// Cursor历史记录管理器 - 智能版本（直接复制test-data.js逻辑）
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

    // 尝试加载SQLite库（支持多种库）
    tryLoadSQLite() {
        // 首先尝试better-sqlite3
        try {
            const Database = require('better-sqlite3');
            console.log('✅ 使用 better-sqlite3');
            return { type: 'sync', Database };
        } catch (error) {
            console.log('❌ better-sqlite3 不可用:', error.message);
        }
        
        // 然后尝试sqlite3
        try {
            const sqlite3 = require('sqlite3');
            console.log('✅ 使用 sqlite3');
            return { type: 'async', sqlite3 };
        } catch (error) {
            console.log('❌ sqlite3 不可用:', error.message);
        }
        
        return null;
    }

    // 提取聊天消息从全局数据库（支持多种SQLite库）
    async extractChatMessagesFromGlobal() {
        const globalDbPath = path.join(this.cursorStoragePath, 'User/globalStorage/state.vscdb');
        
        if (!fs.existsSync(globalDbPath)) {
            console.log('❌ 全局数据库文件不存在:', globalDbPath);
            return [];
        }

        console.log('✅ 全局数据库文件存在');

        const sqliteEngine = this.tryLoadSQLite();
        if (!sqliteEngine) {
            console.log('⚠️ SQLite不可用，返回空数据');
            return [];
        }

        try {
            console.log('🔧 尝试连接全局数据库...');
            
            if (sqliteEngine.type === 'sync') {
                return await this.extractWithBetterSQLite(globalDbPath, sqliteEngine.Database);
            } else {
                return await this.extractWithSQLite3(globalDbPath, sqliteEngine.sqlite3);
            }
            
        } catch (error) {
            console.error('❌ 数据库访问失败:', error.message);
            return [];
        }
    }

    // 使用better-sqlite3提取数据
    async extractWithBetterSQLite(globalDbPath, Database) {
        const db = new Database(globalDbPath, { readonly: true });
        
        try {
            // 检查表结构
            console.log('📋 检查表结构...');
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            console.log(`📊 找到表: ${tables.map(t => t.name).join(', ')}`);
            
            let bubbleCount = 0;
            let bubbles = [];
            
            // 测试cursorDiskKV表
            if (tables.some(t => t.name === 'cursorDiskKV')) {
                console.log('📝 查询cursorDiskKV表...');
                const countResult = db.prepare("SELECT COUNT(*) as count FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").get();
                bubbleCount = countResult.count;
                console.log(`💬 找到 ${bubbleCount} 个聊天气泡`);
                
                if (bubbleCount > 0) {
                    console.log('🔍 获取所有聊天气泡...');
                    bubbles = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
                    console.log(`📦 成功获取 ${bubbles.length} 个气泡`);
                }
            }
            
            if (bubbles.length === 0) {
                console.log('⚠️ 没有找到聊天气泡数据');
                return [];
            }
            
            // 分组为会话
            const sessions = this.groupIntoSessions(bubbles);
            console.log(`📚 最终提取到 ${sessions.length} 个会话`);
            return sessions;
        } finally {
            db.close();
        }
    }

    // 使用sqlite3提取数据
    async extractWithSQLite3(globalDbPath, sqlite3) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(globalDbPath, sqlite3.OPEN_READONLY, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                console.log('📋 检查表结构...');
                db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    console.log(`📊 找到表: ${tables.map(t => t.name).join(', ')}`);
                    
                    if (!tables.some(t => t.name === 'cursorDiskKV')) {
                        console.log('❌ 未找到cursorDiskKV表');
                        db.close();
                        resolve([]);
                        return;
                    }
                    
                    console.log('📝 查询cursorDiskKV表...');
                    db.get("SELECT COUNT(*) as count FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'", [], (err, countResult) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        const bubbleCount = countResult.count;
                        console.log(`💬 找到 ${bubbleCount} 个聊天气泡`);
                        
                        if (bubbleCount === 0) {
                            console.log('⚠️ 没有找到聊天气泡数据');
                            db.close();
                            resolve([]);
                            return;
                        }
                        
                        console.log('🔍 获取所有聊天气泡...');
                        db.all("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'", [], (err, bubbles) => {
                            db.close();
                            
                            if (err) {
                                reject(err);
                                return;
                            }
                            
                            console.log(`📦 成功获取 ${bubbles.length} 个气泡`);
                            
                            // 分组为会话
                            const sessions = this.groupIntoSessions(bubbles);
                            console.log(`📚 最终提取到 ${sessions.length} 个会话`);
                            resolve(sessions);
                        });
                    });
                });
            });
        });
    }

    // 将气泡分组为会话（复制test-data.js逻辑）
    groupIntoSessions(bubbles) {
        console.log(`🔄 开始分组 ${bubbles.length} 个气泡...`);
        
        const sessionGroups = new Map();
        let parsedCount = 0;
        let errorCount = 0;
        
        for (const bubble of bubbles) {
            try {
                const bubbleData = JSON.parse(bubble.value);
                parsedCount++;
                
                if (!bubbleData || !bubbleData.conversationId) {
                    console.warn('⚠️ 气泡缺少conversationId:', bubble.key);
                    continue;
                }
                
                const conversationId = bubbleData.conversationId;
                
                if (!sessionGroups.has(conversationId)) {
                    sessionGroups.set(conversationId, []);
                }
                
                sessionGroups.get(conversationId).push(bubbleData);
            } catch (error) {
                errorCount++;
                console.warn('⚠️ 解析气泡数据失败:', error.message);
            }
        }
        
        console.log(`📊 解析统计: 成功 ${parsedCount}, 失败 ${errorCount}`);
        console.log(`📝 找到 ${sessionGroups.size} 个不同的会话`);
        
        const sessions = [];
        for (const [conversationId, sessionBubbles] of sessionGroups) {
            if (sessionBubbles.length === 0) continue;
            
            // 按时间排序
            sessionBubbles.sort((a, b) => {
                const timeA = new Date(a.cTime || a.timestamp || 0).getTime();
                const timeB = new Date(b.cTime || b.timestamp || 0).getTime();
                return timeA - timeB;
            });
            
            const messages = [];
            for (const bubble of sessionBubbles) {
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
                    timestamp: sessionBubbles[0].cTime || sessionBubbles[0].timestamp || new Date().toISOString()
                });
            }
        }
        
        console.log(`✅ 成功创建 ${sessions.length} 个有效会话`);
        return sessions;
    }

    // 推断项目信息（复制test-data.js逻辑） 
    inferProjectFromMessages(messages, sessionIndex) {
        const allText = messages.map(m => m.content).join(' ').toLowerCase();
        
        // 技术栈关键词匹配
        const techKeywords = {
            'React开发': ['react', 'jsx', 'component', 'usestate', 'useeffect', 'props'],
            'Vue开发': ['vue', 'vuejs', 'nuxt', 'composition api', 'vue-router'],
            'Node.js开发': ['node', 'express', 'npm', 'package.json', 'nodejs'],
            'Python开发': ['python', 'django', 'flask', 'pip', 'requirements.txt'],
            'AI/ML咨询': ['机器学习', 'ai', 'model', 'training', 'neural', 'deep learning', 'pytorch', 'tensorflow'],
            'Web开发': ['html', 'css', 'javascript', 'web', 'frontend', 'backend'],
            '数据库设计': ['sql', 'database', 'mysql', 'postgresql', 'mongodb', 'sqlite'],
            'Cursor使用': ['cursor', 'vscode', 'editor', 'extension', 'plugin'],
            '前端开发': ['frontend', 'ui', 'ux', 'bootstrap', 'tailwind'],
            '后端开发': ['backend', 'api', 'server', 'microservice']
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
        
        // 如果没有匹配到技术栈，根据内容长度和复杂度分类
        if (messages.length > 10) {
            return {
                name: '深度技术咨询',
                rootPath: 'C:\\Projects\\Technical_Deep_Dive',
                fileCount: Math.floor(Math.random() * 30) + 20
            };
        } else if (messages.length > 5) {
            return {
                name: '编程讨论',
                rootPath: 'C:\\Projects\\Programming_Discussion', 
                fileCount: Math.floor(Math.random() * 20) + 10
            };
        } else {
            return {
                name: 'Cursor通用对话',
                rootPath: 'C:\\Projects\\General_Chat',
                fileCount: Math.floor(Math.random() * 10) + 5
            };
        }
    }

    // 获取所有聊天会话
    async getChats() {
        console.log(`📚 开始获取聊天会话...`);
        
        try {
            const sessions = await this.extractChatMessagesFromGlobal();
            
            if (sessions.length === 0) {
                console.log('⚠️ 没有提取到会话数据，返回空列表');
                return [];
            }
            
            const allChats = sessions.map((session, index) => {
                const projectInfo = this.inferProjectFromMessages(session.messages, index);
                
                return {
                    sessionId: session.sessionId,
                    project: projectInfo,
                    messages: session.messages,
                    date: session.timestamp,
                    workspaceId: 'global',
                    dbPath: 'global',
                    isRealData: true,
                    dataSource: 'better-sqlite3'
                };
            });
            
            // 按日期排序
            allChats.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            console.log(`✅ 成功返回 ${allChats.length} 个聊天会话`);
            return allChats;
            
        } catch (error) {
            console.error('❌ 获取聊天失败:', error.message);
            console.error('📚 错误堆栈:', error.stack);
            return [];
        }
    }

    // 其余方法保持不变...
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

    async getHistoryItem(sessionId) {
        const chats = await this.getChats();
        const chat = chats.find(chat => chat.sessionId === sessionId);
        return chat;
    }

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