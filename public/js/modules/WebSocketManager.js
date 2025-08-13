/**
 * WebSocket管理器
 * 负责WebSocket连接、重连、心跳等功能
 */
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.heartbeatInterval = null;
        this.onMessageCallback = null;
        this.onStatusChangeCallback = null;
        this.onConnectCallback = null;
        this.onDisconnectCallback = null;
        this.onReconnectFailureCallback = null;
        // 连接候选与状态
        this._wsCandidates = null;
        this._wsIndex = 0;
        this._opened = false;
    }

    /**
     * 设置消息处理回调
     */
    setMessageCallback(callback) {
        this.onMessageCallback = callback;
    }

    /**
     * 设置状态变化回调
     */
    setStatusChangeCallback(callback) {
        this.onStatusChangeCallback = callback;
    }

    /**
     * 设置连接成功回调
     */
    setConnectCallback(callback) {
        this.onConnectCallback = callback;
    }

    /**
     * 设置断开连接回调
     */
    setDisconnectCallback(callback) {
        this.onDisconnectCallback = callback;
    }

    /**
     * 设置重连失败回调
     */
    setReconnectFailureCallback(callback) {
        this.onReconnectFailureCallback = callback;
    }

    /**
     * 连接WebSocket
     */
    connect() {
        if (this.ws) {
            this.ws.close();
        }

        // 构建候选列表（支持 ?ws= 覆盖、多端口/主机回退）
        this._wsCandidates = this._buildCandidates();
        this._wsIndex = 0;
        this._opened = false;
        this._connectToCurrentCandidate();
    }

    _buildCandidates(){
        const urls = [];
        // 1) URL 覆盖：?ws=ws://ip:port
        try{
            const u = new URL(window.location.href);
            const override = u.searchParams.get('ws');
            if (override && /^wss?:\/\//i.test(override)) urls.push(override);
        }catch{}
        // 2) window.__cursorWS（注入端常用）
        try{ if (typeof window.__cursorWS === 'string' && /^wss?:\/\//i.test(window.__cursorWS)) urls.push(window.__cursorWS); }catch{}
        // 3) 同源地址
        try{
            const isHttps = (window.location && window.location.protocol === 'https:');
            const protocol = isHttps ? 'wss:' : 'ws:';
            const host = (window.location && window.location.hostname) || '';
            const port = (window.location && window.location.port) ? `:${window.location.port}` : ':3000';
            if (host) urls.push(`${protocol}//${host}${port}`);
        }catch{}
        // 4) 回退：localhost 与 127.0.0.1
        urls.push('ws://localhost:3000', 'ws://127.0.0.1:3000');
        // 去重
        return Array.from(new Set(urls));
    }

    _connectToCurrentCandidate(){
        const target = this._wsCandidates[this._wsIndex] || '';
        try{ window.Audit && Audit.log('ws_try', 'connect', { url: target, index: this._wsIndex }); }catch{}
        if (!target){ this.updateStatus('找不到可用的 WebSocket 地址', 'error'); return; }

        console.log('🔌 尝试连接WebSocket:', target);
        this.updateStatus('正在连接网络...', 'connecting');

        this.ws = new WebSocket(target);

        // 连接超时处理
        const connectionTimeout = setTimeout(() => {
            if (this.ws.readyState === WebSocket.CONNECTING) {
                console.error('⏰ WebSocket 连接超时');
                this.ws.close();
                this.updateStatus('网络连接超时', 'error');
                this._tryNextCandidate();
            }
        }, 10000); // 10秒超时

        // 自动重连设置
        this.ws.onopen = () => {
            console.log('✅ WebSocket 连接成功');
            try{ window.Audit && Audit.log('ws', 'open', { url: target }); }catch{}
            clearTimeout(connectionTimeout);
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this._opened = true;

            if (this.onConnectCallback) {
                this.onConnectCallback();
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('📥 收到消息:', data.type);

                if (this.onMessageCallback) {
                    this.onMessageCallback(data);
                }
            } catch (error) {
                console.error('WebSocket 消息处理错误:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('❌ WebSocket 连接关闭:', event.code, event.reason);
            console.log('🔍 关闭详情:', {
                code: event.code,
                reason: event.reason,
                wasClean: event.wasClean,
                readyState: this.ws.readyState
            });
            this.stopHeartbeat();

            // 无论什么原因断开连接，都要更新状态
            if (event.code === 1000) {
                // 正常关闭
                this.updateStatus('网络连接已断开', 'disconnected');
            } else {
                // 异常断开，尝试重连
                this.updateStatus('网络连接断开 - 正在重连...', 'disconnected');
                if (!this._opened) { this._tryNextCandidate(); }
                else { this.attemptReconnect(); }
            }

            if (this.onDisconnectCallback) {
                this.onDisconnectCallback();
            }
        };

        this.ws.onerror = (error) => {
            console.error('⚠️ WebSocket 错误:', error);
            console.error('🔍 错误详情:', {
                error: error,
                readyState: this.ws.readyState,
                url: target
            });
            this.updateStatus('网络连接错误', 'error');
            try { console.warn('WebSocket 连接地址:', target); } catch {}
            if (!this._opened) { this._tryNextCandidate(); }
        };
    }

    _tryNextCandidate(){
        if (this._wsCandidates && this._wsIndex < this._wsCandidates.length - 1){
            this._wsIndex += 1;
            setTimeout(()=> this._connectToCurrentCandidate(), 300);
            return;
        }
        // 候选都失败，走原有重连流程
        this.attemptReconnect();
    }

    /**
     * 发送消息
     */
    send(message) {
        console.log('📤 WebSocket发送消息:', message);

        if (!this.ws) {
            console.error('❌ WebSocket实例不存在');
            try{ this.onMessageCallback && this.onMessageCallback({ type:'delivery_error', reason:'ws_not_initialized', msgId: message?.msgId||null, instanceId: message?.targetInstanceId||null }); }catch{}
            return false;
        }

        if (this.ws.readyState !== WebSocket.OPEN) {
            console.error('❌ WebSocket未连接，状态:', this.ws.readyState);
            try{ this.onMessageCallback && this.onMessageCallback({ type:'delivery_error', reason:'ws_not_connected', msgId: message?.msgId||null, instanceId: message?.targetInstanceId||null }); }catch{}
            return false;
        }

        try {
            const messageStr = JSON.stringify(message);
            this.ws.send(messageStr);
            console.log('✅ 消息发送成功:', messageStr);
            return true;
        } catch (error) {
            console.error('❌ 发送消息时发生错误:', error);
            return false;
        }
    }

    /**
     * 心跳检测
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * 重连机制
     */
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1); // 指数退避
            console.log(`🔄 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，${delay/1000}秒后重试...`);
            this.updateStatus(`网络重连中 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'reconnecting');

            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            console.log('❌ 重连失败，已达到最大尝试次数');
            this.updateStatus('网络连接失败 - 请刷新页面', 'error');

            // 通知主客户端处理重连失败
            if (this.onReconnectFailureCallback) {
                this.onReconnectFailureCallback();
            }
        }
    }

    /**
     * 手动重连
     */
    manualReconnect() {
        this.reconnectAttempts = 0;
        this.connect();
    }

    /**
     * 更新状态
     */
    updateStatus(message, type) {
        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback(message, type);
        }

        // 广播状态变化
        this.broadcastStatusChange(message, type);
    }

    /**
     * 广播状态变化到其他页面
     */
    broadcastStatusChange(message, type) {
        if (window.localStorage) {
            const status = {
                timestamp: Date.now(),
                message: message,
                type: type,
                isConnected: this.isConnected(),
                connectionState: this.getConnectionState(),
                reconnectAttempts: this.reconnectAttempts || 0
            };
            localStorage.setItem('websocket_status', JSON.stringify(status));

            // 触发storage事件，通知其他页面
            window.dispatchEvent(new StorageEvent('storage', {
                key: 'websocket_status',
                newValue: JSON.stringify(status)
            }));
        }
    }

    /**
     * 获取连接状态
     */
    getConnectionState() {
        return this.ws ? this.ws.readyState : WebSocket.CLOSED;
    }

    /**
     * 检查是否已连接
     */
    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    /**
     * 关闭连接
     */
    close() {
        if (this.ws) {
            this.ws.close();
        }
        this.stopHeartbeat();
    }

    /**
     * 手动断开连接（用于测试）
     */
    manualDisconnect() {
        console.log('🔌 手动断开WebSocket连接');
        if (this.ws) {
            this.ws.close(1000, '用户手动断开');
        }
        this.stopHeartbeat();
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketManager;
} else {
    window.WebSocketManager = WebSocketManager;
}
