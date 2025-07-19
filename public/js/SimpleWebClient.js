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
        this.uiManager = new UIManager();
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

        // 初始化事件
        this.eventManager.init();
    }

    /**
     * 处理WebSocket消息
     */
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'html_content':
                this.contentManager.handleContentUpdate(data.data);
                break;
            case 'clear_content':
                this.contentManager.handleClearContent(data);
                break;
            case 'pong':
                console.log('💓 收到心跳响应');
                break;
            default:
                console.log('📥 收到未知消息类型:', data.type);
        }
    }

    /**
     * 处理WebSocket连接成功
     */
    handleWebSocketConnect() {
        if (this.contentManager.hasReceivedContent()) {
            this.uiManager.updateStatus('已连接 - 同步正常', 'connected');
        } else {
            this.uiManager.updateStatus('已连接 - 等待Cursor内容', 'waiting');
        }
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

console.log('💡 调试命令：');
console.log('  - testSendMessage("消息内容") - 测试发送消息');
console.log('  - debugEventBinding() - 检查事件绑定状态');
console.log('  - testWebSocketConnection() - 测试WebSocket连接');

console.log('✅ Simple Client JS 加载完成');
