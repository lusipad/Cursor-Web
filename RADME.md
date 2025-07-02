# Cursor Remote Control 安装和使用指南

## 项目结构

```
cursor-remote-control/
├── server.js           # 主服务器文件
├── cursor-injection.js # Cursor注入脚本
├── package.json        # 项目配置
├── start.js           # 启动脚本
└── README.md          # 本文档
```

## 安装步骤

### 1. 创建项目目录

```bash
mkdir cursor-remote-control
cd cursor-remote-control
```

### 2. 创建 package.json

```json
{
  "name": "cursor-remote-control",
  "version": "1.0.0",
  "description": "Remote control server for Cursor IDE",
  "main": "server.js",
  "scripts": {
    "start": "node start.js",
    "server": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "ws": "^8.14.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

### 3. 安装依赖

```bash
npm install
```

### 4. 创建启动脚本 (start.js)

```javascript
// start.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('启动 Cursor Remote Control...');

// 启动服务器
const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname
});

// 监听退出事件
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    server.kill();
    process.exit();
});

// 显示注入说明
setTimeout(() => {
    console.log(`
════════════════════════════════════════════════════════════════
                        注入脚本说明
════════════════════════════════════════════════════════════════

1. 打开 Cursor IDE

2. 打开开发者工具:
   - Windows/Linux: Ctrl+Shift+I
   - macOS: Cmd+Option+I

3. 在控制台中粘贴并运行 cursor-injection.js 的内容

4. 或者使用以下命令自动注入:
   
   fetch('http://localhost:3456/inject.js')
     .then(r => r.text())
     .then(eval);

5. 成功后将看到 "Cursor Remote Control 注入脚本已加载" 消息

════════════════════════════════════════════════════════════════
`);
}, 2000);
```

### 5. 在 Cursor 中注入脚本

有多种方式注入脚本到 Cursor：

#### 方法 1: 手动注入

1. 打开 Cursor IDE
2. 按 `Ctrl+Shift+I` (Windows/Linux) 或 `Cmd+Option+I` (macOS) 打开开发者工具
3. 在控制台中粘贴 `cursor-injection.js` 的内容并回车

#### 方法 2: 自动注入（推荐）

在 server.js 中添加注入脚本端点：

```javascript
// 添加到 server.js
app.get('/inject.js', (req, res) => {
    res.type('application/javascript');
    res.sendFile(path.join(__dirname, 'cursor-injection.js'));
});
```

然后在 Cursor 控制台运行：

```javascript
fetch('http://localhost:3456/inject.js').then(r => r.text()).then(eval);
```

#### 方法 3: 创建 Cursor 扩展（高级）

创建一个简单的 VS Code 扩展来自动加载脚本：

```javascript
// extension.js
const vscode = require('vscode');

function activate(context) {
    // 在激活时自动注入脚本
    const script = require('./cursor-injection.js');
    
    vscode.commands.registerCommand('cursor-remote.connect', () => {
        vscode.window.showInformationMessage('Cursor Remote Control 已连接!');
    });
}

module.exports = { activate };
```

## 使用方法

### 1. 启动服务器

```bash
npm start
```

### 2. 访问控制界面

打开浏览器访问: http://localhost:3456

### 3. API 使用示例

#### 设置工作空间

```bash
curl -X POST http://localhost:3456/api/workspace \
  -H "Content-Type: application/json" \
  -d '{"path": "/path/to/your/project"}'
```

#### 获取分支列表

```bash
curl http://localhost:3456/api/git/branches
```

#### 切换分支

```bash
curl -X POST http://localhost:3456/api/git/checkout \
  -H "Content-Type: application/json" \
  -d '{"branch": "feature/new-feature"}'
```

#### AI 对话

```bash
curl -X POST http://localhost:3456/api/ai/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "解释这段代码的作用",
    "context": "function fibonacci(n) { return n <= 1 ? n : fibonacci(n-1) + fibonacci(n-2); }"
  }'
