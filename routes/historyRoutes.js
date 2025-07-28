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

        // 获取会话列表（别名，兼容前端调用）
        this.router.get('/history/sessions', this.getAllChats.bind(this));

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

    // 查找所有会话数据库文件（按cursor-view-main逻辑：每个.sqlite文件是一个独立会话）
    findAllSessionDbs() {
        const cursorRoot = this.getCursorRoot();
        const sessionDbs = [];

        // cursor-view-main中的可能路径
        const possibleDirs = [
            path.join(cursorRoot, 'User', 'globalStorage', 'cursor.cursor'),
            path.join(cursorRoot, 'User', 'globalStorage', 'cursor'),
            path.join(cursorRoot, 'User', 'globalStorage'),
            path.join(cursorRoot, 'User', 'workspaceStorage') // 添加工作区存储目录
        ];

        // 递归搜索函数
        const searchDirectory = (dir, maxDepth = 2, currentDepth = 0) => {
            if (!fs.existsSync(dir) || currentDepth > maxDepth) {
                return;
            }

            console.log(`🔍 搜索目录: ${dir} (深度: ${currentDepth})`);

            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });

                for (const item of items) {
                    const fullPath = path.join(dir, item.name);

                    if (item.isFile()) {
                        // 检查多种数据库文件扩展名（包括 Cursor 特有的 .vscdb）
                        if (item.name.endsWith('.sqlite') || item.name.endsWith('.db') || item.name.endsWith('.sqlite3') || item.name.endsWith('.vscdb')) {
                            const stats = fs.statSync(fullPath);
                            sessionDbs.push({
                                path: fullPath,
                                filename: item.name,
                                sessionId: path.parse(item.name).name, // 文件名作为sessionId
                                modTime: stats.mtime
                            });
                            console.log(`📁 找到会话数据库: ${item.name} (路径: ${fullPath})`);
                        }
                    } else if (item.isDirectory() && currentDepth < maxDepth) {
                        // 递归搜索子目录
                        searchDirectory(fullPath, maxDepth, currentDepth + 1);
                    }
                }
            } catch (error) {
                console.log(`⚠️ 无法读取目录 ${dir}: ${error.message}`);
            }
        };

        // 搜索所有可能的目录
        for (const dir of possibleDirs) {
            searchDirectory(dir);
        }

        console.log(`✅ 总共找到 ${sessionDbs.length} 个会话数据库`);
        return sessionDbs;
    }

    // 从workspace数据库提取项目信息（参考cursor-view-main逻辑）
    async extractProjectFromWorkspace(workspaceDbPath) {
        try {
            if (!fs.existsSync(workspaceDbPath)) {
                return null;
            }

            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(workspaceDbPath);
            const db = new SQL.Database(fileBuffer);

            // 检查是否有ItemTable
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];
            
            if (!tableNames.includes('ItemTable')) {
                db.close();
                return null;
            }

            // 提取history.entries
            const historyResult = db.exec(`
                SELECT value FROM ItemTable WHERE key = 'history.entries'
            `);

            db.close();

            if (!historyResult[0] || !historyResult[0].values[0]) {
                return null;
            }

            const entries = JSON.parse(historyResult[0].values[0][0]);
            const filePaths = [];

            // 提取文件路径
            for (const entry of entries) {
                const resource = entry.editor?.resource;
                if (resource && resource.startsWith('file:///')) {
                    // 移除file://前缀并处理Windows路径
                    let filePath = decodeURIComponent(resource.substring(8));
                    if (process.platform === 'win32' && filePath.startsWith('/')) {
                        filePath = filePath.substring(1);
                    }
                    filePaths.push(filePath);
                }
            }

            if (filePaths.length === 0) {
                return null;
            }

            // 找到公共前缀作为项目根目录
            let commonPrefix = filePaths[0];
            for (const filePath of filePaths.slice(1)) {
                while (commonPrefix && !filePath.startsWith(commonPrefix)) {
                    commonPrefix = path.dirname(commonPrefix);
                }
            }

            if (!commonPrefix || commonPrefix === '.' || commonPrefix === '/') {
                commonPrefix = path.dirname(filePaths[0]);
            }

            const projectName = path.basename(commonPrefix);
            
            return {
                name: projectName,
                rootPath: commonPrefix,
                filePaths: filePaths
            };

        } catch (error) {
            console.error('提取workspace项目信息失败:', error);
            return null;
        }
    }

    // 从单个会话数据库提取聊天会话并匹配workspace
    async extractChatSessionsWithWorkspace(dbPath, workspaceProjects) {
        try {
            if (!fs.existsSync(dbPath)) {
                return [];
            }

            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(dbPath);
            const db = new SQL.Database(fileBuffer);

            // 检查数据库表结构
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];
            console.log(`📋 数据库 ${path.basename(dbPath)} 包含表: ${tableNames.join(', ')}`);

            if (!tableNames.includes('cursorDiskKV')) {
                console.log(`⚠️ 数据库 ${path.basename(dbPath)} 不包含cursorDiskKV表`);
                db.close();
                return [];
            }

            // 按composerId分组聊天会话
            const sessions = {};
            
            // 提取bubble数据
            const bubbleResult = db.exec(`
                SELECT rowid, key, value
                FROM cursorDiskKV
                WHERE key LIKE 'bubbleId:%'
                ORDER BY rowid
            `);

            if (bubbleResult[0] && bubbleResult[0].values) {
                for (const row of bubbleResult[0].values) {
                    try {
                        const [rowid, key, value] = row;
                        const bubble = JSON.parse(value);
                        const text = (bubble.text || '').trim();

                        if (!text) continue;

                        // 提取composerId (格式: bubbleId:composerId:bubbleId)
                        const keyParts = key.split(':');
                        const composerId = keyParts[1];
                        
                        if (!composerId) continue;

                        if (!sessions[composerId]) {
                            sessions[composerId] = {
                                sessionId: composerId,
                                messages: [],
                                filePaths: new Set(),
                                workspaceId: 'global',
                                project: { name: 'Global Chat', path: 'global' }
                            };
                        }

                        const role = bubble.type === 1 ? 'user' : 'assistant';
                        sessions[composerId].messages.push({ role, content: text });
                        
                        // 提取文件路径信息用于workspace匹配
                         if (bubble.context && bubble.context.diffHistory && bubble.context.diffHistory.files) {
                             for (const file of bubble.context.diffHistory.files) {
                                 if (file.path) {
                                     sessions[composerId].filePaths.add(file.path);
                                     console.log(`🔍 会话 ${composerId} 提取到文件路径: ${file.path}`);
                                 }
                             }
                         }
                         
                         // 从其他context字段提取文件路径
                         if (bubble.context) {
                             const extractPaths = (obj) => {
                                 if (Array.isArray(obj)) {
                                     obj.forEach(extractPaths);
                                 } else if (obj && typeof obj === 'object') {
                                     if (obj.path && typeof obj.path === 'string') {
                                         sessions[composerId].filePaths.add(obj.path);
                                         console.log(`🔍 会话 ${composerId} 提取到文件路径: ${obj.path}`);
                                     }
                                     Object.values(obj).forEach(extractPaths);
                                 }
                             };
                             extractPaths(bubble.context);
                         }
                        
                    } catch (error) {
                        continue;
                    }
                }
            }

            db.close();

            // 直接根据数据库路径推断workspace ID
            const dbDir = path.dirname(dbPath);
            const parentDir = path.dirname(dbDir);
            const possibleWorkspaceId = path.basename(parentDir);
            
            let workspaceId = 'global';
            let projectInfo = { name: 'Global Chat', path: 'global' };
            
            if (workspaceProjects.has(possibleWorkspaceId)) {
                workspaceId = possibleWorkspaceId;
                projectInfo = workspaceProjects.get(possibleWorkspaceId);
            }
            
            const chatSessions = [];
            for (const session of Object.values(sessions)) {
                session.workspaceId = workspaceId;
                session.project = projectInfo;
                console.log(`✅ 会话 ${session.sessionId} 归属于工作区 ${projectInfo.name}: ${session.messages.length} 条消息`);
                chatSessions.push(session);
            }

            return chatSessions;
            
        } catch (error) {
            console.error('提取聊天会话失败:', error);
            return [];
        }
    }

    // 简化的聊天会话提取方法（采用cursor-view-main逻辑）
    async extractSimpleChatSessions(sessionDbPath, workspaceId, projectInfo) {
        try {
            if (!fs.existsSync(sessionDbPath)) {
                return [];
            }

            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(sessionDbPath);
            const db = new SQL.Database(fileBuffer);

            // 检查是否包含cursorDiskKV表
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];
            
            if (!tableNames.includes('cursorDiskKV')) {
                db.close();
                return [];
            }

            // 按composerId分组聊天会话
            const sessions = {};
            
            // 提取bubble数据
            const bubbleResult = db.exec(`
                SELECT rowid, key, value
                FROM cursorDiskKV
                WHERE key LIKE 'bubbleId:%'
                ORDER BY rowid
            `);

            if (bubbleResult[0] && bubbleResult[0].values) {
                for (const row of bubbleResult[0].values) {
                    try {
                        const [rowid, key, value] = row;
                        const bubble = JSON.parse(value);
                        const text = (bubble.text || '').trim();

                        if (!text) continue;

                        // 提取composerId (格式: bubbleId:composerId:bubbleId)
                        const keyParts = key.split(':');
                        const composerId = keyParts[1];
                        
                        if (!composerId) continue;

                        if (!sessions[composerId]) {
                            sessions[composerId] = {
                                sessionId: composerId,
                                messages: [],
                                workspaceId: workspaceId,
                                project: projectInfo
                            };
                        }

                        const role = bubble.type === 1 ? 'user' : 'assistant';
                        sessions[composerId].messages.push({ role, content: text });
                        
                    } catch (error) {
                        continue;
                    }
                }
            }

            db.close();
            return Object.values(sessions);
            
        } catch (error) {
            return [];
        }
    }

    // 获取workspace存储路径
    getWorkspaceStoragePath() {
        const cursorRoot = this.getCursorRoot();
        return path.join(cursorRoot, 'User', 'workspaceStorage');
    }

    // 获取workspace数据库路径
    getWorkspaceDbPath(workspaceId) {
        const workspaceStoragePath = this.getWorkspaceStoragePath();
        return path.join(workspaceStoragePath, workspaceId, 'state.vscdb');
    }

    // 根据文件路径匹配workspace（改进版）
    matchWorkspaceByPaths(filePaths, workspaceProjects) {
        if (!filePaths || filePaths.size === 0) {
            return null;
        }

        // 转换为数组便于处理
        const paths = Array.from(filePaths);
        
        // 遍历所有workspace，找到最匹配的
        let bestMatch = null;
        let maxMatches = 0;
        let maxScore = 0;

        for (const [workspaceId, project] of workspaceProjects) {
            let matches = 0;
            let score = 0;
            
            // 处理项目路径，确保格式正确
            let projectPath = project.path;
            if (projectPath) {
                projectPath = decodeURIComponent(projectPath).replace(/^d%3A/, 'd:').replace(/%5C/g, '\\');
                // 标准化路径分隔符
                projectPath = path.normalize(projectPath);
            }
            
            // 如果workspace有filePaths信息，优先使用这些路径进行匹配
            const workspaceFilePaths = project.filePaths || [];
            
            for (const filePath of paths) {
                const normalizedFilePath = path.normalize(filePath);
                
                // 方法1: 检查文件路径是否在项目路径下
                if (projectPath && normalizedFilePath.startsWith(projectPath)) {
                    matches++;
                    score += 10; // 完全路径匹配得分最高
                }
                
                // 方法2: 检查是否与workspace的已知文件路径匹配
                for (const workspaceFile of workspaceFilePaths) {
                    const normalizedWorkspaceFile = path.normalize(workspaceFile);
                    if (normalizedFilePath === normalizedWorkspaceFile) {
                        matches++;
                        score += 15; // 精确文件匹配得分更高
                    } else if (path.dirname(normalizedFilePath) === path.dirname(normalizedWorkspaceFile)) {
                        score += 5; // 同目录文件匹配
                    }
                }
                
                // 方法3: 检查项目名称匹配
                if (projectPath && normalizedFilePath.includes(path.basename(projectPath))) {
                    score += 3;
                }
            }
            
            // 综合评分：匹配数量 + 匹配质量
            const totalScore = matches * 5 + score;
            
            if (totalScore > maxScore || (totalScore === maxScore && matches > maxMatches)) {
                maxMatches = matches;
                maxScore = totalScore;
                bestMatch = { 
                    workspaceId, 
                    project: {
                        name: project.name,
                        path: project.path
                    }
                };
            }
        }

        return bestMatch;
    }

    // 从单个会话数据库提取消息（按cursor-view-main逻辑）
    async extractMessagesFromSessionDb(dbPath) {
        try {
            if (!fs.existsSync(dbPath)) {
                return [];
            }

            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(dbPath);
            const db = new SQL.Database(fileBuffer);

            // 检查数据库表结构
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];
            console.log(`📋 数据库 ${path.basename(dbPath)} 包含表: ${tableNames.join(', ')}`);

            // 如果没有任何已知的聊天表，跳过
            if (!tableNames.includes('cursorDiskKV') && !tableNames.includes('ItemTable')) {
                console.log(`⚠️ 数据库 ${path.basename(dbPath)} 不包含已知的聊天表`);
                db.close();
                return [];
            }

            const messages = [];

            // 尝试从cursorDiskKV表提取消息（新格式）
            if (tableNames.includes('cursorDiskKV')) {
                const bubbleResult = db.exec(`
                    SELECT rowid, key, value
                    FROM cursorDiskKV
                    WHERE key LIKE 'bubbleId:%'
                    ORDER BY rowid
                `);

                if (bubbleResult[0] && bubbleResult[0].values) {
                    for (const row of bubbleResult[0].values) {
                        try {
                            const [rowid, key, value] = row;
                            const bubble = JSON.parse(value);
                            const text = (bubble.text || '').trim();

                            if (!text) continue;

                            const role = bubble.type === 1 ? 'user' : 'assistant';
                            messages.push({ role, content: text });
                        } catch (error) {
                            continue;
                        }
                    }
                }
            }

            // 尝试从ItemTable表提取消息（旧格式）
            if (tableNames.includes('ItemTable') && messages.length === 0) {
                try {
                    const itemResult = db.exec(`
                        SELECT key, value
                        FROM ItemTable
                        WHERE key LIKE '%chat%' OR key LIKE '%conversation%' OR key LIKE '%message%'
                        ORDER BY key
                    `);

                    if (itemResult[0] && itemResult[0].values) {
                        for (const row of itemResult[0].values) {
                            try {
                                const [key, value] = row;
                                const data = JSON.parse(value);
                                
                                // 尝试提取不同格式的消息
                                if (data.messages && Array.isArray(data.messages)) {
                                    for (const msg of data.messages) {
                                        if (msg.content && msg.content.trim()) {
                                            messages.push({
                                                role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
                                                content: msg.content.trim()
                                            });
                                        }
                                    }
                                } else if (data.content && data.content.trim()) {
                                    messages.push({
                                        role: data.role || 'user',
                                        content: data.content.trim()
                                    });
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    }
                } catch (error) {
                    console.log(`⚠️ ItemTable查询失败: ${error.message}`);
                }
            }

            db.close();
            return messages;

        } catch (error) {
            console.error(`从会话数据库提取消息失败 ${dbPath}:`, error);
            return [];
        }
    }

    // 采用cursor-view-main的简化逻辑：为每个workspace关联所有session数据库
    async extractSessionSummaries() {
        try {
            console.log('🔍 简化逻辑：直接从session数据库提取聊天...');
            
            // 1. 获取所有workspace项目信息（用于后续匹配）
            const workspaces = this.getAllWorkspaces();
            const workspaceProjects = new Map();
            
            for (const workspaceId of workspaces) {
                try {
                    const projectInfo = await this.getProjectInfoFromWorkspace(workspaceId);
                    if (projectInfo && projectInfo.name && projectInfo.name !== 'global') {
                        workspaceProjects.set(workspaceId, projectInfo);
                    }
                } catch (error) {
                    // 忽略错误
                }
            }
            
            // 2. 查找所有session数据库
            const globalSessionDbs = this.findGlobalSessionDbs();
            console.log(`🗄️ 发现 ${globalSessionDbs.length} 个session数据库`);
            
            const allChats = [];
            
            // 3. 直接从每个session数据库提取所有聊天
            for (const dbInfo of globalSessionDbs) {
                try {
                    const chatSessions = await this.extractAllChatsFromSessionDb(dbInfo.path);
                    for (const chatSession of chatSessions) {
                        if (chatSession.messages.length > 0) {
                            const firstMessage = chatSession.messages[0]?.content || '';
                            const preview = firstMessage.length > 100 ? firstMessage.substring(0, 100) + '...' : firstMessage;
                            
                            // 为每个聊天会话创建独立的项目标识
                            const sessionTitle = this.generateSessionTitle(chatSession.messages);
                            
                            allChats.push({
                                sessionId: chatSession.sessionId,
                                workspaceId: chatSession.sessionId, // 使用sessionId作为唯一标识
                                project: { 
                                    name: sessionTitle, 
                                    path: `session-${chatSession.sessionId}` 
                                },
                                createdAt: dbInfo.modTime.toISOString(),
                                messageCount: chatSession.messages.length,
                                preview: preview || '点击查看详细内容...',
                                dbPath: dbInfo.path
                            });
                        }
                    }
                } catch (error) {
                    console.log(`⚠️ 处理数据库失败: ${dbInfo.path}`);
                }
            }
            
            // 按创建时间排序（最新的在前）
            allChats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            
            console.log(`💬 成功处理了 ${allChats.length} 个会话`);
            return allChats;
            
        } catch (error) {
            console.error('提取会话基本信息失败:', error);
            return [];
        }
    }

    // 生成会话标题
    generateSessionTitle(messages) {
        if (!messages || messages.length === 0) {
            return 'Empty Chat';
        }
        
        // 找到第一个用户消息作为标题
        const firstUserMessage = messages.find(msg => msg.role === 'user');
        if (firstUserMessage && firstUserMessage.content) {
            const content = firstUserMessage.content.trim();
            // 取前50个字符作为标题
            return content.length > 50 ? content.substring(0, 50) + '...' : content;
        }
        
        return 'Untitled Chat';
    }

    // 简化版本：直接从session数据库提取所有聊天
    async extractAllChatsFromSessionDb(sessionDbPath) {
        try {
            if (!fs.existsSync(sessionDbPath)) {
                return [];
            }

            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(sessionDbPath);
            const db = new SQL.Database(fileBuffer);

            // 检查是否包含cursorDiskKV表
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];
            
            if (!tableNames.includes('cursorDiskKV')) {
                db.close();
                return [];
            }

            // 按composerId分组聊天会话
            const sessions = {};
            
            // 提取bubble数据
            const bubbleResult = db.exec(`
                SELECT key, value
                FROM cursorDiskKV
                WHERE key LIKE 'bubbleId:%'
                ORDER BY rowid
            `);

            if (bubbleResult[0] && bubbleResult[0].values) {
                for (const row of bubbleResult[0].values) {
                    try {
                        const [key, value] = row;
                        const bubble = JSON.parse(value);
                        const text = (bubble.text || '').trim();

                        if (!text) continue;

                        // 提取composerId (格式: bubbleId:composerId:bubbleId)
                        const keyParts = key.split(':');
                        const composerId = keyParts[1];
                        
                        if (!composerId) continue;

                        if (!sessions[composerId]) {
                            sessions[composerId] = {
                                sessionId: composerId,
                                messages: []
                            };
                        }

                        const role = bubble.type === 1 ? 'user' : 'assistant';
                        sessions[composerId].messages.push({ role, content: text });
                        
                    } catch (error) {
                        continue;
                    }
                }
            }

            db.close();
            return Object.values(sessions);
            
        } catch (error) {
            return [];
        }
    }

    // 专门查找globalStorage中的session数据库
    findGlobalSessionDbs() {
        const cursorRoot = this.getCursorRoot();
        const sessionDbs = [];

        // 查找globalStorage中的session数据库
        const globalStoragePaths = [
            path.join(cursorRoot, 'User', 'globalStorage'), // 根目录
            path.join(cursorRoot, 'User', 'globalStorage', 'cursor.cursor'),
            path.join(cursorRoot, 'User', 'globalStorage', 'cursor')
        ];

        for (const globalPath of globalStoragePaths) {
            if (fs.existsSync(globalPath)) {
                console.log(`🔍 检查全局存储路径: ${globalPath}`);
                const files = fs.readdirSync(globalPath);
                
                for (const file of files) {
                    if (file.endsWith('.sqlite') || file.endsWith('.vscdb') || file.endsWith('.db')) {
                        const fullPath = path.join(globalPath, file);
                        const stats = fs.statSync(fullPath);
                        
                        sessionDbs.push({
                            path: fullPath,
                            filename: file,
                            sessionId: path.basename(file, path.extname(file)),
                            modTime: stats.mtime
                        });
                        
                        console.log(`📄 发现session数据库: ${file}`);
                    }
                }
            }
        }

        console.log(`📊 在globalStorage中总共发现 ${sessionDbs.length} 个session数据库`);
        return sessionDbs;
    }

    // 按需提取特定会话的完整消息内容 (参考cursor-view-main实现)
    async extractChatDetailById(composerId) {
        try {
            const globalDbPath = this.getGlobalStorageDbPath();
            console.log(`🔍 从全局存储提取会话详情: ${composerId}`);

            if (!fs.existsSync(globalDbPath)) {
                console.log(`❌ 全局存储数据库不存在: ${globalDbPath}`);
                return null;
            }

            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(globalDbPath);
            const db = new SQL.Database(fileBuffer);

            // 检查是否有cursorDiskKV表
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];

            if (!tableNames.includes('cursorDiskKV')) {
                console.log(`⚠️ cursorDiskKV表不存在`);
                db.close();
                return null;
            }

            const messages = [];
            let comp_meta = {
                title: `Chat ${composerId.substring(0, 8)}`,
                createdAt: Date.now(),
                lastUpdatedAt: Date.now()
            };

            // 参考cursor-view-main: 提取bubble消息，按rowid排序确保顺序
            const bubbleStmt = db.prepare("SELECT rowid, key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' ORDER BY rowid");

            console.log(`🔍 查找所有bubble数据`);
            const bubbleMessages = [];

            while (bubbleStmt.step()) {
                const row = bubbleStmt.getAsObject();
                try {
                    const bubble = JSON.parse(row.value);
                    const text = (bubble.text || '').trim();

                    // 参考cursor-view-main: 简洁的类型判断
                    if (!text) continue;

                    const role = bubble.type === 1 ? 'user' : 'assistant';
                    bubbleMessages.push({
                        rowid: row.rowid,
                        role,
                        content: text,
                        bubbleKey: row.key
                    });

                    console.log(`📊 提取bubble: rowid=${row.rowid}, role=${role}, content长度=${text.length}`);
                } catch (error) {
                    console.error(`解析bubble数据失败: ${error.message}`);
                    continue;
                }
            }

            bubbleStmt.free();

            // 如果指定了composerId，只返回该会话的消息
            if (composerId) {
                const targetMessages = bubbleMessages.filter(msg =>
                    msg.bubbleKey === `bubbleId:${composerId}`
                );

                if (targetMessages.length > 0) {
                    messages.push(...targetMessages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })));
                } else {
                    // 如果没有找到精确匹配，尝试查找包含composerId的消息
                    const partialMatches = bubbleMessages.filter(msg =>
                        msg.bubbleKey.includes(composerId)
                    );

                    if (partialMatches.length > 0) {
                        messages.push(...partialMatches.map(msg => ({
                            role: msg.role,
                            content: msg.content
                        })));
                        console.log(`📊 找到部分匹配的消息: ${partialMatches.length}条`);
                    }
                }
            } else {
                // 如果没有指定composerId，返回所有消息
                messages.push(...bubbleMessages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })));
            }

            // 尝试提取composer元数据
            const composerStmt = db.prepare("SELECT value FROM cursorDiskKV WHERE key = ?");
            composerStmt.bind([`composerData:${composerId}`]);

            if (composerStmt.step()) {
                const row = composerStmt.getAsObject();
                try {
                    const data = JSON.parse(row.value);
                    if (data && typeof data === 'object') {
                        comp_meta = {
                            title: data.title || comp_meta.title,
                            createdAt: data.createdAt || comp_meta.createdAt,
                            lastUpdatedAt: data.lastUpdatedAt || data.createdAt || comp_meta.lastUpdatedAt
                        };
                        console.log(`✅ 找到composer元数据`);
                    }
                } catch (error) {
                    console.error(`解析composer数据失败: ${error.message}`);
                }
            } else {
                console.log(`❌ 未找到composer数据，使用默认值`);
                comp_meta.title = `会话 ${composerId.split(':')[0].substring(0, 8)}`;
                comp_meta.createdAt = new Date().toISOString();
            }

            composerStmt.free();
            db.close();

            if (messages.length === 0) {
                console.log(`⚠️ 会话 ${composerId} 没有找到消息`);
                return null;
            }

            console.log(`✅ 会话 ${composerId} 提取了 ${messages.length} 条消息`);

            return {
                sessionId: composerId,
                workspaceId: 'global',
                project: { name: 'Cursor Chat' },
                createdAt: comp_meta.createdAt,
                title: comp_meta.title,
                messages: messages
            };

        } catch (error) {
            console.error(`提取会话详情失败: ${error.message}`);
            return null;
        }
    }

    // 新的聊天详情提取方法，参考 cursor-view-main 实现
    async extractChatDetailByIdNew(sessionId) {
        try {
            console.log(`🔍 查找会话详情: ${sessionId}`);
            
            // 参考cursor-view-main的做法：首先尝试通过文件名匹配sessionId
            const sessionDbs = this.findAllSessionDbs();
            
            // 第一步：尝试通过文件名匹配sessionId（类似cursor-view-main的做法）
            for (const dbInfo of sessionDbs) {
                const fileName = path.basename(dbInfo.path, path.extname(dbInfo.path));
                if (fileName.includes(sessionId) || sessionId.includes(fileName)) {
                    console.log(`✅ 通过文件名匹配找到数据库: ${dbInfo.path}`);
                    const messages = await this.extractMessagesFromSessionDbLikeCursorView(dbInfo.path, sessionId);
                    if (messages && messages.length > 0) {
                        return {
                            sessionId: sessionId,
                            workspaceId: 'global',
                            project: {
                                name: 'Cursor Chat',
                                path: 'global'
                            },
                            createdAt: dbInfo.modTime.toISOString(),
                            title: `会话 ${sessionId}`,
                            messages: messages
                        };
                    }
                }
            }
            
            // 第二步：在所有数据库中搜索bubbleId相关记录（参考cursor-view-main的_iter_bubble_messages）
            for (const dbInfo of sessionDbs) {
                try {
                    console.log(`🔍 检查数据库: ${dbInfo.path}`);
                    const messages = await this.extractMessagesFromSessionDbLikeCursorView(dbInfo.path, sessionId);
                    
                    if (messages && messages.length > 0) {
                        console.log(`✅ 会话 ${sessionId} 提取了 ${messages.length} 条消息`);
                        
                        return {
                            sessionId: sessionId,
                            workspaceId: 'global',
                            project: {
                                name: 'Cursor Chat',
                                path: 'global'
                            },
                            createdAt: dbInfo.modTime.toISOString(),
                            title: `会话 ${sessionId}`,
                            messages: messages
                        };
                    }
                    
                } catch (dbError) {
                    console.log(`⚠️ 检查数据库 ${dbInfo.path} 时出错: ${dbError.message}`);
                    continue;
                }
            }
            
            console.log(`❌ 未找到会话 ${sessionId} 对应的数据库记录`);
            return null;

        } catch (error) {
            console.error(`提取会话详情失败: ${error.message}`);
            return null;
        }
    }

    // 参考cursor-view-main的消息提取逻辑
    async extractMessagesFromSessionDbLikeCursorView(dbPath, sessionId) {
        try {
            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(dbPath);
            const db = new SQL.Database(fileBuffer);
            
            let messages = [];
            
            // 检查是否有cursorDiskKV表（参考cursor-view-main的_iter_bubble_messages）
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];
            
            if (tableNames.includes('cursorDiskKV')) {
                console.log(`🔍 在cursorDiskKV表中查找bubbleId相关记录`);
                
                // 查找所有包含bubbleId的记录
                const bubbleQuery = `
                    SELECT key, value FROM cursorDiskKV 
                    WHERE key LIKE '%bubble%' OR key LIKE '%${sessionId}%'
                    ORDER BY rowid
                `;
                
                const bubbleResults = db.exec(bubbleQuery);
                
                if (bubbleResults[0] && bubbleResults[0].values) {
                    for (const [key, value] of bubbleResults[0].values) {
                        try {
                            if (value && typeof value === 'string') {
                                const parsed = JSON.parse(value);
                                
                                // 检查是否是消息记录
                                if (parsed.text || parsed.content) {
                                    const role = this.determineBubbleRole(key, parsed);
                                    messages.push({
                                        role: role,
                                        content: parsed.text || parsed.content || ''
                                    });
                                }
                            }
                        } catch (parseError) {
                            // 忽略解析错误
                        }
                    }
                }
            }
            
            // 如果cursorDiskKV没有找到消息，尝试ItemTable
            if (messages.length === 0 && tableNames.includes('ItemTable')) {
                console.log(`🔍 在ItemTable中查找会话记录`);
                
                const itemQuery = `
                    SELECT key, value FROM ItemTable 
                    WHERE (key LIKE '%chat%' OR key LIKE '%conversation%' OR key LIKE '%message%' OR key LIKE '%${sessionId}%')
                    AND value IS NOT NULL
                `;
                
                const itemResults = db.exec(itemQuery);
                
                if (itemResults[0] && itemResults[0].values) {
                    for (const [key, value] of itemResults[0].values) {
                        try {
                            if (value && typeof value === 'string') {
                                const parsed = JSON.parse(value);
                                
                                if (parsed.messages && Array.isArray(parsed.messages)) {
                                    messages = parsed.messages.map(msg => ({
                                        role: msg.role || (msg.type === 'user' ? 'user' : 'assistant'),
                                        content: msg.content || msg.text || ''
                                    }));
                                    break;
                                } else if (parsed.content || parsed.text) {
                                    messages.push({
                                        role: 'user',
                                        content: parsed.content || parsed.text
                                    });
                                }
                            }
                        } catch (parseError) {
                            // 忽略解析错误
                        }
                    }
                }
            }
            
            db.close();
            return messages;
            
        } catch (error) {
            console.error(`提取消息失败: ${error.message}`);
            return [];
        }
    }
    
    // 根据key和数据内容判断消息角色
    determineBubbleRole(key, data) {
        if (key.includes('user') || data.role === 'user') {
            return 'user';
        } else if (key.includes('assistant') || key.includes('ai') || data.role === 'assistant') {
            return 'assistant';
        } else {
            // 默认根据内容长度判断（通常用户消息较短，AI回复较长）
            const content = data.text || data.content || '';
            return content.length > 100 ? 'assistant' : 'user';
        }
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
                    workspaceId: 'global',
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

            for (let sessionIndex = 0; sessionIndex < timeGroupedSessions.length; sessionIndex++) {
                const sessionData = timeGroupedSessions[sessionIndex];
                const sessionId = `session_${sessionIndex}_${sessionData[0].unixMs}`;

                const projectInfo = await this.getProjectInfoFromWorkspace(workspaceId);
                chatGroups[sessionId] = {
                    sessionId,
                    workspaceId,
                    messages: [],
                    createdAt: sessionData[0].unixMs || Date.now(),
                    project: {
                        name: projectInfo?.name || await this.extractProjectName(workspaceId),
                        path: projectInfo?.path || workspaceId
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
            }
        } else if (key.includes('chat') || key.includes('conversation')) {
            // 处理其他可能的聊天数据格式
            if (Array.isArray(data)) {
                for (let index = 0; index < data.length; index++) {
                    const item = data[index];
                    const sessionId = item.id || item.sessionId || `session_${index}`;

                    if (!chatGroups[sessionId]) {
                        chatGroups[sessionId] = {
                            sessionId,
                            workspaceId,
                            messages: [],
                            createdAt: item.timestamp || item.createdAt || Date.now(),
                            project: {
                                name: await this.extractProjectName(workspaceId)
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
                }
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

    // 提取项目名称和路径
    async extractProjectName(workspaceId) {
        if (!workspaceId) return 'Unknown';

        try {
            // 尝试从工作区存储中获取真实的项目路径
            const projectInfo = await this.getProjectInfoFromWorkspace(workspaceId);
            if (projectInfo && projectInfo.name) {
                return projectInfo.name;
            }
        } catch (error) {
            console.log(`⚠️ 无法从工作区 ${workspaceId} 获取项目信息:`, error.message);
        }

        // 回退到从工作区ID中提取项目名
        const parts = workspaceId.split('/');
        if (parts.length > 0) {
            const lastPart = parts[parts.length - 1];
            // 移除可能的哈希后缀
            return lastPart.split('-')[0] || 'Unknown';
        }

        return 'Unknown';
    }

    // 从工作区存储中获取项目信息
    async getProjectInfoFromWorkspace(workspaceId) {
        try {
            const cursorRoot = this.getCursorRoot();
            const workspaceDbPath = path.join(cursorRoot, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');

            if (!fs.existsSync(workspaceDbPath)) {
                console.log(`⚠️ 工作区数据库不存在: ${workspaceDbPath}`);
                return null;
            }

            // 尝试从工作区数据库中提取项目路径信息
            const projectPath = await this.extractProjectPathFromDb(workspaceDbPath);
            if (projectPath) {
                const projectName = path.basename(projectPath);
                console.log(`✅ 从工作区 ${workspaceId} 提取到项目: ${projectName} (${projectPath})`);
                return {
                    name: projectName,
                    path: projectPath,
                    workspaceId: workspaceId
                };
            }

        } catch (error) {
            console.error(`获取工作区 ${workspaceId} 项目信息失败:`, error);
        }

        return null;
    }

    // 从工作区数据库中提取项目路径
    async extractProjectPathFromDb(dbPath) {
        try {
            const SQL = await initSqlJs();
            const filebuffer = fs.readFileSync(dbPath);
            const db = new SQL.Database(filebuffer);

            // 查找可能包含项目路径的键
            const possibleKeys = [
                'history.entries',  // 这是cursor-view-main使用的主要键
                'workbench.panel.explorer.state',
                'workbench.explorer.fileTree.state',
                'workbench.sidebar.parts.explorer',
                'workbench.panel.explorer',
                'workspace.folder',
                'workspace.folders',
                'workbench.workspace.folders'
            ];

            for (const key of possibleKeys) {
                const stmt = db.prepare(`SELECT value FROM ItemTable WHERE key = ?`);
                stmt.bind([key]);

                if (stmt.step()) {
                    const result = stmt.getAsObject();
                    if (result && result.value) {
                        try {
                            const data = JSON.parse(result.value);
                            const projectPath = this.extractPathFromWorkspaceData(data);
                            if (projectPath) {
                                db.close();
                                return projectPath;
                            }
                        } catch (parseError) {
                            console.log(`解析键 ${key} 数据失败:`, parseError.message);
                        }
                    }
                }
                stmt.free();
            }

            db.close();
        } catch (error) {
            console.error(`从数据库提取项目路径失败:`, error);
        }

        return null;
    }

    // 从工作区数据中提取路径
    extractPathFromWorkspaceData(data) {
        if (!data) return null;

        // 特殊处理 history.entries 格式（参考 cursor-view-main 的实现）
        if (Array.isArray(data)) {
            const filePaths = [];
            for (const entry of data) {
                const resource = entry?.editor?.resource;
                if (resource && typeof resource === 'string' && resource.startsWith('file:///')) {
                    // 移除 file:// 前缀并转换为本地路径
                    let localPath = resource.replace(/^file:\/\/\//, '');
                    // Windows 路径处理
                    if (process.platform === 'win32') {
                        localPath = localPath.replace(/\//g, '\\');
                    }
                    filePaths.push(localPath);
                }
            }
            
            if (filePaths.length > 0) {
                // 找到所有文件路径的公共前缀
                let commonPrefix = filePaths[0];
                for (let i = 1; i < filePaths.length; i++) {
                    let j = 0;
                    while (j < commonPrefix.length && j < filePaths[i].length && 
                           commonPrefix[j] === filePaths[i][j]) {
                        j++;
                    }
                    commonPrefix = commonPrefix.substring(0, j);
                }
                
                // 确保以目录分隔符结束
                const separator = process.platform === 'win32' ? '\\' : '/';
                const lastSeparatorIndex = commonPrefix.lastIndexOf(separator);
                if (lastSeparatorIndex > 0) {
                    return commonPrefix.substring(0, lastSeparatorIndex);
                }
            }
        }

        // 尝试多种可能的路径字段
        const pathFields = ['uri', 'path', 'folder', 'rootPath', 'workspaceFolder'];

        // 递归搜索路径信息
        const findPath = (obj) => {
            if (typeof obj === 'string' && (obj.includes('\\') || obj.includes('/'))) {
                // 检查是否是有效的文件系统路径
                if (obj.match(/^[a-zA-Z]:\\/) || obj.startsWith('/')) {
                    return obj;
                }
            }

            if (typeof obj === 'object' && obj !== null) {
                // 检查常见的路径字段
                for (const field of pathFields) {
                    if (obj[field] && typeof obj[field] === 'string') {
                        const cleanPath = obj[field].replace(/^file:\/\/\//, '').replace(/\//g, '\\');
                        if (cleanPath.match(/^[a-zA-Z]:\\/) || cleanPath.startsWith('/')) {
                            return cleanPath;
                        }
                    }
                }

                // 递归搜索
                for (const key in obj) {
                    const result = findPath(obj[key]);
                    if (result) return result;
                }
            }

            if (Array.isArray(obj)) {
                for (const item of obj) {
                    const result = findPath(item);
                    if (result) return result;
                }
            }

            return null;
        };

        return findPath(data);
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

            // 完全按照cursor-view-main的方式实现，只返回session基本信息
            const sessionSummaries = await this.extractSessionSummaries();

            // 按创建时间排序（最新的在前）
            sessionSummaries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

            console.log(`✅ 总共找到 ${sessionSummaries.length} 个聊天会话，返回基本信息`);
            res.json(sessionSummaries);
        } catch (error) {
            console.error('❌ 获取聊天历史失败:', error);
            res.status(500).json({ error: error.message });
        }
    }

    // 获取特定聊天详情（按需加载完整消息内容）
    async getChatDetail(req, res) {
        try {
            const { sessionId } = req.params;
            console.log(`🔍 获取会话详情: ${sessionId}`);

            // 使用新的提取方法
            const chatDetail = await this.extractChatDetailByIdNew(sessionId);

            if (chatDetail) {
                console.log(`✅ 找到会话 ${sessionId}，包含 ${chatDetail.messages.length} 条消息`);
                return res.json(chatDetail);
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