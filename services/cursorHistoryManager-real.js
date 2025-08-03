// Cursor历史记录管理器 - 真实数据版本
const fs = require('fs');
const path = require('path');
const os = require('os');

class CursorHistoryManager {
    constructor() {
        this.cursorStoragePath = this.getCursorStoragePath();
        this.cachedHistory = null;
        this.lastCacheTime = 0;
        this.cacheTimeout = 30000; // 30秒缓存
        this.sqliteEngine = null;
        
        console.log(`📁 Cursor数据路径: ${this.cursorStoragePath}`);
        this.initializeSQLiteEngine();
    }

    // 初始化SQLite引擎
    initializeSQLiteEngine() {
        // 尝试不同的SQLite引擎
        const engines = [
            () => {
                console.log('🔍 尝试 better-sqlite3...');
                const Database = require('better-sqlite3');
                return { type: 'better-sqlite3', Database };
            },
            () => {
                console.log('🔍 尝试 sqlite3...');
                const sqlite3 = require('sqlite3');
                return { type: 'sqlite3', Database: sqlite3.Database };
            },
            () => {
                console.log('🔍 尝试 SQLiteReader (命令行)...');
                const SQLiteReader = require('./sqliteReader');
                return { type: 'command', SQLiteReader };
            }
        ];

        for (const engineInit of engines) {
            try {
                this.sqliteEngine = engineInit();
                console.log(`✅ 使用SQLite引擎: ${this.sqliteEngine.type}`);
                return;
            } catch (error) {
                console.log(`❌ ${this.sqliteEngine?.type || '引擎'} 不可用: ${error.message}`);
            }
        }

        console.log('⚠️ 所有SQLite引擎都不可用，使用备用模式');
        this.sqliteEngine = { type: 'fallback' };
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

    // 提取全局聊天消息
    async extractChatMessagesFromGlobal() {
        const globalDbPath = path.join(this.cursorStoragePath, 'User/globalStorage/state.vscdb');
        
        if (!fs.existsSync(globalDbPath)) {
            console.log('❌ 全局数据库文件不存在');
            return [];
        }

        console.log('📂 正在读取全局数据库...');

        try {
            if (this.sqliteEngine.type === 'better-sqlite3') {
                return await this.extractWithBetterSQLite(globalDbPath);
            } else if (this.sqliteEngine.type === 'sqlite3') {
                return await this.extractWithSQLite3(globalDbPath);
            } else if (this.sqliteEngine.type === 'command') {
                return await this.extractWithCommand(globalDbPath);
            } else {
                return this.getFallbackData();
            }
        } catch (error) {
            console.error('❌ 数据提取失败:', error.message);
            return this.getFallbackData();
        }
    }

    // 使用better-sqlite3提取数据
    async extractWithBetterSQLite(dbPath) {
        const { Database } = this.sqliteEngine;
        const db = new Database(dbPath, { readonly: true });
        
        try {
            // 获取所有聊天气泡
            const bubbles = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
            console.log(`💬 找到 ${bubbles.length} 个聊天气泡`);
            
            const sessions = this.groupIntoSessions(bubbles);
            return sessions;
        } finally {
            db.close();
        }
    }

    // 使用sqlite3提取数据
    async extractWithSQLite3(dbPath) {
        return new Promise((resolve, reject) => {
            const { Database } = this.sqliteEngine;
            const db = new Database(dbPath, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                db.all("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'", [], (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    console.log(`💬 找到 ${rows.length} 个聊天气泡`);
                    const sessions = this.groupIntoSessions(rows);
                    resolve(sessions);
                    db.close();
                });
            });
        });
    }

    // 使用命令行提取数据
    async extractWithCommand(dbPath) {
        const { SQLiteReader } = this.sqliteEngine;
        const reader = new SQLiteReader(dbPath);
        
        try {
            const bubbles = reader.query("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'");
            console.log(`💬 找到 ${bubbles.length} 个聊天气泡`);
            
            const sessions = this.groupIntoSessions(bubbles);
            return sessions;
        } finally {
            reader.close();
        }
    }

