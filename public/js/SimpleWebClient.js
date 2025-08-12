/**
 * Simple Web Client - 主控制器（重构版）
 * 说明：该文件在 2025-08 发生过误删/语法损坏，本版本为稳定恢复版。
 */

class SimpleWebClient {
    constructor() {
    console.log('🚀 Simple Cursor Web Client 初始化...');

    // 管理器实例
        this.wsManager = new WebSocketManager();
        this.contentManager = new ContentManager();
        this.statusManager = new StatusManager();
        this.cursorStatusManager = new CursorStatusManager();
        this.uiManager = new UIManager();
        this.homePageStatusManager = new HomePageStatusManager(this.wsManager, this.cursorStatusManager, this.uiManager);
        this.debugManager = new DebugManager(this);
        try { this.timeline = new ChatTimeline(); } catch {}

    // 方案 1：发送后轮询历史的状态
    this._lastMessageHash = null;    // 最近助手消息基线
    this._lastSessionId = null;      // 最近会话ID
    this._replyPollingTimer = null;  // 轮询定时器句柄
    this._replyPollingAbort = false; // 轮询中止标志
    // 相关性窗口：仅在该窗口内接受与最近一次发送相关的助手消息
    this._lastSentMsgId = null;
    this._lastSentAt = 0;
    this._correlationWindowMs = 120000; // 2 分钟窗口，避免误吸其他会话回复
    // 抑制启动阶段把“历史里旧的最新一条”当作新消息渲染
    this._startedAt = Date.now();
    this._suppressUntilBaseline = true; // 等待一次基线建立后再放开
    // 已加载过“同日历史”的标记，避免重复加载
    this._historyLoadedForSession = null;
    this._historyLoadedDayKey = null;

    // URL 中的实例 ID
        try {
            const url = new URL(window.location.href);
            this.instanceId = url.searchParams.get('instance') || null;
        } catch { this.instanceId = null; }
        // 补充：若 URL 未携带 instance，则回退到 InstanceUtils 的默认选择
        if (!this.instanceId) {
            try { this.instanceId = (window.InstanceUtils && InstanceUtils.get && InstanceUtils.get()) || null; } catch {}
        }

    // 设置回调
        this.setupCallbacks();

    // 事件管理器最后初始化
        this.eventManager = new EventManager(this);

    // 启动
        this.init();
    }

  // 回调绑定
    setupCallbacks() {
    // WS 消息
    this.wsManager.setMessageCallback((data) => this.handleWebSocketMessage(data));

    // WS 状态
    this.wsManager.setStatusChangeCallback((message, type) => this.uiManager.updateStatus(message, type));

    // 连接成功
        this.wsManager.setConnectCallback(() => {
            this.handleWebSocketConnect();
            if (this.instanceId) {
                this.wsManager.send({ type: 'register', role: 'web', instanceId: this.instanceId });
            }
        });

    // 断开/重连失败
        this.wsManager.setDisconnectCallback(() => {
            this.statusManager.stopStatusCheck();
            this.homePageStatusManager.updateHomePageStatus();
        });
    this.wsManager.setReconnectFailureCallback(() => this.handleReconnectFailure());

    // 内容管理（此版本仅用于清理场景）
        this.contentManager.setContentUpdateCallback((contentData) => {
            this.uiManager.displayContent(contentData);
        });
    this.contentManager.setClearCallback(() => this.uiManager.clearContent());

    // 状态/轮询
    this.statusManager.setStatusChangeCallback((message, type) => this.uiManager.updateStatus(message, type));
    this.statusManager.setContentPollingCallback(async (payload) => {
      try {
        const latest = payload && payload.latest;
        const message = latest && latest.message;
        if (!message) return;
        const msgTs = Number(message.timestamp || 0);
        const latestSessionId = latest && (latest.sessionId || latest.session_id);
        const normalizedText = String(message.content || message.text || message.value || '');
        const hash = this._hashMessage({ role: message.role || 'assistant', text: normalizedText });
        const now = Date.now();
        // 若存在最近一次发送，则仅在窗口内并且确认与 msgId 相关时才接受
        if (this._lastSentMsgId && (now - this._lastSentAt) <= this._correlationWindowMs) {
          const ok = await this._verifyAssistantCorrelated(latest.sessionId, this._lastSentMsgId, message);
          if (!ok) return; // 不是本次回复，忽略
        } else {
          // 非关联窗口：避免在页面刚打开时把旧的“最新回复”渲染出来
          if (this._suppressUntilBaseline) {
            // 若没有时间戳或时间戳不晚于页面启动时间，则忽略
            if (!msgTs || msgTs <= this._startedAt) return;
          }
        }
        if (!this._lastMessageHash || hash !== this._lastMessageHash) {
          this._lastMessageHash = hash;
          if (normalizedText && this.timeline) {
            this.timeline.appendAssistantMessage(String(normalizedText), msgTs || Date.now());
          }
          const ts = message.timestamp || Date.now();
          try { this.cursorStatusManager.recordContentUpdate(ts); } catch {}
          // 首次观察到该会话的当天消息时，补拉同一会话“同日历史”
          try { if (latestSessionId && msgTs) await this._loadSameDayHistoryForSession(latestSessionId, msgTs); } catch {}
        }
      } catch {}
    });
    this.statusManager.setStatusCheckCallback(() => this.homePageStatusManager.updateHomePageStatus());
    this.statusManager.setConnectionCheckCallback(() => this.homePageStatusManager.updateHomePageStatus());

    // Cursor 状态
    this.cursorStatusManager.setStatusChangeCallback(() => this.homePageStatusManager.updateHomePageStatus());
        this.cursorStatusManager.setCursorActivityCallback((activityType) => {
      console.log(`📝 Cursor 活动：${activityType}`);
        });
    }

