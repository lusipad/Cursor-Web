/**
 * 历史记录服务
 * 后端业务逻辑层，负责数据处理和业务规则
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const initSqlJs = require('sql.js');

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
        const cached = this.getFromCache(cacheKey);
        
        if (cached) {
            console.log(`从缓存返回 ${cached.length} 条聊天记录`);
            return cached;
        }

        try {
            const allChats = [];
            
            // 获取所有会话数据库
            const sessionDbs = this.findAllSessionDbs();
            console.log(`找到 ${sessionDbs.length} 个会话数据库`);
            
            // 获取工作区信息
            const workspaceProjects = await this.getAllWorkspaceProjects();
            console.log(`获取到 ${workspaceProjects.length} 个工作区项目`);
            
            // 从每个数据库提取聊天记录
            for (const dbInfo of sessionDbs) {
                try {
                    const chats = await this.extractChatsFromDb(dbInfo, workspaceProjects);
                    console.log(`从数据库 ${path.basename(dbInfo.path)} 提取到 ${chats.length} 条聊天记录`);
                    allChats.push(...chats);
                } catch (error) {
                    console.error(`从数据库 ${dbInfo.path} 提取聊天失败:`, error.message);
                }
            }
            
            console.log(`总共提取到 ${allChats.length} 条原始聊天记录`);
            
            // 处理和排序
            const processedChats = this.processChats(allChats, options);
            console.log(`处理后得到 ${processedChats.length} 条聊天记录`);
            
            this.setCache(cacheKey, processedChats);
            return processedChats;
            
        } catch (error) {
            console.error('获取聊天记录失败:', error);
            throw error;
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
            const sessionDbs = this.findAllSessionDbs();
            console.log('🗄️ 找到数据库文件数量:', sessionDbs.length);
            
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
            
            throw new Error(`未找到会话 ${sessionId}`);
            
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
                    if (projectInfo) {
                        workspaceList.push({
                            id: workspaceId,
                            name: projectInfo.name,
                            path: projectInfo.rootPath
                        });
                    }
                } catch (error) {
                    console.error(`获取工作区 ${workspaceId} 信息失败:`, error.message);
                }
            }
            
            this.setCache(cacheKey, workspaceList);
            return workspaceList;
            
        } catch (error) {
            console.error('获取工作区列表失败:', error);
            throw error;
        }
    }

    /**
     * 从数据库提取聊天记录
     * @param {Object} dbInfo - 数据库信息
     * @param {Map} workspaceProjects - 工作区项目映射
     * @returns {Promise<Array>} 聊天记录
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
                    project: workspaceInfo.project
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
                    
                    if (!composerId) continue;

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

        return Object.values(sessions).map(session => ({
            ...session,
            filePaths: Array.from(session.filePaths)
        }));
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
        const processedChats = uniqueChats.map(chat => ({
            ...chat,
            title: this.generateChatTitle(chat),
            preview: this.generateChatPreview(chat),
            lastModified: this.getLastModified(chat)
        }));
        
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
        return {
            ...chat,
            title: this.generateChatTitle(chat),
            lastModified: this.getLastModified(chat),
            messages: chat.messages ? chat.messages.map(msg => ({
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
        const cursorDir = path.join(homeDir, 'AppData', 'Roaming', 'Cursor');
        
        if (!fs.existsSync(cursorDir)) {
            throw new Error('Cursor 目录不存在，请确保已安装 Cursor');
        }
        
        return cursorDir;
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
                searchDirectory(dir);
            }
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
        
        if (!fs.existsSync(workspaceStoragePath)) {
            return [];
        }
        
        try {
            return fs.readdirSync(workspaceStoragePath, { withFileTypes: true })
                .filter(item => item.isDirectory())
                .map(item => item.name);
        } catch (error) {
            return [];
        }
    }

    async getAllWorkspaceProjects() {
        const workspaces = this.getAllWorkspaces();
        const projects = new Map();
        
        for (const workspaceId of workspaces) {
            try {
                const projectInfo = await this.getProjectInfoFromWorkspace(workspaceId);
                if (projectInfo) {
                    projects.set(workspaceId, projectInfo);
                }
            } catch (error) {
                // 忽略无法获取的工作区
            }
        }
        
        return projects;
    }

    async getProjectInfoFromWorkspace(workspaceId) {
        try {
            const cursorRoot = this.getCursorRoot();
            const workspaceDbPath = path.join(cursorRoot, 'User', 'workspaceStorage', workspaceId, 'state.vscdb');
            
            if (!fs.existsSync(workspaceDbPath)) {
                return null;
            }

            const SQL = await initSqlJs();
            const fileBuffer = fs.readFileSync(workspaceDbPath);
            const db = new SQL.Database(fileBuffer);

            // 提取项目信息
            let projectName = 'Unknown Project';
            let rootPath = 'Unknown Path';

            try {
                // 尝试从history.entries获取项目根路径
                const historyResult = db.exec("SELECT value FROM ItemTable WHERE key='history.entries'");
                if (historyResult[0] && historyResult[0].values[0]) {
                    const historyData = JSON.parse(historyResult[0].values[0][0]);
                    const filePaths = [];
                    
                    for (const entry of historyData) {
                        const resource = entry?.editor?.resource;
                        if (resource && resource.startsWith('file:///')) {
                            filePaths.push(resource.substring(7)); // 移除 'file://'
                        }
                    }

                    if (filePaths.length > 0) {
                        const commonPrefix = this.getCommonPathPrefix(filePaths);
                        if (commonPrefix) {
                            rootPath = commonPrefix;
                            projectName = this.extractProjectNameFromPath(commonPrefix);
                        }
                    }
                }
            } catch (error) {
                console.warn('从history.entries获取项目信息失败:', error.message);
            }

            // 如果上面方法失败，尝试从debug.selectedroot获取
            if (projectName === 'Unknown Project') {
                try {
                    const selectedRootResult = db.exec("SELECT value FROM ItemTable WHERE key='debug.selectedroot'");
                    if (selectedRootResult[0] && selectedRootResult[0].values[0]) {
                        const selectedRoot = JSON.parse(selectedRootResult[0].values[0][0]);
                        if (selectedRoot && selectedRoot.startsWith('file:///')) {
                            rootPath = selectedRoot.substring(7);
                            projectName = this.extractProjectNameFromPath(rootPath);
                        }
                    }
                } catch (error) {
                    console.warn('从debug.selectedroot获取项目信息失败:', error.message);
                }
            }

            // 如果还是未知，尝试从git仓库获取
            if (projectName === 'Unknown Project') {
                try {
                    const gitReposResult = db.exec("SELECT value FROM ItemTable WHERE key='scm:view:visibleRepositories'");
                    if (gitReposResult[0] && gitReposResult[0].values[0]) {
                        const gitData = JSON.parse(gitReposResult[0].values[0][0]);
                        if (gitData && gitData.all && gitData.all.length > 0) {
                            const firstRepo = gitData.all[0];
                            if (typeof firstRepo === 'string' && firstRepo.includes('git:Git:file:///')) {
                                const repoPath = firstRepo.split('file:///')[1];
                                if (repoPath) {
                                    projectName = this.extractProjectNameFromPath(repoPath);
                                    rootPath = '/' + repoPath.replace(/\\/g, '/').replace(/^\//, '');
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.warn('从git仓库获取项目信息失败:', error.message);
                }
            }

            db.close();

            return {
                name: projectName,
                rootPath: rootPath,
                id: workspaceId
            };

        } catch (error) {
            console.error(`获取工作区 ${workspaceId} 项目信息失败:`, error.message);
            return {
                name: workspaceId.substring(0, 8) + '...',
                rootPath: workspaceId,
                id: workspaceId
            };
        }
    }

    /**
     * 从路径中提取项目名称
     * @param {string} fullPath - 完整路径
     * @returns {string} 项目名称
     */
    extractProjectNameFromPath(fullPath) {
        if (!fullPath || fullPath === '/') return 'Root';
        
        const pathParts = fullPath.split(/[/\\]/).filter(part => part && part.trim());
        if (pathParts.length === 0) return 'Root';
        
        // 获取用户名用于排除
        const username = os.userInfo().username;
        const homeDir = os.homedir();
        
        // 清理路径
        let cleanPath = fullPath;
        if (fullPath.startsWith(homeDir)) {
            cleanPath = fullPath.substring(homeDir.length);
        }
        
        const parts = cleanPath.split(/[/\\]/).filter(part => part && part.trim());
        
        // 跳过系统目录
        const skipDirs = ['Users', 'home', 'homebrew', 'opt', 'var', 'usr', 'mnt', 'c', 'C'];
        const containerDirs = ['Documents', 'Projects', 'Code', 'workspace', 'repos', 'git', 'src', 'codebase', 'Development'];
        
        let projectName = null;
        
        // 从后向前查找合适的目录名
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            if (part === username || skipDirs.includes(part)) continue;
            if (containerDirs.includes(part)) continue;
            if (part.length < 2) continue;
            
            projectName = part;
            break;
        }
        
        if (!projectName) {
            projectName = parts[parts.length - 1] || 'Unknown Project';
        }
        
        return projectName;
    }

    /**
     * 获取路径的共同前缀
     * @param {Array<string>} paths - 路径列表
     * @returns {string} 共同前缀路径
     */
    getCommonPathPrefix(paths) {
        if (!paths || paths.length === 0) return '';
        
        const normalizedPaths = paths.map(p => p.replace(/\\/g, '/'));
        const commonPrefix = normalizedPaths.reduce((prefix, path) => {
            let i = 0;
            while (i < prefix.length && i < path.length && prefix[i] === path[i]) {
                i++;
            }
            return prefix.substring(0, i);
        });
        
        // 确保路径是完整的目录
        const lastSlash = commonPrefix.lastIndexOf('/');
        return lastSlash > 0 ? commonPrefix.substring(0, lastSlash) : commonPrefix;
    }

    matchWorkspace(session, workspaceProjects) {
        if (!session) {
            return {
                id: 'global',
                project: { name: 'Global Chat', path: 'global', workspace_id: 'global' }
            };
        }

        // 优先使用session中的workspaceId
        if (session.workspaceId && workspaceProjects.has(session.workspaceId)) {
            const project = workspaceProjects.get(session.workspaceId);
            return {
                id: session.workspaceId,
                project: project
            };
        }

        // 尝试基于文件路径匹配
        if (session.filePaths && session.filePaths.length > 0) {
            for (const filePath of session.filePaths) {
                for (const [workspaceId, project] of workspaceProjects.entries()) {
                    if (filePath.includes(project.rootPath) || 
                        project.rootPath.includes(filePath)) {
                        return {
                            id: workspaceId,
                            project: project
                        };
                    }
                }
            }
        }

        // 默认全局
        return {
            id: 'global',
            project: { name: 'Global Chat', path: 'global', workspace_id: 'global' }
        };
    }

    extractFilePathsFromBubble(bubble, filePaths) {
        // 简化的文件路径提取逻辑
        if (bubble.context && bubble.context.diffHistory && bubble.context.diffHistory.files) {
            bubble.context.diffHistory.files.forEach(file => {
                if (file.path) {
                    filePaths.add(file.path);
                }
            });
        }
    }

    async extractChatDetailFromDb(dbInfo, sessionId) {
        // 简化的聊天详情提取逻辑
        const chats = await this.extractChatsFromDb(dbInfo, new Map());
        return chats.find(chat => chat.sessionId === sessionId);
    }

    deduplicateChats(chats) {
        const seen = new Set();
        return chats.filter(chat => {
            if (seen.has(chat.sessionId)) {
                return false;
            }
            seen.add(chat.sessionId);
            return true;
        });
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