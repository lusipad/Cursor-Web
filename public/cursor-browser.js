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
    this._lastSessionId = null;      // 最近会话 ID
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
            case 'assistant_stream':
        try {
          const msgId = data.msgId || null;
          const delta = String(data.delta || '');
          if (msgId && this.timeline && delta) {
            this.timeline.appendTypingChunk(msgId, delta);
          }
        } catch {}
        break;
            case 'assistant_done':
        try {
          const msgId = data.msgId || null;
          const text = String(data.text || '');
          if (msgId && this.timeline) {
            const ok = this.timeline.replaceTyping(msgId, text, Number(data.timestamp||Date.now()));
            if (!ok && text) this.timeline.appendAssistantMessage(text, Number(data.timestamp||Date.now()));
            this.timeline.markReplied(msgId);
          }
        } catch {}
        break;
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
                console.log('📥 收到未知消息类型：', data.type);
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
        console.log('  - 消息内容：', message);
    console.log('  - WebSocket 管理器：', this.wsManager);
        console.log('  - 连接状态：', this.wsManager ? this.wsManager.getConnectionState() : '未初始化');
        console.log('  - 是否已连接：', this.wsManager ? this.wsManager.isConnected() : false);
        if (this.wsManager && this.wsManager.isConnected()) {
      const success = this.sendAndPoll(message);
            console.log('  - 发送结果：', success);
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
        console.log('🔍 事件绑定状态检查：');
        console.log('  - 绑定的事件：', window.simpleClient.eventManager.getBoundEvents());
        console.log('  - 表单元素：', {
            sendForm: !!document.getElementById('send-form'),
            sendInput: !!document.getElementById('send-input'),
            sendBtn: !!document.getElementById('send-btn')
        });
    console.log('  - WebSocket 状态：', window.simpleClient.getConnectionState?.());
    console.log('  - 是否已连接：', window.simpleClient.isConnected?.());
    } else {
        console.error('❌ simpleClient 或 eventManager 未初始化');
    }
};

