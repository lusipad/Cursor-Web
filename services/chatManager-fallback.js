// 聊天管理器 - 备用版本（不依赖SQLite）
const path = require('path');
const fs = require('fs');

class ChatManager {
    constructor() {
        this.currentContent = '';
        this.lastActivity = Date.now();
        console.log('📱 使用备用聊天管理器 - SQLite不可用');
    }

    // 设置内容
    setContent(content) {
        this.currentContent = content;
        this.lastActivity = Date.now();
        console.log(`📝 内容已更新: ${content.substring(0, 100)}...`);
    }

    // 获取内容
    getContent() {
        return this.currentContent;
    }

    // 获取最后活动时间
    getLastActivity() {
        return this.lastActivity;
    }

    // 清除内容
    clearContent() {
        this.currentContent = '';
        this.lastActivity = Date.now();
        console.log('🗑️ 内容已清除');
    }

    // 获取状态
    getStatus() {
        return {
            hasContent: this.currentContent.length > 0,
            contentLength: this.currentContent.length,
            lastActivity: this.lastActivity,
            mode: 'fallback'
        };
    }

    // 保存聊天记录（备用模式）
    async saveChat(content, metadata = {}) {
        console.log('⚠️ 备用模式：无法保存聊天记录到数据库');
        return false;
    }

    // 获取聊天记录（备用模式）
    async getChats(options = {}) {
        console.log('⚠️ 备用模式：返回空的聊天记录');
        return [];
    }

    // 删除聊天记录（备用模式）
    async deleteChat(id) {
        console.log('⚠️ 备用模式：无法删除聊天记录');
        return false;
    }

    // 搜索聊天记录（备用模式）
    async searchChats(query) {
        console.log('⚠️ 备用模式：无法搜索聊天记录');
        return [];
    }

    // 获取统计信息（备用模式）
    async getStatistics() {
        return {
            totalChats: 0,
            totalMessages: 0,
            mode: 'fallback'
        };
    }

    // 健康检查
    async healthCheck() {
        return {
            status: 'ok',
            mode: 'fallback',
            features: {
                contentStorage: true,
                chatHistory: false,
                database: false
            },
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = ChatManager;