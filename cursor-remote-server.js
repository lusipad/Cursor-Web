// cursor-remote-server.js
// Cursor IDE 远程控制服务器 - 支持分支切换和AI对话

const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// 服务器配置
const PORT = 3456;
const app = express();

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 存储当前工作空间路径
let workspacePath = '';

// Cursor注入脚本 - 用于与Cursor IDE交互
const cursorInterface = {
    // 初始化Cursor接口
    init: function() {
        // 注入到Cursor的全局对象
        if (typeof window !== 'undefined' && window.cursorAPI) {
            this.api = window.cursorAPI;
            return true;
        }
        return false;
    },

    // 发送AI对话
    sendAIMessage: async function(message, context = '') {
        return new Promise((resolve, reject) => {
            try {
                // 模拟点击AI对话按钮
                const chatButton = document.querySelector('[aria-label="AI Chat"]');
                if (chatButton) {
                    chatButton.click();
                    
                    setTimeout(() => {
                        // 找到输入框
                        const inputBox = document.querySelector('textarea[placeholder*="Ask"]');
                        if (inputBox) {
                            // 设置上下文
                            if (context) {
                                inputBox.value = `Context: ${context}\n\nQuestion: ${message}`;
                            } else {
                                inputBox.value = message;
                            }
                            
                            // 触发输入事件
                            inputBox.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            // 模拟回车发送
                            const enterEvent = new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                keyCode: 13,
                                which: 13,
                                bubbles: true
                            });
                            inputBox.dispatchEvent(enterEvent);
                            
                            // 等待响应
                            this.waitForAIResponse(resolve, reject);
                        } else {
                            reject('找不到AI输入框');
                        }
                    }, 500);
                } else {
                    reject('找不到AI对话按钮');
                }
            } catch (error) {
                reject(error.message);
            }
        });
    },

    // 等待AI响应
    waitForAIResponse: function(resolve, reject, maxWait = 30000) {
        const startTime = Date.now();
        const checkInterval = 500;
        
        const checker = setInterval(() => {
            try {
                // 查找AI响应区域
                const responseElements = document.querySelectorAll('.ai-response, [data-test-id="ai-response"]');
                const lastResponse = responseElements[responseElements.length - 1];
                
                if (lastResponse) {
                    // 检查是否还在加载中
                    const isLoading = lastResponse.querySelector('.loading-indicator, .spinner');
                    if (!isLoading) {
                        clearInterval(checker);
                        const responseText = lastResponse.textContent || lastResponse.innerText;
                        resolve(responseText);
                    }
                }
                
                // 超时检查
                if (Date.now() - startTime > maxWait) {
                    clearInterval(checker);
                    reject('AI响应超时');
                }
            } catch (error) {
                clearInterval(checker);
                reject(error.message);
            }
        }, checkInterval);
    }
};

// API路由

// 健康检查
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        port: PORT,
        workspace: workspacePath || 'Not set'
    });
});

// 设置工作空间路径
app.post('/workspace', (req, res) => {
    const { path } = req.body;
    if (!path) {
        return res.status(400).json({ error: '需要提供工作空间路径' });
    }
    
    workspacePath = path;
    res.json({ success: true, workspace: workspacePath });
});

// Git分支操作
app.get('/git/branches', async (req, res) => {
    if (!workspacePath) {
        return res.status(400).json({ error: '未设置工作空间路径' });
    }

    exec('git branch -a', { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        const branches = stdout.split('\n')
            .filter(branch => branch.trim())
            .map(branch => {
                const name = branch.trim().replace('* ', '');
                const isCurrent = branch.includes('*');
                return { name, isCurrent };
            });
            
        res.json({ branches });
    });
});

// 切换分支
app.post('/git/checkout', async (req, res) => {
    const { branch } = req.body;
    if (!branch) {
        return res.status(400).json({ error: '需要提供分支名称' });
    }
    
    if (!workspacePath) {
        return res.status(400).json({ error: '未设置工作空间路径' });
    }

    exec(`git checkout ${branch}`, { cwd: workspacePath }, (error, stdout, stderr) => {
        if (error) {
            return res.status(500).json({ error: error.message });
        }
        
        res.json({ 
            success: true, 
            message: `成功切换到分支: ${branch}`,
            output: stdout || stderr
        });
    });
});