window.testWebSocketConnection = () => {
  console.log('🔌 WebSocket 连接测试...');
  console.log('  - 当前页面 URL:', window.location.href);
    console.log('  - 协议：', window.location.protocol);
    console.log('  - 主机：', window.location.hostname);
    console.log('  - 端口：', window.location.port);
    if (window.simpleClient && window.simpleClient.wsManager) {
    console.log('  - WebSocket 管理器：', window.simpleClient.wsManager);
        console.log('  - 连接状态：', window.simpleClient.wsManager.getConnectionState());
        console.log('  - 是否已连接：', window.simpleClient.wsManager.isConnected());
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


            '[aria-label*="Chat" i] .interactive-session .monaco-list-rows',
            '[aria-label*="Chat" i] .monaco-list-rows',
            // Cursor/VSCode 常见结构
            '.part.sidebar.right .interactive-session .monaco-list-rows',
            '.interactive-session .monaco-list-rows',
            '.chat-view .monaco-list-rows',
            '[data-testid="chat-container"]',
            '.chat-view',
            '.conversations'
        ];

        const nodes = [];
        for (const sel of selectorCandidates) {
            const n = document.querySelector(sel);
            if (n) nodes.push(n);
        }

        // 2) 评分：
        //   - 文本长度/块数量/高度
        //   - 距离右侧越近得分越高（更像右侧边栏）
        //   - 宽度较窄更可能是侧边栏
        //   - 含助手消息标记加权
        const scoreOf = (el) => {
            try {
                const rect = el.getBoundingClientRect();
                const textLen = (el.textContent || '').length;
                const blocks = el.querySelectorAll('div,p,li,pre,code').length;
                const height = Math.max(el.scrollHeight || 0, el.clientHeight || 0);
                let score = textLen + blocks * 10 + height / 2;
                const distanceToRight = Math.max(0, window.innerWidth - rect.right);
                score += Math.max(0, 2000 - distanceToRight); // 越靠右分越高
                if (rect.width && rect.width < 720) score += 1200; else score -= 400; // 侧栏通常较窄
                const hasAssistant = el.querySelector('[data-from="assistant"], [data-role="assistant"], .assistant, .agent, .bot, .gpt, .assistant-message, .chat-message.agent, .message.assistant');
                if (hasAssistant) score += 5000;
                if (el === document.body) score -= 100000; // 强烈惩罚 body
                return score;
            } catch { return 0; }
        };

        let best = null;
        for (const el of nodes) {
            if (!el) continue;
            const s = scoreOf(el);
            if (!best || s > best.score) best = { el, score: s };
        }

        this.chatContainer = best ? best.el : null;
        if (!this.chatContainer) {
            console.warn('⚠️ 未找到合适的聊天容器，将稍后重试');
        } else {
            const tlen = (this.chatContainer.textContent || '').length;
            const rect = this.chatContainer.getBoundingClientRect();
            console.log('✅ 选定聊天容器:', this.chatContainer, '文本长度:', tlen, '位置/宽度:', rect);
        }
    }

    startSync() {
        // 允许通过全局变量或 localStorage 调整频率
        const readInterval = () => {
            try {
                if (typeof window.__cwSyncIntervalMs === 'number' && window.__cwSyncIntervalMs > 0) return window.__cwSyncIntervalMs;
                const v = Number(localStorage.getItem('cw_sync_interval') || '') || 0;
                if (v > 0) return v;
            } catch {}
            return 400; // 默认 400ms 更顺滑
        };
        const run = () => this.syncContent();
        const intervalMs = readInterval();
        if (this.syncInterval) { try { clearInterval(this.syncInterval); } catch {} }
        this.syncInterval = setInterval(run, intervalMs);
        console.log('🔄 HTTP 同步已启动，间隔 (ms):', intervalMs);
        // 提供动态调整 API
        try { window.setCursorSyncInterval = (ms) => { try { localStorage.setItem('cw_sync_interval', String(Math.max(100, Number(ms)||0))); } catch {}; this.startSync(); }; } catch {}
    }

    async syncContent() {
        try {
            const contentPayload = this.getContent();
            console.log('准备同步内容：', contentPayload);
            if (!contentPayload) {
                return;
            }
            // 附带 instanceId，便于后端识别来源实例
            const payload = { ...contentPayload };
            try { const iid = (window.__cursorInstanceId && String(window.__cursorInstanceId)) || null; if (iid) payload.instanceId = iid; } catch {}

            const response = await fetch(`${this.serverUrl}/api/content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'html_content',
                    data: payload
                })
            });
            if (response.ok) {
                const data = await response.json();
                console.log('同步响应：', data);
                if (data.success) {
                    console.log('✅ 内容同步成功');
                    this.retryCount = 0;
                }
            }
        } catch (error) {
            console.error('❌ 同步失败：', error);
            this.retryCount++;
            if (this.retryCount >= this.maxRetries) {
                console.warn('⚠️ 达到最大重试次数，停止同步');
                this.stop();
            }
        }
    }

    // 收集聊天栏消息 DOM（默认仅助手，可切换包含用户）
    collectChatPaneHtml(maxItems = 30, onlyAssistant = true) {
        try {
            const root = this.chatContainer || document.body;
            const isVisible = (el) => {
                try { return !!(el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden'); } catch { return true; }
            };
            // 消息选择器（先尝试更语义化的）
            const selAssistant = [
                '[data-from="assistant"]', '[data-role="assistant"]',
                '.assistant-message', '.message.assistant', '.chat-message.assistant', '.chat-message.agent',
                '.agent', '.assistant', '.ai', '.bot', '.gpt',
                '.monaco-list-rows .monaco-list-row [class*="assistant"]', '.monaco-list-rows .monaco-list-row .markdown'
            ];
            const selUser = [
                '[data-from="user"]', '[data-role="user"]', '.message.user', '.chat-message.user',
                '.monaco-list-rows .monaco-list-row [class*="user"]'
            ];

            const collect = (selectors) => {
                let nodes = [];
                for (const sel of selectors) {
                    const list = Array.from(root.querySelectorAll(sel));
                    if (list && list.length) nodes.push(...list);
                }
                const set = new Set();
                nodes = nodes.filter((n)=>{ if(!n || !isVisible(n)) return false; if(set.has(n)) return false; set.add(n); return true; });
                return nodes;
            };

            let nodes = collect(selAssistant);
            if (!onlyAssistant) nodes = nodes.concat(collect(selUser));
            if (!nodes.length) return '';
            // 保持 DOM 顺序，截取最新若干条
            const picked = nodes.slice(-maxItems);
            return picked.map(n => n.outerHTML || n.innerHTML || '').join('\n');
        } catch (e) {
            console.warn('collectChatPaneHtml 失败：', e);
            return '';
        }
    }

    getContent() {
        if (!this.chatContainer) {
            console.warn('chatContainer 未找到');
            return null;
        }
        // 自动滚动到底部，确保最新消息渲染
        try { this.chatContainer.scrollTop = this.chatContainer.scrollHeight; } catch {}
        // 仅从“聊天栏”提取消息节点（默认只取助手，可通过 __cwIncludeUser=true 包含用户）
        const onlyAssistant = !(window.__cwIncludeUser === true);
        const html = this.collectChatPaneHtml(40, onlyAssistant);
        const text = (this.chatContainer.textContent || '').trim();
        const contentLength = text.length;
        if (window.__cwDebugLogs) console.log('采集 innerHTML 长度：', html.length, 'textContent 长度：', text.length);
        // 若无法精确提取消息节点则跳过（不再回退到整个容器，避免采集到无关内容）
        if (!html || html.replace(/\s+/g,'').length < 10 || contentLength === 0) {
            return null;
        }
        
        const timestamp = Date.now();
        
        // 检查是否需要过滤清除时间点之前的内容
        if (this.clearTimestamp && timestamp < this.clearTimestamp) {
            console.log('⏰ Cursor 端跳过清理时间点之前的内容:', new Date(timestamp).toLocaleTimeString());
            console.log('📊 时间戳比较：内容时间戳 < 清除时间戳 =', timestamp < this.clearTimestamp);
            console.log('📊 清除时间戳:', new Date(this.clearTimestamp).toLocaleTimeString());
            console.log('📊 内容时间戳:', new Date(timestamp).toLocaleTimeString());
            return null;
        }
        
        // 若文本无变化则跳过，减少重复传输
        if (text === this.lastContent) {
            return null;
        }
        this.lastContent = text;
        return {
            html: html,
            text: text,
            contentLength: contentLength,
            url: window.location.href,
            timestamp: timestamp
        };
    }

    getContentPayload() {
        const content = this.getContent();
        if (!content) {
            return null;
        }
        return content;
    }

    initWebSocket() {
        // 使用全局 WebSocket 管理器
        if (!window.webSocketManager) {
            console.log('🔧 创建全局 WebSocket 管理器...');
            window.webSocketManager = new WebSocketManager();
        }

        // 监听消息
        window.webSocketManager.onMessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.warn('⚠️ 非 JSON 消息，按原始字符串处理：', event.data);
                this.handleWebSocketMessage({ type: 'raw', data: event.data });
            }
        };

        this.showNotification('📡 已连接到消息服务', '#4CAF50', 2000);
    }

    // 处理来自 WebSocket 的消息
    handleWebSocketMessage(message) {
        console.log('📥 收到 WebSocket 消息：', message.type);

        switch (message.type) {
            case 'user_message':
                // 兼容对象结构：{data,msgId}
                if (message && typeof message === 'object') {
                    this.handleUserMessage(message.data, message.msgId);
                } else {
                    this.handleUserMessage(message.data);
                }
                break;
            case 'pong':
                // 心跳响应，无需处理
                break;
            case 'clear_content':
                console.log('🧹 收到清空内容指令');
                this.clearTimestamp = message.timestamp || Date.now();
                console.log('⏰ 设置 Cursor 端清除时间戳:', new Date(this.clearTimestamp).toLocaleString());
                // 清空当前内容缓存
                this.lastContent = '';
                break;
            default:
                console.log('❓ 未知消息类型：', message.type);
        }
    }

    // 简易分发锁，确保同一 msgId 只由一个窗口处理
    acquireDispatchLock(msgId){
        try{
            if(!msgId) return true; // 无 ID 时不加锁
            const key = `__cw_dispatch_${msgId}`;
            const exists = localStorage.getItem(key);
            if (exists) return false;
            const winId = (window.__cwWindowId ||= (Date.now()+Math.random()).toString(16));
            localStorage.setItem(key, winId);
            return true;
        }catch{return true}
    }

    // 处理用户消息 - 将消息发送到 Cursor 聊天输入框
    handleUserMessage(messageText, msgId) {
        console.log('💬 收到用户消息，发送到 Cursor：', messageText);

        // 加锁：若其他窗口已处理此 msgId，则当前窗口忽略
        if (!this.acquireDispatchLock(msgId)) { console.log('⛔ 已由其他窗口处理，本窗口忽略'); return; }

        try {
            // 🎯 使用 Cursor 特定的选择器（基于成功的旧版本）
            const inputDiv = document.querySelector('div.aislash-editor-input[contenteditable="true"]');

            if (!inputDiv) {
                console.error('❌ 未找到 Cursor 输入框 (div.aislash-editor-input[contenteditable="true"])');
                this.showDebugInfo();
                this.tryFallbackInputMethods(messageText);
                return;
            }

            console.log('✅ 找到 Cursor 输入框');

            // 确保输入框获得焦点
            inputDiv.focus();

            // 🔑 关键：使用粘贴事件（而不是直接设置值）
            const clipboardData = new DataTransfer();
            clipboardData.setData('text/plain', messageText);

            // 创建并派发粘贴事件
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: clipboardData
            });

            console.log('📋 触发粘贴事件');
            inputDiv.dispatchEvent(pasteEvent);

            // 粘贴后尝试点击发送按钮
            setTimeout(() => {
                this.clickCursorSendButton();
            }, 100);

            console.log('✅ 消息已通过粘贴事件发送到 Cursor');
            this.showNotification('💬 消息已发送到 Cursor', '#2196F3', 3000);

            // 发送投递确认
            try {
                const instanceId = (window.__cursorInstanceId && String(window.__cursorInstanceId)) || null;
                if (window.webSocketManager && window.webSocketManager.ws && window.webSocketManager.ws.readyState === WebSocket.OPEN) {
                    window.webSocketManager.ws.send(JSON.stringify({ type:'delivery_ack', msgId, instanceId, timestamp: Date.now() }));
                }
            } catch {}

            // 额外提示：告知 Web 端“可能有新回复”，加速其轮询
            try {
                const instanceId = (window.__cursorInstanceId && String(window.__cursorInstanceId)) || null;
                if (window.webSocketManager && window.webSocketManager.ws && window.webSocketManager.ws.readyState === WebSocket.OPEN) {
                    window.webSocketManager.ws.send(JSON.stringify({ type:'assistant_hint', msgId, instanceId, timestamp: Date.now() }));
                }
            } catch {}

        } catch (error) {
            console.error('❌ 发送消息到 Cursor 失败：', error);
            this.showNotification('❌ 发送失败，尝试备用方案', '#FF5722', 4000);
            this.tryFallbackInputMethods(messageText);
            // 发送失败事件
            try {
                const instanceId = (window.__cursorInstanceId && String(window.__cursorInstanceId)) || null;
                if (window.webSocketManager && window.webSocketManager.ws && window.webSocketManager.ws.readyState === WebSocket.OPEN) {
                    window.webSocketManager.ws.send(JSON.stringify({ type:'delivery_error', msgId, instanceId, reason:'inject_failed', timestamp: Date.now() }));
                }
            } catch {}
        }
    }

    // 🔘 点击 Cursor 发送按钮
    clickCursorSendButton() {
        // 🎯 使用 Cursor 特定的发送按钮选择器
        const sendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;

        if (sendBtn && sendBtn.offsetParent !== null && !sendBtn.disabled) {
            console.log('✅ 找到 Cursor 发送按钮，点击发送');
            sendBtn.click();
            console.log('✅ 消息已发送到 Cursor');
            return true;
        }

        // 备用按钮选择器
        const fallbackSelectors = [
            '.anysphere-icon-button .codicon-arrow-up-two',
            '.codicon-arrow-up-two',
            'button .codicon-arrow-up-two',
            '[class*="anysphere-icon-button"]',
            'button[class*="send"]'
        ];

        for (const selector of fallbackSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                const button = element.closest('button') || element.parentElement;
                if (button && button.offsetParent !== null && !button.disabled) {
                    console.log('✅ 找到 Cursor 备用按钮：', selector);
                    button.click();
                    return true;
                }
            }
        }

        console.warn('⚠️ 未找到发送按钮，尝试键盘发送');

        // 最后尝试键盘事件
        const inputDiv = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
        if (inputDiv) {
            inputDiv.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
            return true;
        }

        return false;
    }

    // 🔍 显示调试信息
    showDebugInfo() {
        console.log('🔍 Cursor 调试信息：');
        console.log('Cursor 特定输入框：', document.querySelector('div.aislash-editor-input[contenteditable="true"]'));
        console.log('Cursor 发送按钮：', document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement);
        console.log('所有 aislash-editor-input 元素：', document.querySelectorAll('.aislash-editor-input'));
        console.log('所有 contenteditable 元素：', document.querySelectorAll('[contenteditable="true"]'));
        console.log('所有 anysphere-icon-button 元素：', document.querySelectorAll('.anysphere-icon-button'));
        console.log('所有 codicon-arrow-up-two 元素：', document.querySelectorAll('.codicon-arrow-up-two'));
    }

    // 🛠️ 备用输入方案
    tryFallbackInputMethods(messageText) {
        console.log('🛠️ 尝试备用输入方案...');

        // 备用选择器
        const fallbackSelectors = [
            'div.aislash-editor-input',
            '.aislash-editor-input[contenteditable="true"]',
            '.aislash-editor-input',
            'div[contenteditable="true"]',
            '[role="textbox"]',
            'textarea[placeholder*="问"]',
            'textarea[placeholder*="Ask"]',
            'textarea'
        ];

        for (const selector of fallbackSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (element.offsetParent !== null &&
                    element.offsetHeight > 20 &&
                    !element.disabled &&
                    !element.readOnly) {

                    console.log('🎯 尝试备用输入框：', selector);

                    try {
                        element.focus();

                        if (element.tagName === 'TEXTAREA') {
                            element.value = messageText;
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            // 尝试粘贴事件
                            const clipboardData = new DataTransfer();
                            clipboardData.setData('text/plain', messageText);
                            const pasteEvent = new ClipboardEvent('paste', {
                                bubbles: true,
                                cancelable: true,
                                clipboardData: clipboardData
                            });
                            element.dispatchEvent(pasteEvent);
                        }

                        console.log('✅ 备用方案成功设置消息');
                        this.showNotification('✅ 消息已通过备用方案设置', '#4CAF50', 3000);
                        return true;

                    } catch (error) {
                        console.warn('备用方案失败：', error);
                    }
                }
            }
        }

        // 最终备用：复制到剪贴板
        console.warn('⚠️ 所有输入方案都失败，复制到剪贴板');
        this.copyToClipboard(messageText);
        this.showNotification('📋 消息已复制到剪贴板，请手动粘贴', '#FF9800', 5000);

        return false;
    }

    // 复制文本到剪贴板
    copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            } else {
                // 备用方案
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            console.log('📋 消息已复制到剪贴板');
        } catch (error) {
            console.error('❌ 复制到剪贴板失败：', error);
        }
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 同步已停止');
        }

        // 注意：不关闭全局 WebSocket 连接，让其他实例继续使用
        console.log('🛑 CursorSync 实例已停止');

        this.showNotification('🛑 同步已停止', '#FF9800');
    }

    // 🔄 重启同步功能
    restart() {
        console.log('🔄 重启 Cursor 同步器...');

        // 先停止现有连接
        this.stop();

        // 重置重试计数
        this.retryCount = 0;
        this.wsRetryCount = 0;

        // 重新初始化
        setTimeout(() => {
            this.init();
        }, 2000); // 增加延迟时间
    }

    showNotification(text, color = '#4CAF50', duration = 4000) {
        // 移除旧通知
        const oldNotif = document.getElementById('cursor-sync-notification');
        if (oldNotif) oldNotif.remove();

        // 创建新通知
        const notification = document.createElement('div');
        notification.id = 'cursor-sync-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            background: ${color};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 300px;
        `;
        notification.textContent = text;

        document.body.appendChild(notification);

        // 自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }
}

// 启动同步器
console.log('🎯 启动 Cursor 同步器...');

// 🔧 全局实例管理：确保只有一个实例运行
if (window.cursorSync) {
    console.log('🔄 检测到现有 CursorSync 实例，正在清理...');
    try {
        window.cursorSync.stop();
    } catch (error) {
        console.warn('⚠️ 清理现有实例时出错：', error);
    }
    window.cursorSync = null;
}

// 创建新实例
try {
    window.cursorSync = new CursorSync();
    console.log('✅ Cursor 同步器启动成功');
    console.log('🔧 使用全局 WebSocket 管理器，确保只有一个连接');
} catch (error) {
    console.error('❌ Cursor 同步器启动失败：', error);
}

// 全局控制函数
window.stopCursorSync = () => {
    if (window.cursorSync) {
        window.cursorSync.stop();
    }
};

window.restartCursorSync = () => {
    if (window.cursorSync) {
        window.cursorSync.restart();
    } else {
        console.log('🔄 重新创建 Cursor 同步器...');
        window.cursorSync = new CursorSync();
    }
};

// 强制清理所有连接
window.forceCleanup = () => {
    console.log('🧹 强制清理所有连接...');

    // 清理现有实例
    if (window.cursorSync) {
        console.log('🔄 清理现有 CursorSync 实例...');
        window.cursorSync.stop();
        window.cursorSync = null;
        console.log('✅ CursorSync 实例清理完成');
    }

    // 清理全局 WebSocket 管理器
    if (window.webSocketManager) {
        console.log('🔄 清理全局 WebSocket 管理器...');
        window.webSocketManager.disconnect();
        window.webSocketManager = null;
        console.log('✅ WebSocket 管理器清理完成');
    }

    // 清理可能存在的通知
    const notification = document.getElementById('cursor-sync-notification');
    if (notification) {
        notification.remove();
    }

    console.log('🧹 强制清理完成！');
};

// 完全重置并重新启动
window.fullReset = () => {
    console.log('🔄 完全重置 Cursor 同步器...');

    // 1. 强制清理
    window.forceCleanup();

    // 2. 等待一段时间确保清理完成
    setTimeout(() => {
        console.log('🚀 重新创建 Cursor 同步器...');
        try {
            window.cursorSync = new CursorSync();
            console.log('✅ 完全重置完成！');
        } catch (error) {
            console.error('❌ 重新创建失败：', error);
        }
    }, 1000);
};

window.debugCursorSync = () => {
    if (!window.cursorSync) {
        console.log('❌ 同步器未初始化');
        return;
    }

    const sync = window.cursorSync;
    console.log('🔍 Cursor 同步器调试信息：');
    console.log('  - 服务器：', sync.serverUrl);
    console.log('  - 聊天容器：', sync.chatContainer?.tagName);
    console.log('  - 最后内容长度：', sync.lastContent.length);
    console.log('  - HTTP 重试次数：', sync.retryCount);
    console.log('  - 同步状态：', sync.syncInterval ? '运行中' : '已停止');

    // WebSocket 管理器状态
    if (window.webSocketManager) {
        console.log('  - WebSocket 管理器状态：', window.webSocketManager.getStatus());
        console.log('  - WebSocket 管理器连接中：', window.webSocketManager.isConnecting);
        console.log('  - WebSocket 管理器重试次数：', window.webSocketManager.retryCount);
    } else {
        console.log('  - WebSocket 管理器：未初始化');
    }

    // WebSocket 管理器详细信息
    if (window.webSocketManager && window.webSocketManager.ws) {
        const states = ['连接中', '已连接', '关闭中', '已关闭'];
        console.log('  - WebSocket 状态说明：', states[window.webSocketManager.ws.readyState] || '未知');
        console.log('  - WebSocket URL:', window.webSocketManager.ws.url);
    }

    // 测试内容获取
    const content = sync.getContent();
    if (content) {
        console.log('✅ 当前内容：', content.contentLength, '字符');
    } else {
        console.log('❌ 内容获取失败');
    }

    // 测试输入框查找
    console.log('🔍 查找输入框测试：');

    // 🎯 首先测试 Cursor 特定选择器
    console.log('📍 Cursor 特定选择器测试：');
    const cursorInput = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
    console.log(`  - div.aislash-editor-input[contenteditable="true"]: ${cursorInput ? '✅ 找到' : '❌ 未找到'}`);
    if (cursorInput) {
        console.log(`    可见：${cursorInput.offsetParent !== null}, 高度：${cursorInput.offsetHeight}px`);
        console.log(`    类名："${cursorInput.className}"`);
        console.log(`    ID: "${cursorInput.id}"`);
    }

    // 测试 Cursor 发送按钮
    const cursorSendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;
    console.log(`  - Cursor 发送按钮：${cursorSendBtn ? '✅ 找到' : '❌ 未找到'}`);
    if (cursorSendBtn) {
        console.log(`    可见：${cursorSendBtn.offsetParent !== null}, 启用：${!cursorSendBtn.disabled}`);
    }

    // 通用选择器测试
    console.log('\n📍 通用选择器测试：');
    const inputSelectors = [
        'div.aislash-editor-input',
        '.aislash-editor-input',
        'div[contenteditable="true"]',
        '[contenteditable="true"]',
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="问"]',
        'textarea',
        '[role="textbox"]'
    ];

    for (const selector of inputSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`  - ${selector}: 找到 ${elements.length} 个元素`);
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                console.log(`    [${i}] 可见: ${el.offsetParent !== null}, 启用: ${!el.disabled}, 高度: ${el.offsetHeight}px`);
            }
        }
    }

    // 手动测试消息发送
    console.log('\n💡 手动测试提示：');
    console.log('  运行 testCursorMessageSending("测试消息") 来测试消息发送');
    console.log('  运行 restartCursorSync() 来重启同步器');
    console.log('  运行 checkWebSocketStatus() 来检查 WebSocket 状态');
};

