/**
 * Simple Web Client - 重构版本
 * 主控制器，整合所有模块
 */
class SimpleWebClient {
    constructor() {
        console.log('🚀 Simple Cursor Web Client 开始初始化...');

        // 初始化各个管理器
        this.wsManager = new WebSocketManager();
        this.contentManager = new ContentManager();
        this.statusManager = new StatusManager();
        this.cursorStatusManager = new CursorStatusManager();
        this.uiManager = new UIManager();
        this.homePageStatusManager = new HomePageStatusManager(this.wsManager, this.cursorStatusManager, this.uiManager);
        this.debugManager = new DebugManager(this);
        // 启用轻量聊天时间线（基于历史轮询）
        try { this.timeline = new ChatTimeline(); } catch {}

        // 方案1：发送后轮询历史的状态
        this._lastMessageHash = null;       // 最近消息基线哈希
        this._lastSessionId = null;         // 最近活跃会话（可选）
        this._replyPollingTimer = null;     // 轮询计时器
        this._replyPollingAbort = false;    // 轮询中断标志

        // 多网页：从 URL 读取实例ID（?instance=cursor-1）
        try {
            const url = new URL(window.location.href);
            this.instanceId = url.searchParams.get('instance') || null;
        } catch { this.instanceId = null; }

        // 设置回调函数
        this.setupCallbacks();

        // 初始化事件管理器（在所有其他管理器初始化之后）
        this.eventManager = new EventManager(this);

        // 初始化
        this.init();
    }

    /**
     * 设置各个管理器的回调函数
     */
    setupCallbacks() {
        // WebSocket管理器回调
        this.wsManager.setMessageCallback((data) => {
            this.handleWebSocketMessage(data);
        });

        this.wsManager.setStatusChangeCallback((message, type) => {
            this.uiManager.updateStatus(message, type);
        });

        this.wsManager.setConnectCallback(() => {
            this.handleWebSocketConnect();
            // 连接成功后，若设置了实例ID，则发送 register
            if (this.instanceId) {
                this.wsManager.send({ type: 'register', role: 'web', instanceId: this.instanceId });
            }
        });

        this.wsManager.setDisconnectCallback(() => {
            this.statusManager.stopStatusCheck();
            // 断开连接时使用首页状态管理器更新状态
            this.homePageStatusManager.updateHomePageStatus();
        });

        this.wsManager.setReconnectFailureCallback(() => {
            this.handleReconnectFailure();
        });

        // 内容管理器回调
        this.contentManager.setContentUpdateCallback((contentData) => {
            this.uiManager.displayContent(contentData);
        });

        this.contentManager.setClearCallback((data) => {
            this.uiManager.clearContent();
        });

        // 状态管理器回调
        this.statusManager.setStatusChangeCallback((message, type) => {
            this.uiManager.updateStatus(message, type);
        });

        this.statusManager.setContentPollingCallback((data) => {
            if (data.html !== this.contentManager.getCurrentContent()) {
                console.log('📡 HTTP轮询获取到新内容');
                this.contentManager.handleContentUpdate(data);
            }
        });

        this.statusManager.setStatusCheckCallback(() => {
            this.statusManager.checkCursorStatus(this.wsManager, this.contentManager);
        });

        this.statusManager.setConnectionCheckCallback(() => {
            // 使用首页状态管理器更新状态
            this.homePageStatusManager.updateHomePageStatus();
        });

        // Cursor状态管理器回调
        this.cursorStatusManager.setStatusChangeCallback((message, type) => {
            // 使用首页状态管理器来更新状态
            this.homePageStatusManager.updateHomePageStatus();
        });

        this.cursorStatusManager.setCursorActivityCallback((activityType) => {
            console.log(`📝 Cursor活动: ${activityType}`);
        });
    }

    /**
     * 初始化客户端
     */
    init() {
        console.log('🔧 初始化简化客户端...');

        // 连接WebSocket
        this.wsManager.connect();

        // 开始状态检查和内容轮询
        this.statusManager.startStatusCheck();
        this.statusManager.startContentPolling();

        // 开始Cursor状态监控
        this.cursorStatusManager.startMonitoring();

        // 初始化事件
        this.eventManager.init();

        // 广播初始化完成事件
        this.broadcastStatus();
    }

