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

    // URL 中的实例 ID
    try {
      const url = new URL(window.location.href);
      this.instanceId = url.searchParams.get('instance') || null;
    } catch { this.instanceId = null; }

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
    this.statusManager.setContentPollingCallback((payload) => {
      try {
        const latest = payload && payload.latest;
        const message = latest && latest.message;
        if (!message) return;
        const normalizedText = String(message.content || message.text || message.value || '');
        const hash = this._hashMessage({ role: message.role || 'assistant', text: normalizedText });
        if (!this._lastMessageHash || hash !== this._lastMessageHash) {
          this._lastMessageHash = hash;
          if (normalizedText && this.timeline) {
            this.timeline.appendAssistantMessage(String(normalizedText));
          }
          const ts = message.timestamp || Date.now();
          try { this.cursorStatusManager.recordContentUpdate(ts); } catch {}
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
    const delays = options.delays || [300, 600, 1200, 2000, 3000, 5000, 8000, 10000];
    this._replyPollingAbort = false;
    for (let i = 0; i < delays.length; i++) {
      if (this._replyPollingAbort) return false;
      await new Promise(r => this._replyPollingTimer = setTimeout(r, delays[i]));
      try {
        const ts = Date.now();
        const urlLatest = this.instanceId
          ? `/api/chats/latest?instance=${encodeURIComponent(this.instanceId)}&maxAgeMs=0&nocache=1&_=${ts}`
          : `/api/chats/latest?maxAgeMs=0&nocache=1&_=${ts}`;
        const rLatest = await this._fetchJson(urlLatest);
        const latest = rLatest && rLatest.data && rLatest.data.message;
        if (latest) {
          const text0 = String(latest.content || latest.text || latest.value || '');
          const h0 = this._hashMessage({ role: latest.role || 'assistant', text: text0 });
          const isNew0 = (!this._lastMessageHash || h0 !== this._lastMessageHash);
          const tsOk0 = latest.timestamp ? (latest.timestamp > sentAt) : true;
          if (isNew0 && tsOk0) {
            try { this.uiManager.showNotification('已获取最新回复', 'info'); } catch {}
            this._lastMessageHash = h0;
            if (text0 && options.onAssistant) options.onAssistant(text0);
            return true;
          }
        }

        const urlChats = this.instanceId ? `/api/chats?instance=${encodeURIComponent(this.instanceId)}` : '/api/chats';
        const chats = await this._fetchJson(urlChats);
        const { message } = this._pickLatestAssistant(chats || []);
        if (message) {
          const text = String(message.content || message.text || message.value || '');
          const h = this._hashMessage({ role: message.role || 'assistant', text });
          const isNew = (!this._lastMessageHash || h !== this._lastMessageHash);
          const tsOk = message.timestamp ? (message.timestamp > sentAt) : true;
          if (isNew && tsOk) {
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

    // 基线
    try {
      const url0 = this.instanceId ? `/api/chats?instance=${encodeURIComponent(this.instanceId)}` : '/api/chats';
      const chats = await this._fetchJson(url0);
      this._captureBaseline(chats || []);
    } catch {}

    const msgId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    try { if (this.timeline) this.timeline.appendUserMessage(typeof message === 'string' ? message : JSON.stringify(message), msgId); } catch {}

    const payload = this._embedIdIfString(message, msgId);
    const ok = this.wsManager.send({ type: 'user_message', data: payload, targetInstanceId: this.instanceId || undefined, msgId });
    if (!ok) { try { this.uiManager.showNotification('发送失败', 'error'); } catch {}; return false; }

    const sentAt = Date.now();
    try { this.uiManager.showNotification('已发送，等待回复…', 'info'); } catch {}
    try { if(this.timeline) this.timeline.markRouted(msgId); } catch {}
    try { if(this.timeline) this.timeline.showTyping(msgId); } catch {}

    this._pollReplyAfterSend(sentAt, { onAssistant: (text) => {
      try {
        if (this.timeline) {
          this.timeline.replaceTyping(msgId, String(text||''), Date.now());
          this.timeline.markReplied(msgId);
        }
      } catch {}
    }});
    return true;
  }

  // ====== WS 事件 ======
  handleWebSocketMessage(data) {
    switch (data.type) {
      case 'html_content':
        try {
          const timestamp = (data && data.data && data.data.timestamp) || data.timestamp || Date.now();
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