// 添加手动测试函数
window.testCursorMessageSending = (message = '这是一个测试消息') => {
    if (!window.cursorSync) {
        console.log('❌ cursorSync 未初始化');
        return;
    }

    console.log('🧪 手动测试消息发送：', message);
    window.cursorSync.handleUserMessage(message);
};



// 添加 WebSocket 状态检查函数
window.checkWebSocketStatus = () => {
    console.log('🔍 WebSocket 状态检查：');

    if (window.webSocketManager) {
        console.log('✅ WebSocket 管理器已初始化');
        console.log('  - 连接状态：', window.webSocketManager.getStatus());
        console.log('  - 连接中：', window.webSocketManager.isConnecting);
        console.log('  - 重试次数：', window.webSocketManager.retryCount);
        console.log('  - 最大重试次数：', window.webSocketManager.maxRetries);

        if (window.webSocketManager.ws) {
            const states = ['连接中', '已连接', '关闭中', '已关闭'];
            console.log('  - WebSocket 状态：', states[window.webSocketManager.ws.readyState] || '未知');
            console.log('  - URL:', window.webSocketManager.ws.url);
            console.log('  - 协议：', window.webSocketManager.ws.protocol);
        }
    } else {
        console.log('❌ WebSocket 管理器未初始化');
    }

    if (window.cursorSync) {
        console.log('✅ CursorSync 实例已初始化');
    } else {
        console.log('❌ CursorSync 实例未初始化');
    }
};

