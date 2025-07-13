# Claude Web - Cursor AI 远程控制平台

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/your-username/claude-web)

一个强大的Web界面远程控制平台，让您可以通过浏览器远程操作Cursor的AI聊天功能，同时提供Git仓库管理、实时消息同步等高级功能。

![image-20250713090500736](README.assets/image-20250713090500736.png)





## ✨ 主要功能

### 🤖 AI 聊天控制
- **实时消息同步** - Cursor ↔ Web 双向消息同步
- **远程对话** - 通过Web界面与Cursor AI进行对话
- **消息历史** - 完整的对话历史记录和搜索
- **格式化显示** - 支持代码高亮和Markdown渲染

### 🔧 Git 仓库管理
- **分支管理** - 查看和切换Git分支
- **代码同步** - 一键拉取最新代码
- **状态监控** - 实时显示仓库状态
- **操作日志** - 完整的Git操作记录

### 🌐 Web 界面
- **响应式设计** - 支持桌面和移动设备
- **实时状态** - WebSocket连接状态监控
- **多标签页** - 工作空间、AI助手、Git管理分离
- **现代化UI** - 美观的用户界面

### ⚡ 技术特性
- **WebSocket通信** - 实时双向数据传输
- **自动重连** - 网络中断自动恢复
- **跨域支持** - 完整的CORS配置
- **错误处理** - 完善的异常处理机制

## 🚀 快速开始

### 方式一：使用可执行文件（推荐）

1. **下载最新版本**
   - 从 [Releases](https://github.com/your-username/claude-web/releases) 下载 `cursor-web.exe`
   - 或直接下载：`cursor-web.exe` (40MB)

2. **运行程序**
   ```bash
   # 双击运行
   cursor-web.exe
   
   # 或在命令行运行
   ./cursor-web.exe
   ```

3. **访问Web界面**
   - 打开浏览器访问：`http://localhost:3000`
   - 查看服务器状态：`http://localhost:3000/health`

### 方式二：从源码运行

1. **克隆项目**
   ```bash
   git clone https://github.com/your-username/claude-web.git
   cd claude-web
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动服务**
   ```bash
   # 开发模式（自动重启）
   npm run dev
   
   # 生产模式
   npm start
   ```

4. **打包可执行文件**
   ```bash
   npm run package
   ```

## 📖 使用指南

### 连接Cursor

1. **启动Web服务**
   - 确保服务运行在 `http://localhost:3000`

2. **打开Cursor**
   - 启动Cursor编辑器
   - 打开AI聊天面板

3. **注入连接脚本**
   - 在Cursor中按 `F12` 打开开发者工具
   - 切换到 `Console` 标签
   - 复制Web界面"工作空间"标签页中的注入脚本
   - 粘贴到Console并执行
   - 看到"✅ WebSocket连接成功"表示连接成功

### 使用AI聊天

1. **发送消息**
   - 在Web界面"AI助手"标签页输入消息
   - 点击发送按钮或按 `Ctrl+Enter`
   - 消息会自动同步到Cursor

2. **接收回复**
   - Cursor中的AI回复会自动同步到Web界面
   - 支持代码高亮和格式化显示

3. **管理对话**
   - 使用搜索功能查找历史消息
   - 清空对话重新开始
   - 查看消息时间戳和状态

### Git仓库管理

1. **查看分支**
   - 在"Git管理"标签页查看所有分支
   - 当前分支会高亮显示

2. **切换分支**
   - 选择目标分支
   - 点击"切换分支"按钮
   - 确认切换操作

3. **更新代码**
   - 点击"拉取代码"按钮
   - 自动从远程仓库拉取最新代码
   - 查看操作结果和日志

## 🔧 API 文档

### 服务器状态
```http
GET /health
```
返回服务器健康状态和连接信息

### 内容管理
```http
GET /api/content
POST /api/content
```
获取和设置当前聊天内容

### Git操作
```http
GET /api/git/branches
POST /api/git/checkout
POST /api/git/pull
```
Git分支管理和代码同步

### WebSocket事件
- `html_content` - 接收HTML内容
- `cursor_message` - Cursor消息事件
- `web_message` - Web消息事件
- `status_update` - 状态更新

## 🛠️ 开发指南

### 项目结构
```
claude-web/
├── app.js              # 主服务器文件
├── package.json        # 项目配置
├── public/             # 前端静态文件
│   ├── index.html      # 主页面
│   ├── style.css       # 样式文件
│   ├── simple-client.js # 客户端脚本
│   ├── cursor-browser.js # Cursor浏览器脚本
│   └── git-manager.js  # Git管理脚本
├── routes/             # 路由文件
├── services/           # 服务文件
├── middleware/         # 中间件
├── utils/              # 工具函数
├── tests/              # 测试文件
└── config/             # 配置文件
```

### 开发环境
```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 运行测试
npm test

# 代码检查
npm run lint
```

### 构建部署
```bash
# 打包可执行文件
npm run package

# 生产环境启动
npm start
```

## 🧪 测试

详细的测试指南请参考 [TESTING.md](./TESTING.md)

### 快速测试
1. 启动服务：`npm start`
2. 访问：`http://localhost:3000`
3. 连接Cursor并测试双向同步
4. 测试Git管理功能

## 🤝 贡献指南

我们欢迎各种形式的贡献！请查看 [CONTRIBUTING.md](./CONTRIBUTING.md) 了解详情。

### 贡献方式
- 🐛 报告Bug
- 💡 提出新功能
- 📝 改进文档
- 🔧 提交代码

## 📝 更新日志

详细的版本更新记录请查看 [CHANGELOG.md](./CHANGELOG.md)

## 📄 许可证

本项目采用 [MIT License](./LICENSE) 开源协议。

## 🆘 支持与帮助

### 常见问题

**Q: 无法连接到Cursor？**
A: 确保Cursor正在运行，并且正确执行了注入脚本。

**Q: 消息同步失败？**
A: 检查WebSocket连接状态，尝试刷新页面重新连接。

**Q: Git操作失败？**
A: 确保当前目录是有效的Git仓库，并且有相应的权限。

### 获取帮助
- 📖 查看 [测试指南](./TESTING.md)
- 🐛 提交 [Issue](https://github.com/your-username/claude-web/issues)
- 💬 参与 [讨论](https://github.com/your-username/claude-web/discussions)

## ⭐ 致谢

感谢所有为这个项目做出贡献的开发者！

---

**Claude Web** - 让Cursor AI控制更简单、更强大！ 🚀