    // ========== 方案1：发送后轮询历史 ==========
    _hashMessage(msg) {
        try {
            const s = typeof msg === 'string' ? msg : JSON.stringify(msg || {});
            let h = 0;
            for (let i = 0; i < s.length; i++) {
                h = ((h << 5) - h) + s.charCodeAt(i);
                h |= 0;
            }
            return String(h);
        } catch { return String(Date.now()); }
    }

    async _fetchJson(url) {
        const res = await fetch(url);
        return res.json();
    }

    _pickLatestAssistant(chats) {
        if (!Array.isArray(chats)) return { session: null, message: null };
        let best = null;
        let bestSession = null;
        for (const s of chats) {
            const msgs = Array.isArray(s.messages) ? s.messages : [];
            for (let i = msgs.length - 1; i >= 0; i--) {
                const m = msgs[i];
                if (m && (m.role === 'assistant' || m.role === 'assistant_bot')) {
                    const score = (s.lastUpdatedAt || s.updatedAt || 0);
                    if (!best || score > best.score) {
                        best = { msg: m, score };
                        bestSession = s;
                    }
                    break;
                }
            }
        }
        return { session: bestSession, message: best ? best.msg : null };
    }

    _captureBaseline(chats) {
        const { session, message } = this._pickLatestAssistant(chats);
        this._lastSessionId = session?.sessionId || session?.session_id || null;
        this._lastMessageHash = message ? this._hashMessage(message) : null;
    }

    async _pollReplyAfterSend(sentAt, options = {}) {
        const delays = options.delays || [2000, 2000, 5000, 10000, 10000];
        this._replyPollingAbort = false;
        for (let i = 0; i < delays.length; i++) {
            if (this._replyPollingAbort) return false;
            await new Promise(r => this._replyPollingTimer = setTimeout(r, delays[i]));
            try {
                const url = this.instanceId ? `/api/chats?instance=${encodeURIComponent(this.instanceId)}` : '/api/chats';
                const chats = await this._fetchJson(url);
                const { session, message } = this._pickLatestAssistant(chats || []);
                if (message) {
                    const h = this._hashMessage(message);
                    const isNew = (!this._lastMessageHash || h !== this._lastMessageHash);
                    const tsOk = message.timestamp ? (message.timestamp > sentAt) : true;
                    if (isNew && tsOk) {
                        // 在现有 UI 上，直接触发一次“内容刷新”即可（后端也在同步HTML）
                        // 若需要可在此处追加一段简要提示
                        this.uiManager.showNotification('已获取最新回复', 'info');
                        // 更新基线，避免重复提示
                        this._lastMessageHash = h;
                        try { const text = message && (message.content || message.text || message.value || ''); if (text && options.onAssistant) options.onAssistant(text); } catch {}
                        return true;
                    }
                }
                // 第三次后尝试清理后端缓存
                if (i === 2) {
                    try { await this._fetchJson('/api/history/cache/clear'); } catch {}
                }
            } catch (e) {
                // 静默失败，继续下一轮
            }
        }
        this.uiManager.showNotification('等待回复超时，可稍后在历史里查看', 'warning');
        return false;
    }

    async sendAndPoll(message) {
        if (!this.wsManager.isConnected()) {
            this.uiManager.showNotification('WebSocket 未连接，无法发送', 'error');
            return false;
        }
        // 发送前抓取一次基线（最近助手消息）
        try {
            const url0 = this.instanceId ? `/api/chats?instance=${encodeURIComponent(this.instanceId)}` : '/api/chats';
            const chats = await this._fetchJson(url0);
            this._captureBaseline(chats || []);
        } catch {}
        // 本地时间线先展示用户消息，并生成 msgId
        const msgId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
        try { if (this.timeline) { this.timeline.appendUserMessage(typeof message === 'string' ? message : JSON.stringify(message), msgId); } } catch {}

        const ok = this.wsManager.send({ type: 'user_message', data: message, targetInstanceId: this.instanceId || undefined, msgId });
        if (!ok) {
            this.uiManager.showNotification('发送失败', 'error');
            return false;
        }
        const sentAt = Date.now();
        this.uiManager.showNotification('已发送，等待回复…', 'info');
        // 后台轮询，不阻塞 UI
        // 已路由（本端直接点亮），等待注入端ACK与历史回复
        try { if(this.timeline) this.timeline.markRouted(msgId); } catch {}
        this._pollReplyAfterSend(sentAt, { onAssistant: (text) => { try { if (this.timeline){ this.timeline.appendAssistantMessage(String(text||'')); this.timeline.markReplied(msgId);} } catch {} } });
        return true;
    }