// 检查所有可能的 WebSocket 连接
window.checkAllWebSockets = () => {
    console.log('🔍 检查所有 WebSocket 连接...');

    // 检查全局实例
    if (window.cursorSync) {
        console.log('✅ 找到全局 cursorSync 实例');
        if (window.cursorSync.ws) {
            const states = ['连接中', '已连接', '关闭中', '已关闭'];
            console.log(`  - WebSocket 状态：${states[window.cursorSync.ws.readyState] || '未知'}`);
        } else {
            console.log('  - 无 WebSocket 连接');
        }
    } else {
        console.log('❌ 未找到全局 cursorSync 实例');
    }

    // 检查是否有其他 WebSocket 连接
    console.log('🔍 检查页面中的所有 WebSocket 连接...');
    const allElements = document.querySelectorAll('*');
    let wsCount = 0;

    for (const element of allElements) {
        if (element._websocket || element.websocket) {
            wsCount++;
            console.log(`  - 发现 WebSocket 连接 #${wsCount}:`, element);
        }
    }

    if (wsCount === 0) {
        console.log('✅ 页面中未发现其他 WebSocket 连接');
    } else {
        console.log(`⚠️ 发现 ${wsCount} 个其他 WebSocket 连接`);
    }
};

console.log('✨ Cursor 同步脚本加载完成！');
console.log('💡 使用说明：');
console.log('  - 脚本会自动开始双向同步');
console.log('  - HTTP 同步：Cursor → Web (每 5 秒检查)');
console.log('  - WebSocket：Web → Cursor (实时接收)');
console.log('  - stopCursorSync() - 停止同步');
console.log('  - restartCursorSync() - 重启同步');
console.log('  - debugCursorSync() - 查看调试信息');
console.log('  - testCursorMessageSending("消息") - 手动测试发送');

console.log('  - checkWebSocketStatus() - 检查 WebSocket 状态');
console.log('  - checkAllWebSockets() - 检查所有 WebSocket 连接');
console.log('  - forceCleanup() - 强制清理所有连接');
console.log('  - fullReset() - 完全重置并重新启动');
console.log('  - 确保服务器在 localhost:3000 运行');
console.log('🎯 现在可以从 Web 界面发送消息到 Cursor 了！');
console.log('🔧 使用全局 WebSocket 管理器，确保只有一个连接');

// 页面卸载时自动清理
window.addEventListener('beforeunload', () => {
    if (window.cursorSync) {
        console.log('🧹 页面卸载，自动清理连接...');
        window.cursorSync.stop();
    }
});

