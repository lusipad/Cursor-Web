/**
 * 状态管理器
 * 负责状态检查、显示和轮询功能
 */
class StatusManager {
    constructor() {
        this.statusCheckInterval = null;
        this.contentPollingInterval = null;
        this.onStatusChangeCallback = null;
        this.onContentPollingCallback = null;
        this.onStatusCheckCallback = null;
    }

    /**
     * 设置状态变化回调
     */
    setStatusChangeCallback(callback) {
        this.onStatusChangeCallback = callback;
    }

    /**
     * 设置内容轮询回调
     */
    setContentPollingCallback(callback) {
        this.onContentPollingCallback = callback;
    }

    /**
     * 设置状态检查回调
     */
    setStatusCheckCallback(callback) {
        this.onStatusCheckCallback = callback;
    }

    /**
     * 设置连接检查回调
     */
    setConnectionCheckCallback(callback) {
        this.onConnectionCheckCallback = callback;
    }

    /**
     * 开始状态检查
     */
    startStatusCheck() {
        this.statusCheckInterval = setInterval(() => {
            // 这里需要传入参数，但在这个模块中我们没有直接访问其他管理器
            // 所以通过回调来处理
            if (this.onStatusCheckCallback) {
                this.onStatusCheckCallback();
            }
        }, 15000); // 每15秒检查一次

        // 添加更频繁的连接状态检查（每5秒）
        this.connectionCheckInterval = setInterval(() => {
            if (this.onConnectionCheckCallback) {
                this.onConnectionCheckCallback();
            }
        }, 5000); // 每5秒检查一次连接状态
    }

    /**
     * 停止状态检查
     */
    stopStatusCheck() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
    }

    /**
     * 开始内容轮询（备用方案）
     */
    startContentPolling() {
        this.contentPollingInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/content');
                const result = await response.json();

                if (result.success && result.data && this.onContentPollingCallback) {
                    this.onContentPollingCallback(result.data);
                }
            } catch (error) {
                // 静默处理错误，避免控制台噪音
            }
        }, 10000); // 每10秒检查一次
    }

    /**
     * 停止内容轮询
     */
    stopContentPolling() {
        if (this.contentPollingInterval) {
            clearInterval(this.contentPollingInterval);
            this.contentPollingInterval = null;
        }
    }

    /**
     * 检查Cursor状态
     */
    checkCursorStatus(wsManager, contentManager) {
        // 首先检查WebSocket连接状态
        if (!wsManager) {
            this.updateStatus('WebSocket管理器未初始化', 'error');
            return;
        }

        if (!wsManager.isConnected()) {
            // WebSocket未连接，检查连接状态
            const connectionState = wsManager.getConnectionState();
            if (connectionState === WebSocket.CONNECTING) {
                this.updateStatus('正在连接...', 'connecting');
            } else if (connectionState === WebSocket.CLOSED) {
                this.updateStatus('连接已断开', 'disconnected');
            } else {
                this.updateStatus('连接状态异常', 'error');
            }
            return;
        }

        // WebSocket已连接，检查Cursor状态
        const now = Date.now();
        const lastContentTime = contentManager.getLastContentTime();
        const hasReceivedContent = contentManager.hasReceivedContent();
        const timeSinceLastContent = lastContentTime ? now - lastContentTime : null;

        if (!hasReceivedContent) {
            this.updateStatus('已连接 - 等待Cursor内容', 'waiting');
        } else if (timeSinceLastContent && timeSinceLastContent > 60000) {
            // 超过1分钟没有新内容，可能Cursor已关闭
            this.updateStatus('已连接 - Cursor可能已关闭', 'inactive');
        } else {
            this.updateStatus('已连接 - 同步正常', 'connected');
        }
    }

    /**
     * 更新状态显示
     */
    updateStatus(message, type) {
        if (this.onStatusChangeCallback) {
            this.onStatusChangeCallback(message, type);
        }
    }

    /**
     * 停止所有定时器
     */
    stopAll() {
        this.stopStatusCheck();
        this.stopContentPolling();
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatusManager;
} else {
    window.StatusManager = StatusManager;
}
