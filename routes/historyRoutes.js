const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const initSqlJs = require('sql.js');

class HistoryRoutes {
    constructor() {
        this.router = express.Router();
        this.setupRoutes();
    }

    setupRoutes() {
        // 获取所有聊天历史
        this.router.get('/chats', this.getAllChats.bind(this));
        
        // 获取特定聊天详情
        this.router.get('/chat/:sessionId', this.getChatDetail.bind(this));
        
        // 导出聊天记录
        this.router.get('/chat/:sessionId/export', this.exportChat.bind(this));
        
        // 搜索聊天记录
        this.router.get('/search', this.searchChats.bind(this));
    }

    // 获取Cursor根目录
    getCursorRoot() {
        const homeDir = os.homedir();
        console.log(`🏠 用户主目录: ${homeDir}`);
        const cursorDir = path.join(homeDir, 'AppData', 'Roaming', 'Cursor');
        console.log(`📂 Cursor目录路径: ${cursorDir}`);
        
        if (!fs.existsSync(cursorDir)) {
            console.log(`❌ Cursor目录不存在: ${cursorDir}`);
            throw new Error('Cursor 目录不存在，请确保已安装 Cursor');
        }
        
        console.log(`✅ Cursor目录存在: ${cursorDir}`);
        return cursorDir;
    }

