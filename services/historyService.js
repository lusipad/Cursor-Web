/**
 * 历史记录服务
 * 后端业务逻辑层，负责数据处理和业务规则
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const initSqlJs = require('sql.js');
const { generateMockChats } = require('./mockData');

class HistoryService {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5分钟缓存
    }

    /**
     * 获取所有聊天记录
     * @param {Object} options - 查询选项
     * @returns {Promise<Array>} 聊天记录列表
     */
    async getAllChats(options = {}) {
        const cacheKey = `all_chats_${JSON.stringify(options)}`;
        console.log('重新加载聊天记录，采用优化的映射架构...');
        this.clearCache(); // 清除所有缓存

        try {
            // 1. 先建立工作区到项目的映射表
            console.log('步骤1: 建立工作区到项目的映射表');
            const workspaceProjects = await this.getAllWorkspaceProjects();
            console.log(`建立了 ${Object.keys(workspaceProjects).length} 个工作区的项目映射`);
            
            // 2. 建立 composerId 到工作区的映射表
            console.log('步骤2: 建立 composerId 到工作区的映射表');
            const composerToWorkspace = new Map();
            const composerMeta = new Map();
            const sessions = new Map();
            
            // 获取所有会话数据库
            const sessionDbs = this.findAllSessionDbs();
            console.log(`找到 ${sessionDbs.length} 个会话数据库`);
            
            // 如果没有找到真实的数据库，返回空数组
            if (sessionDbs.length === 0) {
                console.warn('未找到真实的 Cursor 数据库，返回空结果');
                const emptyResult = [];
                this.setCache(cacheKey, emptyResult);
                return emptyResult;
            }
            console.log(`获取到 ${Object.keys(workspaceProjects).length} 个工作区项目`);
            
            // 3. 处理每个数据库，建立映射关系
            console.log('步骤3: 处理数据库，建立映射关系');
            for (const dbInfo of sessionDbs) {
                try {
                    console.log(`处理数据库: ${dbInfo.relativePath}`);
                    await this.processDbForMappings(dbInfo, composerToWorkspace, composerMeta, sessions, workspaceProjects);
                } catch (error) {
                    console.error(`处理数据库 ${dbInfo.relativePath} 时出错:`, error.message);
                }
            }
            
            console.log(`建立了 ${composerToWorkspace.size} 个 composer 到工作区的映射`);
            console.log(`收集了 ${sessions.size} 个会话的消息`);
            
            // 4. 构建最终输出
            console.log('步骤4: 构建最终输出');
            console.log(`sessions中有 ${sessions.size} 个会话`);
            
            // 为全局数据库添加默认项目信息
            if (!workspaceProjects['global']) {
                workspaceProjects['global'] = {
                    name: 'Global Chats',
                    rootPath: 'global',
                    path: 'global',
                    id: 'global'
                };
            }
            
            const allChats = [];
            for (const [composerId, sessionData] of sessions) {
                console.log(`处理会话 ${composerId}: ${sessionData.messages ? sessionData.messages.length : 0} 条消息`);
                
                if (!sessionData.messages || sessionData.messages.length === 0) {
                    console.log(`跳过会话 ${composerId}: 没有消息`);
                    continue;
                }
                
                const workspaceId = composerToWorkspace.get(composerId) || 'unknown';
                const project = workspaceProjects[workspaceId] || {
                    name: 'Unknown Project',
                    rootPath: '/unknown'
                };
                const meta = composerMeta.get(composerId) || {
                    title: 'Untitled Chat',
                    createdAt: null,
                    lastUpdatedAt: null
                };
                
                console.log(`会话 ${composerId} 映射到工作区: ${workspaceId}, 项目: ${project.name}`);
                
                const chat = {
                    id: composerId,
                    title: meta.title,
                    workspaceId: workspaceId,
                    project: project,
                    messages: sessionData.messages,
                    filePaths: sessionData.filePaths || [],
                    createdAt: meta.createdAt,
                    lastUpdatedAt: meta.lastUpdatedAt,
                    dbPath: sessionData.dbPath
                };
                
                allChats.push(chat);
            }
            
            console.log(`构建了 ${allChats.length} 条聊天记录`);
            
            // 如果仍然没有找到聊天记录，返回空数组
            if (allChats.length === 0) {
                console.warn('未从数据库提取到任何聊天记录，返回空结果');
                const emptyResult = [];
                this.setCache(cacheKey, emptyResult);
                return emptyResult;
            }
            
            // 按最后更新时间排序
            allChats.sort((a, b) => (b.lastUpdatedAt || 0) - (a.lastUpdatedAt || 0));
            
            // 处理聊天记录（应用限制等）
            const processedChats = this.processChats(allChats, options);
            console.log(`处理后返回 ${processedChats.length} 条聊天记录`);
            
            this.setCache(cacheKey, processedChats);
            return processedChats;
            
        } catch (error) {
            console.error('获取聊天记录失败:', error);
            
            // 发生错误时使用模拟数据
            console.warn('发生错误，使用模拟数据作为后备');
            const mockChats = generateMockChats();
            const processedChats = this.processChats(mockChats, options);
            this.setCache(cacheKey, processedChats);
            return processedChats;
        }
    }

    /**
     * 获取特定聊天详情
     * @param {string} sessionId - 会话ID
     * @returns {Promise<Object>} 聊天详情
     */
    async getChatDetail(sessionId) {
        console.log('🔍 获取聊天详情，会话ID:', sessionId);
        const cacheKey = `chat_detail_${sessionId}`;
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            console.log('📦 从缓存返回聊天详情，消息数量:', cached.messages ? cached.messages.length : 0);
            return cached;
        }

        try {
            // 检查是否是演示会话ID（demo-开头）
            if (sessionId && (sessionId.startsWith('mock-session-') || sessionId.startsWith('demo-session-'))) {
                const mockChats = generateMockChats();
                const chatDetail = mockChats.find(chat => chat.sessionId === sessionId);
                
                if (chatDetail) {
                    const processedDetail = this.processChatDetail(chatDetail);
                    this.setCache(cacheKey, processedDetail);
                    return processedDetail;
                }
            }

            const sessionDbs = this.findAllSessionDbs();
            console.log('🗄️ 找到数据库文件数量:', sessionDbs.length);
            
            // 如果没有找到真实的数据库，返回null
            if (sessionDbs.length === 0) {
                console.warn('未找到真实数据库，无法获取聊天详情');
                return null;
            }
            
            for (const dbInfo of sessionDbs) {
                const chatDetail = await this.extractChatDetailFromDb(dbInfo, sessionId);
                if (chatDetail) {
                    console.log('📄 原始聊天详情:', {
                        sessionId: chatDetail.sessionId,
                        messageCount: chatDetail.messages ? chatDetail.messages.length : 0,
                        hasMessages: !!chatDetail.messages,
                        messagesType: typeof chatDetail.messages
                    });
                    const processedDetail = this.processChatDetail(chatDetail);
                    console.log('✅ 处理后聊天详情:', {
                        sessionId: processedDetail.sessionId,
                        messageCount: processedDetail.messages ? processedDetail.messages.length : 0,
                        title: processedDetail.title
                    });
                    this.setCache(cacheKey, processedDetail);
                    return processedDetail;
                }
            }
            
            // 如果仍然找不到，返回null
            console.warn(`未找到会话 ${sessionId}`);
            return null;
            
        } catch (error) {
            console.error('获取聊天详情失败:', error);
            
            // 发生错误时返回null
            console.warn('获取聊天详情时发生错误，返回null');
            return null;
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
            return this.getAllChats(options);
        }

        try {
            const allChats = await this.getAllChats(options);
            const searchTerm = query.toLowerCase();
            
            const results = allChats.filter(chat => {
                // 搜索标题
                if (chat.title && chat.title.toLowerCase().includes(searchTerm)) {
                    return true;
                }
                
                // 搜索消息内容
                if (chat.messages) {
                    return chat.messages.some(msg => 
                        msg.content && msg.content.toLowerCase().includes(searchTerm)
                    );
                }
                
                // 搜索项目名称
                if (chat.project && chat.project.name && 
                    chat.project.name.toLowerCase().includes(searchTerm)) {
                    return true;
                }
                
                return false;
            });
            
            return results;
            
        } catch (error) {
            console.error('搜索聊天记录失败:', error);
            throw error;
        }
    }

    /**
     * 获取工作区列表
     * @returns {Promise<Array>} 工作区列表
     */
    async getWorkspaces() {
        const cacheKey = 'workspaces';
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            const workspaces = this.getAllWorkspaces();
            const workspaceList = [];
            
            for (const workspaceId of workspaces) {
                try {
                    const projectInfo = await this.getProjectInfoFromWorkspace(workspaceId);
                    console.log(`工作区 ${workspaceId} 项目信息:`, projectInfo);
                    
                    if (projectInfo && projectInfo.name !== 'Unknown Project' && projectInfo.rootPath !== 'Unknown Path') {
                        // 确保路径被正确解码
                        let decodedPath = projectInfo.rootPath;
                        try {
                            if (decodedPath.includes('%')) {
                                decodedPath = decodeURIComponent(decodedPath);
                            }
                        } catch (error) {
                            console.warn(`解码工作区路径失败: ${error.message}`);
                        }
                        
                        workspaceList.push({
                            id: workspaceId,
                            name: projectInfo.name,
                            path: decodedPath
                        });
                        console.log(`添加工作区到列表: ${projectInfo.name} - ${decodedPath}`);
                    } else {
                        console.log(`跳过工作区 ${workspaceId}: 项目信息无效或未知`);
                    }
                } catch (error) {
                    console.error(`获取工作区 ${workspaceId} 信息失败:`, error.message);
                }
            }
            
            // 如果没有找到真实的工作区，返回模拟工作区
            if (workspaceList.length === 0) {
                console.warn('未找到真实工作区，返回模拟工作区');
                const mockWorkspaces = [
                    {
                        id: 'mock-workspace-123',
                        name: '示例项目',
                        path: '/示例/项目/路径'
                    },
                    {
                        id: 'mock-workspace-456',
                        name: 'React 应用',
                        path: '/示例/react-app'
                    }
                ];
                this.setCache(cacheKey, mockWorkspaces);
                return mockWorkspaces;
            }
            
            this.setCache(cacheKey, workspaceList);
            return workspaceList;
            
        } catch (error) {
            console.error('获取工作区列表失败:', error);
            
            // 发生错误时返回模拟工作区
            console.warn('发生错误，返回模拟工作区');
            const mockWorkspaces = [
                {
                    id: 'mock-workspace-123',
                    name: '示例项目',
                    path: '/示例/项目/路径'
                },
                {
                    id: 'mock-workspace-456',
                    name: 'React 应用',
                    path: '/示例/react-app'
                }
            ];
            this.setCache(cacheKey, mockWorkspaces);
            return mockWorkspaces;
        }
    }

    /**
     * 从数据库提取聊天记录
     * @param {Object} dbInfo - 数据库信息
     * @param {Map} workspaceProjects - 工作区项目映射
     * @returns {Promise<Array>} 聊天记录
     */
    /**
     * 处理数据库以建立映射关系（新架构）
     * @param {Object} dbInfo - 数据库信息
     * @param {Map} composerToWorkspace - composerId到工作区的映射
     * @param {Map} composerMeta - composer元数据映射
     * @param {Map} sessions - 会话数据映射
     * @param {Object} workspaceProjects - 工作区项目映射
     */
    async processDbForMappings(dbInfo, composerToWorkspace, composerMeta, sessions, workspaceProjects) {
        const SQL = await initSqlJs();
        const dbBuffer = fs.readFileSync(dbInfo.path);
        const db = new SQL.Database(dbBuffer);
        
        try {
            // 确定工作区ID
            let workspaceId = 'global';
            if (dbInfo.type === 'workspace') {
                workspaceId = dbInfo.workspaceId || this.extractWorkspaceId(dbInfo.relativePath);
            }
            
            console.log(`  数据库类型: ${dbInfo.type}, 工作区ID: ${workspaceId}`);
            
            // 处理 cursorDiskKV 表中的 composer 数据
            await this.processComposerData(db, composerToWorkspace, composerMeta, sessions, workspaceId, dbInfo.path);
            
            // 处理 ItemTable 中的聊天数据（如果存在）
            await this.processItemTableData(db, composerToWorkspace, composerMeta, sessions, workspaceId, dbInfo.path);
            
        } finally {
            db.close();
        }
    }
    
    /**
     * 处理 composer 数据
     */
    async processComposerData(db, composerToWorkspace, composerMeta, sessions, workspaceId, dbPath) {
        try {
            // 首先检查数据库中有哪些表
            const tablesQuery = "SELECT name FROM sqlite_master WHERE type='table'";
            const tablesResult = db.exec(tablesQuery);
            
            console.log(`  数据库 ${dbPath} 中的表:`);
            if (tablesResult.length > 0 && tablesResult[0].values) {
                tablesResult[0].values.forEach(row => {
                    console.log(`    - ${row[0]}`);
                });
            } else {
                console.log(`    - 没有找到任何表`);
            }
            
            // 检查 cursorDiskKV 表是否存在
            const tableCheck = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'");
            if (tableCheck.length === 0) {
                console.log(`  数据库中没有 cursorDiskKV 表，尝试查找其他可能的表...`);
                
                // 尝试查找包含聊天数据的其他表
                const possibleTables = ['ItemTable', 'conversations', 'chats', 'sessions', 'messages'];
                for (const tableName of possibleTables) {
                    const checkTable = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`);
                    if (checkTable.length > 0) {
                        console.log(`  找到可能的聊天表: ${tableName}`);
                        // 查看表结构
                        try {
                            const schemaQuery = `PRAGMA table_info(${tableName})`;
                            const schemaResult = db.exec(schemaQuery);
                            if (schemaResult.length > 0 && schemaResult[0].values) {
                                console.log(`    表 ${tableName} 的结构:`);
                                schemaResult[0].values.forEach(row => {
                                    console.log(`      ${row[1]} (${row[2]})`);
                                });
                            }
                            
                            // 查看前几条数据
                            const sampleQuery = `SELECT * FROM ${tableName} LIMIT 3`;
                            const sampleResult = db.exec(sampleQuery);
                            if (sampleResult.length > 0 && sampleResult[0].values) {
                                console.log(`    表 ${tableName} 的示例数据:`);
                                sampleResult[0].values.forEach((row, index) => {
                                    if (row) {
                                        const rowStr = JSON.stringify(row);
                                        console.log(`      行${index + 1}: ${rowStr ? rowStr.substring(0, 200) : 'null'}...`);
                                    }
                                });
                            }
                        } catch (err) {
                            console.log(`    查看表 ${tableName} 时出错: ${err.message}`);
                        }
                    }
                }
                console.log(`  处理了 0 个 composer`);
                return;
            }
            
            // 如果有 cursorDiskKV 表，先查看表的记录数量
            const countQuery = `SELECT COUNT(*) FROM cursorDiskKV`;
            const countResult = db.exec(countQuery);
            const recordCount = countResult.length > 0 && countResult[0].values ? countResult[0].values[0][0] : 0;
            console.log(`  cursorDiskKV 表中有 ${recordCount} 条记录`);
            
            if (recordCount > 0) {
                console.log(`  查看 cursorDiskKV 表中的所有键...`);
                const allKeysQuery = `SELECT key FROM cursorDiskKV LIMIT 20`;
                const allKeysResult = db.exec(allKeysQuery);
                if (allKeysResult.length > 0 && allKeysResult[0].values) {
                    console.log(`    cursorDiskKV 表中的键示例:`);
                    allKeysResult[0].values.forEach((row, index) => {
                        console.log(`      ${index + 1}: ${row[0]}`);
                    });
                } else {
                    console.log(`    无法获取键列表`);
                }
            } else {
                console.log(`  cursorDiskKV 表为空`);
            }
            
            // 查找可能的聊天相关键
            const chatKeysQuery = `
                SELECT key, value 
                FROM cursorDiskKV 
                WHERE key LIKE '%composer%' OR key LIKE '%chat%' OR key LIKE '%conversation%' OR key LIKE '%session%'
            `;
            
            const chatKeysResult = db.exec(chatKeysQuery);
            if (chatKeysResult.length > 0 && chatKeysResult[0].values) {
                console.log(`    找到 ${chatKeysResult[0].values.length} 个可能的聊天相关键`);
                chatKeysResult[0].values.forEach((row, index) => {
                    const [key, value] = row;
                    if (key && value) {
                        console.log(`      ${index + 1}: ${key} = ${value.substring(0, 100)}...`);
                    }
                });
            }
            
            // 查找真正的聊天数据格式：composerData:
            const composerDataQuery = `
                SELECT key, value 
                FROM cursorDiskKV 
                WHERE key LIKE 'composerData:%'
            `;
            
            // 继续原来的逻辑（保留以防万一）
            const composerQuery = `
                SELECT key, value 
                FROM cursorDiskKV 
                WHERE key LIKE 'composer:%'
            `;
            
            // 同时查找bubbleId格式的键
            const bubbleQuery = `
                SELECT key, value 
                FROM cursorDiskKV 
                WHERE key LIKE 'bubbleId:%'
                LIMIT 10
            `;
            
            const result = db.exec(composerQuery);
            let composerCount = 0;
            
            if (result.length > 0 && result[0].values) {
                for (const row of result[0].values) {
                    const [key, value] = row;
                    if (!key || !value) continue;
                    const composerId = key.replace('composer:', '');
                    
                    try {
                        const data = JSON.parse(value);
                        const createdAt = data.createdAt || null;
                        const lastUpdatedAt = data.lastUpdatedAt || createdAt;
                        
                        // 建立 composer 到工作区的映射
                        composerToWorkspace.set(composerId, workspaceId);
                        
                        // 存储 composer 元数据
                        composerMeta.set(composerId, {
                            title: data.title || `Chat ${composerId ? composerId.substring(0, 8) : 'unknown'}`,
                            createdAt: createdAt,
                            lastUpdatedAt: lastUpdatedAt
                        });
                        
                        // 初始化会话数据
                        if (!sessions.has(composerId)) {
                            sessions.set(composerId, {
                                messages: [],
                                filePaths: [],
                                dbPath: dbPath
                            });
                        }
                        
                        // 提取对话消息
                        const conversation = data.conversation || [];
                        const sessionData = sessions.get(composerId);
                        
                        for (const msg of conversation) {
                            const msgType = msg.type;
                            if (msgType === undefined) continue;
                            
                            const role = msgType === 1 ? 'user' : 'assistant';
                            const content = msg.text || '';
                            
                            if (content && typeof content === 'string') {
                                sessionData.messages.push({ role, content });
                            }
                        }
                        
                        composerCount++;
                        
                    } catch (parseError) {
                        console.warn(`解析 composer 数据失败: ${composerId}`, parseError.message);
                    }
                }
            }
            
            console.log(`  处理了 ${composerCount} 个 composer`);
            
            // 处理bubbleId格式的数据
            const bubbleResult = db.exec(bubbleQuery);
            let bubbleCount = 0;
            
            if (bubbleResult.length > 0 && bubbleResult[0].values) {
                console.log(`  找到 ${bubbleResult[0].values.length} 个 bubbleId 数据`);
                
                for (const row of bubbleResult[0].values) {
                    const [key, value] = row;
                    if (!key || !value) continue;
                    console.log(`    bubbleId 键: ${key}`);
                    
                    try {
                        const data = JSON.parse(value);
                        console.log(`    bubbleId 数据结构:`, Object.keys(data));
                        
                        // 提取 bubbleId
                        const bubbleIdMatch = key.match(/bubbleId:([^:]+)/);
                        if (bubbleIdMatch) {
                            const bubbleId = bubbleIdMatch[1];
                            
                            // 建立 bubbleId 到工作区的映射
                            composerToWorkspace.set(bubbleId, workspaceId);
                            
                            // 存储 bubble 元数据
                            composerMeta.set(bubbleId, {
                                title: data.title || `Chat ${bubbleId ? bubbleId.substring(0, 8) : 'unknown'}`,
                                createdAt: data.createdAt || null,
                                lastUpdatedAt: data.lastUpdatedAt || data.createdAt
                            });
                            
                            // 初始化会话数据
                            if (!sessions.has(bubbleId)) {
                                sessions.set(bubbleId, {
                                    messages: [],
                                    filePaths: [],
                                    dbPath: dbPath
                                });
                            }
                            
                            // 如果有消息数据，提取会话信息
                            if (data.messages && Array.isArray(data.messages)) {
                                const sessionData = sessions.get(bubbleId);
                                for (const msg of data.messages) {
                                    if (msg.role && msg.content) {
                                        sessionData.messages.push({
                                            role: msg.role,
                                            content: msg.content
                                        });
                                    }
                                }
                            }
                            
                            bubbleCount++;
                        }
                    } catch (error) {
                        console.log(`    解析 bubbleId 数据失败: ${error.message}`);
                    }
                }
            }
            
            console.log(`  处理了 ${bubbleCount} 个 bubbleId`);
            
            // 处理composerData格式的数据（真正的聊天数据）
            const composerDataResult = db.exec(composerDataQuery);
            let composerDataCount = 0;
            
            if (composerDataResult.length > 0 && composerDataResult[0].values) {
                console.log(`  找到 ${composerDataResult[0].values.length} 个 composerData 数据`);
                
                for (const row of composerDataResult[0].values) {
                    const [key, value] = row;
                    if (!key || !value) continue;
                    
                    try {
                        const data = JSON.parse(value);
                        
                        // 提取 composerId
                        const composerIdMatch = key.match(/composerData:([^:]+)/);
                        if (composerIdMatch) {
                            const composerId = composerIdMatch[1];
                            
                            // 建立 composerId 到工作区的映射
                            composerToWorkspace.set(composerId, workspaceId);
                            
                            // 存储 composer 元数据
                            composerMeta.set(composerId, {
                                title: data.title || `Chat ${composerId ? composerId.substring(0, 8) : 'unknown'}`,
                                createdAt: data.createdAt || null,
                                lastUpdatedAt: data.lastUpdatedAt || data.createdAt
                            });
                            
                            // 初始化会话数据
                            if (!sessions.has(composerId)) {
                                sessions.set(composerId, {
                                    messages: [],
                                    filePaths: [],
                                    dbPath: dbPath
                                });
                            }
                            
                            // 提取对话消息
                            const conversation = data.conversation || [];
                            const sessionData = sessions.get(composerId);
                            
                            for (const msg of conversation) {
                                const msgType = msg.type;
                                if (msgType === undefined) continue;
                                
                                const role = msgType === 1 ? 'user' : 'assistant';
                                const content = msg.text || '';
                                
                                if (content && typeof content === 'string') {
                                    sessionData.messages.push({ role, content });
                                }
                            }
                            
                            composerDataCount++;
                        }
                    } catch (error) {
                        console.log(`    解析 composerData 数据失败: ${error.message}`);
                    }
                }
            }
            
            console.log(`  处理了 ${composerDataCount} 个 composerData`);
            
        } catch (error) {
            console.log(`处理 composer 数据时出错: ${error.message}`);
        }
    }
    
    /**
     * 处理 ItemTable 数据
     */
    async processItemTableData(db, composerToWorkspace, composerMeta, sessions, workspaceId, dbPath) {
        try {
            const stmt = db.prepare(`
                SELECT key, value 
                FROM ItemTable 
                WHERE key = 'workbench.panel.aichat.view.aichat.chatdata'
            `);
            
            if (stmt.step()) {
                const row = stmt.getAsObject();
                try {
                    const chatData = JSON.parse(row.value);
                    const tabs = chatData.tabs || [];
                    
                    for (const tab of tabs) {
                        const tabId = tab.tabId;
                        if (!tabId) continue;
                        
                        // 建立映射
                        composerToWorkspace.set(tabId, workspaceId);
                        composerMeta.set(tabId, {
                            title: `Chat ${tabId ? tabId.substring(0, 8) : 'unknown'}`,
                            createdAt: null,
                            lastUpdatedAt: null
                        });
                        
                        // 初始化会话数据
                        if (!sessions.has(tabId)) {
                            sessions.set(tabId, {
                                messages: [],
                                filePaths: [],
                                dbPath: dbPath
                            });
                        }
                        
                        const sessionData = sessions.get(tabId);
                        
                        // 处理气泡消息
                        for (const bubble of tab.bubbles || []) {
                            const content = bubble.text || bubble.content || '';
                            if (content && typeof content === 'string') {
                                const role = bubble.type === 'user' ? 'user' : 'assistant';
                                sessionData.messages.push({ role, content });
                            }
                        }
                    }
                    
                    console.log(`  处理了 ${tabs.length} 个 ItemTable 标签页`);
                    
                } catch (parseError) {
                    console.warn(`解析 ItemTable 数据失败:`, parseError.message);
                }
            }
            
            stmt.free();
            
        } catch (error) {
            console.warn(`处理 ItemTable 数据时出错:`, error.message);
        }
    }

    /**
     * 从数据库提取聊天记录（旧方法，保留兼容性）
     * @param {Object} dbInfo - 数据库信息
     * @param {Map} workspaceProjects - 工作区项目映射
     * @returns {Promise<Array>} 聊天记录数组
     */
    async extractChatsFromDb(dbInfo, workspaceProjects) {
        if (!fs.existsSync(dbInfo.path)) {
            return [];
        }

        try {
            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(dbInfo.path);
            const db = new SQL.Database(fileBuffer);

            // 检查表结构
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
            const tableNames = tables[0] ? tables[0].values.map(row => row[0]) : [];

            if (!tableNames.includes('cursorDiskKV')) {
                db.close();
                return [];
            }

            // 提取聊天会话
            const sessions = await this.extractSessionsFromDb(db);
            db.close();

            // 匹配工作区信息
            const chats = sessions.map(session => {
                const workspaceInfo = this.matchWorkspace(session, workspaceProjects);
                return {
                    ...session,
                    workspaceId: workspaceInfo.id,
                    project: workspaceInfo.project,
                    workspacePath: workspaceInfo.project ? workspaceInfo.project.rootPath || workspaceInfo.project.path : null
                };
            });

            return chats;
            
        } catch (error) {
            console.error(`提取数据库 ${dbInfo.path} 失败:`, error);
            return [];
        }
    }

    /**
     * 从数据库提取会话
     * @param {Object} db - 数据库连接
     * @returns {Promise<Array>} 会话列表
     */
    async extractSessionsFromDb(db) {
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

                    // 提取composerId
                    const keyParts = key.split(':');
                    const composerId = keyParts[1];
                    
                    // 调试：打印key格式
                    if (!composerId) {
                        console.log(`⚠️  无效的bubbleId key格式: "${key}", keyParts:`, keyParts);
                        continue;
                    }
                    
                    // 调试：打印有效的composerId
                    console.log(`✅ 有效的composerId: "${composerId}" from key: "${key}"`);
                    if (Object.keys(sessions).length < 3) { // 只打印前3个
                        console.log(`   keyParts:`, keyParts);
                    }

                    if (!sessions[composerId]) {
                        sessions[composerId] = {
                            sessionId: composerId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            messages: [],
                            timestamp: Date.now(),
                            filePaths: new Set()
                        };
                    }

                    const role = bubble.type === 1 ? 'user' : 'assistant';
                    sessions[composerId].messages.push({ 
                        role, 
                        content: text,
                        timestamp: bubble.timestamp || Date.now()
                    });
                    
                    // 提取文件路径用于工作区匹配
                    this.extractFilePathsFromBubble(bubble, sessions[composerId].filePaths);
                    
                } catch (error) {
                    continue;
                }
            }
        }

        const finalSessions = Object.values(sessions).map(session => ({
            ...session,
            filePaths: session.filePaths // 保持Set格式用于工作区匹配
        }));
        
        // 调试：统计文件路径提取情况
        const sessionsWithPaths = finalSessions.filter(s => s.filePaths && s.filePaths.size > 0);
        console.log(`📊 会话统计: 总数=${finalSessions.length}, 有文件路径=${sessionsWithPaths.length}`);
        if (sessionsWithPaths.length > 0) {
            console.log('📁 有文件路径的会话示例:', {
                sessionId: sessionsWithPaths[0].sessionId,
                pathCount: sessionsWithPaths[0].filePaths.size,
                paths: Array.from(sessionsWithPaths[0].filePaths).slice(0, 3)
            });
        }
        
        return finalSessions;
    }

    /**
     * 处理聊天记录
     * @param {Array} chats - 原始聊天记录
     * @param {Object} options - 处理选项
     * @returns {Array} 处理后的聊天记录
     */
    processChats(chats, options = {}) {
        // 去重
        const uniqueChats = this.deduplicateChats(chats);
        
        // 生成标题和预览
        const processedChats = uniqueChats.map(chat => {
            // 从filePaths Set中提取文件路径信息
            const filePaths = chat.filePaths ? Array.from(chat.filePaths) : [];
            const primaryFilePath = filePaths.length > 0 ? filePaths[0] : null;
            
            return {
                ...chat,
                title: this.generateChatTitle(chat),
                preview: this.generateChatPreview(chat),
                lastModified: this.getLastModified(chat),
                // 添加文件路径信息到会话数据
                filePaths: filePaths,
                primaryFilePath: primaryFilePath,
                // 在sessionId中包含路径信息的哈希（用于唯一标识）
                sessionId: chat.sessionId + (primaryFilePath ? `_${this.hashPath(primaryFilePath)}` : '')
            };
        });
        
        // 排序
        processedChats.sort((a, b) => 
            new Date(b.lastModified) - new Date(a.lastModified)
        );
        
        // 分页
        if (options.limit) {
            const offset = options.offset || 0;
            return processedChats.slice(offset, offset + options.limit);
        }
        
        return processedChats;
    }

    /**
     * 处理聊天详情
     * @param {Object} chat - 聊天详情
     * @returns {Object} 处理后的聊天详情
     */
    processChatDetail(chat) {
        // 从filePaths Set中提取文件路径信息
        const filePaths = chat.filePaths ? Array.from(chat.filePaths) : [];
        const primaryFilePath = filePaths.length > 0 ? filePaths[0] : null;
        
        return {
            ...chat,
            title: this.generateChatTitle(chat),
            lastModified: this.getLastModified(chat),
            // 添加文件路径信息
            filePaths: filePaths,
            primaryFilePath: primaryFilePath,
            messages: chat.messages ? chat.messages.map(msg => ({
                ...msg,
                formattedTime: this.formatTime(msg.timestamp)
            })) : []
        };
    }

    /**
     * 生成路径哈希值
     * @param {string} filePath - 文件路径
     * @returns {string} 路径哈希值
     */
    hashPath(filePath) {
        if (!filePath) return '';
        // 简单的哈希函数，用于生成路径的短标识
        let hash = 0;
        for (let i = 0; i < filePath.length; i++) {
            const char = filePath.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash).toString(36).substring(0, 6);
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
                return firstUserMessage.content.substring(0, 50) + 
                    (firstUserMessage.content.length > 50 ? '...' : '');
            }
        }
        
        // 如果没有sessionId或为空，生成基于时间的标题
        if (!chat.sessionId || chat.sessionId === 'Unknown') {
            const timeStr = this.formatTime(chat.timestamp || chat.lastModified || Date.now());
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
            return lastMessage.content.substring(0, 100) + 
                (lastMessage.content.length > 100 ? '...' : '');
        }
        return '暂无消息';
    }

    /**
     * 获取最后修改时间
     * @param {Object} chat - 聊天数据
     * @returns {string} 最后修改时间
     */
    getLastModified(chat) {
        if (chat.lastModified) return chat.lastModified;
        
        if (chat.messages && chat.messages.length > 0) {
            const lastMessage = chat.messages[chat.messages.length - 1];
            return lastMessage.timestamp || chat.timestamp || Date.now();
        }
        
        return chat.timestamp || Date.now();
    }

    /**
     * 格式化时间
     * @param {string|number|Date} timestamp - 时间戳
     * @returns {string} 格式化后的时间
     */
    formatTime(timestamp) {
        if (!timestamp) return '未知时间';
        
        const date = new Date(timestamp);
        return date.toLocaleString('zh-CN');
    }

    // 以下是辅助方法，从原有代码中简化而来
    
    getCursorRoot() {
        const homeDir = os.homedir();
        console.log(`用户主目录: ${homeDir}`);
        
        // 检查不同操作系统的 Cursor 目录
        const possiblePaths = [
            // Windows - 使用环境变量
            process.env.APPDATA ? path.join(process.env.APPDATA, 'Cursor') : null,
            // Windows - 备用路径
            path.join(homeDir, 'AppData', 'Roaming', 'Cursor'),
            // macOS
            path.join(homeDir, 'Library', 'Application Support', 'Cursor'),
            // Linux
            path.join(homeDir, '.config', 'Cursor'),
            path.join(homeDir, '.cursor-server'),
            path.join(homeDir, '.cursor')
        ].filter(Boolean); // 过滤掉null值
        
        console.log('检查可能的Cursor路径:');
        for (const cursorDir of possiblePaths) {
            const exists = fs.existsSync(cursorDir);
            console.log(`  ${cursorDir}: ${exists ? '存在' : '不存在'}`);
            if (exists) {
                console.log(`✅ 找到Cursor根目录: ${cursorDir}`);
                return cursorDir;
            }
        }
        
        // 如果没有找到 Cursor 目录，返回一个模拟目录用于测试
        const mockDir = path.join(homeDir, '.cursor-mock');
        console.log(`❌ 所有Cursor路径都不存在，使用模拟目录: ${mockDir}`);
        if (!fs.existsSync(mockDir)) {
            fs.mkdirSync(mockDir, { recursive: true });
            
            // 创建模拟的数据目录结构
            const mockStorage = path.join(mockDir, 'User', 'workspaceStorage');
            fs.mkdirSync(mockStorage, { recursive: true });
            
            // 创建模拟的数据库文件
            const mockDbDir = path.join(mockStorage, 'mock-workspace-123');
            fs.mkdirSync(mockDbDir, { recursive: true });
            
            console.warn('未找到 Cursor 安装，使用模拟数据目录:', mockDir);
        }
        
        return mockDir;
    }

    findAllSessionDbs() {
        const cursorRoot = this.getCursorRoot();
        const sessionDbs = [];
        
        // 搜索所有可能的数据库文件
        const searchPaths = [
            // 全局存储
            path.join(cursorRoot, 'User', 'globalStorage'),
            path.join(cursorRoot, 'User', 'globalStorage', 'cursor'),
            path.join(cursorRoot, 'User', 'globalStorage', 'cursor.cursor'),
            // 工作区存储
            path.join(cursorRoot, 'User', 'workspaceStorage'),
            // 扩展存储
            path.join(cursorRoot, 'extensions')
        ];
        
        console.log('搜索数据库文件的路径:');
        searchPaths.forEach(searchPath => {
            const exists = fs.existsSync(searchPath);
            console.log(`  ${searchPath}: ${exists ? '存在' : '不存在'}`);
        });
        
        const searchDirectory = (dir, maxDepth = 3, currentDepth = 0) => {
            if (!fs.existsSync(dir) || currentDepth > maxDepth) return;
            
            try {
                const items = fs.readdirSync(dir, { withFileTypes: true });
                
                for (const item of items) {
                    const fullPath = path.join(dir, item.name);
                    
                    if (item.isFile()) {
                        const ext = path.extname(item.name).toLowerCase();
                        if (ext === '.sqlite' || ext === '.vscdb' || ext === '.db') {
                            const stats = fs.statSync(fullPath);
                            const relativePath = path.relative(cursorRoot, fullPath);
                            
                            sessionDbs.push({
                                path: fullPath,
                                filename: item.name,
                                type: this.determineDbType(relativePath),
                                workspaceId: this.extractWorkspaceId(relativePath),
                                modTime: stats.mtime,
                                relativePath: relativePath
                            });
                        }
                    } else if (item.isDirectory() && currentDepth < maxDepth) {
                        // 跳过node_modules等目录
                        if (!item.name.startsWith('.') && item.name !== 'node_modules') {
                            searchDirectory(fullPath, maxDepth, currentDepth + 1);
                        }
                    }
                }
            } catch (error) {
                console.warn(`访问目录失败: ${dir}`, error.message);
            }
        };
        
        searchPaths.forEach(dir => {
            if (fs.existsSync(dir)) {
                console.log(`开始搜索目录: ${dir}`);
                searchDirectory(dir);
            }
        });
        
        console.log(`总共找到 ${sessionDbs.length} 个数据库文件`);
        sessionDbs.forEach(db => {
            console.log(`  数据库: ${db.filename}, 类型: ${db.type}, 工作区ID: ${db.workspaceId}`);
        });
        
        // 去重并按修改时间排序
        const uniqueDbs = [];
        const seen = new Set();
        sessionDbs.forEach(db => {
            if (!seen.has(db.path)) {
                seen.add(db.path);
                uniqueDbs.push(db);
            }
        });
        
        return uniqueDbs.sort((a, b) => b.modTime - a.modTime);
    }

    /**
     * 确定数据库类型
     * @param {string} relativePath - 相对路径
     * @returns {string} 数据库类型
     */
    determineDbType(relativePath) {
        if (relativePath.includes('workspaceStorage')) return 'workspace';
        if (relativePath.includes('globalStorage')) return 'global';
        if (relativePath.includes('cursor') && relativePath.includes('sqlite')) return 'cursor';
        return 'unknown';
    }

    /**
     * 从路径中提取工作区ID
     * @param {string} relativePath - 相对路径
     * @returns {string} 工作区ID
     */
    extractWorkspaceId(relativePath) {
        const workspaceMatch = relativePath.match(/workspaceStorage[/\\]([^/\\]+)/);
        if (workspaceMatch) return workspaceMatch[1];
        return 'global';
    }

    getAllWorkspaces() {
        const cursorRoot = this.getCursorRoot();
        const workspaceStoragePath = path.join(cursorRoot, 'User', 'workspaceStorage');
        
        console.log(`检查工作区存储路径: ${workspaceStoragePath}`);
        console.log(`路径是否存在: ${fs.existsSync(workspaceStoragePath)}`);
        
        if (!fs.existsSync(workspaceStoragePath)) {
            console.log('工作区存储路径不存在，返回空数组');
            return [];
        }
        
        try {
            const workspaces = fs.readdirSync(workspaceStoragePath, { withFileTypes: true })
                .filter(item => item.isDirectory())
                .map(item => item.name);
            console.log(`找到工作区目录: ${workspaces.length} 个`, workspaces);
            return workspaces;
        } catch (error) {
            console.log('读取工作区目录失败:', error.message);
            return [];
        }
    }

    async getAllWorkspaceProjects() {
        const workspaces = this.getAllWorkspaces();
        console.log(`找到 ${workspaces.length} 个工作区:`, workspaces);
        const projects = new Map();
        
        for (const workspaceId of workspaces) {
            try {
                const projectInfo = await this.getProjectInfoFromWorkspace(workspaceId);
                if (projectInfo) {
                    console.log(`工作区 ${workspaceId} 项目信息:`, projectInfo);
                    projects.set(workspaceId, projectInfo);
                } else {
                    console.log(`工作区 ${workspaceId} 未获取到项目信息`);
                }
            } catch (error) {
                console.log(`工作区 ${workspaceId} 获取项目信息失败:`, error.message);
            }
        }
        
        console.log(`最终获取到 ${projects.size} 个工作区项目`);
        return projects;
    }

    async getProjectInfoFromWorkspace(workspaceId) {
        console.log(`开始获取工作区 ${workspaceId} 的项目信息`);
        try {
            const cursorRoot = this.getCursorRoot();
            const workspaceDir = path.join(cursorRoot, 'User', 'workspaceStorage', workspaceId);
            const workspaceJsonPath = path.join(workspaceDir, 'workspace.json');
            
            // 优先从workspace.json获取项目信息
            if (fs.existsSync(workspaceJsonPath)) {
                console.log(`从workspace.json获取项目信息: ${workspaceJsonPath}`);
                try {
                    const workspaceData = JSON.parse(fs.readFileSync(workspaceJsonPath, 'utf8'));
                    if (workspaceData.folder) {
                        let projectPath = workspaceData.folder;
                        let projectName = 'Unknown Project';
                        
                        // 处理不同类型的路径格式
                        if (projectPath.startsWith('vscode-remote://')) {
                            // 远程路径格式: vscode-remote://wsl%2Bubuntu-22.04/root/Repos/Cursor-Web
                            const pathMatch = projectPath.match(/vscode-remote:\/\/[^/]+(.+)$/);
                            if (pathMatch) {
                                projectPath = decodeURIComponent(pathMatch[1]);
                                projectName = path.basename(projectPath);
                            }
                        } else if (projectPath.startsWith('file:///')) {
                            // 本地文件路径格式
                            projectPath = projectPath.substring(8); // 移除 'file:///'
                            // 先进行URL解码
                            try {
                                if (projectPath.includes('%')) {
                                    projectPath = decodeURIComponent(projectPath);
                                }
                            } catch (error) {
                                console.warn('解码file:///路径失败:', error.message);
                            }
                            // 将/d:/格式转换为D:\格式
                            if (projectPath.startsWith('/') && projectPath.includes(':')) {
                                projectPath = projectPath.substring(1).replace(/\//g, '\\');
                            }
                            projectName = path.basename(projectPath);
                        } else {
                            // 直接路径，可能包含URL编码
                            try {
                                if (projectPath.includes('%')) {
                                    projectPath = decodeURIComponent(projectPath);
                                }
                                // 将/d:/格式转换为D:\格式
                                if (projectPath.startsWith('/') && projectPath.includes(':')) {
                                    projectPath = projectPath.substring(1).replace(/\//g, '\\');
                                }
                            } catch (error) {
                                console.warn('解码workspace.json路径失败:', error.message);
                            }
                            projectName = path.basename(projectPath);
                        }
                        
                        console.log(`从workspace.json获取到项目信息: ${projectName}, 路径: ${projectPath}`);
                        return {
                            name: projectName,
                            rootPath: projectPath,
                            path: projectPath,
                            id: workspaceId
                        };
                    }
                } catch (error) {
                    console.warn(`解析workspace.json失败: ${error.message}`);
                }
            }
            
            // 如果workspace.json不存在或解析失败，回退到state.vscdb
            const workspaceDbPath = path.join(workspaceDir, 'state.vscdb');
            console.log(`回退到数据库解析: ${workspaceDbPath}`);
            
            if (!fs.existsSync(workspaceDbPath)) {
                console.log(`工作区数据库文件不存在: ${workspaceDbPath}`);
                return null;
            }
            
            console.log(`成功找到工作区数据库文件，开始解析...`);

            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(workspaceDbPath);
            const db = new SQL.Database(fileBuffer);

            // 提取项目信息
            let projectName = 'Unknown Project';
            let rootPath = 'Unknown Path';

            // 优先从git仓库获取项目信息（参考cursor-view-main实现）
            try {
                const gitReposResult = db.exec("SELECT value FROM ItemTable WHERE key='scm:view:visibleRepositories'");
                if (gitReposResult[0] && gitReposResult[0].values[0]) {
                    const gitData = JSON.parse(gitReposResult[0].values[0][0]);
                    console.log('Git仓库原始数据:', JSON.stringify(gitData, null, 2));
                    
                    if (gitData && typeof gitData === 'object' && 'all' in gitData) {
                        const repos = gitData.all;
                        if (Array.isArray(repos) && repos.length > 0) {
                            console.log(`找到 ${repos.length} 个Git仓库:`, repos);
                            
                            // 处理每个仓库路径
                            for (const repo of repos) {
                                if (typeof repo === 'string' && repo.includes('git:Git:file:///')) {
                                    console.log('处理仓库路径:', repo);
                                    // 提取路径部分
                                    const pathPart = repo.split('file:///')[1];
                                    if (pathPart) {
                                        const pathParts = pathPart.split('/').filter(p => p);
                                        if (pathParts.length > 0) {
                                            // 使用最后一部分作为项目名称
                                            projectName = pathParts[pathParts.length - 1];
                                            rootPath = '/' + pathPart.replace(/\\/g, '/').replace(/^\//, '');
                                            console.log(`从Git仓库获取到项目信息: ${projectName}, 路径: ${rootPath}`);
                                            break;
                                        }
                                    }
                                } else {
                                    console.log('仓库路径不包含git:Git:file:///模式:', repo);
                                }
                            }
                        } else {
                            console.log('Git数据中的all字段不是数组或为空:', repos);
                        }
                    } else {
                        console.log('Git数据格式不正确或缺少all字段:', gitData);
                    }
                } else {
                    console.log('未找到scm:view:visibleRepositories数据');
                }
            } catch (error) {
                console.warn('从git仓库获取项目信息失败:', error.message);
            }

            // 优先从history.entries获取项目根路径 (基于cursor-view-main的逻辑)
            if (projectName === 'Unknown Project') {
                try {
                    const historyResult = db.exec("SELECT value FROM ItemTable WHERE key='history.entries'");
                    if (historyResult[0] && historyResult[0].values[0]) {
                        const historyData = JSON.parse(historyResult[0].values[0][0]);
                        console.log(`找到 ${historyData.length} 个历史条目`);
                        
                        // 从历史条目中提取文件路径，去除file:///前缀
                        const paths = [];
                        for (const entry of historyData) {
                            const resource = entry?.editor?.resource || "";
                            if (resource && resource.startsWith("file:///")) {
                                paths.push(resource.substring(8)); // 移除 'file:///'
                            }
                        }
                        
                        // 如果我们找到了文件路径，使用最长公共前缀提取项目名称
                        if (paths.length > 0) {
                            console.log(`从历史条目中找到 ${paths.length} 个路径`);
                            
                            // 获取最长公共前缀
                            const commonPrefix = this.getCommonPathPrefix(paths);
                            console.log(`公共前缀: ${commonPrefix}`);
                            
                            // 在公共前缀中找到最后一个目录分隔符
                            const lastSeparatorIndex = commonPrefix.lastIndexOf('/');
                            if (lastSeparatorIndex > 0) {
                                const projectRoot = commonPrefix.substring(0, lastSeparatorIndex);
                                console.log(`从公共前缀得到项目根路径: ${projectRoot}`);
                                
                                // 使用辅助函数提取项目名称
                                projectName = this.extractProjectNameFromPath("/" + projectRoot.replace(/^\//,''), true);
                                rootPath = "/" + projectRoot.replace(/^\//,'');
                            }
                        }
                    }
                } catch (error) {
                    console.warn('从history.entries获取项目信息失败:', error.message);
                }
            }

            // 尝试备用方法如果我们没有得到项目名称
            if (projectName === 'Unknown Project') {
                console.log("尝试备用方法获取项目名称");
                
                // 检查debug.selectedroot作为备用
                try {
                    const selectedRootResult = db.exec("SELECT value FROM ItemTable WHERE key='debug.selectedroot'");
                    if (selectedRootResult[0] && selectedRootResult[0].values[0]) {
                        const selectedRoot = JSON.parse(selectedRootResult[0].values[0][0]);
                        if (selectedRoot && typeof selectedRoot === 'string' && selectedRoot.startsWith('file:///')) {
                            const path = selectedRoot.substring(8); // 移除 'file:///'
                            if (path) {
                                rootPath = "/" + path.replace(/^\//,'');
                                console.log(`从debug.selectedroot得到项目根路径: ${rootPath}`);
                                
                                // 使用辅助函数提取项目名称
                                projectName = this.extractProjectNameFromPath(rootPath, true);
                                
                                if (projectName) {
                                    console.log(`从debug.selectedroot提取的项目名称: ${projectName}`);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn('从debug.selectedroot获取项目信息失败:', error.message);
                }
            }

            db.close();

            // 解码URL编码的路径
            let decodedRootPath = rootPath;
            try {
                if (rootPath.includes('%')) {
                    decodedRootPath = decodeURIComponent(rootPath);
                }
                // 将/d:/格式转换为D:\格式
                if (decodedRootPath.startsWith('/') && decodedRootPath.includes(':')) {
                    decodedRootPath = decodedRootPath.substring(1).replace(/\//g, '\\');
                }
            } catch (error) {
                console.warn('解码路径失败:', error.message);
            }

            console.log(`工作区 ${workspaceId} 最终项目信息: 名称=${projectName}, 路径=${decodedRootPath}`);

            return {
                name: projectName,
                rootPath: decodedRootPath,
                path: decodedRootPath, // 添加path字段作为备用
                id: workspaceId,
                workspace_id: workspaceId // 确保包含workspace_id字段
            };

        } catch (error) {
            console.error(`获取工作区 ${workspaceId} 项目信息失败:`, error.message);
            return {
                name: (workspaceId ? workspaceId.substring(0, 8) : 'unknown') + '...',
                rootPath: workspaceId,
                id: workspaceId
            };
        }
    }

    /**
     * 从路径中提取项目名称 (基于cursor-view-main的逻辑)
     * @param {string} rootPath - 完整路径
     * @param {boolean} debug - 是否启用调试日志
     * @returns {string} 项目名称
     */
    extractProjectNameFromPath(rootPath, debug = false) {
        if (!rootPath || rootPath === '/') {
            return "Root";
        }
        
        const pathParts = rootPath.split(/[/\\]/).filter(p => p);
        
        // 跳过常见用户目录模式
        let projectName = null;
        const homeDirPatterns = ['Users', 'home'];
        
        // 获取当前用户名用于比较
        const currentUsername = os.userInfo().username;
        
        // 在路径中查找用户目录
        let usernameIndex = -1;
        for (let i = 0; i < pathParts.length; i++) {
            if (homeDirPatterns.includes(pathParts[i])) {
                usernameIndex = i + 1;
                break;
            }
        }
        
        // 如果这只是 /Users/username 没有更深的路径，不要使用用户名作为项目
        if (usernameIndex >= 0 && usernameIndex < pathParts.length && pathParts[usernameIndex] === currentUsername) {
            if (pathParts.length <= usernameIndex + 1) {
                return "Home Directory";
            }
        }
        
        if (usernameIndex >= 0 && usernameIndex + 1 < pathParts.length) {
            // 首先尝试我们知道的特定项目目录
            const knownProjects = ['genaisf', 'cursor-view', 'cursor', 'cursor-apps', 'universal-github', 'inquiry', 'cursor-web'];
            
            // 首先查看路径的最具体/最深部分
            for (let i = pathParts.length - 1; i > usernameIndex; i--) {
                if (knownProjects.includes(pathParts[i])) {
                    projectName = pathParts[i];
                    if (debug) {
                        console.log(`从已知项目列表中找到项目名称: ${projectName}`);
                    }
                    break;
                }
            }
            
            // 如果没有找到已知项目，使用路径的最后部分，因为它很可能是项目目录
            if (!projectName && pathParts.length > usernameIndex + 1) {
                // 检查是否有类似 /Users/username/Documents/codebase/project_name 的结构
                if (pathParts.includes('Documents') && pathParts.includes('codebase')) {
                    const docIndex = pathParts.indexOf('Documents');
                    const codebaseIndex = pathParts.indexOf('codebase');
                    
                    // 如果 'codebase' 后面有路径组件，使用它作为项目名称
                    if (codebaseIndex + 1 < pathParts.length) {
                        projectName = pathParts[codebaseIndex + 1];
                        if (debug) {
                            console.log(`在Documents/codebase结构中找到项目名称: ${projectName}`);
                        }
                    }
                }
                
                // 如果没有找到特定结构，使用路径的最后组件
                if (!projectName) {
                    projectName = pathParts[pathParts.length - 1];
                    if (debug) {
                        console.log(`使用最后路径组件作为项目名称: ${projectName}`);
                    }
                }
            }
            
            // 跳过用户名作为项目名称
            if (projectName === currentUsername) {
                projectName = 'Home Directory';
                if (debug) {
                    console.log(`避免使用用户名作为项目名称`);
                }
            }
            
            // 跳过常见项目容器目录
            const projectContainers = ['Documents', 'Projects', 'Code', 'workspace', 'repos', 'git', 'src', 'codebase'];
            if (projectContainers.includes(projectName)) {
                // 不要使用容器目录作为项目名称
                // 如果可用，尝试使用下一个组件
                const containerIndex = pathParts.indexOf(projectName);
                if (containerIndex + 1 < pathParts.length) {
                    projectName = pathParts[containerIndex + 1];
                    if (debug) {
                        console.log(`跳过容器目录，使用下一个组件作为项目名称: ${projectName}`);
                    }
                }
            }
            
            // 如果我们仍然没有项目名称，使用用户名后的第一个非系统目录
            if (!projectName && usernameIndex + 1 < pathParts.length) {
                const systemDirs = ['Library', 'Applications', 'System', 'var', 'opt', 'tmp'];
                for (let i = usernameIndex + 1; i < pathParts.length; i++) {
                    if (!systemDirs.includes(pathParts[i]) && !projectContainers.includes(pathParts[i])) {
                        projectName = pathParts[i];
                        if (debug) {
                            console.log(`使用非系统目录作为项目名称: ${projectName}`);
                        }
                        break;
                    }
                }
            }
        } else {
            // 如果不在用户目录中，使用basename
            projectName = pathParts.length > 0 ? pathParts[pathParts.length - 1] : "Root";
            if (debug) {
                console.log(`使用basename作为项目名称: ${projectName}`);
            }
        }
        
        // 最终检查：不要返回用户名作为项目名称
        if (projectName === currentUsername) {
            projectName = "Home Directory";
            if (debug) {
                console.log(`最终检查：将用户名替换为'Home Directory'`);
            }
        }
        
        return projectName || "Unknown Project";
    }

    /**
     * 获取路径的共同前缀
     * @param {Array<string>} paths - 路径列表
     * @returns {string} 共同前缀路径
     */
    getCommonPathPrefix(paths) {
        if (!paths || paths.length === 0) return '';
        if (paths.length === 1) return paths[0];
        
        // 标准化路径分隔符
        const normalizedPaths = paths.map(p => p.replace(/\\/g, '/'));
        
        // 实现类似Python os.path.commonprefix的逻辑
        let commonPrefix = normalizedPaths[0];
        for (let i = 1; i < normalizedPaths.length; i++) {
            const currentPath = normalizedPaths[i];
            let j = 0;
            while (j < commonPrefix.length && j < currentPath.length && commonPrefix[j] === currentPath[j]) {
                j++;
            }
            commonPrefix = commonPrefix.substring(0, j);
            if (commonPrefix === '') break;
        }
        
        return commonPrefix;
    }

    matchWorkspace(session, workspaceProjects) {
        if (!session) {
            console.log('匹配工作区: session为空，返回global');
            return {
                id: 'global',
                project: { name: 'Global Chat', path: 'global', workspace_id: 'global' }
            };
        }

        // 检查工作区项目数据可用性
        if (workspaceProjects.size === 0) {
            console.log('匹配工作区: 没有可用的工作区项目数据');
        }

        // 优先使用session中的workspaceId
        if (session.workspaceId && workspaceProjects.has(session.workspaceId)) {
            const project = workspaceProjects.get(session.workspaceId);
            console.log(`匹配工作区: 使用session.workspaceId=${session.workspaceId}, 项目=${project.name}`);
            return {
                id: session.workspaceId,
                project: project
            };
        }

        // 增强的文件路径匹配逻辑
        if (session.filePaths && session.filePaths.size > 0) {
            const filePathsArray = Array.from(session.filePaths);
            // console.log(`匹配工作区: 尝试文件路径匹配, 文件路径:`, filePathsArray);
            
            // 计算每个工作区的匹配分数
            let bestMatch = null;
            let bestScore = 0;
            
            for (const [workspaceId, project] of workspaceProjects.entries()) {
                let score = 0;
                let matchedPaths = [];
                
                for (const filePath of filePathsArray) {
                    const normalizedFilePath = this.normalizePath(filePath);
                    const normalizedProjectPath = this.normalizePath(project.rootPath);
                    
                    // 检查文件路径是否在项目目录下
                    if (normalizedFilePath.startsWith(normalizedProjectPath)) {
                        score += 10; // 完全匹配得高分
                        matchedPaths.push(filePath);
                    } else if (normalizedProjectPath.startsWith(normalizedFilePath)) {
                        score += 5; // 部分匹配得中等分
                        matchedPaths.push(filePath);
                    } else {
                        // 检查路径中是否包含相同的目录名
                        const filePathParts = normalizedFilePath.split('/').filter(p => p);
                        const projectPathParts = normalizedProjectPath.split('/').filter(p => p);
                        
                        const commonParts = filePathParts.filter(part => 
                            projectPathParts.some(projPart => 
                                projPart.toLowerCase() === part.toLowerCase()
                            )
                        );
                        
                        if (commonParts.length > 0) {
                            score += commonParts.length; // 根据共同部分数量得分
                            matchedPaths.push(filePath);
                        }
                    }
                }
                
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = {
                        id: workspaceId,
                        project: project,
                        score: score,
                        matchedPaths: matchedPaths
                    };
                }
            }
            
            if (bestMatch && bestScore > 0) {
                // console.log(`匹配工作区: 文件路径匹配成功, 项目=${bestMatch.project.name}, 分数=${bestScore}, 匹配路径:`, bestMatch.matchedPaths);
                return {
                    id: bestMatch.id,
                    project: bestMatch.project
                };
            }
            
            // console.log('匹配工作区: 文件路径匹配失败，返回global');
        } else {
            console.log('匹配工作区: 无文件路径信息，返回global');
        }

        // 默认全局
        return {
            id: 'global',
            project: { name: 'Global Chat', path: 'global', workspace_id: 'global' }
        };
    }

    normalizePath(path) {
        if (!path) return '';
        
        // 处理file:///协议
        let normalized = path;
        if (path.startsWith('file:///')) {
            normalized = path.substring(7); // 移除file:///
        }
        
        // 标准化路径分隔符
        normalized = normalized.replace(/\\/g, '/');
        
        // 移除末尾的斜杠
        normalized = normalized.replace(/\/$/, '');
        
        // 转换为小写以便比较
        normalized = normalized.toLowerCase();
        
        return normalized;
    }

    extractFilePathsFromBubble(bubble, filePaths) {
        // 增强的文件路径提取逻辑
        let foundPaths = false;
        
        // 调试：输出bubble结构
        if (Math.random() < 0.1) { // 输出10%的样本
            console.log('🔍 Bubble结构示例:', {
                hasContext: !!bubble.context,
                contextKeys: bubble.context ? Object.keys(bubble.context) : [],
                text: bubble.text ? bubble.text.substring(0, 100) + '...' : 'no text',
                fileSelections: bubble.context?.fileSelections ? bubble.context.fileSelections.length : 0,
                folderSelections: bubble.context?.folderSelections ? bubble.context.folderSelections.length : 0,
                files: bubble.context?.files ? bubble.context.files.length : 0
            });
            
            // 如果有文件选择，输出详细信息
            if (bubble.context?.fileSelections?.length > 0) {
                console.log('🔍 文件选择详情:', bubble.context.fileSelections.slice(0, 3));
            }
            if (bubble.context?.folderSelections?.length > 0) {
                console.log('🔍 文件夹选择详情:', bubble.context.folderSelections.slice(0, 3));
            }
            if (bubble.context?.files?.length > 0) {
                console.log('🔍 文件详情:', bubble.context.files.slice(0, 3));
            }
        }
        
        // 方法1: 从context.diffHistory.files提取
        if (bubble.context && bubble.context.diffHistory && bubble.context.diffHistory.files) {
            bubble.context.diffHistory.files.forEach(file => {
                if (file.path) {
                    filePaths.add(file.path);
                    foundPaths = true;
                }
            });
        }
        
        // 方法2: 从context.files提取
        if (bubble.context && bubble.context.files) {
            bubble.context.files.forEach(file => {
                if (file.path) {
                    filePaths.add(file.path);
                    foundPaths = true;
                } else if (typeof file === 'string') {
                    filePaths.add(file);
                    foundPaths = true;
                }
            });
        }
        
        // 方法3: 从context.fileSelections提取
        if (bubble.context && bubble.context.fileSelections) {
            bubble.context.fileSelections.forEach(selection => {
                if (selection.path) {
                    filePaths.add(selection.path);
                    foundPaths = true;
                } else if (selection.file && selection.file.path) {
                    filePaths.add(selection.file.path);
                    foundPaths = true;
                } else if (typeof selection === 'string') {
                    filePaths.add(selection);
                    foundPaths = true;
                }
            });
        }
        
        // 方法4: 从context.folderSelections提取
        if (bubble.context && bubble.context.folderSelections) {
            bubble.context.folderSelections.forEach(selection => {
                if (selection.path) {
                    filePaths.add(selection.path);
                    foundPaths = true;
                } else if (typeof selection === 'string') {
                    filePaths.add(selection);
                    foundPaths = true;
                }
            });
        }
        
        // 方法5: 从attachedCodeChunks提取文件路径
        if (bubble.attachedCodeChunks && Array.isArray(bubble.attachedCodeChunks)) {
            bubble.attachedCodeChunks.forEach(chunk => {
                if (chunk.path) {
                    filePaths.add(chunk.path);
                    foundPaths = true;
                } else if (chunk.file && chunk.file.path) {
                    filePaths.add(chunk.file.path);
                    foundPaths = true;
                }
            });
        }
        
        // 方法6: 从relevantFiles提取文件路径
        if (bubble.relevantFiles && Array.isArray(bubble.relevantFiles)) {
            bubble.relevantFiles.forEach(file => {
                if (file.path) {
                    filePaths.add(file.path);
                    foundPaths = true;
                } else if (typeof file === 'string') {
                    filePaths.add(file);
                    foundPaths = true;
                }
            });
        }
        
        // 方法7: 从attachedFolders提取文件夹路径
        if (bubble.attachedFolders && Array.isArray(bubble.attachedFolders)) {
            bubble.attachedFolders.forEach(folder => {
                if (folder.path) {
                    filePaths.add(folder.path);
                    foundPaths = true;
                } else if (typeof folder === 'string') {
                    filePaths.add(folder);
                    foundPaths = true;
                }
            });
        }
        
        // 方法8: 从attachedFoldersNew提取文件夹路径
        if (bubble.attachedFoldersNew && Array.isArray(bubble.attachedFoldersNew)) {
            bubble.attachedFoldersNew.forEach(folder => {
                if (folder.path) {
                    filePaths.add(folder.path);
                    foundPaths = true;
                } else if (typeof folder === 'string') {
                    filePaths.add(folder);
                    foundPaths = true;
                }
            });
        }
        
        // 方法9: 从text中提取文件路径（正则匹配）
        if (bubble.text) {
            // 匹配相对路径文件（如 public/git-manager.js）
            const relativePathRegex = /([a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.\/]+\.[a-zA-Z0-9]+)/g;
            let match;
            while ((match = relativePathRegex.exec(bubble.text)) !== null) {
                filePaths.add(match[1]);
                foundPaths = true;
            }
            
            // 匹配绝对路径文件
            const absolutePathRegex = /(?:file:\/\/\/|\/)([a-zA-Z]:[\\\w\s\-\.\/\_]+\.[a-zA-Z0-9]+)/g;
            while ((match = absolutePathRegex.exec(bubble.text)) !== null) {
                filePaths.add(match[1]);
                foundPaths = true;
            }
        }
        
        // 文件路径提取完成
    }

    async extractChatDetailFromDb(dbInfo, sessionId) {
        // 简化的聊天详情提取逻辑
        const chats = await this.extractChatsFromDb(dbInfo, new Map());
        
        // 首先尝试直接匹配sessionId
        let chat = chats.find(chat => chat.sessionId === sessionId);
        
        // 如果没找到，尝试匹配原始sessionId（去掉路径哈希后缀）
        if (!chat && sessionId.includes('_')) {
            const originalSessionId = sessionId.split('_')[0];
            chat = chats.find(chat => chat.sessionId === originalSessionId);
        }
        
        // 如果还是没找到，尝试匹配处理后的sessionId（包含路径哈希）
        if (!chat) {
            const processedChats = this.processChats(chats);
            chat = processedChats.find(chat => chat.sessionId === sessionId);
        }
        
        return chat;
    }

    deduplicateChats(chats) {
        console.log(`去重前: ${chats.length} 条聊天记录`);
        const seen = new Set();
        const duplicateIds = [];
        const uniqueIds = new Set();
        
        // 先统计所有sessionId
        chats.forEach(chat => {
            const id = chat.sessionId || 'undefined';
            uniqueIds.add(id);
        });
        console.log(`发现 ${uniqueIds.size} 个不同的sessionId:`, Array.from(uniqueIds).slice(0, 5));
        
        const result = chats.filter(chat => {
            const sessionId = chat.sessionId || 'undefined';
            if (seen.has(sessionId)) {
                duplicateIds.push(sessionId);
                return false;
            }
            seen.add(sessionId);
            return true;
        });
        console.log(`去重后: ${result.length} 条聊天记录`);
        if (duplicateIds.length > 0) {
            console.log(`发现重复的sessionId: ${duplicateIds.slice(0, 5).join(', ')}${duplicateIds.length > 5 ? '...' : ''}`);
        }
        return result;
    }

    // 缓存管理
    getFromCache(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        return null;
    }

    setCache(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }
}

module.exports = HistoryService;