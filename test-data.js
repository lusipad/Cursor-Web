// 独立的数据提取测试脚本
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

class CursorDataTester {
    constructor() {
        this.cursorStoragePath = path.join(os.homedir(), 'AppData/Roaming/Cursor');
        console.log(`📁 Cursor存储路径: ${this.cursorStoragePath}`);
    }

    // 测试全局数据库访问
    async testGlobalDatabase() {
        console.log('\n🔍 === 测试全局数据库访问 ===');
        
        const globalDbPath = path.join(this.cursorStoragePath, 'User/globalStorage/state.vscdb');
        console.log(`📂 全局数据库路径: ${globalDbPath}`);
        
        // 检查文件是否存在
        if (!fs.existsSync(globalDbPath)) {
            console.log('❌ 全局数据库文件不存在');
            return null;
        }
        
        console.log('✅ 全局数据库文件存在');
        
        try {
            // 尝试不同的连接方式
            console.log('🔧 尝试连接方式1: 普通连接');
            const db = new Database(globalDbPath, { readonly: true });
            
            // 检查表结构
            console.log('📋 检查表结构...');
            const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
            console.log(`📊 找到表: ${tables.map(t => t.name).join(', ')}`);
            
            let bubbleCount = 0;
            
            // 测试cursorDiskKV表
            if (tables.some(t => t.name === 'cursorDiskKV')) {
                console.log('\n📝 测试cursorDiskKV表...');
                const count = db.prepare("SELECT COUNT(*) as count FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").get();
                bubbleCount = count.count;
                console.log(`💬 找到 ${bubbleCount} 个聊天气泡`);
                
                if (bubbleCount > 0) {
                    // 获取前5个示例
                    console.log('🔍 获取前5个聊天气泡示例:');
                    const samples = db.prepare("SELECT rowid, key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' LIMIT 5").all();
                    
                    for (const sample of samples) {
                        try {
                            const bubble = JSON.parse(sample.value);
                            const text = (bubble.text || '').substring(0, 50);
                            console.log(`  ${sample.rowid}: ${bubble.type === 1 ? '👤' : '🤖'} ${text}...`);
                        } catch (e) {
                            console.log(`  ${sample.rowid}: 解析失败`);
                        }
                    }
                }
            }
            
            // 测试ItemTable表
            if (tables.some(t => t.name === 'ItemTable')) {
                console.log('\n📝 测试ItemTable表...');
                const keys = db.prepare("SELECT key FROM ItemTable WHERE key LIKE '%chat%' OR key LIKE '%composer%' LIMIT 10").all();
                console.log(`🔑 相关键: ${keys.map(k => k.key).join(', ')}`);
            }
            
            db.close();
            console.log('✅ 数据库测试完成');
            return bubbleCount;
            
        } catch (error) {
            console.error('❌ 数据库连接失败:', error.message);
            return null;
        }
    }

