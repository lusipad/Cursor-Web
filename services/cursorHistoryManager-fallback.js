// Cursor历史记录管理器 - 备用版本（不依赖SQLite）
const fs = require('fs');
const path = require('path');
const os = require('os');

class CursorHistoryManager {
    constructor() {
        this.cursorStoragePath = this.getCursorStoragePath();
        this.cachedHistory = null;
        this.lastCacheTime = 0;
        this.cacheTimeout = 30000; // 30秒缓存
        console.log(`📁 Cursor数据路径: ${this.cursorStoragePath}`);
        console.log(`⚠️  使用备用模式 - SQLite不可用`);
    }

    // 获取Cursor存储路径
    getCursorStoragePath() {
        const platform = os.platform();
        const home = os.homedir();
        
        switch (platform) {
            case 'darwin': // macOS
                return path.join(home, 'Library', 'Application Support', 'Cursor');
            case 'win32': // Windows
                return path.join(home, 'AppData', 'Roaming', 'Cursor');
            case 'linux': // Linux
                return path.join(home, '.config', 'Cursor');
            default:
                throw new Error(`不支持的平台: ${platform}`);
        }
    }

    // 获取所有聊天会话（备用模式返回测试数据）
    async getChats() {
        console.log(`📚 备用模式：返回示例数据`);
        
        // 返回一些示例数据
        const sampleChats = [
            {
                sessionId: 'sample-1',
                project: {
                    name: '示例项目',
                    rootPath: 'C:\\示例路径',
                    fileCount: 10
                },
                messages: [
                    {
                        role: 'user',
                        content: '这是一个示例用户消息'
                    },
                    {
                        role: 'assistant',
                        content: '这是一个示例AI回复'
                    }
                ],
                date: new Date().toISOString(),
                workspaceId: 'sample',
                dbPath: 'sample',
                isRealData: false,
                dataSource: 'fallback'
            }
        ];
        
        return sampleChats;
    }

    // 获取聊天记录列表（兼容原有API）
    async getHistory(options = {}) {
        const { limit = 50, offset = 0 } = options;
        
        const chats = await this.getChats();
        const paginatedChats = chats.slice(offset, offset + limit);
        
        return {
            items: paginatedChats,
            total: chats.length,
            offset: offset,
            limit: limit,
            hasMore: offset + limit < chats.length
        };
    }

    // 获取单个聊天记录
    async getHistoryItem(sessionId) {
        const chats = await this.getChats();
        const chat = chats.find(chat => chat.sessionId === sessionId);
        
        return chat;
    }

    // 获取统计信息
    async getStatistics() {
        const chats = await this.getChats();
        const stats = {
            total: chats.length,
            byType: {},
            byDay: {},
            recentActivity: []
        };

        // 按项目统计
        chats.forEach(chat => {
            const projectName = chat.project?.name || 'Unknown';
            stats.byType[projectName] = (stats.byType[projectName] || 0) + 1;
        });

        // 按天统计
        chats.forEach(chat => {
            const date = new Date(chat.date || Date.now());
            const dayKey = date.toISOString().split('T')[0];
            stats.byDay[dayKey] = (stats.byDay[dayKey] || 0) + 1;
        });

        // 最近活动
        stats.recentActivity = chats.slice(0, 10).map(chat => ({
            id: chat.sessionId,
            type: 'chat',
            timestamp: new Date(chat.date).getTime(),
            summary: `${chat.project?.name}: ${chat.messages.length} 条消息`
        }));

        return stats;
    }

    // 清除缓存
    clearCache() {
        this.cachedHistory = null;
        this.lastCacheTime = 0;
        console.log('🗑️ 历史记录缓存已清除');
    }

    // 添加历史记录
    async addHistory(item) {
        console.log('⚠️ 备用模式：无法添加历史记录');
        return false;
    }

    // 删除历史记录
    async deleteHistory(id) {
        console.log('⚠️ 备用模式：无法删除历史记录');
        return false;
    }

    // 清除所有历史记录
    async clearHistory() {
        console.log('⚠️ 备用模式：无法清除历史记录');
        return false;
    }

    // 搜索历史记录
    async searchHistory(query, options = {}) {
        const chats = await this.getChats();
        
        // 简单的搜索逻辑
        const filtered = chats.filter(chat => {
            const content = chat.messages.map(m => m.content).join(' ').toLowerCase();
            const projectName = (chat.project?.name || '').toLowerCase();
            return content.includes(query.toLowerCase()) || projectName.includes(query.toLowerCase());
        });

        return {
            items: filtered,
            total: filtered.length,
            query: query
        };
    }

    // 导出历史记录
    async exportHistory(format = 'json') {
        const chats = await this.getChats();
        
        switch (format) {
            case 'json':
                return JSON.stringify(chats, null, 2);
            case 'csv':
                // 简单的CSV导出
                let csv = 'Project,Date,MessageCount,FirstMessage\n';
                chats.forEach(chat => {
                    const project = chat.project?.name || '';
                    const date = chat.date || '';
                    const count = chat.messages.length;
                    const first = chat.messages[0]?.content || '';
                    csv += `"${project}","${date}","${count}","${first.substring(0, 100)}"\n`;
                });
                return csv;
            default:
                return JSON.stringify(chats, null, 2);
        }
    }
}

module.exports = CursorHistoryManager;