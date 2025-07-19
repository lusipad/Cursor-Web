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

        // 动态获取WebSocket URL，支持局域网访问
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname;
        const port = window.location.port || '3000';
        const wsUrl = `${protocol}//${host}:${port}`;

        console.log('🔌 尝试连接WebSocket:', wsUrl);
        console.log('🔍 连接详情:', {
            protocol: window.location.protocol,
            hostname: window.location.hostname,
            port: window.location.port,
            fullUrl: window.location.href
        });
        this.updateStatus('正在连接...', 'connecting');

        this.ws = new WebSocket(wsUrl);

        // 连接超时处理
        const connectionTimeout = setTimeout(() => {
            if (this.ws.readyState === WebSocket.CONNECTING) {
                console.error('⏰ WebSocket 连接超时');
                this.ws.close();
                this.updateStatus('连接超时', 'error');
            }
        }, 10000); // 10秒超时

        // 自动重连设置
        this.ws.onopen = () => {
            console.log('✅ WebSocket 连接成功');
            clearTimeout(connectionTimeout);
            this.reconnectAttempts = 0;
            this.startHeartbeat();

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

            if (this.onDisconnectCallback) {
                this.onDisconnectCallback();
            }

            if (event.code !== 1000) {
                this.updateStatus('连接断开 - 正在重连...', 'disconnected');
                this.attemptReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('⚠️ WebSocket 错误:', error);
            console.error('🔍 错误详情:', {
                error: error,
                readyState: this.ws.readyState,
                url: wsUrl
            });
            this.updateStatus('连接错误', 'error');
        };
    }

    /**
     * 发送消息
     */
    send(message) {
        console.log('📤 WebSocket发送消息:', message);

        if (!this.ws) {
            console.error('❌ WebSocket实例不存在');
            return false;
        }

        if (this.ws.readyState !== WebSocket.OPEN) {
            console.error('❌ WebSocket未连接，状态:', this.ws.readyState);
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
            this.updateStatus(`正在重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`, 'reconnecting');

            setTimeout(() => {
                this.connect();
            }, delay);
        } else {
            console.log('❌ 重连失败，已达到最大尝试次数');
            this.updateStatus('连接失败 - 请刷新页面', 'error');

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
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketManager;
} else {
    window.WebSocketManager = WebSocketManager;
}