  // 启动
    init() {
        console.log('🔧 初始化简化客户端...');
        this.wsManager.connect();
        this.statusManager.startStatusCheck();
      this.statusManager.startContentPolling();
      // 启动后先建立一次“基线”，防止把历史的最新一条当作新消息显示
      this._prefetchBaseline()
        .catch(()=>{})
        .finally(()=>{ this._suppressUntilBaseline = false; });
        this.cursorStatusManager.startMonitoring();
        this.eventManager.init();
        this.broadcastStatus();
    }

  // ====== 轮询与发送 ======
    _hashMessage(msg) {
        try {
            const s = typeof msg === 'string' ? msg : JSON.stringify(msg || {});
            let h = 0;
      for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
            return String(h);
        } catch { return String(Date.now()); }
    }

  _embedIdIfString(text, msgId) {
    try { if (typeof text === 'string') return `${text} \n<!--#msg:${msgId}-->`; } catch {}
    return text;
  }

  async _fetchJson(url) { const r = await fetch(url); return r.json(); }

    _pickLatestAssistant(chats) {
        if (!Array.isArray(chats)) return { session: null, message: null };
    let best = null; let bestSession = null;
        for (const s of chats) {
            const msgs = Array.isArray(s.messages) ? s.messages : [];
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (m && (m.role === 'assistant' || m.role === 'assistant_bot')) {
                    const score = (s.lastUpdatedAt || s.updatedAt || 0);
          if (!best || score > best.score) { best = { msg: m, score }; bestSession = s; }
                    break;
                }
            }
        }
        return { session: bestSession, message: best ? best.msg : null };
    }

    _captureBaseline(chats) {
        const { session, message } = this._pickLatestAssistant(chats);
        this._lastSessionId = session?.sessionId || session?.session_id || null;
    this._lastMessageHash = message ? this._hashMessage({ role: message.role || 'assistant', text: String(message.content || message.text || message.value || '') }) : null;
    }

    async _pollReplyAfterSend(sentAt, options = {}) {
    const delays = options.delays || [100, 300, 800, 1500, 2500, 4000, 7000, 10000];
        this._replyPollingAbort = false;
        for (let i = 0; i < delays.length; i++) {
            if (this._replyPollingAbort) return false;
            await new Promise(r => this._replyPollingTimer = setTimeout(r, delays[i]));
            try {
        const ts = Date.now();
        // 0) 精确接口：优先按 msgId 直接查询对应的助手回复（强制）
        if (options.msgId) {
          const urlR = this.instanceId
            ? `/api/chats/force-reply?msgId=${encodeURIComponent(options.msgId)}&instance=${encodeURIComponent(this.instanceId)}&_=${ts}`
            : `/api/chats/force-reply?msgId=${encodeURIComponent(options.msgId)}&_=${ts}`;
          const r = await this._fetchJson(urlR);
          const m0 = r && r.data && r.data.message;
          if (m0) {
            const textR = String(m0.content || m0.text || m0.value || '');
            const notEchoR = !options.userTextNormalized || textR.trim() !== options.userTextNormalized.trim();
            const tsOkR = m0.timestamp ? (m0.timestamp > sentAt) : true;
            if (notEchoR && tsOkR) {
              if (options.onAssistant) options.onAssistant(textR);
              return true;
            }
          }
        }
        const urlLatest = this.instanceId
          ? `/api/chats/latest?instance=${encodeURIComponent(this.instanceId)}&maxAgeMs=0&nocache=1&_=${ts}`
          : `/api/chats/latest?maxAgeMs=0&nocache=1&_=${ts}`;
        const rLatest = await this._fetchJson(urlLatest);
        const latest = rLatest && rLatest.data && rLatest.data.message;
        const latestSessionId = rLatest && rLatest.data && rLatest.data.sessionId;
        if (latest) {
          const text0 = String(latest.content || latest.text || latest.value || '');
          const notEcho0 = !options.userTextNormalized || text0.trim() !== options.userTextNormalized.trim();
          const h0 = this._hashMessage({ role: latest.role || 'assistant', text: text0 });
          const isNew0 = (!this._lastMessageHash || h0 !== this._lastMessageHash);
          const tsOk0 = latest.timestamp ? (latest.timestamp > sentAt) : true;
          // 相关性校验：确认该回复紧随本次发送的用户消息之后
          let correlated0 = false;
          try {
            if (latestSessionId && options.msgId) {
              correlated0 = await this._verifyAssistantCorrelated(latestSessionId, options.msgId, latest);
            }
          } catch {}
          if (isNew0 && tsOk0 && notEcho0 && (correlated0 || !options.msgId)) {
            try { this.uiManager.showNotification('已获取最新回复', 'info'); } catch {}
            this._lastMessageHash = h0;
            if (text0 && options.onAssistant) options.onAssistant(text0);
                        return true;
                    }
                }

        const urlChats = this.instanceId ? `/api/chats?instance=${encodeURIComponent(this.instanceId)}` : '/api/chats';
        const chats = await this._fetchJson(urlChats);
        // 在完整会话中定位“携带 msgId 的用户消息”后的第一条助手回复
        let reply = null;
        if (options.msgId) {
          reply = this._findAssistantReplyForMsgId(chats || [], options.msgId, sentAt);
        } else {
          const { message } = this._pickLatestAssistant(chats || []);
          reply = message || null;
        }
        if (reply) {
          const text = String(reply.content || reply.text || reply.value || '');
          const notEcho = !options.userTextNormalized || text.trim() !== options.userTextNormalized.trim();
          const h = this._hashMessage({ role: reply.role || 'assistant', text });
          const isNew = (!this._lastMessageHash || h !== this._lastMessageHash);
          const tsOk = reply.timestamp ? (reply.timestamp > sentAt) : true;
          if (isNew && tsOk && notEcho) {
            try { this.uiManager.showNotification('已获取最新回复', 'info'); } catch {}
            this._lastMessageHash = h;
            if (text && options.onAssistant) options.onAssistant(text);
            return true;
          }
        }
        if (i === 2) { try { await this._fetchJson('/api/history/cache/clear'); } catch {} }
      } catch {}
    }
    try { this.uiManager.showNotification('等待回复超时，可稍后在历史里查看', 'warning'); } catch {}
        return false;
    }

    async sendAndPoll(message) {
        if (!this.wsManager.isConnected()) {
      try { this.uiManager.showNotification('WebSocket 未连接，无法发送', 'error'); } catch {}
            return false;
        }

    // 1) 立刻生成消息并渲染到时间线（不等待任何网络）
    const msgId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const sentAt = Date.now();
    this._lastSentMsgId = msgId;
    this._lastSentAt = sentAt;
    try { if (this.timeline) this.timeline.appendUserMessage(typeof message === 'string' ? message : JSON.stringify(message), msgId, sentAt); } catch {}
    try { if (this.timeline) this.timeline.showTyping(msgId); } catch {}

    // 2) 异步预取旧基线，不阻塞 UI
    this._prefetchBaseline().catch(()=>{});

    // 3) 立即发送
    const payload = this._embedIdIfString(message, msgId);
    const ok = this.wsManager.send({ type: 'user_message', data: payload, targetInstanceId: this.instanceId || undefined, msgId });
    if (!ok) { try { this.uiManager.showNotification('发送失败', 'error'); } catch {}; return false; }

    try { this.uiManager.showNotification('已发送，等待回复…', 'info'); } catch {}
    try { if (this.timeline) this.timeline.markRouted(msgId); } catch {}

    // 4) 后台快速轮询（带 msgId 相关性）
    // 4) 后台快速轮询（带 msgId 与去回显）
    const userTextNormalized = typeof message === 'string' ? String(message) : '';
    this._pollReplyAfterSend(sentAt, { msgId, userTextNormalized, onAssistant: (text) => {
      try {
        if (this.timeline) {
          this.timeline.replaceTyping(msgId, String(text||''), Date.now());
          this.timeline.markReplied(msgId);
        }
      } catch {}
    }});
    return true;
  }

  // 异步预取基线（最近助手消息），避免阻塞 UI
  async _prefetchBaseline(){
    try{
            const url0 = this.instanceId ? `/api/chats?instance=${encodeURIComponent(this.instanceId)}` : '/api/chats';
            const chats = await this._fetchJson(url0);
      // 仅当还未设置过基线时再写入，避免覆盖实时更新
      if (!this._lastMessageHash) {
            this._captureBaseline(chats || []);
      }
    }catch{}
  }

  _dayKey(ts){ try { const d = new Date(Number(ts)||Date.now()); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; } catch { return ''; } }

  async _loadSameDayHistoryForSession(sessionId, anchorTs){
    try{
      const dayKey = this._dayKey(anchorTs);
      if (this._historyLoadedForSession === sessionId && this._historyLoadedDayKey === dayKey) return;
      const url = `/api/chat/${encodeURIComponent(sessionId)}`;
      const res = await fetch(url);
      const chat = await res.json();
      const msgs = Array.isArray(chat?.messages) ? chat.messages : (Array.isArray(chat?.data?.messages) ? chat.data.messages : []);
      if (!msgs.length) { this._historyLoadedForSession = sessionId; this._historyLoadedDayKey = dayKey; return; }
      const start = new Date(new Date(anchorTs).setHours(0,0,0,0)).getTime();
      const end = new Date(new Date(anchorTs).setHours(23,59,59,999)).getTime();
      // 升序渲染，交给时间线去重
      const inDay = msgs.filter(m=>{ const t=Number(m?.timestamp||0); return t && t>=start && t<=end; }).sort((a,b)=>Number(a.timestamp||0)-Number(b.timestamp||0));
      for (const m of inDay){
        const text = String(m?.content || m?.text || m?.value || '');
        if (!text) continue;
        const role = String(m?.role||'assistant');
        if (role==='user'){ try{ this.timeline && this.timeline.appendUserMessage(text, null, Number(m.timestamp||0)||Date.now()); }catch{} }
        else { try{ this.timeline && this.timeline.appendAssistantMessage(text, Number(m.timestamp||0)||Date.now()); }catch{} }
      }
      this._historyLoadedForSession = sessionId;
      this._historyLoadedDayKey = dayKey;
    }catch{}
  }

  // ====== 关联性判定 ======
  async _verifyAssistantCorrelated(sessionId, msgId, assistantMsg){
    try{
      // 使用服务端精确接口，直接返回与 msgId 对应的助手回复
      const r = await this._fetchJson(`/api/chats/reply-for-msg?msgId=${encodeURIComponent(msgId)}${this.instanceId ? `&instance=${encodeURIComponent(this.instanceId)}` : ''}&maxAgeMs=0&nocache=1`);
      const reply = r && r.data && r.data.message;
      if (!reply) return false;
      // 内容或时间戳一致即视为相关
      const aTxt = String(assistantMsg?.content || assistantMsg?.text || assistantMsg?.value || '');
      const rTxt = String(reply.content || reply.text || reply.value || '');
      if ((assistantMsg?.timestamp && reply?.timestamp && assistantMsg.timestamp === reply.timestamp) || aTxt === rTxt) return true;
            return false;
    }catch{ return false; }
  }

  _findAssistantReplyForMsgId(chats, msgId, sentAt){
    try{
      for (const s of (Array.isArray(chats) ? chats : [])){
        const msgs = Array.isArray(s.messages) ? s.messages : [];
        const idxUser = msgs.findIndex(m => typeof (m?.content||m?.text||'') === 'string' && (m.content||m.text||'').includes(`<!--#msg:${msgId}-->`));
        if (idxUser === -1) continue;
        for (let i = idxUser + 1; i < msgs.length; i++){
          const m = msgs[i];
          if (!m) continue;
          if ((m.role === 'assistant' || m.role === 'assistant_bot') && (!sentAt || !m.timestamp || m.timestamp > sentAt)){
            return m;
          }
        }
      }
      return null;
    }catch{ return null; }
  }

  // ====== WS 事件 ======
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'html_content':
        try {
          const payload = (data && data.data) ? data.data : { html: (data && data.html) || '', timestamp: data?.timestamp || Date.now() };
          // 推送到内容管理器 → 由 UIManager 渲染到当前渲染容器（聊天或实时回显）
          if (this.contentManager && typeof this.contentManager.handleContentUpdate === 'function') {
            this.contentManager.handleContentUpdate(payload);
          }
          const timestamp = Number(payload?.timestamp || Date.now());
          this.cursorStatusManager.recordContentUpdate(timestamp);
        } catch {}
                break;
            case 'clear_content':
                this.contentManager.handleClearContent(data);
                this.cursorStatusManager.recordCursorActivity('clear_content');
                break;
            case 'delivery_ack':
        try { if (this.timeline && data.msgId) this.timeline.markDelivered(data.msgId); } catch {}
        try { this.uiManager.showNotification('已提交给 Cursor（网络回执）', 'success'); } catch {}
                break;
            case 'delivery_error':
        try { this.uiManager.showNotification('注入失败：' + (data.reason || 'unknown'), 'warning'); } catch {}
        break;
      case 'assistant_hint':
        try { this.uiManager.showNotification('模型已接收，等待回复…', 'info'); } catch {}
                break;
            case 'pong':
                console.log('💓 收到心跳响应');
                this.cursorStatusManager.recordCursorActivity('pong');
                break;
            default:
                console.log('📥 收到未知消息类型:', data.type);
                this.cursorStatusManager.recordCursorActivity('message_received');
        }
    }

    handleWebSocketConnect() {
        this.homePageStatusManager.updateHomePageStatus();
    }

    handleReconnectFailure() {
    this.uiManager.showReconnectButton(() => this.wsManager.manualReconnect());
  }

  // ====== 其他工具 ======
  broadcastStatus() {
    if (!window.localStorage) return;
    const status = {
      timestamp: Date.now(),
                isConnected: this.wsManager.isConnected(),
                connectionState: this.wsManager.getConnectionState(),
                reconnectAttempts: this.wsManager.reconnectAttempts || 0
    };
    localStorage.setItem('websocket_status', JSON.stringify(status));
  }

  cleanup() {
    try { this.statusManager.stopAll(); } catch {}
    try { this.cursorStatusManager.stopMonitoring(); } catch {}
    try { this.wsManager.close(); } catch {}
    try { this.eventManager.unbindAllEvents(); } catch {}
    try { this.uiManager.hideClearNotification?.(); } catch {}
  }

  // 调试接口
    testSendMessage(message = '测试消息') {
        console.log('🧪 测试发送消息功能...');
        console.log('  - 消息内容:', message);
    console.log('  - WebSocket 管理器:', this.wsManager);
        console.log('  - 连接状态:', this.wsManager ? this.wsManager.getConnectionState() : '未初始化');
        console.log('  - 是否已连接:', this.wsManager ? this.wsManager.isConnected() : false);
        if (this.wsManager && this.wsManager.isConnected()) {
      const success = this.sendAndPoll(message);
            console.log('  - 发送结果:', success);
            return success;
        } else {
      console.error('  - 无法发送：WebSocket 未连接');
            return false;
        }
    }
}

