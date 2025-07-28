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
        this.router.get('/history/chats', this.getAllChats.bind(this));
        
        // 获取特定聊天详情
        this.router.get('/history/chat/:sessionId', this.getChatDetail.bind(this));
        
        // 导出聊天记录
        this.router.get('/history/chat/:sessionId/export', this.exportChat.bind(this));
        
        // 搜索聊天记录
        this.router.get('/history/search', this.searchChats.bind(this));
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
        // 尝试多个可能的路径
        const possiblePaths = [
            path.join(cursorRoot, 'User', 'globalStorage', 'cursor.cursor', 'state.sqlite'),
            path.join(cursorRoot, 'User', 'globalStorage', 'cursor', 'state.sqlite'),
            path.join(cursorRoot, 'User', 'globalStorage', 'state.vscdb'),
            path.join(cursorRoot, 'User', 'globalStorage', 'state.sqlite')
        ];
        
        for (const dbPath of possiblePaths) {
            if (fs.existsSync(dbPath)) {
                console.log(`✅ 找到全局存储数据库: ${dbPath}`);
                return dbPath;
            }
        }
        
        console.log(`❌ 未找到全局存储数据库，尝试的路径:`, possiblePaths);
        return possiblePaths[0]; // 返回默认路径
    }

    // 从数据库提取JSON数据
    async extractJsonFromDb(dbPath, key, tableName = 'ItemTable') {
        if (!fs.existsSync(dbPath)) {
            return null;
        }

        try {
            const SQL = await initSqlJs();
            const filebuffer = fs.readFileSync(dbPath);
            const db = new SQL.Database(filebuffer);
            
            // 检查表是否存在
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];
            
            if (!tableNames.includes(tableName)) {
                console.log(`⚠️ 表 ${tableName} 不存在于数据库 ${dbPath}，可用表: ${tableNames.join(', ')}`);
                db.close();
                return null;
            }
            
            const stmt = db.prepare(`SELECT value FROM ${tableName} WHERE key = ?`);
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
        
        let allChats = [];
        
        // 首先尝试从全局存储数据库提取AI聊天数据（包含AI回复）
        const globalChats = await this.extractChatsFromGlobalStorage(workspaceId);
        if (globalChats && globalChats.length > 0) {
            console.log(`🌐 从全局存储找到 ${globalChats.length} 个聊天会话`);
            allChats = allChats.concat(globalChats);
        }
        
        // 尝试从多个可能的键提取数据
        const possibleKeys = [
            'aiService.generations',
            'workbench.panel.aichat',
            'chat.history',
            'cursor.chat.history',
            'aiConversationService',
            'workbench.panel.composerChatViewPane.d91f5fbc-5222-4f7f-902b-5fd068092859'
        ];
        
        // 首先提取AI聊天会话配置
        const aiChatConfig = await this.extractAIChatSessions(dbPath);
        if (aiChatConfig && aiChatConfig.length > 0) {
            console.log(`🤖 找到 ${aiChatConfig.length} 个AI聊天会话`);
            for (const sessionId of aiChatConfig) {
                const sessionData = await this.extractAIChatSessionData(dbPath, sessionId);
                if (sessionData) {
                    allChats = allChats.concat(sessionData);
                }
            }
        }
        
        for (const key of possibleKeys) {
            const chatData = await this.extractJsonFromDb(dbPath, key);
            if (chatData) {
                console.log(`💾 从键 ${key} 提取到数据:`, Array.isArray(chatData) ? `${chatData.length} 条记录` : '对象数据');
                const chats = await this.processDataFromKey(chatData, key, workspaceId);
                allChats = allChats.concat(chats);
            }
        }
        
        // 尝试查找聊天相关的所有键
        const allChatKeys = await this.findChatKeys(dbPath);
        for (const key of allChatKeys) {
            if (!possibleKeys.includes(key)) {
                const chatData = await this.extractJsonFromDb(dbPath, key);
                if (chatData) {
                    console.log(`💾 从发现的键 ${key} 提取到数据`);
                    const chats = await this.processDataFromKey(chatData, key, workspaceId);
                    allChats = allChats.concat(chats);
                }
            }
        }
        
        // 去重并合并相同会话的聊天
        const uniqueChats = this.mergeDuplicateChats(allChats);
        
        console.log(`✅ 工作区 ${workspaceId} 总共找到 ${uniqueChats.length} 个聊天会话`);
        return uniqueChats;
    }
    
    // 从全局存储数据库提取AI聊天数据（完全参考cursor-view-main实现）
    async extractChatsFromGlobalStorage() {
        try {
            const globalDbPath = this.getGlobalStorageDbPath();
            console.log(`🌐 尝试从全局存储数据库提取AI聊天: ${globalDbPath}`);
            
            if (!fs.existsSync(globalDbPath)) {
                console.log(`❌ 全局存储数据库不存在: ${globalDbPath}`);
                return [];
            }
            
            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(globalDbPath);
            const db = new SQL.Database(fileBuffer);
            
            // 检查是否有cursorDiskKV表
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];
            
            if (!tableNames.includes('cursorDiskKV')) {
                console.log(`⚠️ cursorDiskKV表不存在，可用表: ${tableNames.join(', ')}`);
                db.close();
                return [];
            }
            
            // 按cursor-view-main逻辑：按composerId分组会话
            const sessions = {};
            const comp_meta = {};
            
            // 1. 处理bubble数据
            const stmt = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'");
            let msg_count = 0;
            
            while (stmt.step()) {
                const row = stmt.getAsObject();
                try {
                    const bubble = JSON.parse(row.value);
                    if (!bubble || typeof bubble !== 'object') {
                        continue;
                    }
                    
                    const text = (bubble.text || bubble.richText || '').trim();
                    if (!text) continue;
                    
                    const role = bubble.type === 1 ? 'user' : 'assistant';
                    const composerId = row.key.split(':')[1]; // bubbleId:composerId:bubbleId格式
                    
                    if (!sessions[composerId]) {
                        sessions[composerId] = { messages: [] };
                    }
                    
                    sessions[composerId].messages.push({ role, content: text });
                    msg_count++;
                    
                    if (!comp_meta[composerId]) {
                        comp_meta[composerId] = {
                            title: `Chat ${composerId.substring(0, 8)}`,
                            createdAt: bubble.createdAt || Date.now(),
                            lastUpdatedAt: bubble.createdAt || Date.now()
                        };
                    }
                } catch (error) {
                    // 静默处理解析错误，避免日志污染
                }
            }
            
            stmt.free();
            
            // 2. 处理composer数据
            const composerStmt = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'");
            let comp_count = 0;
            
            while (composerStmt.step()) {
                const row = composerStmt.getAsObject();
                try {
                    const composerData = JSON.parse(row.value);
                    if (!composerData || typeof composerData !== 'object') {
                        continue;
                    }
                    
                    const composerId = row.key.split(':')[1];
                    
                    if (!comp_meta[composerId]) {
                        comp_meta[composerId] = {
                            title: `Chat ${composerId.substring(0, 8)}`,
                            createdAt: composerData.createdAt || Date.now(),
                            lastUpdatedAt: composerData.createdAt || Date.now()
                        };
                    }
                    
                    const conversation = composerData.conversation || [];
                    if (Array.isArray(conversation) && conversation.length > 0) {
                        if (!sessions[composerId]) {
                            sessions[composerId] = { messages: [] };
                        }
                        
                        for (const msg of conversation) {
                            if (!msg || msg.type === undefined) continue;
                            
                            const role = msg.type === 1 ? 'user' : 'assistant';
                            const content = msg.text || '';
                            if (content && typeof content === 'string') {
                                sessions[composerId].messages.push({ role, content });
                            }
                        }
                        comp_count++;
                    }
                } catch (error) {
                    // 静默处理解析错误，避免日志污染
                }
            }
            
            composerStmt.free();
            db.close();
            
            console.log(`🎯 从bubble提取 ${msg_count} 条消息，从composer提取 ${comp_count} 个会话`);
            
            // 3. 构建最终输出
            const out = [];
            for (const [composerId, data] of Object.entries(sessions)) {
                if (!data.messages || data.messages.length === 0) continue;
                
                const meta = comp_meta[composerId] || {
                    title: 'untitled',
                    createdAt: null,
                    lastUpdatedAt: null
                };
                
                out.push({
                    sessionId: composerId,
                    workspaceId: '(global)',
                    project: { name: 'Cursor Chat' },
                    createdAt: meta.createdAt || Date.now(),
                    messages: data.messages
                });
            }
            
            // 按最后更新时间排序
            out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            
            console.log(`💬 创建了 ${out.length} 个聊天会话`);
            return out;
            
        } catch (error) {
            console.error('从全局存储提取AI聊天数据失败:', error);
            return [];
        }
    }
    

    


    // 提取AI聊天会话配置
    async extractAIChatSessions(dbPath) {
        try {
            const configData = await this.extractJsonFromDb(dbPath, 'workbench.panel.composerChatViewPane.d91f5fbc-5222-4f7f-902b-5fd068092859');
            if (configData && typeof configData === 'object') {
                const sessionIds = [];
                for (const key in configData) {
                    if (key.includes('workbench.panel.aichat.view.')) {
                        const sessionId = key.replace('workbench.panel.aichat.view.', '');
                        sessionIds.push(sessionId);
                    }
                }
                return sessionIds;
            }
        } catch (error) {
            console.error('提取AI聊天会话配置失败:', error);
        }
        return [];
    }

    // 提取具体AI聊天会话数据
    async extractAIChatSessionData(dbPath, sessionId) {
        try {
            // 尝试多种可能的键格式
            const possibleKeys = [
                `workbench.panel.aichat.view.${sessionId}`,
                `aichat.view.${sessionId}`,
                `chat.session.${sessionId}`,
                `bubbleId:${sessionId}`
            ];
            
            for (const key of possibleKeys) {
                const sessionData = await this.extractJsonFromDb(dbPath, key);
                if (sessionData) {
                    console.log(`🎯 从键 ${key} 找到会话数据`);
                    return this.parseAIChatSession(sessionData, sessionId);
                }
            }
        } catch (error) {
            console.error(`提取AI聊天会话 ${sessionId} 数据失败:`, error);
        }
        return null;
    }

    // 解析AI聊天会话数据
    parseAIChatSession(sessionData, sessionId) {
        try {
            const messages = [];
            
            // 如果是数组格式的消息
            if (Array.isArray(sessionData)) {
                for (const message of sessionData) {
                    if (message.role && message.content) {
                        messages.push({
                            role: message.role,
                            content: message.content,
                            timestamp: message.timestamp || Date.now(),
                            type: 'ai_chat'
                        });
                    }
                }
            }
            // 如果是对象格式，尝试提取消息
            else if (sessionData && typeof sessionData === 'object') {
                if (sessionData.messages && Array.isArray(sessionData.messages)) {
                    for (const message of sessionData.messages) {
                        if (message.role && message.content) {
                            messages.push({
                                role: message.role,
                                content: message.content,
                                timestamp: message.timestamp || Date.now(),
                                type: 'ai_chat'
                            });
                        }
                    }
                }
            }
            
            if (messages.length > 0) {
                return [{
                    sessionId: sessionId,
                    workspace: 'AI Chat',
                    timestamp: Math.min(...messages.map(m => m.timestamp)),
                    messages: messages
                }];
            }
        } catch (error) {
            console.error('解析AI聊天会话数据失败:', error);
        }
        return null;
    }

    // 查找所有可能包含聊天数据的键
    async findChatKeys(dbPath) {
        try {
            if (!fs.existsSync(dbPath)) return [];
            
            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(dbPath);
            const db = new SQL.Database(fileBuffer);
            
            const stmt = db.prepare("SELECT key FROM ItemTable WHERE key LIKE '%chat%' OR key LIKE '%ai%' OR key LIKE '%conversation%' OR key LIKE '%bubble%'");
            const keys = [];
            
            while (stmt.step()) {
                const row = stmt.getAsObject();
                keys.push(row.key);
            }
            
            stmt.free();
            db.close();
            
            return keys;
        } catch (error) {
            console.error('查找聊天键时出错:', error);
            return [];
        }
    }
    
    // 根据不同的键处理数据
    async processDataFromKey(data, key, workspaceId) {
        const chatGroups = {};
        
        if (key === 'aiService.generations' && Array.isArray(data)) {
            // 按时间分组聊天会话（相近时间的消息归为一个会话）
            const timeGroupedSessions = this.groupByTimeProximity(data);
            
            timeGroupedSessions.forEach((sessionData, sessionIndex) => {
                const sessionId = `session_${sessionIndex}_${sessionData[0].unixMs}`;
                
                chatGroups[sessionId] = {
                    sessionId,
                    workspaceId,
                    messages: [],
                    createdAt: sessionData[0].unixMs || Date.now(),
                    project: {
                        name: this.extractProjectName(workspaceId)
                    }
                };
                
                sessionData.forEach(generation => {
                     // 只添加真实的用户消息，不添加模拟的AI回复
                     if (generation.textDescription && generation.textDescription.trim()) {
                         chatGroups[sessionId].messages.push({
                             role: 'user',
                             content: generation.textDescription.trim(),
                             timestamp: generation.unixMs || Date.now(),
                             type: generation.type || 'unknown'
                         });
                     }
                 });
            });
        } else if (key.includes('chat') || key.includes('conversation')) {
            // 处理其他可能的聊天数据格式
            if (Array.isArray(data)) {
                data.forEach((item, index) => {
                    const sessionId = item.id || item.sessionId || `session_${index}`;
                    
                    if (!chatGroups[sessionId]) {
                        chatGroups[sessionId] = {
                            sessionId,
                            workspaceId,
                            messages: [],
                            createdAt: item.timestamp || item.createdAt || Date.now(),
                            project: {
                                name: this.extractProjectName(workspaceId)
                            }
                        };
                    }
                    
                    // 尝试提取消息
                    if (item.messages && Array.isArray(item.messages)) {
                        chatGroups[sessionId].messages = chatGroups[sessionId].messages.concat(item.messages);
                    } else if (item.content || item.text) {
                        chatGroups[sessionId].messages.push({
                            role: item.role || 'user',
                            content: item.content || item.text,
                            timestamp: item.timestamp || Date.now()
                        });
                    }
                });
            }
        }
        
        return Object.values(chatGroups).map(chat => {
            // 按时间戳排序消息
            chat.messages.sort((a, b) => a.timestamp - b.timestamp);
            return chat;
        }).filter(chat => chat.messages.length > 0); // 只返回有消息的会话
    }
    
    // 按时间接近程度分组（30分钟内的消息归为一个会话）
    groupByTimeProximity(generations) {
        if (!generations || generations.length === 0) return [];
        
        // 按时间排序
        const sorted = [...generations].sort((a, b) => (a.unixMs || 0) - (b.unixMs || 0));
        const groups = [];
        let currentGroup = [sorted[0]];
        
        for (let i = 1; i < sorted.length; i++) {
            const current = sorted[i];
            const previous = sorted[i - 1];
            const timeDiff = (current.unixMs || 0) - (previous.unixMs || 0);
            
            // 如果时间差超过30分钟（1800000毫秒），开始新的会话
            if (timeDiff > 1800000) {
                groups.push(currentGroup);
                currentGroup = [current];
            } else {
                currentGroup.push(current);
            }
        }
        
        groups.push(currentGroup);
        return groups;
    }
    
    // 合并重复的聊天会话
    mergeDuplicateChats(chats) {
        const merged = {};
        let uniqueIdCounter = 0;
        
        chats.forEach(chat => {
            // 如果sessionId为空或undefined，生成一个唯一的key
            let key = chat.sessionId;
            if (!key || key.trim() === '') {
                key = `generated_session_${uniqueIdCounter++}_${chat.createdAt || Date.now()}`;
                chat.sessionId = key; // 更新chat对象的sessionId
            }
            
            if (!merged[key]) {
                merged[key] = chat;
            } else {
                // 合并消息
                merged[key].messages = merged[key].messages.concat(chat.messages);
                // 去重消息
                const uniqueMessages = [];
                const seen = new Set();
                merged[key].messages.forEach(msg => {
                    const msgKey = `${msg.role}_${msg.content}_${msg.timestamp}`;
                    if (!seen.has(msgKey)) {
                        seen.add(msgKey);
                        uniqueMessages.push(msg);
                    }
                });
                merged[key].messages = uniqueMessages.sort((a, b) => a.timestamp - b.timestamp);
            }
        });
        
        return Object.values(merged);
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

    // 获取所有聊天记录（仅基本信息，用于列表显示）
    async getAllChats(req, res) {
        try {
            console.log('📚 开始获取聊天历史记录...');
            
            // 直接从全局存储提取聊天数据，参考cursor-view-main的简化方式
            const allChats = await this.extractChatsFromGlobalStorage();
            
            // 按创建时间排序（最新的在前）
            allChats.sort((a, b) => b.createdAt - a.createdAt);
            
            // 优化：只返回基本信息，不包含详细消息内容
            const chatSummaries = allChats.map(chat => {
                const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
                const preview = firstUserMessage ? 
                    (firstUserMessage.content.length > 100 ? 
                        firstUserMessage.content.substring(0, 100) + '...' : 
                        firstUserMessage.content) : 
                    '暂无消息内容';
                
                return {
                    sessionId: chat.sessionId,
                    workspaceId: chat.workspaceId,
                    project: chat.project,
                    createdAt: chat.createdAt,
                    messageCount: chat.messages.length,
                    preview: preview,
                    // 不包含完整的messages数组，减少数据传输量
                };
            });
            
            console.log(`✅ 总共找到 ${allChats.length} 个聊天记录，返回基本信息`);
            res.json(chatSummaries);
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