// AI对话接口
app.post('/ai/chat', async (req, res) => {
    const { message, context } = req.body;
    if (!message) {
        return res.status(400).json({ error: '需要提供消息内容' });
    }

    try {
        // 这里需要通过注入脚本与Cursor交互
        // 实际实现时需要通过WebSocket或其他方式与Cursor进程通信
        const response = await simulateAIChat(message, context);
        res.json({ 
            success: true, 
            response: response,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 模拟AI对话（实际实现需要与Cursor进程交互）
async function simulateAIChat(message, context) {
    // 这是一个模拟函数，实际实现需要：
    // 1. 通过WebSocket连接到Cursor
    // 2. 注入JavaScript代码控制Cursor UI
    // 3. 获取AI响应并返回
    
    return `AI响应: 收到消息"${message}"${context ? ` 上下文: ${context}` : ''}`;
}

// 获取当前文件内容
app.get('/file/current', async (req, res) => {
    // 需要从Cursor获取当前打开的文件
    // 这里是模拟实现
    res.json({
        fileName: 'example.js',
        content: '// Current file content',
        language: 'javascript'
    });
});

// Web界面路由
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Cursor Remote Control</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
        }
        .section {
            margin-bottom: 20px;
            padding: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-right: 10px;
        }
        button:hover {
            background-color: #45a049;
        }
        input, textarea {
            width: 100%;
            padding: 8px;
            margin: 5px 0;
            box-sizing: border-box;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .response {
            background-color: #f0f0f0;
            padding: 10px;
            margin-top: 10px;
            border-radius: 4px;
            white-space: pre-wrap;
        }
        .branch-list {
            list-style: none;
            padding: 0;
        }
        .branch-list li {
            padding: 5px;
            margin: 2px 0;
            background-color: #f9f9f9;
            border-radius: 3px;
        }
        .current-branch {
            background-color: #e8f5e9;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Cursor Remote Control</h1>
        
        <div class="section">
            <h2>工作空间设置</h2>
            <input type="text" id="workspacePath" placeholder="输入工作空间路径">
            <button onclick="setWorkspace()">设置工作空间</button>
            <div id="workspaceResponse" class="response"></div>
        </div>
        
        <div class="section">
            <h2>Git 分支管理</h2>
            <button onclick="getBranches()">获取分支列表</button>
            <ul id="branchList" class="branch-list"></ul>
            <input type="text" id="branchName" placeholder="输入分支名称">
            <button onclick="checkoutBranch()">切换分支</button>
            <div id="gitResponse" class="response"></div>
        </div>
        
        <div class="section">
            <h2>AI 对话</h2>
            <textarea id="aiMessage" rows="4" placeholder="输入要发送给AI的消息"></textarea>
            <textarea id="aiContext" rows="2" placeholder="上下文（可选）"></textarea>
            <button onclick="sendAIMessage()">发送消息</button>
            <div id="aiResponse" class="response"></div>
        </div>
    </div>
    
    <script>
        const API_BASE = 'http://localhost:${PORT}';
        
        async function setWorkspace() {
            const path = document.getElementById('workspacePath').value;
            try {
                const response = await fetch(\`\${API_BASE}/workspace\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path })
                });
                const data = await response.json();
                document.getElementById('workspaceResponse').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                document.getElementById('workspaceResponse').textContent = '错误: ' + error.message;
            }
        }
        
        async function getBranches() {
            try {
                const response = await fetch(\`\${API_BASE}/git/branches\`);
                const data = await response.json();
                
                if (data.branches) {
                    const listElement = document.getElementById('branchList');
                    listElement.innerHTML = data.branches.map(branch => 
                        \`<li class="\${branch.isCurrent ? 'current-branch' : ''}">\${branch.name}\${branch.isCurrent ? ' (当前)' : ''}</li>\`
                    ).join('');
                }
            } catch (error) {
                document.getElementById('gitResponse').textContent = '错误: ' + error.message;
            }
        }
        
        async function checkoutBranch() {
            const branch = document.getElementById('branchName').value;
            try {
                const response = await fetch(\`\${API_BASE}/git/checkout\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ branch })
                });
                const data = await response.json();
                document.getElementById('gitResponse').textContent = JSON.stringify(data, null, 2);
                
                // 刷新分支列表
                if (data.success) {
                    getBranches();
                }
            } catch (error) {
                document.getElementById('gitResponse').textContent = '错误: ' + error.message;
            }
        }
        
        async function sendAIMessage() {
            const message = document.getElementById('aiMessage').value;
            const context = document.getElementById('aiContext').value;
            
            try {
                const response = await fetch(\`\${API_BASE}/ai/chat\`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, context })
                });
                const data = await response.json();
                document.getElementById('aiResponse').textContent = JSON.stringify(data, null, 2);
            } catch (error) {
                document.getElementById('aiResponse').textContent = '错误: ' + error.message;
            }
        }
    </script>
</body>
</html>
    `);
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`Cursor Remote Control Server 运行在 http://localhost:${PORT}`);
    console.log(`API 文档:`);
    console.log(`  GET  /health - 健康检查`);
    console.log(`  POST /workspace - 设置工作空间`);
    console.log(`  GET  /git/branches - 获取分支列表`);
    console.log(`  POST /git/checkout - 切换分支`);
    console.log(`  POST /ai/chat - 发送AI对话`);
});

// 导出服务器实例
module.exports = { app, cursorInterface };