// ====== 全局调试方法 ======
window.testSendMessage = (message) => {
  if (window.simpleClient) return window.simpleClient.testSendMessage(message);
        console.error('❌ simpleClient 未初始化');
        return false;
};

window.debugEventBinding = () => {
    if (window.simpleClient && window.simpleClient.eventManager) {
        console.log('🔍 事件绑定状态检查:');
        console.log('  - 绑定的事件:', window.simpleClient.eventManager.getBoundEvents());
        console.log('  - 表单元素:', {
            sendForm: !!document.getElementById('send-form'),
            sendInput: !!document.getElementById('send-input'),
            sendBtn: !!document.getElementById('send-btn')
        });
    console.log('  - WebSocket 状态:', window.simpleClient.getConnectionState?.());
    console.log('  - 是否已连接:', window.simpleClient.isConnected?.());
    } else {
        console.error('❌ simpleClient 或 eventManager 未初始化');
    }
};

window.testWebSocketConnection = () => {
  console.log('🔌 WebSocket 连接测试...');
  console.log('  - 当前页面 URL:', window.location.href);
    console.log('  - 协议:', window.location.protocol);
    console.log('  - 主机:', window.location.hostname);
    console.log('  - 端口:', window.location.port);
    if (window.simpleClient && window.simpleClient.wsManager) {
    console.log('  - WebSocket 管理器:', window.simpleClient.wsManager);
        console.log('  - 连接状态:', window.simpleClient.wsManager.getConnectionState());
        console.log('  - 是否已连接:', window.simpleClient.wsManager.isConnected());
        console.log('  - 尝试手动重连...');
        window.simpleClient.wsManager.manualReconnect();
    } else {
    console.error('  - WebSocket 管理器未初始化');
  }
};

// 打印可用调试命令
console.log('💡 调试命令：');
console.log('  - testSendMessage("消息")');
console.log('  - debugEventBinding()');
console.log('  - testWebSocketConnection()');

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleWebClient;
} else {
    window.SimpleWebClient = SimpleWebClient;
}