    // 获取工作区数据库路径
    getWorkspaceDbPath(workspaceId) {
        const cursorRoot = this.getCursorRoot();
        return path.join(cursorRoot, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
    }

    // 获取全局存储数据库路径
    getGlobalStorageDbPath() {
        const cursorRoot = this.getCursorRoot();
        return path.join(cursorRoot, 'User', 'globalStorage', 'state.vscdb');
    }

    // 从数据库提取JSON数据
    async extractJsonFromDb(dbPath, key) {
        if (!fs.existsSync(dbPath)) {
            return null;
        }

        try {
            const SQL = await initSqlJs();
            const filebuffer = fs.readFileSync(dbPath);
            const db = new SQL.Database(filebuffer);
            const stmt = db.prepare('SELECT value FROM ItemTable WHERE key = ?');
            stmt.bind([key]);
            
            if (stmt.step()) {
                const result = stmt.getAsObject();
                db.close();
                
                if (result && result.value) {
                    return JSON.parse(result.value);
                }
            }
            
            db.close();
        } catch (error) {
            console.error(`从数据库 ${dbPath} 提取数据失败:`, error);
        }
        
        return null;
    }

    // 从工作区数据库提取聊天数据
    async extractChatsFromWorkspace(workspaceId) {
        const dbPath = this.getWorkspaceDbPath(workspaceId);
        console.log(`🔍 工作区 ${workspaceId} 数据库路径: ${dbPath}`);
        console.log(`📁 数据库文件存在: ${fs.existsSync(dbPath)}`);
        
        const chatData = await this.extractJsonFromDb(dbPath, 'aiService.generations');
        console.log(`💾 从数据库提取的数据:`, chatData ? '有数据' : '无数据');
        
        if (!chatData || !Array.isArray(chatData)) {
            console.log(`❌ 工作区 ${workspaceId} 没有找到generations数据`);
            return [];
        }
        
        console.log(`✅ 工作区 ${workspaceId} 找到 ${chatData.length} 个生成记录`);

        // 将generations数据转换为聊天格式
        const chats = [];
        const chatGroups = {};
        
        chatData.forEach((generation, index) => {
            const sessionId = generation.generationUUID || `session_${index}`;
            
            if (!chatGroups[sessionId]) {
                chatGroups[sessionId] = {
                    sessionId,
                    workspaceId,
                    messages: [],
                    createdAt: generation.unixMs || Date.now(),
                    project: {
                        name: this.extractProjectName(workspaceId)
                    }
                };
            }
            
            // 添加用户消息
            if (generation.textDescription) {
                chatGroups[sessionId].messages.push({
                    role: 'user',
                    content: generation.textDescription,
                    timestamp: generation.unixMs || Date.now()
                });
            }
            
            // 添加AI回复（如果有）
            if (generation.response || generation.content) {
                chatGroups[sessionId].messages.push({
                    role: 'assistant',
                    content: generation.response || generation.content,
                    timestamp: (generation.unixMs || Date.now()) + 1000
                });
            }
        });
        
        return Object.values(chatGroups).map(chat => {
            // 按时间戳排序消息
            chat.messages.sort((a, b) => a.timestamp - b.timestamp);
            return chat;
        });
    }

    // 提取项目名称
    extractProjectName(workspaceId) {
        if (!workspaceId) return 'Unknown';
        
        // 从工作区ID中提取项目名
        const parts = workspaceId.split('/');
        if (parts.length > 0) {
            const lastPart = parts[parts.length - 1];
            // 移除可能的哈希后缀
            return lastPart.split('-')[0] || 'Unknown';
        }
        
        return 'Unknown';
    }

    // 获取所有工作区
    getAllWorkspaces() {
        try {
            const cursorRoot = this.getCursorRoot();
            const workspaceStoragePath = path.join(cursorRoot, 'User', 'workspaceStorage');
            console.log(`📁 工作区存储路径: ${workspaceStoragePath}`);
            
            if (!fs.existsSync(workspaceStoragePath)) {
                console.log(`❌ 工作区存储目录不存在: ${workspaceStoragePath}`);
                return [];
            }
            
            const workspaces = fs.readdirSync(workspaceStoragePath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            console.log(`📂 找到工作区目录: ${workspaces}`);
            return workspaces;
        } catch (error) {
            console.error('❌ 获取工作区列表失败:', error);
            return [];
        }
    }

    // 获取所有聊天记录
    async getAllChats(req, res) {
        try {
            console.log('📚 开始获取聊天历史记录...');
            const workspaces = this.getAllWorkspaces();
            console.log(`📁 找到 ${workspaces.length} 个工作区:`, workspaces);
            let allChats = [];
            
            for (const workspaceId of workspaces) {
                try {
                    console.log(`🔍 正在处理工作区: ${workspaceId}`);
                    const chats = await this.extractChatsFromWorkspace(workspaceId);
                    console.log(`💬 工作区 ${workspaceId} 找到 ${chats.length} 个聊天记录`);
                    allChats = allChats.concat(chats);
                } catch (error) {
                    console.error(`❌ 提取工作区 ${workspaceId} 的聊天记录失败:`, error);
                }
            }
            
            // 按创建时间排序（最新的在前）
            allChats.sort((a, b) => b.createdAt - a.createdAt);
            
            console.log(`✅ 总共找到 ${allChats.length} 个聊天记录`);
            res.json(allChats);
        } catch (error) {
            console.error('❌ 获取聊天历史失败:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // 获取特定聊天详情
    async getChatDetail(req, res) {
        try {
            const { sessionId } = req.params;
            const workspaces = this.getAllWorkspaces();
            
            for (const workspaceId of workspaces) {
                try {
                    const chats = await this.extractChatsFromWorkspace(workspaceId);
                    const chat = chats.find(c => c.sessionId === sessionId);
                    
                    if (chat) {
                        return res.json(chat);
                    }
                } catch (error) {
                    console.error(`在工作区 ${workspaceId} 中查找聊天记录失败:`, error);
                }
            }
            
            res.status(404).json({ error: '聊天记录不存在' });
        } catch (error) {
            console.error('获取聊天详情失败:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // 搜索聊天记录
    async searchChats(req, res) {
        try {
            const { q: query } = req.query;
            
            if (!query) {
                return res.status(400).json({ error: '搜索查询不能为空' });
            }
            
            const workspaces = this.getAllWorkspaces();
            let allChats = [];
            
            for (const workspaceId of workspaces) {
                try {
                    const chats = await this.extractChatsFromWorkspace(workspaceId);
                    allChats = allChats.concat(chats);
                } catch (error) {
                    console.error(`提取工作区 ${workspaceId} 的聊天记录失败:`, error);
                }
            }
            
            // 搜索匹配的聊天记录
            const searchResults = allChats.filter(chat => {
                const searchText = query.toLowerCase();
                
                // 搜索会话ID
                if (chat.sessionId.toLowerCase().includes(searchText)) {
                    return true;
                }
                
                // 搜索项目名
                if (chat.project.name.toLowerCase().includes(searchText)) {
                    return true;
                }
                
                // 搜索消息内容
                return chat.messages.some(msg => 
                    msg.content.toLowerCase().includes(searchText)
                );
            });
            
            // 按创建时间排序
            searchResults.sort((a, b) => b.createdAt - a.createdAt);
            
            res.json(searchResults);
        } catch (error) {
            console.error('搜索聊天记录失败:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // 导出聊天记录
    async exportChat(req, res) {
        try {
            const { sessionId } = req.params;
            const { format = 'json' } = req.query;
            
            const workspaces = this.getAllWorkspaces();
            let chat = null;
            
            for (const workspaceId of workspaces) {
                try {
                    const chats = await this.extractChatsFromWorkspace(workspaceId);
                    chat = chats.find(c => c.sessionId === sessionId);
                    
                    if (chat) break;
                } catch (error) {
                    console.error(`在工作区 ${workspaceId} 中查找聊天记录失败:`, error);
                }
            }
            
            if (!chat) {
                return res.status(404).json({ error: '聊天记录不存在' });
            }
            
            if (format === 'html') {
                const html = this.generateChatHtml(chat);
                res.setHeader('Content-Type', 'text/html; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="chat-${sessionId}.html"`);
                res.send(html);
            } else {
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="chat-${sessionId}.json"`);
                res.json(chat);
            }
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // 生成聊天HTML
    generateChatHtml(chat) {
        const messagesHtml = chat.messages.map(msg => {
            const role = msg.role || 'unknown';
            const content = this.escapeHtml(msg.content || '');
            const roleText = role === 'user' ? '用户' : role === 'assistant' ? 'Cursor 助手' : role;
            const bgColor = role === 'user' ? '#e3f2fd' : '#f5f5f5';
            
            return `
                <div class="message">
                    <div class="message-header">
                        <div class="avatar" style="background-color: ${role === 'user' ? '#2196f3' : '#4caf50'}">
                            ${roleText.charAt(0)}
                        </div>
                        <span class="sender">${roleText}</span>
                    </div>
                    <div class="message-content" style="background-color: ${bgColor}">
                        ${content.replace(/\n/g, '<br>')}
                    </div>
                </div>
            `;
        }).join('');

        return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cursor 聊天记录 - ${chat.sessionId}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 900px; margin: 20px auto; padding: 20px; }
        h1 { color: #2c3e50; }
        .chat-info { background-color: #f9f9f9; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .message { margin-bottom: 20px; }
        .message-header { display: flex; align-items: center; margin-bottom: 8px; }
        .avatar { width: 32px; height: 32px; border-radius: 50%; color: white; display: flex; justify-content: center; align-items: center; margin-right: 10px; }
        .sender { font-weight: bold; }
        .message-content { padding: 15px; border-radius: 8px; }
    </style>
</head>
<body>
    <h1>Cursor 聊天记录</h1>
    <div class="chat-info">
        <p><strong>会话ID:</strong> ${chat.sessionId}</p>
        <p><strong>工作区:</strong> ${chat.workspaceId}</p>
        <p><strong>项目:</strong> ${chat.project.name}</p>
        <p><strong>创建时间:</strong> ${new Date(chat.createdAt).toLocaleString('zh-CN')}</p>
        <p><strong>消息数量:</strong> ${chat.messages.length}</p>
    </div>
    <div class="messages">
        ${messagesHtml}
    </div>
</body>
</html>
        `;
    }

    // HTML转义
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }

    getRouter() {
        return this.router;
    }
}

module.exports = HistoryRoutes;