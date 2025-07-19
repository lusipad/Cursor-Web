/**
 * 调试管理器
 * 负责调试功能和工具函数
 */
class DebugManager {
    constructor(client) {
        this.client = client;
        this.setupGlobalDebugFunctions();
    }

    /**
     * 设置全局调试函数
     */
    setupGlobalDebugFunctions() {
        // Web客户端调试功能
        window.debugWebClient = () => {
            if (!this.client) {
                console.log('❌ simpleClient 未初始化');
                return;
            }

            const container = document.getElementById('messages-container');
            const contentArea = container?.querySelector('.sync-content');

            console.log('🔍 Web 客户端调试信息：');
            console.log('  - WebSocket 状态:', this.client.wsManager?.getConnectionState() || '未连接');
            console.log('  - 当前内容长度:', this.client.contentManager?.getCurrentContent()?.length || 0);
            console.log('  - 容器元素:', container);
            console.log('  - 内容区域:', contentArea);

            if (container) {
                console.log('  - 容器高度:', container.scrollHeight, 'px');
                console.log('  - 视口高度:', container.clientHeight, 'px');
                console.log('  - 滚动位置:', container.scrollTop, 'px');
                console.log('  - 是否有滚动条:', container.scrollHeight > container.clientHeight);
            }

            if (contentArea) {
                console.log('  - 内容区域高度:', contentArea.scrollHeight, 'px');
                console.log('  - 内容区域内容长度:', contentArea.innerHTML.length);
                console.log('  - 内容预览:', contentArea.innerHTML.substring(0, 300) + '...');
            }

            // 手动触发滚动到底部
            if (container) {
                container.scrollTop = container.scrollHeight;
                console.log('📜 手动滚动到底部');
            }
        };

        // 清理状态调试功能
        window.debugClearStatus = () => {
            if (!this.client) {
                console.log('❌ simpleClient 未初始化');
                return;
            }

            const now = Date.now();
            const clearTimestamp = this.client.contentManager?.getClearTimestamp();

            console.log('🧹 清理状态调试信息：');
            console.log('  - 清理时间点:', clearTimestamp ? new Date(clearTimestamp).toLocaleString() : '未设置');
            console.log('  - 当前时间:', new Date(now).toLocaleString());

            if (clearTimestamp) {
                const timeDiff = now - clearTimestamp;
                console.log('  - 距离清理时间:', Math.floor(timeDiff / 1000), '秒');
                console.log('  - 是否已清理:', timeDiff > 0 ? '是' : '否');
            }

            // 显示当前清理状态
            const clearStatusEl = document.querySelector('.clear-status');
            console.log('  - 清理状态显示元素:', clearStatusEl);
            if (clearStatusEl) {
                console.log('  - 清理状态文本:', clearStatusEl.textContent);
            }

            // 测试时间戳比较
            const testTimestamp = now;
            console.log('  - 测试时间戳比较 (当前时间):', testTimestamp < clearTimestamp ? '会被过滤' : '不会被过滤');

            // 检查Cursor端状态
            if (window.cursorSync) {
                console.log('  - Cursor端清理时间戳:', window.cursorSync.clearTimestamp ? new Date(window.cursorSync.clearTimestamp).toLocaleString() : '未设置');
            }
        };

        // 强制清除功能
        window.forceClear = () => {
            if (!this.client) {
                console.log('❌ simpleClient 未初始化');
                return;
            }

            const now = Date.now();
            console.log('🧹 强制清除所有内容...');

            // 设置清除时间戳
            this.client.contentManager?.setClearTimestamp(now);

            // 清空界面
            this.client.uiManager?.clearContent();

            // 发送清除消息
            this.client.wsManager?.send({
                type: 'clear_content',
                timestamp: now
            });

            console.log('✅ 强制清除完成');
        };

        // 连接状态调试
        window.debugConnection = () => {
            if (!this.client) {
                console.log('❌ simpleClient 未初始化');
                return;
            }

            console.log('🔌 连接状态调试信息：');
            console.log('  - WebSocket 状态:', this.client.wsManager?.getConnectionState());
            console.log('  - 是否已连接:', this.client.wsManager?.isConnected());
            console.log('  - 重连尝试次数:', this.client.wsManager?.reconnectAttempts || 0);
            console.log('  - 最大重连次数:', this.client.wsManager?.maxReconnectAttempts || 0);
        };

        // 内容状态调试
        window.debugContent = () => {
            if (!this.client) {
                console.log('❌ simpleClient 未初始化');
                return;
            }

            console.log('📄 内容状态调试信息：');
            console.log('  - 当前内容长度:', this.client.contentManager?.getCurrentContent()?.length || 0);
            console.log('  - 是否已接收内容:', this.client.contentManager?.hasReceivedContent());
            console.log('  - 最后内容时间:', this.client.contentManager?.getLastContentTime() ? new Date(this.client.contentManager.getLastContentTime()).toLocaleString() : '无');
            console.log('  - 清理时间戳:', this.client.contentManager?.getClearTimestamp() ? new Date(this.client.contentManager.getClearTimestamp()).toLocaleString() : '无');
        };

        console.log('💡 调试命令：debugWebClient() - 查看 Web 客户端状态');
        console.log('💡 调试命令：debugClearStatus() - 查看清理状态');
        console.log('💡 调试命令：forceClear() - 强制清除所有内容');
        console.log('💡 调试命令：debugConnection() - 查看连接状态');
        console.log('💡 调试命令：debugContent() - 查看内容状态');
    }

    /**
     * 获取客户端状态信息
     */
    getClientStatus() {
        if (!this.client) {
            return { error: '客户端未初始化' };
        }

        return {
            websocket: {
                state: this.client.wsManager?.getConnectionState(),
                connected: this.client.wsManager?.isConnected(),
                reconnectAttempts: this.client.wsManager?.reconnectAttempts || 0
            },
            content: {
                currentLength: this.client.contentManager?.getCurrentContent()?.length || 0,
                hasReceived: this.client.contentManager?.hasReceivedContent(),
                lastUpdate: this.client.contentManager?.getLastContentTime() ? new Date(this.client.contentManager.getLastContentTime()).toLocaleString() : '无',
                clearTimestamp: this.client.contentManager?.getClearTimestamp() ? new Date(this.client.contentManager.getClearTimestamp()).toLocaleString() : '无'
            },
            ui: {
                containerExists: !!document.getElementById('messages-container'),
                contentAreaExists: !!document.querySelector('.sync-content'),
                statusElementExists: !!document.getElementById('status')
            }
        };
    }

    /**
     * 打印详细调试信息
     */
    printDetailedDebugInfo() {
        const status = this.getClientStatus();
        console.log('🔍 详细调试信息：', status);

        // 打印DOM元素状态
        const container = document.getElementById('messages-container');
        if (container) {
            console.log('📦 容器信息：', {
                scrollHeight: container.scrollHeight,
                clientHeight: container.clientHeight,
                scrollTop: container.scrollTop,
                hasScrollbar: container.scrollHeight > container.clientHeight
            });
        }

        // 打印WebSocket详细信息
        if (this.client?.wsManager?.ws) {
            const ws = this.client.wsManager.ws;
            console.log('🔌 WebSocket详细信息：', {
                readyState: ws.readyState,
                url: ws.url,
                protocol: ws.protocol,
                extensions: ws.extensions,
                bufferedAmount: ws.bufferedAmount
            });
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DebugManager;
} else {
    window.DebugManager = DebugManager;
}
