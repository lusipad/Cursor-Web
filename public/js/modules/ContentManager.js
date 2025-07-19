/**
 * 内容管理器
 * 负责内容的显示、更新、清理等功能
 */
class ContentManager {
    constructor() {
        this.currentContent = '';
        this._hasReceivedContent = false;  // 使用下划线前缀避免与方法名冲突
        this.lastContentTime = null;
        this.clearTimestamp = null;
        this.onContentUpdateCallback = null;
        this.onClearCallback = null;
    }

    /**
     * 设置内容更新回调
     */
    setContentUpdateCallback(callback) {
        this.onContentUpdateCallback = callback;
    }

    /**
     * 设置清理回调
     */
    setClearCallback(callback) {
        this.onClearCallback = callback;
    }

    /**
     * 处理内容更新
     */
    handleContentUpdate(contentData) {
        try {
            const { html, timestamp } = contentData;

            // 检查是否需要过滤清除时间点之前的内容
            if (this.clearTimestamp && timestamp < this.clearTimestamp) {
                console.log('⏰ 跳过清理时间点之前的内容:', new Date(timestamp).toLocaleTimeString());
                return;
            }

            if (html) {
                // 改进的内容变化检测
                const contentChanged = html !== this.currentContent;
                const lengthChanged = html.length !== this.currentContent.length;
                const forceUpdate = timestamp && (!this.lastContentTime || timestamp > this.lastContentTime);

                if (contentChanged || lengthChanged || forceUpdate) {
                    console.log('🔄 内容更新触发:', {
                        contentChanged,
                        lengthChanged,
                        forceUpdate,
                        oldLength: this.currentContent.length,
                        newLength: html.length
                    });

                    this.currentContent = html;
                    this._hasReceivedContent = true;
                    this.lastContentTime = Date.now();

                    if (this.onContentUpdateCallback) {
                        this.onContentUpdateCallback(contentData);
                    }
                } else {
                    console.log('📋 内容无变化，跳过更新');
                }
            }
        } catch (error) {
            console.error('❌ 处理内容更新时发生错误:', error);
        }
    }

    /**
     * 处理清理内容
     */
    handleClearContent(data) {
        this.currentContent = '';

        // 同步清除时间戳
        if (data.timestamp) {
            this.clearTimestamp = data.timestamp;
            console.log('🧹 同步清除时间戳:', new Date(data.timestamp).toLocaleTimeString());
        }

        if (this.onClearCallback) {
            this.onClearCallback(data);
        }
    }

    /**
     * 设置清理时间戳
     */
    setClearTimestamp(timestamp) {
        this.clearTimestamp = timestamp;
        console.log('🧹 设置清理时间点:', new Date(timestamp).toLocaleTimeString());
    }

    /**
     * 获取当前内容
     */
    getCurrentContent() {
        return this.currentContent;
    }

    /**
     * 获取最后内容时间
     */
    getLastContentTime() {
        return this.lastContentTime;
    }

    /**
     * 获取清理时间戳
     */
    getClearTimestamp() {
        return this.clearTimestamp;
    }

    /**
     * 检查是否已接收内容
     */
    hasReceivedContent() {
        return this._hasReceivedContent;
    }

    /**
     * 重置内容状态
     */
    reset() {
        this.currentContent = '';
        this._hasReceivedContent = false;
        this.lastContentTime = null;
        this.clearTimestamp = null;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ContentManager;
} else {
    window.ContentManager = ContentManager;
}
