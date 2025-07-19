/**
 * Simple Web Client - 重构版本
 * 主控制器，整合所有模块
 */
class SimpleWebClient {
    constructor() {
        console.log('🚀 Simple Claude Web Client 开始初始化...');

        // 初始化各个管理器
        this.wsManager = new WebSocketManager();
        this.contentManager = new ContentManager();
        this.statusManager = new StatusManager();
        this.cursorStatusManager = new CursorStatusManager();
        this.uiManager = new UIManager();
        this.homePageStatusManager = new HomePageStatusManager(this.wsManager, this.cursorStatusManager, this.uiManager);
        this.debugManager = new DebugManager(this);

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