```

## 高级功能

### 1. 自动启动服务器

可以配置 Cursor 在启动时自动运行服务器：

1. 创建 `.vscode/tasks.json`:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Start Remote Control Server",
      "type": "shell",
      "command": "npm",
      "args": ["start"],
      "options": {
        "cwd": "${workspaceFolder}/cursor-remote-control"
      },
      "runOptions": {
        "runOn": "folderOpen"
      },
      "problemMatcher": []
    }
  ]
}
```

### 2. 持久化注入脚本

创建一个 Cursor 设置来持久化注入：

1. 在 Cursor 设置中添加自定义 CSS/JS
2. 或创建一个简单的扩展自动加载脚本

### 3. 安全性增强

在生产环境中，建议添加以下安全措施：

```javascript
// 添加认证中间件
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'your-secret-token';

app.use((req, res, next) => {
    const token = req.headers['authorization'];
    if (token !== `Bearer ${AUTH_TOKEN}`) {
        return res.status(401).json({ error: '未授权' });
    }
    next();
});
```

### 4. 远程访问

如果需要远程访问，可以使用 ngrok 或配置反向代理：

```bash
# 使用 ngrok
ngrok http 3456

# 或配置 nginx 反向代理
server {
    listen 80;
    server_name cursor-remote.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }
}
```

## 故障排除

### 1. Cursor 未连接

- 确保已在 Cursor 中运行注入脚本
- 检查开发者控制台是否有错误信息
- 确认 WebSocket 端口 3457 未被占用

### 2. Git 命令失败

- 确保工作空间路径正确
- 检查是否有 Git 仓库
- 确认有适当的文件权限

### 3. AI 对话无响应

- 确保 Cursor 已登录并有 AI 功能权限
- 检查网络连接
- 查看服务器日志获取详细错误信息

## 扩展开发

### 添加新功能

1. 在 `server.js` 中添加新的 API 端点
2. 在 `cursor-injection.js` 中添加相应的处理逻辑
3. 更新 Web 界面添加新功能的控制

示例：添加代码格式化功能

```javascript
// server.js
app.post('/api/format', async (req, res) => {
    try {
        const response = await sendToCursor({
            type: 'execute_command',
            data: { commandId: 'editor.action.formatDocument' }
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// cursor-injection.js - 在 switch 语句中添加
case 'format_document':
    await CursorAPI.executeCommand('editor.action.formatDocument');
    response = { type: 'format_result', success: true };
    break;
```

## 完整的 API 参考

### HTTP API

| 方法 | 端点              | 描述          | 请求体                                       |
| ---- | ----------------- | ------------- | -------------------------------------------- |
| GET  | /health           | 健康检查      | -                                            |
| POST | /api/workspace    | 设置工作空间  | `{"path": "string"}`                         |
| GET  | /api/git/branches | 获取分支列表  | -                                            |
| POST | /api/git/checkout | 切换分支      | `{"branch": "string"}`                       |
| GET  | /api/git/status   | 获取 Git 状态 | -                                            |
| POST | /api/ai/chat      | AI 对话       | `{"message": "string", "context": "string"}` |
| GET  | /api/file/current | 获取当前文件  | -                                            |
| POST | /api/command      | 执行命令      | `{"commandId": "string"}`                    |

### WebSocket 消息类型

| 类型             | 方向          | 描述         | 数据                 |
| ---------------- | ------------- | ------------ | -------------------- |
| init             | Client→Server | 初始化连接   | Platform info        |
| ping             | Server→Client | 保持连接     | -                    |
| pong             | Client→Server | 响应 ping    | Timestamp            |
| ai_chat          | Server→Client | 发送 AI 消息 | `{message, context}` |
| ai_response      | Client→Server | AI 响应      | Response data        |
| get_file_content | Server→Client | 请求文件内容 | -                    |
| file_content     | Client→Server | 文件内容     | File data            |
| execute_command  | Server→Client | 执行命令     | `{commandId}`        |
| command_result   | Client→Server | 命令结果     | Success/Error        |

## 贡献指南

欢迎提交 Pull Request 来改进这个项目！

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

## 许可证

MIT License - 详见 LICENSE 文件

## 联系方式

如有问题或建议，请创建 Issue 或联系项目维护者。