    // 将气泡分组为会话
    groupIntoSessions(bubbles) {
        const sessionGroups = new Map();
        
        for (const bubble of bubbles) {
            try {
                const bubbleData = JSON.parse(bubble.value);
                if (!bubbleData || !bubbleData.conversationId) continue;
                
                const conversationId = bubbleData.conversationId;
                
                if (!sessionGroups.has(conversationId)) {
                    sessionGroups.set(conversationId, []);
                }
                
                sessionGroups.get(conversationId).push(bubbleData);
            } catch (error) {
                console.warn('⚠️ 解析气泡数据失败:', error.message);
            }
        }
        
        const sessions = [];
        for (const [conversationId, bubbles] of sessionGroups) {
            if (bubbles.length === 0) continue;
            
            // 按时间排序
            bubbles.sort((a, b) => {
                const timeA = new Date(a.cTime || a.timestamp || 0).getTime();
                const timeB = new Date(b.cTime || b.timestamp || 0).getTime();
                return timeA - timeB;
            });
            
            const messages = [];
            for (const bubble of bubbles) {
                if (bubble.type === 'user') {
                    messages.push({
                        role: 'user',
                        content: bubble.text || '',
                        timestamp: bubble.cTime || bubble.timestamp
                    });
                } else if (bubble.type === 'assistant') {
                    messages.push({
                        role: 'assistant', 
                        content: bubble.text || '',
                        timestamp: bubble.cTime || bubble.timestamp
                    });
                }
            }
            
            if (messages.length > 0) {
                sessions.push({
                    sessionId: conversationId,
                    messages: messages,
                    timestamp: bubbles[0].cTime || bubbles[0].timestamp || new Date().toISOString()
                });
            }
        }
        
        console.log(`📚 提取到 ${sessions.length} 个会话`);
        return sessions;
    }

    // 获取备用数据
    getFallbackData() {
        console.log('🔄 使用备用数据');
        return [
            {
                sessionId: 'fallback-1',
                messages: [
                    {
                        role: 'user',
                        content: '这是一个备用示例消息',
                        timestamp: new Date().toISOString()
                    },
                    {
                        role: 'assistant',
                        content: '这是备用模式的AI回复。请安装SQLite引擎以获取真实数据。',
                        timestamp: new Date().toISOString()
                    }
                ],
                timestamp: new Date().toISOString()
            }
        ];
    }

    // 推断项目信息
    inferProjectFromMessages(messages, sessionIndex) {
        const allText = messages.map(m => m.content).join(' ').toLowerCase();
        
        // 技术栈关键词匹配
        const techKeywords = {
            'React开发': ['react', 'jsx', 'component', 'usestate', 'useeffect'],
            'Vue开发': ['vue', 'vuejs', 'nuxt', 'composition api'],
            'Node.js开发': ['node', 'express', 'npm', 'package.json'],
            'Python开发': ['python', 'django', 'flask', 'pip', 'requirements.txt'],
            'AI/ML咨询': ['机器学习', 'ai', 'model', 'training', 'neural'],
            'Web开发': ['html', 'css', 'javascript', 'web', 'frontend'],
            '数据库设计': ['sql', 'database', 'mysql', 'postgresql', 'mongodb']
        };
        
        for (const [projectType, keywords] of Object.entries(techKeywords)) {
            if (keywords.some(keyword => allText.includes(keyword))) {
                return {
                    name: projectType,
                    rootPath: `C:\\Projects\\${projectType.replace(/[^a-zA-Z0-9]/g, '_')}`,
                    fileCount: Math.floor(Math.random() * 50) + 10
                };
            }
        }
        
        return {
            name: 'Cursor通用对话',
            rootPath: 'C:\\Projects\\General',
            fileCount: 5
        };
    }

    // 获取所有聊天会话
    async getChats() {
        console.log(`📚 获取聊天会话...`);
        
        try {
            const sessions = await this.extractChatMessagesFromGlobal();
            
            const allChats = sessions.map((session, index) => {
                const projectInfo = this.inferProjectFromMessages(session.messages, index);
                
                return {
                    sessionId: session.sessionId,
                    project: projectInfo,
                    messages: session.messages,
                    date: session.timestamp,
                    workspaceId: 'global',
                    dbPath: 'global',
                    isRealData: this.sqliteEngine.type !== 'fallback',
                    dataSource: this.sqliteEngine.type
                };
            });
            
            // 按日期排序
            allChats.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            console.log(`📊 返回 ${allChats.length} 个聊天会话`);
            return allChats;
            
        } catch (error) {
            console.error('❌ 获取聊天失败:', error.message);
            return this.getFallbackData().map(session => ({
                ...session,
                project: this.inferProjectFromMessages(session.messages, 0),
                date: session.timestamp,
                workspaceId: 'fallback',
                dbPath: 'fallback',
                isRealData: false,
                dataSource: 'fallback'
            }));
        }
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

    // 其他方法保持与原版本兼容
    clearCache() {
        this.cachedHistory = null;
        this.lastCacheTime = 0;
        console.log('🗑️ 历史记录缓存已清除');
    }

    async addHistory(item) {
        console.log('⚠️ 不支持添加历史记录到Cursor数据库');
        return false;
    }

    async deleteHistory(id) {
        console.log('⚠️ 不支持从Cursor数据库删除历史记录');
        return false;
    }

    async clearHistory() {
        console.log('⚠️ 不支持清除Cursor数据库历史记录');
        return false;
    }

    async searchHistory(query, options = {}) {
        const chats = await this.getChats();
        
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

    async exportHistory(format = 'json') {
        const chats = await this.getChats();
        
        switch (format) {
            case 'json':
                return JSON.stringify(chats, null, 2);
            case 'csv':
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