/**
 * 首页状态管理器
 * 专门负责在首页显示Cursor连接状态，而不是WebSocket连接状态
 */
class HomePageStatusManager {
    constructor(wsManager, cursorStatusManager, uiManager) {
        this.wsManager = wsManager;
        this.cursorStatusManager = cursorStatusManager;
        this.uiManager = uiManager;
        this.lastStatus = null;
    }

    /**
     * 更新首页状态显示
     */
    updateHomePageStatus() {
        const wsConnected = this.wsManager.isConnected();
        const cursorStatus = this.cursorStatusManager.getCursorStatus();

        let message = '';
        let type = 'unknown';

        if (!wsConnected) {
            // WebSocket未连接，显示网络问题
            const connectionState = this.wsManager.getConnectionState();
            if (connectionState === WebSocket.CONNECTING) {
                message = '正在连接网络...';
                type = 'connecting';
            } else if (connectionState === WebSocket.CLOSED) {
                message = '网络连接已断开';
                type = 'disconnected';
            } else {
                message = '网络连接异常';
                type = 'error';
            }
        } else {
            // WebSocket已连接，显示Cursor状态
            switch (cursorStatus.status) {
                case 'waiting':
                    message = '等待Cursor内容';
                    type = 'waiting';
                    break;
                case 'active':
                    message = 'Cursor活跃 - 同步正常';
                    type = 'active';
                    break;
                case 'inactive':
                    message = 'Cursor可能已关闭';
                    type = 'inactive';
                    break;
                case 'closed':
                    message = 'Cursor已关闭';
                    type = 'closed';
                    break;
                default:
                    message = '等待Cursor内容';
                    type = 'waiting';
            }
        }

        // 只有当状态发生变化时才更新UI
        const newStatus = `${message}|${type}`;
        if (this.lastStatus !== newStatus) {
            this.uiManager.updateStatus(message, type);
            this.lastStatus = newStatus;
            console.log(`🏠 首页状态更新: ${message} (${type})`);
        }
    }

    /**
     * 获取当前首页状态
     */
    getCurrentStatus() {
        const wsConnected = this.wsManager.isConnected();
        const cursorStatus = this.cursorStatusManager.getCursorStatus();

        return {
            websocketConnected: wsConnected,
            cursorStatus: cursorStatus.status,
            cursorDescription: this.cursorStatusManager.getStatusDescription(),
            displayMessage: this.lastStatus ? this.lastStatus.split('|')[0] : '未知状态'
        };
    }

    /**
     * 强制更新状态
     */
    forceUpdate() {
        this.lastStatus = null;
        this.updateHomePageStatus();
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HomePageStatusManager;
} else {
    window.HomePageStatusManager = HomePageStatusManager;
}
