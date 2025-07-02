// server.js
// 完整的 Cursor Remote Control 服务器实现

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const http = require('http');

// 配置
const HTTP_PORT = 3456;
const WS_PORT = 3457;

// Express 应用
const app = express();

// 更宽松的 CORS 配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());

// WebSocket 服务器
const wss = new WebSocket.Server({ port: WS_PORT });

// 存储连接的客户端
let cursorClient = null;
const pendingRequests = new Map();

// 工作空间路径
let workspacePath = process.cwd();

// WebSocket 连接处理
wss.on('connection', (ws) => {
    console.log('Cursor 客户端已连接');
    cursorClient = ws;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('收到 Cursor 消息：', data.type);
            
            // 处理响应
            if (data.requestId && pendingRequests.has(data.requestId)) {
                const { resolve } = pendingRequests.get(data.requestId);
                pendingRequests.delete(data.requestId);
                resolve(data);
            }
        } catch (error) {
            console.error('处理 WebSocket 消息错误：', error);
        }
    });
    
    ws.on('close', () => {
        console.log('Cursor 客户端断开连接');
        if (cursorClient === ws) {
            cursorClient = null;
        }
    });
    
    // 定期发送 ping 保持连接
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
        } else {
            clearInterval(pingInterval);
        }
    }, 30000);
});

// 向 Cursor 发送消息并等待响应
function sendToCursor(message) {
    return new Promise((resolve, reject) => {
        if (!cursorClient || cursorClient.readyState !== WebSocket.OPEN) {
            reject(new Error('Cursor 未连接'));
            return;
        }
        
        const requestId = Math.random().toString(36).substring(7);
        message.requestId = requestId;
        
        // 设置超时
        const timeout = setTimeout(() => {
            pendingRequests.delete(requestId);
            reject(new Error('请求超时'));
        }, 30000);
        
        pendingRequests.set(requestId, {
            resolve: (data) => {
                clearTimeout(timeout);
                resolve(data);
            }
        });
        
        cursorClient.send(JSON.stringify(message));
    });
}

// API 路由

// 健康检查
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        httpPort: HTTP_PORT,
        wsPort: WS_PORT,
        cursorConnected: cursorClient && cursorClient.readyState === WebSocket.OPEN,
        workspace: workspacePath
    });
});

// 设置工作空间
app.post('/api/workspace', (req, res) => {
    const { path } = req.body;
    if (!path) {
        return res.status(400).json({ error: '需要提供工作空间路径' });
    }
    
    if (!fs.existsSync(path)) {
        return res.status(400).json({ error: '路径不存在' });
    }
    
    workspacePath = path;
    res.json({ success: true, workspace: workspacePath });
});

// Git 分支列表
app.get('/api/git/branches', (req, res) => {
    exec('git branch -a', { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: `Git 错误：${error.message}` });
        }
        
        const branches = stdout.split('\n')
            .filter(branch => branch.trim())
            .map(branch => {
                const name = branch.trim().replace(/^\* /, '');
                const isCurrent = branch.startsWith('*');
                const isRemote = name.startsWith('remotes/');
                return { name, isCurrent, isRemote };
            });
        
        res.json({ success: true, branches });
    });
});

// 切换分支
app.post('/api/git/checkout', (req, res) => {
    const { branch } = req.body;
    if (!branch) {
        return res.status(400).json({ error: '需要提供分支名称' });
    }
    
    // 先保存当前更改
    exec('git stash', { cwd: workspacePath }, (stashError) => {
        // 切换分支
        exec(`git checkout ${branch}`, { cwd: workspacePath }, (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ 
                    error: `切换分支失败：${error.message}`,
                    details: stderr
                });
            }
            
            res.json({
                success: true,
                message: `成功切换到分支：${branch}`,
                output: stdout,
                stashed: !stashError
            });
        });
    });
});

// Git 状态
app.get('/api/git/status', (req, res) => {
    exec('git status --porcelain', { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        const files = stdout.split('\n')
            .filter(line => line.trim())
            .map(line => {
                const status = line.substring(0, 2);
                const file = line.substring(3);
                return { status, file };
            });
        
        res.json({ success: true, files });
    });
});

