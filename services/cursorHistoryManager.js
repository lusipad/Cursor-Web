// Cursor历史记录管理器 - 直接读取Cursor的SQLite数据库
const fs = require('fs');
const path = require('path');
const os = require('os');

class CursorHistoryManager {
    constructor() {
        this.cursorStoragePath = this.getCursorStoragePath();
        this.cachedChats = null;
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
                // 标准的Cursor安装路径
                const possiblePaths = [
                    path.join(home, '.config', 'Cursor'),
                    path.join(home, '.cursor'),
                    '/root/.cursor',
                    '/root/.cursor-server' // 最后的备选
                ];
                
                for (const cursorPath of possiblePaths) {
                    if (fs.existsSync(cursorPath)) {
                        console.log(`✅ 找到Cursor数据路径: ${cursorPath}`);
                        return cursorPath;
                    }
                }
                
                console.log(`❌ 未找到Cursor数据路径，尝试过的路径: ${possiblePaths.join(', ')}`);
                return path.join(home, '.config', 'Cursor'); // 返回默认路径
            default:
                throw new Error(`不支持的平台: ${platform}`);
        }
    }

    // 获取所有聊天会话
    async getChats() {
        const now = Date.now();
        if (this.cachedChats && (now - this.lastCacheTime) < this.cacheTimeout) {
            console.log(`📚 使用缓存的聊天记录: ${this.cachedChats.length} 个会话`);
            return this.cachedChats;
        }

        try {
            console.log(`🔍 开始提取聊天记录...`);
            const result = await this.extractAllChats();
            const chats = result.chats;
            this.cachedChats = chats;
            this.lastCacheTime = now;
            console.log(`📚 加载聊天记录: ${chats.length} 个会话`);
            
            // 添加数据源信息
            const enhancedChats = chats.map(chat => ({
                ...chat,
                isRealData: result.isRealData,
                dataSource: result.isRealData ? 'cursor' : 'demo'
            }));
            
            return enhancedChats;
        } catch (error) {
            console.error('❌ 加载聊天记录失败:', error);
            console.log(`📝 返回演示数据...`);
            const demoChats = this.getDemoChats();
            
            // 添加数据源信息
            const enhancedDemoChats = demoChats.map(chat => ({
                ...chat,
                isRealData: false,
                dataSource: 'demo'
            }));
            
            return enhancedDemoChats;
        }
    }

    // 提取所有聊天会话
    async extractAllChats() {
        console.log("🔍 开始提取聊天会话...");
        
        const workspaces = this.findWorkspaceDatabases();
        
        if (workspaces.length === 0) {
            console.log("📝 未找到工作区数据，返回演示数据");
            return {
                chats: this.getDemoChats(),
                isRealData: false
            };
        }
        
        const allChats = [];
        
        // 处理每个工作区
        for (const workspace of workspaces) {
            console.log(`📂 处理工作区: ${workspace.workspaceId}`);
            
            // 处理每个session数据库
            for (const sessionDb of workspace.sessionDbs) {
                try {
                    const chatSession = await this.extractChatSession(workspace.workspaceDb, sessionDb);
                    if (chatSession && chatSession.messages.length > 0) {
                        // 添加元数据
                        const chatData = {
                            ...chatSession,
                            date: new Date(fs.statSync(sessionDb).mtime).toISOString(),
                            sessionId: path.basename(sessionDb, path.extname(sessionDb)),
                            workspaceId: workspace.workspaceId
                        };
                        allChats.push(chatData);
                        console.log(`✅ 从 ${sessionDb} 提取了 ${chatSession.messages.length} 条消息`);
                    }
                } catch (error) {
                    console.error(`❌ 处理session数据库失败 ${sessionDb}:`, error);
                }
            }
        }
        
        console.log(`📊 总共提取了 ${allChats.length} 个聊天会话`);
        
        // 如果没有找到真实的聊天记录，返回演示数据
        if (allChats.length === 0) {
            console.log("📝 未找到真实聊天记录，返回演示数据");
            return {
                chats: this.getDemoChats(),
                isRealData: false
            };
        }
        
        // 按时间排序
        allChats.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        console.log("✅ 聊天会话提取完成");
        return {
            chats: allChats,
            isRealData: true
        };
    }

    // 查找工作区数据库
    findWorkspaceDatabases() {
        const results = [];
        
        // 查找工作区存储目录
        const workspaceStorage = path.join(this.cursorStoragePath, 'User', 'workspaceStorage');
        console.log(`🔍 查找工作区存储: ${workspaceStorage}`);
        
        // 查找session数据库目录
        const sessionDbDirs = [
            path.join(this.cursorStoragePath, 'User', 'globalStorage', 'cursor.cursor'),
            path.join(this.cursorStoragePath, 'User', 'globalStorage', 'cursor')
        ];
        
        // 查找所有session数据库
        const allSessionDbs = [];
        for (const sessionDir of sessionDbDirs) {
            if (fs.existsSync(sessionDir)) {
                console.log(`🔍 查找session数据库: ${sessionDir}`);
                const files = fs.readdirSync(sessionDir);
                for (const file of files) {
                    if (file.endsWith('.sqlite') || file.endsWith('.db') || file.endsWith('.sqlite3')) {
                        allSessionDbs.push(path.join(sessionDir, file));
                        console.log(`✅ 找到session数据库: ${file}`);
                    }
                }
            }
        }
        
        // 如果没有找到工作区但有session数据库，创建一个虚拟工作区
        if (allSessionDbs.length > 0 && !fs.existsSync(workspaceStorage)) {
            console.log(`📄 没有工作区但找到session数据库，创建虚拟工作区`);
            results.push({
                workspaceDb: null,
                sessionDbs: allSessionDbs,
                workspaceId: 'unknown'
            });
            return results;
        }
        
        // 如果有工作区存储，处理每个工作区
        if (fs.existsSync(workspaceStorage)) {
            const workspaceDirs = fs.readdirSync(workspaceStorage);
            console.log(`📁 找到 ${workspaceDirs.length} 个工作区目录`);
            
            for (const dir of workspaceDirs) {
                const workspaceDb = path.join(workspaceStorage, dir, 'state.vscdb');
                if (fs.existsSync(workspaceDb)) {
                    console.log(`✅ 找到工作区数据库: ${workspaceDb}`);
                    results.push({
                        workspaceDb: workspaceDb,
                        sessionDbs: allSessionDbs,
                        workspaceId: dir
                    });
                }
            }
        }
        
        console.log(`📊 总共找到 ${results.length} 个工作区配置`);
        return results;
    }

    // 查找全局数据库
    findGlobalDatabases() {
        const possiblePaths = [
            path.join(this.cursorStoragePath, 'User', 'globalStorage'),
            path.join(this.cursorStoragePath, 'data', 'User', 'globalStorage')
        ];
        
        const databases = [];
        
        for (const globalStorage of possiblePaths) {
            if (!fs.existsSync(globalStorage)) {
                continue;
            }
            
            console.log(`🔍 检查全局存储: ${globalStorage}`);
            
            // 检查全局state.vscdb文件
            const globalStateDb = path.join(globalStorage, 'state.vscdb');
            if (fs.existsSync(globalStateDb)) {
                databases.push(globalStateDb);
            }
            
            // 检查可能的目录
            const possibleDirs = [
                path.join(globalStorage, 'cursor.cursor'),
                path.join(globalStorage, 'cursor'),
                globalStorage
            ];
            
            for (const dir of possibleDirs) {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        if (file.endsWith('.sqlite') || file.endsWith('.vscdb') || file.endsWith('.db') || file.endsWith('.sqlite3')) {
                            databases.push(path.join(dir, file));
                        }
                    }
                }
            }
            
            break; // 找到有效路径后就停止
        }
        
        return databases;
    }

    // 提取聊天会话
    async extractChatSession(workspaceDb, sessionDb) {
        try {
            // 提取项目信息
            const project = workspaceDb ? this.extractProjectInfo(workspaceDb) : { name: 'Unknown Project', rootPath: '/' };
            
            // 提取消息
            const messages = this.extractMessages(sessionDb);
            
            return {
                project: project,
                messages: messages
            };
        } catch (error) {
            console.error(`提取聊天会话失败:`, error);
            return null;
        }
    }

    // 从工作区数据库提取项目信息
    extractProjectInfo(workspaceDb) {
        try {
            const Database = require('better-sqlite3');
            const db = new Database(workspaceDb, { readonly: true });
            
            const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("history.entries");
            const entries = JSON.parse(row?.value || '[]');
            
            db.close();
            
            const filePaths = [];
            for (const entry of entries) {
                const resource = entry?.editor?.resource || '';
                if (resource.startsWith('file:///')) {
                    filePaths.push(resource.substring(7)); // 移除 file:///
                }
            }
            
            if (filePaths.length === 0) {
                return { name: 'Unknown Project', rootPath: '/' };
            }
            
            // 找到公共前缀作为项目根路径
            const commonPrefix = this.getCommonPrefix(filePaths);
            const projectName = this.extractProjectNameFromPath(commonPrefix);
            
            return {
                name: projectName,
                rootPath: commonPrefix
            };
        } catch (error) {
            console.error('提取项目信息失败:', error);
            return { name: 'Unknown Project', rootPath: '/' };
        }
    }

    // 从session数据库提取消息
    extractMessages(sessionDb) {
        try {
            const Database = require('better-sqlite3');
            const db = new Database(sessionDb, { readonly: true });
            
            const rows = db.prepare("SELECT rowid, key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
            const messages = [];
            
            for (const row of rows) {
                try {
                    const bubble = JSON.parse(row.value);
                    const text = bubble.text?.trim();
                    if (!text) continue;
                    
                    const role = bubble.type === 1 ? 'user' : 'assistant';
                    messages.push({
                        rowid: row.rowid,
                        role: role,
                        content: text
                    });
                } catch (e) {
                    // 忽略解析错误
                }
            }
            
            db.close();
            
            // 按rowid排序（插入顺序）
            messages.sort((a, b) => a.rowid - b.rowid);
            
            // 移除rowid字段，只保留消息内容
            return messages.map(msg => ({
                role: msg.role,
                content: msg.content
            }));
        } catch (error) {
            console.error('提取消息失败:', error);
            return [];
        }
    }

    // 从JSON文件提取历史记录
    extractHistoryFromJSON(jsonPath) {
        try {
            const content = fs.readFileSync(jsonPath, 'utf8');
            const data = JSON.parse(content);
            
            console.log(`📄 解析JSON历史记录: ${jsonPath}`);
            
            // 检查是否是文件历史记录
            if (data.resource && data.entries) {
                return {
                    project: {
                        name: 'File History',
                        rootPath: this.extractPathFromResource(data.resource)
                    },
                    session: {
                        composerId: `file_${Date.now()}`,
                        title: `File History: ${this.getFileNameFromResource(data.resource)}`,
                        createdAt: Math.min(...data.entries.map(e => e.timestamp)),
                        lastUpdatedAt: Math.max(...data.entries.map(e => e.timestamp))
                    },
                    messages: [
                        {
                            role: 'system',
                            content: `File history for: ${data.resource}\n\n${data.entries.map(entry => 
                                `${new Date(entry.timestamp).toLocaleString()}: ${entry.source} (${entry.id})`
                            ).join('\n')}`
                        }
                    ],
                    workspace_id: 'file_history',
                    db_path: jsonPath
                };
            }
            
            // 如果不是已知格式，返回原始数据
            return {
                project: { name: 'Unknown Data', rootPath: '/' },
                session: {
                    composerId: `json_${Date.now()}`,
                    title: 'JSON Data',
                    createdAt: Date.now(),
                    lastUpdatedAt: Date.now()
                },
                messages: [
                    { role: 'system', content: JSON.stringify(data, null, 2) }
                ],
                workspace_id: 'json_data',
                db_path: jsonPath
            };
            
        } catch (error) {
            console.error(`解析JSON历史记录失败 ${jsonPath}:`, error);
            return null;
        }
    }
    
    // 从资源字符串提取路径
    extractPathFromResource(resource) {
        if (resource.startsWith('vscode-remote://')) {
            // 解析vscode-remote URL
            const match = resource.match(/vscode-remote:\/\/[^\/]+(.+)/);
            return match ? match[1] : resource;
        }
        return resource;
    }
    
    // 从资源字符串提取文件名
    getFileNameFromResource(resource) {
        const path = this.extractPathFromResource(resource);
        return path.split('/').pop() || 'Unknown File';
    }

    // 从全局数据库提取聊天记录
    async extractGlobalChats(dbPath) {
        const chats = [];
        
        try {
            const Database = require('better-sqlite3');
            const db = new Database(`file:${dbPath}?mode=ro`, { readonly: true });
            
            // 获取聊天气泡数据
            const bubbles = this.getBubbleData(db);
            
            // 按composerId分组
            const sessions = {};
            for (const bubble of bubbles) {
                const sessionId = bubble.composerId;
                if (!sessions[sessionId]) {
                    sessions[sessionId] = {
                        composerId: sessionId,
                        title: `Chat ${sessionId.substring(0, 8)}`,
                        messages: []
                    };
                }
                sessions[sessionId].messages.push({
                    role: bubble.role,
                    content: bubble.text
                });
            }
            
            for (const sessionId in sessions) {
                const session = sessions[sessionId];
                if (session.messages.length > 0) {
                    chats.push({
                        project: { name: 'Global Chat', rootPath: '/' },
                        session: session,
                        messages: session.messages,
                        workspace_id: 'global',
                        db_path: dbPath
                    });
                }
            }
            
            db.close();
        } catch (error) {
            console.error(`提取全局聊天记录失败 ${dbPath}:`, error);
        }
        
        return chats;
    }

    // 提取项目信息
    extractProjectInfo(db) {
        try {
            const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("history.entries");
            const entries = JSON.parse(row?.value || '[]');
            const filePaths = [];
            
            for (const entry of entries) {
                const resource = entry?.editor?.resource || '';
                if (resource.startsWith('file:///')) {
                    filePaths.push(resource.substring(7)); // 移除 file:///
                }
            }
            
            if (filePaths.length > 0) {
                const commonPrefix = this.getCommonPrefix(filePaths);
                const projectName = this.extractProjectNameFromPath(commonPrefix);
                return {
                    name: projectName,
                    rootPath: commonPrefix
                };
            } else {
                return { name: 'Unknown Project', rootPath: '/' };
            }
        } catch (error) {
            return { name: 'Unknown Project', rootPath: '/' };
        }
    }

    // 获取聊天数据
    getChatData(db) {
        try {
            const sessions = [];
            
            // 尝试从workbench.panel.aichat.view.aichat.chatdata获取
            const chatDataRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("workbench.panel.aichat.view.aichat.chatdata");
            if (chatDataRow) {
                const chatData = JSON.parse(chatDataRow.value || '{"tabs": []}');
                for (const tab of chatData.tabs || []) {
                    const messages = [];
                    for (const bubble of tab.bubbles || []) {
                        if (bubble.text) {
                            messages.push({
                                role: bubble.type === 'user' ? 'user' : 'assistant',
                                content: bubble.text
                            });
                        }
                    }
                    
                    if (messages.length > 0) {
                        sessions.push({
                            composerId: tab.tabId,
                            title: tab.title || `Chat ${tab.tabId?.substring(0, 8)}`,
                            createdAt: tab.createdAt,
                            lastUpdatedAt: tab.lastUpdatedAt,
                            messages: messages
                        });
                    }
                }
            }
            
            // 尝试从composer.composerData获取
            const composerDataRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("composer.composerData");
            if (composerDataRow) {
                const composerData = JSON.parse(composerDataRow.value || '{}');
                for (const [composerId, data] of Object.entries(composerData)) {
                    if (data.bubbles && data.bubbles.length > 0) {
                        const messages = [];
                        for (const bubble of data.bubbles) {
                            if (bubble.text) {
                                messages.push({
                                    role: bubble.type === 1 ? 'user' : 'assistant',
                                    content: bubble.text
                                });
                            }
                        }
                        
                        if (messages.length > 0) {
                            sessions.push({
                                composerId: composerId,
                                title: data.title || `Chat ${composerId.substring(0, 8)}`,
                                createdAt: data.createdAt,
                                lastUpdatedAt: data.lastUpdatedAt,
                                messages: messages
                            });
                        }
                    }
                }
            }
            
            // 尝试从aiService.prompts获取
            const promptsRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("aiService.prompts");
            if (promptsRow) {
                const promptsData = JSON.parse(promptsRow.value || '{}');
                for (const [promptId, prompt] of Object.entries(promptsData)) {
                    if (prompt.prompt && prompt.response) {
                        sessions.push({
                            composerId: promptId,
                            title: prompt.title || `Prompt ${promptId.substring(0, 8)}`,
                            createdAt: prompt.timestamp,
                            lastUpdatedAt: prompt.timestamp,
                            messages: [
                                { role: 'user', content: prompt.prompt },
                                { role: 'assistant', content: prompt.response }
                            ]
                        });
                    }
                }
            }
            
            // 尝试从aiService.generations获取
            const generationsRow = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("aiService.generations");
            if (generationsRow) {
                const generationsData = JSON.parse(generationsRow.value || '{}');
                for (const [genId, generation] of Object.entries(generationsData)) {
                    if (generation.prompt && generation.response) {
                        sessions.push({
                            composerId: genId,
                            title: generation.title || `Generation ${genId.substring(0, 8)}`,
                            createdAt: generation.timestamp,
                            lastUpdatedAt: generation.timestamp,
                            messages: [
                                { role: 'user', content: generation.prompt },
                                { role: 'assistant', content: generation.response }
                            ]
                        });
                    }
                }
            }
            
            return sessions;
        } catch (error) {
            console.error('获取聊天数据失败:', error);
            return [];
        }
    }

    // 获取聊天气泡数据
    getBubbleData(db) {
        try {
            const rows = db.prepare("SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
            const bubbles = [];
            
            for (const row of rows) {
                try {
                    const key = row.key;
                    const value = JSON.parse(row.value);
                    
                    if (value.text) {
                        const parts = key.split(':');
                        const composerId = parts[1];
                        const role = value.type === 1 ? 'user' : 'assistant';
                        
                        bubbles.push({
                            composerId: composerId,
                            role: role,
                            text: value.text
                        });
                    }
                } catch (error) {
                    // 忽略解析错误
                }
            }
            
            return bubbles;
        } catch (error) {
            return [];
        }
    }

    // 获取公共前缀
    getCommonPrefix(paths) {
        if (paths.length === 0) return '';
        if (paths.length === 1) return paths[0];
        
        const sorted = [...paths].sort();
        const first = sorted[0];
        const last = sorted[sorted.length - 1];
        
        let i = 0;
        while (i < first.length && i < last.length && first[i] === last[i]) {
            i++;
        }
        
        return first.substring(0, i);
    }

    // 从路径提取项目名称
    extractProjectNameFromPath(path) {
        if (!path || path === '/') return 'Root';
        
        const parts = path.split('/').filter(p => p);
        if (parts.length === 0) return 'Root';
        
        // 跳过用户目录
        const username = os.userInfo().username;
        const userIndex = parts.findIndex(p => p === username);
        
        if (userIndex >= 0 && userIndex + 1 < parts.length) {
            const relevantParts = parts.slice(userIndex + 1);
            return this.getProjectNameFromRelevantParts(relevantParts, path);
        }
        
        return this.getProjectNameFromRelevantParts(parts, path);
    }
    
    // 从相关路径部分提取项目名称
    getProjectNameFromRelevantParts(parts, fullPath) {
        if (parts.length === 0) return 'Root';
        
        // 已知的项目名称模式
        const knownProjectNames = [
            'app', 'src', 'main', 'index', 'home', 'admin', 'api', 'web', 'site', 'blog', 'shop'
        ];
        
        // 避免通用目录名
        const genericNames = [
            'Documents', 'Downloads', 'Desktop', 'Pictures', 'Music', 'Videos', 'codebase', 'projects', 'work', 'dev'
        ];
        
        // 从后往前查找合适的名称
        for (let i = parts.length - 1; i >= 0; i--) {
            const part = parts[i];
            
            // 跳过通用目录名
            if (genericNames.includes(part)) continue;
            
            // 跳过已知的项目名称
            if (knownProjectNames.includes(part) && i < parts.length - 1) continue;
            
            // 检查是否是有效的项目名称
            if (this.isValidProjectName(part)) {
                return part;
            }
        }
        
        // 尝试从Git仓库获取名称
        const gitName = this.getProjectNameFromGit(fullPath);
        if (gitName) return gitName;
        
        // 最后使用最后一个部分
        return parts[parts.length - 1];
    }
    
    // 检查是否是有效的项目名称
    isValidProjectName(name) {
        if (!name || name.length < 2) return false;
        
        // 排除常见的非项目名称
        const invalidNames = [
            'tmp', 'temp', 'test', 'tests', 'build', 'dist', 'out', 'bin', 'lib', 'node_modules',
            'vendor', 'target', 'public', 'static', 'assets', 'resources', 'config', 'conf'
        ];
        
        return !invalidNames.includes(name.toLowerCase());
    }
    
    // 从Git仓库获取项目名称
    getProjectNameFromGit(path) {
        try {
            // 查找.git目录
            let currentPath = path;
            while (currentPath && currentPath !== '/') {
                const gitPath = path.join(currentPath, '.git');
                if (fs.existsSync(gitPath)) {
                    // 尝试从git配置获取项目名称
                    const configPath = path.join(gitPath, 'config');
                    if (fs.existsSync(configPath)) {
                        const configContent = fs.readFileSync(configPath, 'utf8');
                        const urlMatch = configContent.match(/url\s*=\s*[^\s]+\/([^\/\n]+?)(?:\.git)?\s*$/m);
                        if (urlMatch) {
                            return urlMatch[1];
                        }
                    }
                    
                    // 从路径提取项目名称
                    const pathParts = currentPath.split('/').filter(p => p);
                    if (pathParts.length > 0) {
                        return pathParts[pathParts.length - 1];
                    }
                }
                
                // 向上级目录查找
                currentPath = path.dirname(currentPath);
            }
        } catch (error) {
            // 忽略错误
        }
        
        return null;
    }

    // 添加历史记录（兼容API，但不实际保存）
    async addHistoryItem(content, type = 'chat', metadata = {}) {
        // Cursor历史管理器是只读的，所以这个方法只是返回一个模拟结果
        console.log(`⚠️ 尝试添加历史记录，但Cursor历史管理器是只读的`);
        return {
            id: `mock_${Date.now()}`,
            timestamp: Date.now(),
            type: type,
            content: content,
            metadata: metadata,
            summary: this.generateSummary(content)
        };
    }

    // 删除历史记录（兼容API，但不实际删除）
    async deleteHistoryItem(id) {
        console.log(`⚠️ 尝试删除历史记录 ${id}，但Cursor历史管理器是只读的`);
        return false; // 总是返回失败，因为是只读的
    }

    // 清除历史记录（兼容API，但不实际清除）
    async clearHistory(options = {}) {
        console.log(`⚠️ 尝试清除历史记录，但Cursor历史管理器是只读的`);
        // 不执行任何操作
    }

    // 生成摘要
    generateSummary(content) {
        if (!content || content.length <= 100) {
            return content || '';
        }
        
        // 移除HTML标签
        const plainText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        
        // 截取前100个字符
        let summary = plainText.substring(0, 100);
        
        // 确保在单词边界处截断
        const lastSpace = summary.lastIndexOf(' ');
        if (lastSpace > 80) {
            summary = summary.substring(0, lastSpace);
        }
        
        return summary + '...';
    }

    // 获取演示聊天数据
    getDemoChats() {
        return [
            {
                project: { name: 'Demo Project', rootPath: '/path/to/demo' },
                messages: [
                    { role: 'user', content: 'Can you help me with this React component?' },
                    { role: 'assistant', content: 'Of course! What specific issues are you having with the component?' }
                ],
                date: new Date(Date.now() - 86400000).toISOString(),
                sessionId: 'demo1',
                workspaceId: 'demo'
            },
            {
                project: { name: 'Sample API', rootPath: '/path/to/api' },
                messages: [
                    { role: 'user', content: 'How do I properly structure my Flask API?' },
                    { role: 'assistant', content: 'For Flask APIs, I recommend organizing your code with a blueprint structure. Here\'s an example...' }
                ],
                date: new Date(Date.now() - 172800000).toISOString(),
                sessionId: 'demo2',
                workspaceId: 'demo'
            }
        ];
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
        
        // Ensure data source information is included
        if (chat && !chat.isRealData) {
            chat.isRealData = false;
            chat.dataSource = 'demo';
        }
        
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

    // 搜索聊天记录
    async searchHistory(query, options = {}) {
        const chats = await this.getChats();
        const lowercaseQuery = query.toLowerCase();
        
        const filteredChats = chats.filter(chat => {
            // 搜索项目名称
            if (chat.project?.name?.toLowerCase().includes(lowercaseQuery)) {
                return true;
            }
            
            // 搜索消息内容
            return chat.messages?.some(msg => 
                msg.content?.toLowerCase().includes(lowercaseQuery)
            );
        });
        
        return {
            items: filteredChats,
            total: filteredChats.length,
            offset: 0,
            limit: filteredChats.length,
            hasMore: false
        };
    }

    // 导出聊天记录
    async exportHistory(options = {}) {
        const { format = 'json' } = options;
        const chats = await this.getChats();
        
        if (format === 'json') {
            return JSON.stringify(chats, null, 2);
        } else if (format === 'csv') {
            return this.exportToCSV(chats);
        } else if (format === 'html') {
            return this.exportToHTML(chats);
        }
        
        return JSON.stringify(chats, null, 2);
    }

    // 导出为CSV
    exportToCSV(chats) {
        const headers = ['Session ID', 'Project', 'Title', 'Date', 'Message Count', 'Database Path'];
        const rows = chats.map(chat => [
            chat.session?.composerId || '',
            `"${chat.project?.name || ''}"`,
            `"${chat.session?.title || ''}"`,
            new Date(chat.session?.lastUpdatedAt || Date.now()).toISOString(),
            chat.messages?.length || 0,
            `"${chat.db_path || ''}"`
        ]);
        
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    // 导出为HTML
    exportToHTML(chats) {
        const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cursor聊天记录导出</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #eee; }
        .chat-item { margin-bottom: 30px; padding: 20px; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; }
        .chat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
        .chat-title { font-size: 18px; font-weight: bold; color: #333; }
        .chat-meta { font-size: 12px; color: #666; }
        .messages { margin-top: 15px; }
        .message { margin-bottom: 15px; padding: 10px; border-radius: 6px; }
        .message.user { background: #e3f2fd; border-left: 4px solid #2196f3; }
        .message.assistant { background: #f3e5f5; border-left: 4px solid #9c27b0; }
        .message-role { font-weight: bold; margin-bottom: 5px; }
        .message-content { white-space: pre-wrap; line-height: 1.5; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Cursor聊天记录导出</h1>
            <p>导出时间: ${new Date().toLocaleString()}</p>
            <p>总记录数: ${chats.length}</p>
        </div>
        
        ${chats.map(chat => `
            <div class="chat-item">
                <div class="chat-header">
                    <div>
                        <div class="chat-title">${chat.project?.name || 'Unknown Project'} - ${chat.session?.title || 'Untitled'}</div>
                        <div class="chat-meta">
                            会话ID: ${chat.session?.composerId || 'N/A'} | 
                            工作区: ${chat.workspace_id || 'N/A'} | 
                            数据库: ${chat.db_path || 'N/A'}
                        </div>
                    </div>
                    <div class="chat-meta">
                        ${chat.session?.lastUpdatedAt ? new Date(chat.session.lastUpdatedAt).toLocaleString() : 'N/A'}
                    </div>
                </div>
                <div class="messages">
                    ${chat.messages?.map(msg => `
                        <div class="message ${msg.role}">
                            <div class="message-role">${msg.role === 'user' ? '用户' : '助手'}</div>
                            <div class="message-content">${this.escapeHtml(msg.content || '')}</div>
                        </div>
                    `).join('') || '<p>无消息内容</p>'}
                </div>
            </div>
        `).join('')}
    </div>
</body>
</html>`;
        
        return html;
    }

    // HTML转义
    escapeHtml(text) {
        if (!text) return '';
        
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        
        return text.replace(/[&<>"']/g, (m) => map[m]);
    }
}

module.exports = CursorHistoryManager;