    /**
     * 广播状态到其他页面
     */
    broadcastStatus() {
        if (window.localStorage) {
            const status = {
                timestamp: Date.now(),
                isConnected: this.wsManager.isConnected(),
                connectionState: this.wsManager.getConnectionState(),
                reconnectAttempts: this.wsManager.reconnectAttempts || 0
            };
            localStorage.setItem('websocket_status', JSON.stringify(status));
        }
    }

    /**
     * 处理WebSocket消息
     */
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'html_content':
                this.contentManager.handleContentUpdate(data.data);
                // 记录Cursor内容更新活动
                const timestamp = data.data.timestamp || data.timestamp || Date.now();
                this.cursorStatusManager.recordContentUpdate(timestamp);
                break;
            case 'clear_content':
                this.contentManager.handleClearContent(data);
                // 记录Cursor清除活动
                this.cursorStatusManager.recordCursorActivity('clear_content');
                break;
            case 'delivery_ack':
                try{ if(this.timeline && data.msgId){ this.timeline.markDelivered(data.msgId); } }catch{}
                break;
            case 'delivery_error':
                try{ this.uiManager.showNotification('注入失败：'+(data.reason||'unknown'),'warning'); }catch{}
                break;
            case 'pong':
                console.log('💓 收到心跳响应');
                // 记录Cursor心跳活动
                this.cursorStatusManager.recordCursorActivity('pong');
                break;
            default:
                console.log('📥 收到未知消息类型:', data.type);
                // 记录其他Cursor活动
                this.cursorStatusManager.recordCursorActivity('message_received');
        }
    }

    /**
     * 处理WebSocket连接成功
     */
    handleWebSocketConnect() {
        // WebSocket连接成功，使用首页状态管理器更新状态
        this.homePageStatusManager.updateHomePageStatus();
    }

    /**
     * 处理重连失败
     */
    handleReconnectFailure() {
        this.uiManager.showReconnectButton(() => {
            this.wsManager.manualReconnect();
        });
    }

    /**
     * 清理资源
     */
    cleanup() {
        console.log('🧹 清理客户端资源...');

        // 停止所有定时器
        this.statusManager.stopAll();

        // 停止Cursor状态监控
        this.cursorStatusManager.stopMonitoring();

        // 关闭WebSocket连接
        this.wsManager.close();

        // 解绑所有事件
        this.eventManager.unbindAllEvents();

        // 隐藏清理通知
        this.uiManager.hideClearNotification();
    }

    /**
     * 获取客户端状态
     */
    getStatus() {
        return this.debugManager.getClientStatus();
    }

    /**
     * 强制清除内容
     */
    forceClear() {
        const now = Date.now();
        console.log('🧹 强制清除所有内容...');

        // 设置清除时间戳
        this.contentManager.setClearTimestamp(now);

        // 清空界面
        this.uiManager.clearContent();

        // 发送清除消息
        this.wsManager.send({
            type: 'clear_content',
            timestamp: now
        });

        console.log('✅ 强制清除完成');
    }

    /**
     * 手动重连
     */
    reconnect() {
        console.log('🔄 手动重连...');
        this.wsManager.manualReconnect();
    }

    /**
     * 手动断开连接（用于测试）
     */
    disconnect() {
        console.log('🔌 手动断开连接...');
        this.wsManager.manualDisconnect();
    }

    /**
     * 发送消息
     */
    sendMessage(message) {
        if (this.wsManager.isConnected()) {
            return this.wsManager.send({ type: 'user_message', data: message });
        }
        return false;
    }

    /**
     * 检查连接状态
     */
    isConnected() {
        return this.wsManager.isConnected();
    }

    /**
     * 获取Cursor状态
     */
    getCursorStatus() {
        return this.cursorStatusManager.getCursorStatus();
    }

    /**
     * 获取完整状态信息
     */
    getFullStatus() {
        return {
            websocket: {
                isConnected: this.wsManager.isConnected(),
                connectionState: this.wsManager.getConnectionState(),
                reconnectAttempts: this.wsManager.reconnectAttempts || 0
            },
            cursor: this.cursorStatusManager.getCursorStatus(),
            content: {
                hasReceivedContent: this.contentManager.hasReceivedContent(),
                lastContentTime: this.contentManager.getLastContentTime()
            },
            homePage: this.homePageStatusManager.getCurrentStatus()
        };
    }

    /**
     * 获取首页状态
     */
    getHomePageStatus() {
        return this.homePageStatusManager.getCurrentStatus();
    }

    /**
     * 模拟Cursor活动（用于测试）
     */
    simulateCursorActivity() {
        if (this.cursorStatusManager) {
            this.cursorStatusManager.simulateCursorActivity();
        }
    }

    /**
     * 模拟Cursor关闭（用于测试）
     */
    simulateCursorClose() {
        if (this.cursorStatusManager) {
            this.cursorStatusManager.simulateCursorClose();
        }
    }

    /**
     * 获取WebSocket状态
     */
    getConnectionState() {
        return this.wsManager.getConnectionState();
    }

    /**
     * 测试发送消息功能
     */
    testSendMessage(message = '测试消息') {
        console.log('🧪 测试发送消息功能...');
        console.log('  - 消息内容:', message);
        console.log('  - WebSocket管理器:', this.wsManager);
        console.log('  - 连接状态:', this.wsManager ? this.wsManager.getConnectionState() : '未初始化');
        console.log('  - 是否已连接:', this.wsManager ? this.wsManager.isConnected() : false);

        if (this.wsManager && this.wsManager.isConnected()) {
            const success = this.sendMessage(message);
            console.log('  - 发送结果:', success);
            return success;
        } else {
            console.error('  - 无法发送：WebSocket未连接');
            return false;
        }
    }
}