// AI 对话
app.post('/api/ai/chat', async (req, res) => {
    const { message, context } = req.body;
    if (!message) {
        return res.status(400).json({ error: '需要提供消息内容' });
    }
    
    try {
        const response = await sendToCursor({
            type: 'ai_chat',
            data: { message, context }
        });
        
        if (response.success) {
            res.json({
                success: true,
                response: response.data,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({ error: response.error || 'AI 对话失败' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 获取当前文件内容
app.get('/api/file/current', async (req, res) => {
    try {
        const response = await sendToCursor({
            type: 'get_file_content'
        });
        
        res.json({
            success: true,
            file: response.data
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 执行 Cursor 命令
app.post('/api/command', async (req, res) => {
    const { commandId } = req.body;
    if (!commandId) {
        return res.status(400).json({ error: '需要提供命令 ID' });
    }
    
    try {
        const response = await sendToCursor({
            type: 'execute_command',
            data: { commandId }
        });
        
        if (response.success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: response.error || '命令执行失败' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 提供注入脚本
app.get('/inject.js', (req, res) => {
    const scriptPath = path.join(__dirname, 'cursor-injection.js');
    
    // 检查文件是否存在
    if (!fs.existsSync(scriptPath)) {
        console.error('cursor-injection.js 文件不存在！');
        return res.status(404).send('// 错误：找不到注入脚本文件\n// 请确保 cursor-injection.js 在服务器目录中');
    }
    
    try {
        const injectionScript = fs.readFileSync(scriptPath, 'utf8');
        
        // 设置正确的响应头
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        res.send(injectionScript);
    } catch (error) {
        console.error('读取注入脚本失败：', error);
        res.status(500).send(`// 错误：${error.message}`);
    }
});

// 提供安全注入方法
app.get('/safe-inject', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(`
// === 安全注入方法 ===
// 复制以下代码到 Cursor 控制台：

(async function() {
    try {
        const response = await fetch('http://localhost:3456/inject.js');
        const script = await response.text();
        new Function(script)();
        console.log('✅ Cursor Remote Control 注入成功！');
    } catch (e) {
        console.error('❌ 注入失败:', e);
        console.log('请手动访问 http://localhost:3456/inject.js 并复制代码');
    }
})();
    `);
});

// 静态文件服务
app.use(express.static('public'));

// Web 控制界面
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cursor Remote Control</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #1e1e1e;
            color: #d4d4d4;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
        }
        
        header {
            background-color: #2d2d30;
            padding: 20px 0;
            margin-bottom: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }
        
        h1 {
            text-align: center;
            color: #007acc;
            font-size: 2em;
        }
        
        .status-bar {
            background-color: #252526;
            padding: 10px 20px;
            border-radius: 5px;
            margin-bottom: 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .status-indicator {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 10px;
        }
        
        .status-connected {
            background-color: #4ec9b0;
        }
        
        .status-disconnected {
            background-color: #f14c4c;
        }
        
        .section {
            background-color: #252526;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        
        h2 {
            color: #4ec9b0;
            margin-bottom: 15px;
            font-size: 1.3em;
        }
        
        .input-group {
            margin-bottom: 15px;
        }
        
        label {
            display: block;
            margin-bottom: 5px;
            color: #cccccc;
            font-size: 0.9em;
        }
        
        input, textarea, select {
            width: 100%;
            padding: 10px;
            background-color: #3c3c3c;
            border: 1px solid #474747;
            border-radius: 4px;
            color: #d4d4d4;
            font-size: 14px;
        }
        
        input:focus, textarea:focus, select:focus {
            outline: none;
            border-color: #007acc;
        }
        
        button {
            background-color: #007acc;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.3s;
        }
        
        button:hover:not(:disabled) {
            background-color: #005a9e;
        }
        
        button:disabled {
            background-color: #474747;
            cursor: not-allowed;
        }
        
        .button-group {
            display: flex;
            gap: 10px;
            margin-top: 10px;
        }
        
        .response-box {
            background-color: #1e1e1e;
            border: 1px solid #474747;
            border-radius: 4px;
            padding: 15px;
            margin-top: 15px;
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 13px;
            white-space: pre-wrap;
            max-height: 300px;
            overflow-y: auto;
        }
        
        .branch-list {
            list-style: none;
            margin-top: 10px;
        }
        
        .branch-item {
            padding: 8px 12px;
            background-color: #3c3c3c;
            margin-bottom: 5px;
            border-radius: 4px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .branch-current {
            background-color: #2d5a2d;
        }
        
        .branch-remote {
            color: #9cdcfe;
        }
        
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #007acc;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-left: 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .tab-container {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }
        
        .tab {
            padding: 10px 20px;
            background-color: #3c3c3c;
            border-radius: 4px 4px 0 0;
            cursor: pointer;
            transition: background-color 0.3s;
        }
        
        .tab:hover {
            background-color: #474747;
        }
        
        .tab.active {
            background-color: #252526;
        }
        
        .tab-content {
            display: none;
        }
        
        .tab-content.active {
            display: block;
        }
    </style>
</head>
<body>
    <header>
        <div class="container">
            <h1>🚀 Cursor Remote Control</h1>
        </div>
    </header>
    
    <div class="container">
        <div class="status-bar">
            <div>
                <span class="status-indicator" id="statusIndicator"></span>
                <span id="statusText">检查连接状态...</span>
            </div>
            <div>
                <span>工作空间：</span>
                <span id="currentWorkspace">未设置</span>
            </div>
        </div>
        
        <div class="tab-container">
            <div class="tab active" onclick="switchTab('workspace')">工作空间</div>
            <div class="tab" onclick="switchTab('git')">Git 管理</div>
            <div class="tab" onclick="switchTab('ai')">AI 助手</div>
            <div class="tab" onclick="switchTab('api')">API 文档</div>
        </div>
        
        <!-- 工作空间标签 -->
        <div id="workspace-tab" class="tab-content active">
            <div class="section">
                <h2>工作空间设置</h2>
                <div class="input-group">
                    <label for="workspacePath">工作空间路径</label>
                    <input type="text" id="workspacePath" placeholder="例如：/Users/username/projects/my-project">
                </div>
                <button onclick="setWorkspace()">设置工作空间</button>
                <div id="workspaceResponse" class="response-box" style="display: none;"></div>
            </div>
        </div>
        
        <!-- Git 管理标签 -->
        <div id="git-tab" class="tab-content">
            <div class="section">
                <h2>Git 分支管理</h2>
                <div class="button-group">
                    <button onclick="getBranches()">刷新分支列表</button>
                    <button onclick="getGitStatus()">查看状态</button>
                </div>
                <ul id="branchList" class="branch-list"></ul>
                
                <div class="input-group" style="margin-top: 20px;">
                    <label for="branchName">切换到分支</label>
                    <input type="text" id="branchName" placeholder="输入分支名称">
                </div>
                <button onclick="checkoutBranch()">切换分支</button>
                <div id="gitResponse" class="response-box" style="display: none;"></div>
            </div>
        </div>
        
        <!-- AI 助手标签 -->
        <div id="ai-tab" class="tab-content">
            <div class="section">
                <h2>AI 对话助手</h2>
                <div class="input-group">
                    <label for="aiContext">上下文（可选）</label>
                    <textarea id="aiContext" rows="3" placeholder="提供相关的上下文信息，帮助 AI 更好地理解你的问题"></textarea>
                </div>
                <div class="input-group">
                    <label for="aiMessage">消息</label>
                    <textarea id="aiMessage" rows="5" placeholder="输入你想要询问 AI 的问题"></textarea>
                </div>
                <button onclick="sendAIMessage()" id="aiSendButton">发送消息</button>
                <div id="aiResponse" class="response-box" style="display: none;"></div>
            </div>
            
            <div class="section">
                <h2>当前文件</h2>
                <button onclick="getCurrentFile()">获取当前文件内容</button>
                <div id="fileResponse" class="response-box" style="display: none;"></div>
            </div>
        </div>
        
        <!-- API 文档标签 -->
        <div id="api-tab" class="tab-content">
            <div class="section">
                <h2>API 文档</h2>
                <div class="response-box">
基础 URL: http://localhost:${HTTP_PORT}

健康检查:
GET /health

工作空间:
POST /api/workspace
Body: { "path": "/path/to/workspace" }

Git 操作:
GET  /api/git/branches - 获取分支列表
POST /api/git/checkout - 切换分支
     Body: { "branch": "branch-name" }
GET  /api/git/status - 获取 Git 状态

AI 对话:
POST /api/ai/chat
Body: { "message": "你的问题", "context": "可选的上下文" }

文件操作:
GET /api/file/current - 获取当前文件内容

命令执行:
POST /api/command
Body: { "commandId": "command.id" }
                </div>
            </div>
        </div>
    </div>
    
    <script>
        const API_BASE = 'http://localhost:${HTTP_PORT}';
        let isConnected = false;
        
        // 初始化
        async function init() {
            await checkConnection();
            setInterval(checkConnection, 5000);
        }
        
        // 检查连接状态
        async function checkConnection() {
            try {
                const response = await fetch(\`\${API_BASE}/health\`);
                const data = await response.json();
                
                isConnected = data.cursorConnected;
                document.getElementById('statusIndicator').className = 
                    'status-indicator ' + (isConnected ? 'status-connected' : 'status-disconnected');
                document.getElementById('statusText').textContent = 
                    isConnected ? 'Cursor 已连接' : 'Cursor 未连接';
                
                if (data.workspace) {
                    document.getElementById('currentWorkspace').textContent = data.workspace;
                }
            } catch (error) {
                document.getElementById('statusIndicator').className = 'status-indicator status-disconnected';
                document.getElementById('statusText').textContent = '服务器未响应';
            }
        }
        
        // 切换标签
        function switchTab(tabName) {
            const tabs = document.querySelectorAll('.tab');
            const contents = document.querySelectorAll('.tab-content');
            
            tabs.forEach(tab => tab.classList.remove('active'));
            contents.forEach(content => content.classList.remove('active'));
            
            event.target.classList.add('active');
            document.getElementById(\`\${tabName}-tab\`).classList.add('active');
        }
        
        // 显示响应
        function showResponse(elementId, data, isError = false) {
            const element = document.getElementById(elementId);
            element.style.display = 'block';
            element.style.color = isError ? '#f14c4c' : '#d4d4d4';
            element.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        }
        
        // 设置工作空间
        async function setWorkspace() {
            const path = document.getElementById('workspacePath').value;
            if (!path) {
                showResponse('workspaceResponse', '请输入工作空间路径', true);
                return;
            }
            
            try {
                const response = await fetch(\`\${API_BASE}/api/workspace\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path })
                });
                
                const data = await response.json();
                if (response.ok) {
                    showResponse('workspaceResponse', '工作空间设置成功：' + path);
                    document.getElementById('currentWorkspace').textContent = path;
                } else {
                    showResponse('workspaceResponse', data.error, true);
                }
            } catch (error) {
                showResponse('workspaceResponse', '错误：' + error.message, true);
            }
        }
        
        // 获取分支列表
        async function getBranches() {
            try {
                const response = await fetch(\`\${API_BASE}/api/git/branches\`);
                const data = await response.json();
                
                if (response.ok && data.branches) {
                    const listElement = document.getElementById('branchList');
                    listElement.innerHTML = data.branches.map(branch => \`
                        <li class="branch-item \${branch.isCurrent ? 'branch-current' : ''} \${branch.isRemote ? 'branch-remote' : ''}">
                            <span>\${branch.name}\${branch.isCurrent ? ' ✓' : ''}</span>
                            \${!branch.isRemote && !branch.isCurrent ? 
                                \`<button onclick="document.getElementById('branchName').value='\${branch.name}'">选择</button>\` : 
                                ''}
                        </li>
                    \`).join('');
                } else {
                    showResponse('gitResponse', data.error || '获取分支失败', true);
                }
            } catch (error) {
                showResponse('gitResponse', '错误：' + error.message, true);
            }
        }
        
        // 获取 Git 状态
        async function getGitStatus() {
            try {
                const response = await fetch(\`\${API_BASE}/api/git/status\`);
                const data = await response.json();
                
                if (response.ok) {
                    const status = data.files.length === 0 ? 
                        '工作区干净' : 
                        \`有 \${data.files.length} 个文件变更:\\n\` + 
                        data.files.map(f => \`\${f.status} \${f.file}\`).join('\\n');
                    showResponse('gitResponse', status);
                } else {
                    showResponse('gitResponse', data.error, true);
                }
            } catch (error) {
                showResponse('gitResponse', '错误：' + error.message, true);
            }
        }
        
        // 切换分支
        async function checkoutBranch() {
            const branch = document.getElementById('branchName').value;
            if (!branch) {
                showResponse('gitResponse', '请输入分支名称', true);
                return;
            }
            
            try {
                const response = await fetch(\`\${API_BASE}/api/git/checkout\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ branch })
                });
                
                const data = await response.json();
                if (response.ok) {
                    showResponse('gitResponse', data.message);
                    getBranches(); // 刷新分支列表
                } else {
                    showResponse('gitResponse', data.error, true);
                }
            } catch (error) {
                showResponse('gitResponse', '错误：' + error.message, true);
            }
        }
        
        // 发送 AI 消息
        async function sendAIMessage() {
            const message = document.getElementById('aiMessage').value;
            const context = document.getElementById('aiContext').value;
            
            if (!message) {
                showResponse('aiResponse', '请输入消息内容', true);
                return;
            }
            
            if (!isConnected) {
                showResponse('aiResponse', 'Cursor 未连接，请确保已安装并运行注入脚本', true);
                return;
            }
            
            const button = document.getElementById('aiSendButton');
            button.disabled = true;
            button.innerHTML = '发送中... <span class="loading"></span>';
            
            try {
                const response = await fetch(\`\${API_BASE}/api/ai/chat\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, context })
                });
                
                const data = await response.json();
                if (response.ok) {
                    showResponse('aiResponse', data.response.content || data.response);
                } else {
                    showResponse('aiResponse', data.error, true);
                }
            } catch (error) {
                showResponse('aiResponse', '错误：' + error.message, true);
            } finally {
                button.disabled = false;
                button.innerHTML = '发送消息';
            }
        }
        
        // 获取当前文件
        async function getCurrentFile() {
            if (!isConnected) {
                showResponse('fileResponse', 'Cursor 未连接', true);
                return;
            }
            
            try {
                const response = await fetch(\`\${API_BASE}/api/file/current\`);
                const data = await response.json();
                
                if (response.ok && data.file) {
                    const info = \`文件: \${data.file.path || '未知'}\\n语言: \${data.file.language || '未知'}\\n\\n\${data.file.content || '无内容'}\`;
                    showResponse('fileResponse', info);
                } else {
                    showResponse('fileResponse', '无法获取文件内容', true);
                }
            } catch (error) {
                showResponse('fileResponse', '错误：' + error.message, true);
            }
        }
        
        // 启动
        init();
    </script>
</body>
</html>
    `);
});

// 启动服务器
const server = app.listen(HTTP_PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║     Cursor Remote Control Server       ║
╠════════════════════════════════════════╣
║ HTTP 服务器：http://localhost:${HTTP_PORT}    ║
║ WebSocket 端口：${WS_PORT}                 ║
╠════════════════════════════════════════╣
║ 请在 Cursor 中注入 injection.js       ║
║ 以启用远程控制功能                     ║
╚════════════════════════════════════════╝
    `);
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('正在关闭服务器...');
    server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
    });
});

module.exports = { app, wss };