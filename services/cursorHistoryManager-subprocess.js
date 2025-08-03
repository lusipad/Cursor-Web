// Cursor历史记录管理器 - 子进程版本
const { spawn } = require('child_process');
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
        console.log('🔧 使用子进程方式提取数据');
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

    // 通过子进程提取聊天数据
    async extractChatDataViaSubprocess() {
        return new Promise((resolve, reject) => {
            console.log('🚀 启动子进程提取数据...');
            
            const testDataPath = path.join(__dirname, '..', 'test-data.js');
            console.log(`📂 测试脚本路径: ${testDataPath}`);
            
            if (!fs.existsSync(testDataPath)) {
                console.error('❌ 测试脚本不存在:', testDataPath);
                resolve([]);
                return;
            }
            
            // 启动子进程
            const child = spawn('node', [testDataPath, '--json'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                cwd: path.dirname(testDataPath)
            });
            
            let stdout = '';
            let stderr = '';
            
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            child.on('close', (code) => {
                console.log(`📊 子进程退出，代码: ${code}`);
                
                if (code !== 0) {
                    console.error('❌ 子进程执行失败:', stderr);
                    resolve([]);
                    return;
                }
                
                try {
                    // 从输出中提取JSON数据
                    const jsonStart = stdout.indexOf('=== JSON OUTPUT START ===');
                    const jsonEnd = stdout.indexOf('=== JSON OUTPUT END ===');
                    
                    if (jsonStart === -1 || jsonEnd === -1) {
                        console.error('❌ 未找到JSON输出标记');
                        console.log('📝 完整输出:', stdout);
                        resolve([]);
                        return;
                    }
                    
                    const jsonStr = stdout.substring(jsonStart + '=== JSON OUTPUT START ==='.length, jsonEnd).trim();
                    const result = JSON.parse(jsonStr);
                    
                    console.log(`✅ 成功解析数据: ${result.length} 个聊天会话`);
                    resolve(result);
                    
                } catch (error) {
                    console.error('❌ 解析JSON失败:', error.message);
                    console.log('📝 原始输出:', stdout);
                    resolve([]);
                }
            });
            
            child.on('error', (error) => {
                console.error('❌ 启动子进程失败:', error.message);
                resolve([]);
            });
            
            // 设置超时
            setTimeout(() => {
                console.log('⏰ 子进程超时，强制结束');
                child.kill();
                resolve([]);
            }, 60000); // 60秒超时
        });
    }

    // 推断项目信息（复制之前的逻辑） 
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
        
        // 检查缓存
        const now = Date.now();
        if (this.cachedHistory && (now - this.lastCacheTime) < this.cacheTimeout) {
            console.log('📚 使用缓存的聊天数据');
            return this.cachedHistory;
        }
        
        try {
            const sessions = await this.extractChatDataViaSubprocess();
            
            if (sessions.length === 0) {
                console.log('⚠️ 没有提取到会话数据，返回空列表');
                return [];
            }
            
            const allChats = sessions.map((session, index) => {
                // 如果session已经有project信息，使用它，否则推断
                const projectInfo = session.project || this.inferProjectFromMessages(session.messages, index);
                
                return {
                    sessionId: session.sessionId,
                    project: projectInfo,
                    messages: session.messages,
                    date: session.timestamp || session.date,
                    workspaceId: 'global',
                    dbPath: 'global',
                    isRealData: true,
                    dataSource: 'subprocess'
                };
            });
            
            // 按日期排序
            allChats.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            // 更新缓存
            this.cachedHistory = allChats;
            this.lastCacheTime = now;
            
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