// 添加全局调试函数
window.testSendMessage = (message) => {
    if (window.simpleClient) {
        return window.simpleClient.testSendMessage(message);
    } else {
        console.error('❌ simpleClient 未初始化');
        return false;
    }
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
        console.log('  - WebSocket状态:', window.simpleClient.getConnectionState());
        console.log('  - 是否已连接:', window.simpleClient.isConnected());
    } else {
        console.error('❌ simpleClient 或 eventManager 未初始化');
    }
};

window.testWebSocketConnection = () => {
    console.log('🔌 WebSocket连接测试...');
    console.log('  - 当前页面URL:', window.location.href);
    console.log('  - 协议:', window.location.protocol);
    console.log('  - 主机:', window.location.hostname);
    console.log('  - 端口:', window.location.port);

    if (window.simpleClient && window.simpleClient.wsManager) {
        console.log('  - WebSocket管理器:', window.simpleClient.wsManager);
        console.log('  - 连接状态:', window.simpleClient.wsManager.getConnectionState());
        console.log('  - 是否已连接:', window.simpleClient.wsManager.isConnected());

        // 尝试手动重连
        console.log('  - 尝试手动重连...');
        window.simpleClient.wsManager.manualReconnect();
    } else {
        console.error('  - WebSocket管理器未初始化');
    }
};

// 测试断开连接
window.testDisconnect = () => {
    console.log('🔌 测试断开连接...');
    if (window.simpleClient) {
        window.simpleClient.disconnect();
    } else {
        console.error('❌ simpleClient 未初始化');
    }
};

// 检查当前连接状态
window.checkConnectionStatus = () => {
    console.log('🔍 检查连接状态...');
    if (window.simpleClient) {
        const wsManager = window.simpleClient.wsManager;
        const states = ['连接中', '已连接', '关闭中', '已关闭'];
        console.log('  - WebSocket状态:', states[wsManager.getConnectionState()] || '未知');
        console.log('  - 是否已连接:', wsManager.isConnected());
        console.log('  - 重连尝试次数:', wsManager.reconnectAttempts || 0);

        // 检查页面状态显示
        const statusEl = document.getElementById('status');
        if (statusEl) {
            console.log('  - 页面状态显示:', statusEl.textContent);
            console.log('  - 状态样式类:', statusEl.className);
        }
    } else {
        console.error('❌ simpleClient 未初始化');
    }
};

