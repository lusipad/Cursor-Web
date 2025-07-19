/**
 * Cursor状态管理器
 * 专门负责检测和管理Cursor应用的状态
 */
class CursorStatusManager {
    constructor() {
        this.lastContentTime = null;
        this.lastCursorActivity = null;
        this.cursorStatus = 'waiting'; // waiting, active, inactive, closed
        this.statusCheckInterval = null;
        this.onStatusChangeCallback = null;
        this.onCursorActivityCallback = null;

        // Cursor状态检测配置
        this.config = {
            activityTimeout: 30000,    // 30秒无活动认为Cursor可能关闭
            contentTimeout: 60000,     // 60秒无内容更新认为Cursor可能关闭
            checkInterval: 10000,      // 每10秒检查一次Cursor状态
            heartbeatInterval: 5000    // 每5秒发送心跳检测
        };
    }

    /**
     * 设置状态变化回调
     */
    setStatusChangeCallback(callback) {
        this.onStatusChangeCallback = callback;
    }

    /**
     * 设置Cursor活动回调
     */
    setCursorActivityCallback(callback) {
        this.onCursorActivityCallback = callback;
    }

    /**
     * 开始Cursor状态监控
     */
    startMonitoring() {
        console.log('🔍 开始Cursor状态监控...');

        // 定期检查Cursor状态
        this.statusCheckInterval = setInterval(() => {
            this.checkCursorStatus();
        }, this.config.checkInterval);

        // 定期发送心跳检测
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, this.config.heartbeatInterval);
    }

    /**
     * 停止Cursor状态监控
     */
    stopMonitoring() {
        if (this.statusCheckInterval) {
            clearInterval(this.statusCheckInterval);
            this.statusCheckInterval = null;
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        console.log('🛑 停止Cursor状态监控');
    }

    /**
     * 检查Cursor状态
     */
    checkCursorStatus() {
        const now = Date.now();
        let newStatus = 'unknown';
        let statusMessage = '';
        let statusType = 'unknown';

        // 检查是否有内容更新
        if (this.lastContentTime) {
            const timeSinceContent = now - this.lastContentTime;

            if (timeSinceContent < this.config.contentTimeout) {
                // 最近有内容更新，Cursor应该是活跃的
                newStatus = 'active';
                statusMessage = 'Cursor活跃 - 同步正常';
                statusType = 'active';
            } else if (timeSinceContent < this.config.contentTimeout * 2) {
                // 较长时间没有内容更新，Cursor可能不活跃
                newStatus = 'inactive';
                statusMessage = 'Cursor可能已关闭';
                statusType = 'inactive';
            } else {
                // 很长时间没有内容更新，Cursor很可能已关闭
                newStatus = 'closed';
                statusMessage = 'Cursor已关闭';
                statusType = 'closed';
            }
        } else {
            // 从未收到过内容
            newStatus = 'waiting';
            statusMessage = '等待Cursor内容';
            statusType = 'waiting';
        }

        // 检查Cursor活动状态
        if (this.lastCursorActivity) {
            const timeSinceActivity = now - this.lastCursorActivity;
            if (timeSinceActivity > this.config.activityTimeout) {
                // 长时间无活动，降级状态
                if (newStatus === 'active') {
                    newStatus = 'inactive';
                    statusMessage = 'Cursor可能不活跃';
                    statusType = 'inactive';
                }
            }
        }

        // 状态发生变化时更新
        if (this.cursorStatus !== newStatus) {
            console.log(`🔄 Cursor状态变化: ${this.cursorStatus} -> ${newStatus}`);
            this.cursorStatus = newStatus;

            if (this.onStatusChangeCallback) {
                this.onStatusChangeCallback(statusMessage, statusType);
            }
        }

        // 记录调试信息
        this.logStatusInfo(now);
    }

    /**
     * 记录Cursor活动
     */
    recordCursorActivity(activityType = 'general') {
        this.lastCursorActivity = Date.now();
        console.log(`📝 记录Cursor活动: ${activityType}`);

        if (this.onCursorActivityCallback) {
            this.onCursorActivityCallback(activityType);
        }
    }

    /**
     * 记录内容更新
     */
    recordContentUpdate(timestamp = Date.now()) {
        this.lastContentTime = timestamp;
        this.recordCursorActivity('content_update');
        console.log(`📄 记录内容更新: ${new Date(timestamp).toLocaleTimeString()}`);
    }

    /**
     * 发送心跳检测
     */
    sendHeartbeat() {
        // 这里可以发送特定的心跳消息来检测Cursor是否响应
        // 目前只是记录心跳时间
        this.recordCursorActivity('heartbeat');
    }

    /**
     * 获取Cursor状态
     */
    getCursorStatus() {
        return {
            status: this.cursorStatus,
            lastContentTime: this.lastContentTime,
            lastActivityTime: this.lastCursorActivity,
            timeSinceContent: this.lastContentTime ? Date.now() - this.lastContentTime : null,
            timeSinceActivity: this.lastCursorActivity ? Date.now() - this.lastCursorActivity : null
        };
    }

    /**
     * 获取状态描述
     */
    getStatusDescription() {
        const statusMap = {
            'unknown': '未知状态',
            'active': 'Cursor活跃',
            'inactive': 'Cursor不活跃',
            'closed': 'Cursor已关闭',
            'waiting': '等待Cursor内容'
        };
        return statusMap[this.cursorStatus] || '未知状态';
    }

    /**
     * 重置状态
     */
    reset() {
        this.lastContentTime = null;
        this.lastCursorActivity = null;
        this.cursorStatus = 'waiting';
        console.log('🔄 Cursor状态已重置');
    }

    /**
     * 记录状态信息（调试用）
     */
    logStatusInfo(now) {
        const status = this.getCursorStatus();
        console.log('🔍 Cursor状态信息:', {
            status: status.status,
            description: this.getStatusDescription(),
            lastContent: status.lastContentTime ? new Date(status.lastContentTime).toLocaleTimeString() : '无',
            lastActivity: status.lastActivityTime ? new Date(status.lastActivityTime).toLocaleTimeString() : '无',
            timeSinceContent: status.timeSinceContent ? `${Math.round(status.timeSinceContent / 1000)}秒` : '无',
            timeSinceActivity: status.timeSinceActivity ? `${Math.round(status.timeSinceActivity / 1000)}秒` : '无'
        });
    }

    /**
     * 更新配置
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('⚙️ Cursor状态管理器配置已更新:', this.config);
    }

    /**
     * 模拟Cursor活动（用于测试）
     */
    simulateCursorActivity() {
        console.log('🧪 模拟Cursor活动...');
        this.recordCursorActivity('simulated_activity');
        this.recordContentUpdate();
    }

    /**
     * 模拟Cursor关闭（用于测试）
     */
    simulateCursorClose() {
        console.log('🧪 模拟Cursor关闭...');
        this.lastContentTime = Date.now() - this.config.contentTimeout * 3; // 设置为很久以前
        this.lastCursorActivity = Date.now() - this.config.activityTimeout * 2;
        this.checkCursorStatus();
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CursorStatusManager;
} else {
    window.CursorStatusManager = CursorStatusManager;
}
