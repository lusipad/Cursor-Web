# 🚀 Claude Web - Cursor 聊天同步工具

一个简洁的工具，用于将 Cursor 编辑器中的 Claude 聊天内容同步到 Web 界面查看。

---

## 🆕 Git 分支管理功能

> **v2.1+ 新增：Web界面内置Git分支管理Tab**

你可以在网页顶部切换到“Git管理”Tab，进行如下操作：
- 查看当前分支和所有本地分支
- 一键切换分支
- 拉取（更新）最新代码
- 添加所有更改到暂存区（等同于 `git add .`）
- 填写提交信息并提交代码
- 推送代码到远程仓库
- 查看当前Git状态和操作日志

### 使用方法
1. 在顶部Tab切换到“Git管理”
2. 点击“刷新分支”获取分支信息
3. 选择分支并点击“切换分支”
4. 修改代码后，点击“添加文件”将更改加入暂存区
5. 填写提交信息，点击“提交代码”
6. 如需推送到远程，点击“推送代码”
7. 操作结果会在下方“Git操作输出”区域显示

> “添加文件”按钮等同于命令行 `git add .`，会将所有更改（新建、修改、删除）加入暂存区。

### 常见问题
- 目前仅支持全部文件的批量添加（不支持单独选择文件）。
- 推送/拉取需本地仓库已配置远程（如origin）。
- 如遇权限或冲突问题，请在命令行处理后再用Web界面。

---

## ✨ 功能特点

- 🔄 实时同步 Cursor 聊天内容到 Web 界面
- 🌐 基于 HTTP API 和 WebSocket 的双重连接方式
- 📱 响应式 Web 界面，支持桌面和移动设备
- 🛠️ 简洁的代码结构，易于维护和扩展
- 💬 支持从 Web 界面发送消息到 Cursor
- 🆕 **内置Git分支管理Tab，支持常用Git操作**

## 📁 项目结构

```
claude-web/
├── server.js              # 🔧 统一服务器 (HTTP + WebSocket)
├── cursor-browser.js      # 🌐 Cursor 浏览器客户端脚本
├── public/                # 📱 Web 界面文件
│   ├── index.html         #   主页面
│   ├── simple-client.js   #   前端 JavaScript
│   ├── git-manager.js     #   Git管理前端逻辑
│   └── style.css          #   样式文件
├── package.json           # 📦 项目配置
└── README.md              # 📖 说明文档
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
node app.js
```

服务器将在 http://localhost:3000 启动

### 3. 在 Cursor 中运行同步脚本

1. 在 Cursor 中打开开发者控制台 (F12)
2. 复制 `cursor-browser.js` 的全部内容
3. 粘贴到控制台并回车执行

### 4. 查看同步内容

在浏览器中访问 http://localhost:3000 查看同步的聊天内容

## 🎯 使用方法

### Cursor 端操作

```javascript
// 在 Cursor 控制台中运行这些命令：

// 停止同步
stopCursorSync()

// 查看调试信息
debugCursorSync()
```

### Web 端功能

- 📖 实时查看 Cursor 聊天内容
- 💬 从 Web 界面发送消息到 Cursor
- 🔄 自动刷新和同步
- 📊 连接状态监控

## 🔧 API 端点

### HTTP API

- `GET /api/test` - 测试服务器连接
- `POST /api/content` - 发送聊天内容
- `GET /api/content` - 获取当前内容
- `GET /api/status` - 服务器状态
- `GET /health` - 健康检查

### WebSocket 消息类型

- `html_content` - HTML 聊天内容
- `user_message` - 用户消息
- `ping/pong` - 心跳检测
- `clear_content` - 清空内容

## 🛠️ 开发说明

### 技术栈

- **后端**: Node.js + Express + WebSocket
- **前端**: 原生 JavaScript + HTML + CSS
- **同步**: HTTP API + 定时器

### 核心特性

1. **双重连接**: HTTP API 用于稳定性，WebSocket 用于实时性
2. **智能检测**: 自动识别 Cursor 聊天区域
3. **错误恢复**: 自动重试和连接恢复
4. **内容同步**: 增量更新，避免重复传输

## 🔍 故障排除

### 常见问题

1. **"require is not defined" 错误**
   - 确保在 Cursor 控制台运行 `cursor-browser.js`，不是服务器文件

2. **服务器连接失败**
   - 检查服务器是否在 localhost:3000 运行
   - 确认防火墙设置

3. **内容不同步**
   - 运行 `debugCursorSync()` 查看详细信息
   - 检查 Cursor 聊天区域是否被正确识别

### 调试命令

```javascript
// 查看详细调试信息
debugCursorSync()

// 手动测试连接
fetch('http://localhost:3000/api/test').then(r => r.json()).then(console.log)
```

## 📝 更新日志

### v2.0.0 (当前版本)
- 🔄 重构项目结构，简化文件组织
- ✨ 统一 server.js，合并最佳功能
- 🧹 清理冗余文件，保持项目简洁
- 📱 优化 Web 界面和用户体验
- 🛠️ 改进错误处理和调试功能

### v1.x
- 基础同步功能
- 多种客户端实现
- 实验性功能测试

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

---

💡 **使用提示**: 确保先启动服务器，再在 Cursor 控制台运行同步脚本。