// 获取全局状态信息
window.getGlobalStatus = () => {
    const status = {
        hasSimpleClient: !!window.simpleClient,
        hasWebSocketManager: !!(window.simpleClient && window.simpleClient.wsManager),
        hasCursorStatusManager: !!(window.simpleClient && window.simpleClient.cursorStatusManager),
        websocket: {
            connectionState: null,
            isConnected: false,
            reconnectAttempts: 0
        },
        cursor: {
            status: null,
            description: null,
            lastContentTime: null,
            lastActivityTime: null
        },
        pageStatus: null
    };

    if (window.simpleClient) {
        if (window.simpleClient.wsManager) {
            const wsManager = window.simpleClient.wsManager;
            status.websocket.connectionState = wsManager.getConnectionState();
            status.websocket.isConnected = wsManager.isConnected();
            status.websocket.reconnectAttempts = wsManager.reconnectAttempts || 0;
        }

        if (window.simpleClient.cursorStatusManager) {
            const cursorStatus = window.simpleClient.cursorStatusManager.getCursorStatus();
            status.cursor.status = cursorStatus.status;
            status.cursor.description = window.simpleClient.cursorStatusManager.getStatusDescription();
            status.cursor.lastContentTime = cursorStatus.lastContentTime;
            status.cursor.lastActivityTime = cursorStatus.lastActivityTime;
        }
    }

    // 检查页面状态显示
    const statusEl = document.getElementById('status');
    if (statusEl) {
        status.pageStatus = {
            text: statusEl.textContent,
            className: statusEl.className
        };
    }

    return status;
};

// 同步所有页面状态
window.syncAllPagesStatus = () => {
    const status = window.getGlobalStatus();
    console.log('🔄 同步所有页面状态:', status);

    if (window.localStorage) {
        localStorage.setItem('websocket_status', JSON.stringify(status));
    }

    return status;
};

// 检查Cursor状态
window.checkCursorStatus = () => {
    console.log('🔍 检查Cursor状态...');
    if (window.simpleClient && window.simpleClient.cursorStatusManager) {
        const status = window.simpleClient.cursorStatusManager.getCursorStatus();
        const description = window.simpleClient.cursorStatusManager.getStatusDescription();
        console.log('  - Cursor状态:', status.status);
        console.log('  - 状态描述:', description);
        console.log('  - 最后内容时间:', status.lastContentTime ? new Date(status.lastContentTime).toLocaleTimeString() : '无');
        console.log('  - 最后活动时间:', status.lastActivityTime ? new Date(status.lastActivityTime).toLocaleTimeString() : '无');
        console.log('  - 距内容更新时间:', status.timeSinceContent ? `${Math.round(status.timeSinceContent / 1000)}秒` : '无');
        console.log('  - 距活动时间:', status.timeSinceActivity ? `${Math.round(status.timeSinceActivity / 1000)}秒` : '无');
    } else {
        console.error('❌ Cursor状态管理器未初始化');
    }
};

// 获取完整状态
window.getFullStatus = () => {
    console.log('🔍 获取完整状态信息...');
    if (window.simpleClient) {
        const status = window.simpleClient.getFullStatus();
        console.log('完整状态:', status);
        return status;
    } else {
        console.error('❌ simpleClient 未初始化');
        return null;
    }
};

// 检查首页状态
window.checkHomePageStatus = () => {
    console.log('🏠 检查首页状态...');
    if (window.simpleClient) {
        const status = window.simpleClient.getHomePageStatus();
        console.log('首页状态:', status);
        return status;
    } else {
        console.error('❌ simpleClient 未初始化');
        return null;
    }
};

// 模拟Cursor活动（测试用）
window.simulateCursorActivity = () => {
    console.log('🧪 模拟Cursor活动...');
    if (window.simpleClient) {
        window.simpleClient.simulateCursorActivity();
    } else {
        console.error('❌ simpleClient 未初始化');
    }
};

// 模拟Cursor关闭（测试用）
window.simulateCursorClose = () => {
    console.log('🧪 模拟Cursor关闭...');
    if (window.simpleClient) {
        window.simpleClient.simulateCursorClose();
    } else {
        console.error('❌ simpleClient 未初始化');
    }
};

console.log('💡 调试命令：');
console.log('  - testSendMessage("消息内容") - 测试发送消息');
console.log('  - debugEventBinding() - 检查事件绑定状态');
console.log('  - testWebSocketConnection() - 测试WebSocket连接');
console.log('  - testDisconnect() - 测试断开连接');
console.log('  - checkConnectionStatus() - 检查WebSocket连接状态');
console.log('  - checkCursorStatus() - 检查Cursor状态');
console.log('  - checkHomePageStatus() - 检查首页状态');
console.log('  - getFullStatus() - 获取完整状态信息');
console.log('  - getGlobalStatus() - 获取全局状态信息');
console.log('  - syncAllPagesStatus() - 同步所有页面状态');
console.log('  - simulateCursorActivity() - 模拟Cursor活动（测试）');
console.log('  - simulateCursorClose() - 模拟Cursor关闭（测试）');

console.log('✅ Simple Client JS 加载完成');

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SimpleWebClient;
} else {
    window.SimpleWebClient = SimpleWebClient;
}
