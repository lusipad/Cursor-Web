/**
 * 历史记录服务
 * 负责历史记录的业务逻辑处理
 */
class HistoryService {
    constructor(apiClient) {
        this.apiClient = apiClient;
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
    }

    /**
     * 获取聊天列表（带缓存）
     * @param {Object} options - 查询选项
     * @returns {Promise<Array>} 聊天列表
     */
    async getChatList(options = {}) {
        const cacheKey = `chats_${JSON.stringify(options)}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const response = await this.apiClient.getAllChats(options);
            
            // 处理API响应格式
            let chats;
            if (response && response.success && Array.isArray(response.data)) {
                chats = response.data;
            } else if (Array.isArray(response)) {
                chats = response;
            } else {
                console.warn('意外的API响应格式:', response);
                chats = [];
            }
            
            const processedChats = this.processChats(chats);
            
            this.cache.set(cacheKey, {
                data: processedChats,
                timestamp: Date.now()
            });
            
            return processedChats;
        } catch (error) {
            console.error('获取聊天列表失败:', error);
            throw error;
        }
    }

    /**
     * 获取聊天详情
     * @param {string} sessionId - 会话ID
     * @returns {Promise<Object>} 聊天详情
     */
    async getChatDetail(sessionId) {
        const cacheKey = `chat_detail_${sessionId}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const chatDetail = await this.apiClient.getChatDetail(sessionId);
            const processedDetail = this.processChatDetail(chatDetail);
            
            this.cache.set(cacheKey, {
                data: processedDetail,
                timestamp: Date.now()
            });
            
            return processedDetail;
        } catch (error) {
            console.error('获取聊天详情失败:', error);
            throw error;
        }
    }

    /**
     * 搜索聊天记录
     * @param {string} query - 搜索关键词
     * @param {Object} options - 搜索选项
     * @returns {Promise<Array>} 搜索结果
     */
    async searchChats(query, options = {}) {
        if (!query || query.trim() === '') {
            return this.getChatList(options);
        }

        try {
            const results = await this.apiClient.searchChats(query, options);
            return this.processChats(results);
        } catch (error) {
            console.error('搜索聊天记录失败:', error);
            throw error;
        }
    }

    /**
     * 导出聊天记录
     * @param {string} sessionId - 会话ID
     * @param {string} format - 导出格式
     * @returns {Promise<void>}
     */
    async exportChat(sessionId, format = 'html') {
        try {
            const blob = await this.apiClient.exportChat(sessionId, format);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat_${sessionId}.${format}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            throw error;
        }
    }

    /**
     * 获取工作区列表
     * @returns {Promise<Array>} 工作区列表
     */
    async getWorkspaces() {
        const cacheKey = 'workspaces';
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const workspaces = await this.apiClient.getWorkspaces();
            
            this.cache.set(cacheKey, {
                data: workspaces,
                timestamp: Date.now()
            });
            
            return workspaces;
        } catch (error) {
            console.error('获取工作区列表失败:', error);
            throw error;
        }
    }

    /**
     * 处理聊天列表数据
     * @param {Array} chats - 原始聊天数据
     * @returns {Array} 处理后的聊天数据
     */
    processChats(chats) {
        // 确保chats是数组
        if (!Array.isArray(chats)) {
            console.warn('processChats: 期望数组但收到:', typeof chats, chats);
            return [];
        }
        
        return chats.map(chat => ({
            ...chat,
            title: this.generateChatTitle(chat),
            preview: this.generateChatPreview(chat),
            formattedTime: this.formatTime(chat.timestamp || chat.lastModified),
            messageCount: chat.messages ? chat.messages.length : 0
        }));
    }

    /**
     * 处理聊天详情数据
     * @param {Object} chatDetail - 原始聊天详情
     * @returns {Object} 处理后的聊天详情
     */
    processChatDetail(chatDetail) {
        return {
            ...chatDetail,
            title: this.generateChatTitle(chatDetail),
            formattedTime: this.formatTime(chatDetail.timestamp || chatDetail.lastModified),
            messages: chatDetail.messages ? chatDetail.messages.map(msg => ({
                ...msg,
                formattedTime: this.formatTime(msg.timestamp)
            })) : []
        };
    }

    /**
     * 生成聊天标题
     * @param {Object} chat - 聊天数据
     * @returns {string} 聊天标题
     */
    generateChatTitle(chat) {
        if (chat.title) return chat.title;
        
        if (chat.messages && chat.messages.length > 0) {
            const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
            if (firstUserMessage) {
                return firstUserMessage.content.substring(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
            }
        }
        
        // 如果没有sessionId或为空，生成基于时间的标题
        if (!chat.sessionId || chat.sessionId === 'Unknown') {
            const timeStr = chat.formattedTime || this.formatTime(chat.timestamp || Date.now());
            return `聊天记录 ${timeStr}`;
        }
        
        return `聊天 ${chat.sessionId}`;
    }

    /**
     * 生成聊天预览
     * @param {Object} chat - 聊天数据
     * @returns {string} 聊天预览
     */
    generateChatPreview(chat) {
        if (chat.messages && chat.messages.length > 0) {
            const lastMessage = chat.messages[chat.messages.length - 1];
            return lastMessage.content.substring(0, 100) + (lastMessage.content.length > 100 ? '...' : '');
        }
        return '暂无消息';
    }

    /**
     * 格式化时间
     * @param {string|number|Date} timestamp - 时间戳
     * @returns {string} 格式化后的时间
     */
    formatTime(timestamp) {
        if (!timestamp) return '未知时间';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 60000) { // 1分钟内
            return '刚刚';
        } else if (diff < 3600000) { // 1小时内
            return `${Math.floor(diff / 60000)}分钟前`;
        } else if (diff < 86400000) { // 24小时内
            return `${Math.floor(diff / 3600000)}小时前`;
        } else if (diff < 604800000) { // 7天内
            return `${Math.floor(diff / 86400000)}天前`;
        } else {
            return date.toLocaleDateString('zh-CN');
        }
    }

    /**
     * 按项目分组聊天
     * @param {Array} chats - 聊天列表
     * @returns {Object} 按项目分组的聊天
     */
    groupChatsByProject(chats) {
        const groups = {};
        
        chats.forEach(chat => {
            const projectName = chat.project?.name || 'Unknown Project';
            if (!groups[projectName]) {
                groups[projectName] = {
                    name: projectName,
                    path: chat.project?.path || '',
                    chats: []
                };
            }
            groups[projectName].chats.push(chat);
        });
        
        return groups;
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * 刷新数据
     * @param {Object} options - 刷新选项
     * @returns {Promise<Array>} 刷新后的数据
     */
    async refresh(options = {}) {
        this.clearCache();
        return this.getChatList(options);
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistoryService;
} else {
    window.HistoryService = HistoryService;
}