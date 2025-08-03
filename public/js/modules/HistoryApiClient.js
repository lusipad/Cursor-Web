/**
 * 历史记录 API 客户端
 * 负责与后端 API 的通信
 */
class HistoryApiClient {
    constructor() {
        this.baseUrl = '/api/history';
    }

    /**
     * 获取所有聊天历史
     */
    async getAllChats(options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.limit) params.append('limit', options.limit);
            if (options.offset) params.append('offset', options.offset);
            if (options.workspaceId) params.append('workspaceId', options.workspaceId);
            
            const url = `${this.baseUrl}/chats${params.toString() ? '?' + params.toString() : ''}`;
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('获取聊天历史失败:', error);
            throw error;
        }
    }

    /**
     * 获取特定聊天的详细信息
     * @param {string} sessionId - 会话ID
     */
    async getChatDetail(sessionId) {
        try {
            const response = await fetch(`${this.baseUrl}/chat/${encodeURIComponent(sessionId)}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('获取聊天详情失败:', error);
            throw error;
        }
    }

    /**
     * 搜索聊天记录
     * @param {string} query - 搜索关键词
     */
    async searchChats(query) {
        try {
            const response = await fetch(`${this.baseUrl}/search?q=${encodeURIComponent(query)}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('搜索聊天记录失败:', error);
            throw error;
        }
    }

    /**
     * 导出聊天记录
     * @param {string} sessionId - 会话ID
     * @param {string} format - 导出格式 ('html' 或 'json')
     */
    async exportChat(sessionId, format = 'html') {
        try {
            const response = await fetch(`${this.baseUrl}/export/${encodeURIComponent(sessionId)}?format=${format}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            if (format === 'json') {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            throw error;
        }
    }

    /**
     * 获取工作区列表
     */
    async getWorkspaces() {
        try {
            const response = await fetch(`${this.baseUrl}/history/workspaces`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('获取工作区列表失败:', error);
            throw error;
        }
    }

    /**
     * 清除缓存
     */
    async clearCache() {
        try {
            const response = await fetch(`${this.baseUrl}/cache`, {
                method: 'DELETE'
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('清除缓存失败:', error);
            throw error;
        }
    }

    /**
     * 检查 API 连接状态
     */
    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/status`);
            return response.ok;
        } catch (error) {
            console.error('检查连接状态失败:', error);
            return false;
        }
    }
}

// 导出到全局作用域
if (typeof window !== 'undefined') {
    window.HistoryApiClient = HistoryApiClient;
}

// 模块导出（如果支持）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistoryApiClient;
}