    // 提取聊天消息
    async extractChatMessages() {
        console.log('\n💬 === 提取聊天消息 ===');
        
        const globalDbPath = path.join(this.cursorStoragePath, 'User/globalStorage/state.vscdb');
        
        try {
            const db = new Database(globalDbPath, { readonly: true });
            
            // 提取所有聊天气泡
            const rows = db.prepare("SELECT rowid, key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%'").all();
            console.log(`📊 总共找到 ${rows.length} 个聊天气泡`);
            
            const messages = [];
            let validCount = 0;
            
            for (const row of rows) {
                try {
                    const bubble = JSON.parse(row.value);
                    const text = (bubble.text || bubble.richText || '').trim();
                    if (text) {
                        const role = bubble.type === 1 ? 'user' : 'assistant';
                        messages.push({
                            rowid: row.rowid,
                            role: role,
                            content: text
                        });
                        validCount++;
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
            
            console.log(`✅ 成功解析 ${validCount} 条有效消息`);
            
            // 按rowid排序
            messages.sort((a, b) => a.rowid - b.rowid);
            
            // 分组为对话会话（简单逻辑）
            const sessions = this.groupIntoSessions(messages);
            console.log(`📚 分组为 ${sessions.length} 个对话会话`);
            
            db.close();
            return sessions;
            
        } catch (error) {
            console.error('❌ 提取消息失败:', error.message);
            return [];
        }
    }

    // 将消息分组为会话
    groupIntoSessions(messages) {
        if (messages.length === 0) return [];
        
        const sessions = [];
        const sessionSize = 30; // 每30条消息作为一个会话
        
        for (let i = 0; i < messages.length; i += sessionSize) {
            const sessionMessages = messages.slice(i, i + sessionSize);
            if (sessionMessages.length > 0) {
                sessions.push({
                    sessionId: `session-${sessions.length + 1}`,
                    messages: sessionMessages,
                    messageCount: sessionMessages.length,
                    firstMessage: sessionMessages[0].content.substring(0, 50) + '...'
                });
            }
        }
        
        return sessions;
    }

    // 从workspace数据库提取项目信息
    extractProjectInfo(workspaceDb) {
        try {
            const Database = require('better-sqlite3');
            const db = new Database(workspaceDb, { readonly: true });
            
            // 查询 history.entries 获取文件路径
            const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get("history.entries");
            
            if (row && row.value) {
                const historyData = JSON.parse(row.value);
                
                // 收集所有文件路径
                const filePaths = [];
                
                // history.entries 是一个数组，不是对象
                if (Array.isArray(historyData)) {
                    historyData.forEach(entry => {
                        if (entry.editor && entry.editor.resource) {
                            // 处理 file:// 格式的路径
                            let cleanPath = entry.editor.resource;
                            if (cleanPath.startsWith('file:///')) {
                                cleanPath = cleanPath.replace('file:///', '');
                                cleanPath = decodeURIComponent(cleanPath);
                                cleanPath = cleanPath.replace(/%3A/g, ':');
                                // 转换为Windows路径格式
                                if (cleanPath.includes('/')) {
                                    cleanPath = cleanPath.replace(/\//g, '\\');
                                }
                            }
                            filePaths.push(cleanPath);
                        }
                    });
                }
                
                if (filePaths.length > 0) {
                    // 找到共同的根路径
                    const commonPath = this.findCommonPath(filePaths);
                    const projectName = this.extractProjectNameFromPath(commonPath);
                    
                    db.close();
                    return {
                        name: projectName,
                        rootPath: commonPath,
                        fileCount: filePaths.length
                    };
                }
            }
            
            db.close();
            return { name: 'Unknown Project', rootPath: '/', fileCount: 0 };
            
        } catch (error) {
            console.error('提取项目信息失败:', error.message);
            return { name: 'Unknown Project', rootPath: '/', fileCount: 0 };
        }
    }

    // 找到文件路径的共同前缀
    findCommonPath(paths) {
        if (paths.length === 0) return '/';
        if (paths.length === 1) {
            // 如果只有一个路径，返回其目录
            const path = require('path');
            return path.dirname(paths[0]);
        }

        // 找到所有路径的共同前缀
        let commonPath = paths[0];
        for (let i = 1; i < paths.length; i++) {
            commonPath = this.getCommonPrefix(commonPath, paths[i]);
        }
        
        // 确保返回的是目录路径
        const path = require('path');
        const fs = require('fs');
        try {
            if (fs.existsSync(commonPath) && fs.statSync(commonPath).isFile()) {
                return path.dirname(commonPath);
            }
        } catch (e) {
            // 如果路径不存在，返回目录部分
            return path.dirname(commonPath);
        }
        
        return commonPath;
    }

    // 获取两个路径的共同前缀
    getCommonPrefix(path1, path2) {
        const path = require('path');
        const parts1 = path1.split(/[\/\\]/);
        const parts2 = path2.split(/[\/\\]/);
        
        const commonParts = [];
        const minLength = Math.min(parts1.length, parts2.length);
        
        for (let i = 0; i < minLength; i++) {
            if (parts1[i] === parts2[i]) {
                commonParts.push(parts1[i]);
            } else {
                break;
            }
        }
        
        return commonParts.join(path.sep);
    }

    // 从路径提取项目名称
    extractProjectNameFromPath(projectPath) {
        const path = require('path');
        const os = require('os');
        
        if (!projectPath || projectPath === '/') {
            return 'Unknown Project';
        }
        
        // 获取最后一个目录名作为项目名
        let projectName = path.basename(projectPath);
        
        // 如果是用户目录或常见的无意义目录名，尝试使用上级目录
        const meaninglessDirs = ['src', 'source', 'code', 'projects', 'workspace', 'Documents', 'Desktop'];
        const userHome = os.homedir();
        
        if (projectPath === userHome || meaninglessDirs.includes(projectName)) {
            const parentPath = path.dirname(projectPath);
            if (parentPath !== projectPath) {
                projectName = path.basename(parentPath);
            }
        }
        
        // 如果仍然是无意义的名称，尝试从路径中找到更好的名称
        if (meaninglessDirs.includes(projectName) || projectName === os.userInfo().username) {
            const pathParts = projectPath.split(path.sep);
            for (let i = pathParts.length - 1; i >= 0; i--) {
                const part = pathParts[i];
                if (part && !meaninglessDirs.includes(part) && part !== os.userInfo().username) {
                    projectName = part;
                    break;
                }
            }
        }
        
        return projectName || 'Unknown Project';
    }

    // 获取所有workspace数据库的项目信息
    async extractWorkspaceProjects() {
        console.log('\n📁 === 提取Workspace项目信息 ===');
        
        const workspaceStorage = path.join(this.cursorStoragePath, 'User/workspaceStorage');
        const projects = new Map();
        
        if (!fs.existsSync(workspaceStorage)) {
            console.log('❌ 工作区存储目录不存在');
            return projects;
        }
        
        try {
            const workspaceDirs = fs.readdirSync(workspaceStorage);
            console.log(`📂 找到 ${workspaceDirs.length} 个工作区目录`);
            
            for (const workspaceId of workspaceDirs) {
                const workspaceDb = path.join(workspaceStorage, workspaceId, 'state.vscdb');
                
                if (fs.existsSync(workspaceDb)) {
                    const projectInfo = this.extractProjectInfo(workspaceDb);
                    projects.set(workspaceId, projectInfo);
                    console.log(`📁 ${workspaceId}: ${projectInfo.name} (${projectInfo.rootPath})`);
                }
            }
            
            console.log(`✅ 提取了 ${projects.size} 个项目信息`);
            return projects;
            
        } catch (error) {
            console.error('❌ 提取workspace项目失败:', error.message);
            return projects;
        }
    }

    // 生成真实的项目路径样本
    generateRealisticProjectPaths() {
        const basePaths = [
            'C:\\Users\\lus\\Desktop\\Projects',
            'C:\\Users\\lus\\Documents\\Code',
            'C:\\dev\\workspace',
            'D:\\Projects',
            'C:\\workspace',
            'C:\\code',
            'D:\\Repos'
        ];
        
        const projectNames = [
            'web-dashboard', 'admin-panel', 'user-management', 'api-server', 'mobile-app',
            'e-commerce', 'blog-system', 'cms-platform', 'chat-app', 'file-manager',
            'todo-app', 'weather-app', 'calculator', 'text-editor', 'image-gallery',
            'game-engine', 'music-player', 'video-editor', 'pdf-viewer', 'markdown-editor',
            'data-visualization', 'ml-model', 'ai-assistant', 'blockchain-wallet', 'crypto-exchange',
            'social-media', 'forum-system', 'booking-system', 'inventory-management', 'pos-system',
            'hr-system', 'school-management', 'hospital-system', 'library-system', 'banking-app',
            'real-estate', 'food-delivery', 'taxi-booking', 'gym-management', 'event-planner'
        ];
        
        return { basePaths, projectNames };
    }

    // 从聊天内容推断项目信息
    inferProjectFromMessages(messages, sessionIndex) {
        const allText = messages.map(msg => msg.content).join(' ').toLowerCase();
        const { basePaths, projectNames } = this.generateRealisticProjectPaths();
        
        // 常见的项目类型关键词
        const projectPatterns = [
            { keywords: ['react', 'jsx', 'tsx', 'next.js', 'nextjs'], name: 'React 项目', type: 'frontend' },
            { keywords: ['vue', 'vuejs', 'nuxt'], name: 'Vue 项目', type: 'frontend' },
            { keywords: ['angular', 'typescript'], name: 'Angular 项目', type: 'frontend' },
            { keywords: ['python', 'django', 'flask', 'fastapi'], name: 'Python 项目', type: 'backend' },
            { keywords: ['java', 'spring', 'springboot'], name: 'Java 项目', type: 'backend' },
            { keywords: ['node.js', 'nodejs', 'express', 'koa'], name: 'Node.js 项目', type: 'backend' },
            { keywords: ['golang', 'go语言', 'gin'], name: 'Go 项目', type: 'backend' },
            { keywords: ['rust', 'cargo'], name: 'Rust 项目', type: 'backend' },
            { keywords: ['html', 'css', 'javascript', 'js'], name: 'Web 项目', type: 'frontend' },
            { keywords: ['数据库', 'mysql', 'postgresql', 'mongodb'], name: '数据库项目', type: 'database' },
            { keywords: ['机器学习', 'ml', 'tensorflow', 'pytorch'], name: 'AI/ML 项目', type: 'ai' },
            { keywords: ['微信小程序', 'miniprogram', '小程序'], name: '小程序项目', type: 'mobile' },
            { keywords: ['移动应用', 'android', 'ios', 'flutter'], name: '移动应用', type: 'mobile' },
            { keywords: ['游戏', 'unity', 'unreal'], name: '游戏项目', type: 'game' },
            { keywords: ['区块链', 'blockchain', 'solidity'], name: '区块链项目', type: 'blockchain' },
            { keywords: ['web3', 'defi', 'nft'], name: 'Web3 项目', type: 'blockchain' }
        ];
        
        // 寻找最匹配的项目类型
        let bestMatch = { name: 'AI聊天项目', type: 'general' };
        let maxScore = 0;
        
        for (const pattern of projectPatterns) {
            let score = 0;
            for (const keyword of pattern.keywords) {
                if (allText.includes(keyword)) {
                    score += 1;
                }
            }
            if (score > maxScore) {
                maxScore = score;
                bestMatch = {
                    name: pattern.name,
                    type: pattern.type
                };
            }
        }
        
        // 尝试从内容中提取具体的项目名称
        const projectNamePatterns = [
            /项目[：:]\s*([^\s，,。.]+)/g,
            /在([^\s，,。.]{2,10})(项目|系统|应用)/g,
            /开发([^\s，,。.]{2,10})(网站|平台|系统)/g,
            /([^\s，,。.]{2,10})(管理系统|后台|前端)/g
        ];
        
        let extractedName = null;
        for (const pattern of projectNamePatterns) {
            const matches = allText.matchAll(pattern);
            for (const match of matches) {
                if (match[1] && match[1].length > 1 && match[1].length < 15) {
                    extractedName = match[1];
                    break;
                }
            }
            if (extractedName) break;
        }
        
        // 生成真实的项目路径
        const basePathIndex = sessionIndex % basePaths.length;
        const basePath = basePaths[basePathIndex];
        
        let projectName;
        if (extractedName) {
            projectName = extractedName.replace(/\s+/g, '-');
        } else {
            // 根据session索引选择不同的项目名称，确保多样性
            const nameIndex = sessionIndex % projectNames.length;
            projectName = projectNames[nameIndex];
        }
        
        const fullPath = `${basePath}\\${projectName}`;
        
        return {
            name: extractedName || bestMatch.name,
            rootPath: fullPath,
            fileCount: Math.floor(Math.random() * 50) + 10 // 模拟文件数量
        };
    }

    // 生成测试数据用于API（包含从内容推断的项目信息）
    async generateTestData() {
        console.log('\n🎯 === 生成测试数据 ===');
        
        // 提取全局聊天数据
        const sessions = await this.extractChatMessages();
        
        if (sessions.length === 0) {
            console.log('❌ 没有找到聊天会话');
            return [];
        }
        
        // 获取真实的workspace项目信息
        const workspaceProjects = await this.extractWorkspaceProjects();
        const projectsArray = Array.from(workspaceProjects.values());
        
        const apiData = sessions.map((session, index) => {
            // 优先使用真实的项目信息，如果没有则使用推断的项目信息
            let projectInfo;
            if (projectsArray.length > 0) {
                // 循环使用真实的项目信息
                const projectIndex = index % projectsArray.length;
                projectInfo = projectsArray[projectIndex];
            } else {
                // 如果没有真实项目信息，则使用推断的
                projectInfo = this.inferProjectFromMessages(session.messages, index);
            }
            
            return {
                sessionId: session.sessionId,
                project: projectInfo,
                messages: session.messages.map(msg => ({
                    role: msg.role,
                    content: msg.content
                })),
                date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(), // 随机30天内的日期
                workspaceId: 'global',
                dbPath: 'global'
            };
        });
        
        // 统计项目分布
        const projectStats = {};
        const pathStats = {};
        apiData.forEach(chat => {
            const projectName = chat.project.name;
            const basePath = chat.project.rootPath.split('\\').slice(0, -1).join('\\');
            
            projectStats[projectName] = (projectStats[projectName] || 0) + 1;
            pathStats[basePath] = (pathStats[basePath] || 0) + 1;
        });
        
        console.log(`✅ 生成了 ${apiData.length} 个API格式的聊天会话`);
        console.log('📊 项目分布:', projectStats);
        console.log('📁 路径分布:', pathStats);
        
        // 显示一些示例路径
        console.log('🔍 示例项目路径:');
        apiData.slice(0, 5).forEach((chat, index) => {
            console.log(`  ${index + 1}. ${chat.project.name}: ${chat.project.rootPath}`);
        });
        
        return apiData;
    }
}

// 运行测试
async function runTest() {
    console.log('🧪 Cursor聊天数据提取测试开始\n');
    
    const tester = new CursorDataTester();
    
    // 测试数据库访问
    const bubbleCount = await tester.testGlobalDatabase();
    
    if (bubbleCount && bubbleCount > 0) {
        // 提取消息
        const testData = await tester.generateTestData();
        
        if (testData.length > 0) {
            console.log('\n🎉 测试成功！找到真实聊天数据');
            console.log(`📊 统计: ${testData.length} 个会话，总共 ${testData.reduce((sum, s) => sum + s.messages.length, 0)} 条消息`);
            
            // 保存测试数据
            const fs = require('fs');
            fs.writeFileSync('test-chat-data.json', JSON.stringify(testData, null, 2));
            console.log('💾 测试数据已保存到 test-chat-data.json');
            
            return testData;
        }
    }
    
    console.log('\n❌ 测试失败：未能提取到有效数据');
    return [];
}

// 如果直接运行此脚本
if (require.main === module) {
    runTest().catch(console.error);
}

module.exports = { CursorDataTester, runTest };