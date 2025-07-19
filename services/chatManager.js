// 聊天内容管理器
class ChatManager {
    constructor() {
        this.currentChatContent = '';
        this.globalClearTimestamp = null;
    }

    // 更新聊天内容
    updateContent(html, timestamp) {
        // 检查是否需要过滤清除时间点之前的内容
        if (this.globalClearTimestamp && timestamp && timestamp < this.globalClearTimestamp) {
            console.log('⏰ 服务器端过滤清除时间点之前的内容:', new Date(timestamp).toLocaleTimeString());
            return {
                success: false,
                filtered: true,
                message: '内容已过滤（清除时间点之前）'
            };
        }

        this.currentChatContent = html;
        console.log(`📥 更新聊天内容：${html.length} 字符`);

        return {
            success: true,
            contentLength: html.length,
            message: '内容更新成功'
        };
    }

    // 获取当前内容
    getContent() {
        return {
            html: this.currentChatContent,
            hasContent: !!this.currentChatContent,
            contentLength: this.currentChatContent.length
        };
    }

    // 清除内容
    clearContent(timestamp) {
        this.currentChatContent = '';
        this.globalClearTimestamp = timestamp || Date.now();
        console.log('🧹 清除聊天内容');
        console.log('⏱️ 设置清除时间戳:', new Date(this.globalClearTimestamp).toLocaleString());

        return {
            success: true,
            timestamp: this.globalClearTimestamp
        };
    }

    // 获取状态
    getStatus() {
        return {
            hasContent: !!this.currentChatContent,
            contentLength: this.currentChatContent.length,
            clearTimestamp: this.globalClearTimestamp
        };
    }

    // 同步清除时间戳
    syncClearTimestamp(timestamp) {
        this.globalClearTimestamp = timestamp;
        console.log('⏱️ 同步清除时间戳:', new Date(timestamp).toLocaleString());
        return {
            success: true,
            timestamp: timestamp
        };
    }
}

module.exports = ChatManager;
