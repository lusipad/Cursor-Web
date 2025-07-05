# 🚀 Cursor Remote Control v2.0 - 简化版

通过Web界面远程控制Cursor IDE的AI聊天功能。

## 📁 项目结构

```
claude-web/
├── app.js              # 主服务器文件
├── inject.js           # Cursor注入脚本
├── client.js           # 前端客户端脚本
├── public/
│   ├── index.html      # 主页面
│   └── style.css       # 样式文件
├── package.json        # 项目配置
└── README.md          # 说明文档
```

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

### 3. 访问控制面板

打开浏览器访问：`http://localhost:3459`

### 4. 注入脚本到Cursor

1. 在Cursor中打开AI聊天面板
2. 通过菜单栏打开开发者工具：**Help → Toggle Developer Tools**
3. 切换到Console标签
4. 复制并粘贴控制面板中的注入脚本
5. 看到"WebSocket连接成功"即可开始使用

## 🎯 功能特性

- **🌐 Web控制面板** - 现代化的Web界面
- **🔄 实时连接** - WebSocket双向通信
- **📁 工作空间管理** - 动态切换工作目录
- **🌿 Git分支管理** - 查看和切换Git分支
- **🤖 AI对话** - 远程发送AI指令
- **📱 响应式设计** - 支持移动设备
- **🔧 自动重连** - 网络断开自动重连

## 🛠️ API接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/health` | GET | 健康检查 |
| `/inject-script.js` | GET | 获取注入脚本 |
| `/api/workspace` | POST | 设置工作空间 |
| `/api/git/branches` | GET | 获取分支列表 |
| `/api/git/checkout` | POST | 切换分支 |
| `/api/ai/chat` | POST | AI对话 |

## 🔧 配置选项

服务器配置在`app.js`中：

```javascript
const CONFIG = {
    host: '0.0.0.0',
    httpPort: 3459,
    wsPort: 3460,
    timeout: 90000
};
```

## 📋 使用步骤

1. **启动服务器**
   ```bash
   npm start
   ```

2. **打开控制面板**
   - 访问 `http://localhost:3459`

3. **注入脚本**
   - 在Cursor中打开AI聊天面板
   - 菜单栏：**Help → Toggle Developer Tools**
   - 切换到Console标签
   - 复制控制面板中的注入脚本
   - 在Console中粘贴执行

4. **开始使用**
   - 设置工作空间路径
   - 管理Git分支
   - 发送AI对话指令

## 🎨 界面预览

控制面板包含4个主要功能区：

- **工作空间** - 设置项目路径和注入脚本
- **Git管理** - 查看和切换分支
- **AI助手** - 远程AI对话
- **API文档** - 接口说明

## 🔄 开发模式

```bash
# 开发模式（自动重启）
npm run dev

# 使用旧版服务器
npm run legacy
```

## 🌟 主要改进

v2.0相比之前版本的主要改进：

- **简化架构** - 从20+个文件减少到6个核心文件
- **合并功能** - 前后端逻辑集中管理
- **优化性能** - 减少HTTP请求和资源占用
- **增强稳定性** - 改进错误处理和重连机制
- **提升体验** - 现代化UI和响应式设计

## 🐛 故障排除

### 连接问题
- 确保端口3459和3460没有被占用
- 检查防火墙设置
- 尝试使用`127.0.0.1`替代`localhost`

### 注入脚本问题
- 确保先打开Cursor的AI聊天面板
- 通过菜单栏打开开发者工具：**Help → Toggle Developer Tools**
- 在Console标签中粘贴脚本
- 检查WebSocket连接状态
- 查看控制台错误信息

### 功能异常
- 检查工作空间路径是否正确
- 确认Git仓库状态
- 查看服务器日志

## 💡 重要提示

### Cursor开发者工具打开方式
- **不是F12**，而是通过菜单栏：**Help → Toggle Developer Tools**
- 或者使用快捷键：**Ctrl+Shift+I** (Windows/Linux) 或 **Cmd+Option+I** (Mac)

### 注入脚本执行步骤
1. 打开Cursor AI聊天面板
2. 菜单栏：**Help → Toggle Developer Tools**
3. 点击**Console**标签
4. 粘贴注入脚本并按Enter执行
5. 看到"✅ WebSocket连接成功"即可

## 📜 许可证

MIT License

## 🤝 贡献

欢迎提交Issue和Pull Request！

---

**注意：** 本工具仅用于学习和开发目的，请遵守相关使用条款。 

# Cursor Remote Control v2.0

一个现代化的Cursor远程控制Web应用，具有完整的AI助手界面。

## 功能特性

### 🎯 核心功能
- **工作空间管理** - 设置和管理项目工作空间
- **Git集成** - 分支查看、切换和管理
- **Cursor注入** - 通过WebSocket连接Cursor
- **现代化AI界面** - 类似VSCode的AI聊天体验

### 🤖 AI 双向对话同步
- **双向实时同步** - Cursor ↔ Web界面的完整双向通信
- **智能消息识别** - 自动区分用户消息和AI回复
- **消息自动发送** - Web界面消息自动输入到Cursor并发送
- **状态实时反馈** - 显示发送状态和连接状态
- **暗色主题设计** - 现代化的专业界面
- **消息格式化** - 支持代码块和语法高亮
- **历史管理功能** - 搜索、清空和管理对话记录
- **多重状态指示** - 清楚标识消息来源和状态

### 🎨 界面特色
- **响应式设计** - 适配移动端和桌面端
- **流畅动画** - 平滑的过渡效果
- **现代化图标** - 使用Emoji和符号图标
- **分离式容器** - 独立的聊天容器设计
- **搜索高亮** - 搜索结果高亮显示

## 快速开始

### 1. 启动服务器
```bash
# 安装依赖
npm install

# 启动服务器
npm start
```

### 2. 访问Web界面
打开浏览器访问: `http://localhost:3459`

### 3. 连接Cursor
1. 在Cursor中打开AI聊天面板
2. 菜单栏：**Help → Toggle Developer Tools**
3. 切换到**Console**标签
4. 复制网页上显示的注入脚本并粘贴到Console中
5. 按Enter执行，看到"✅ WebSocket连接成功"即可

### 4. 双向AI对话同步
1. 切换到Web界面的"AI助手"标签页
2. **从Cursor到Web**: Cursor中的AI对话会自动同步到Web界面
3. **从Web到Cursor**: 在Web界面输入消息，自动发送到Cursor中
4. 同步的消息会有特殊标识（🔄 来自 Cursor）
5. 发送状态会显示实时反馈（📤 发送到 Cursor）
6. 可以搜索和管理所有同步的对话

### 5. 高级功能
- **搜索对话**: 点击搜索按钮🔍搜索历史消息
- **清空对话**: 点击垃圾桶图标🗑️清空当前对话
- **新建对话**: 点击加号➕开始新的对话
- **图片上传**: 点击相机图标📷上传图片

## 技术栈
- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **后端**: Node.js, Express
- **通信**: WebSocket
- **UI**: 现代化暗色主题设计

## 项目结构
```
claude-web/
├── app.js              # 主服务器文件（WebSocket + HTTP）
├── inject.js           # Cursor注入脚本（双向通信）
├── public/
│   ├── index.html     # 主页面（现代化UI）
│   ├── style.css      # 样式文件（暗色主题）
│   └── client.js      # 前端逻辑（双向同步）
├── package.json       # 项目配置
├── README.md         # 说明文档
└── TESTING.md        # 测试指南
```

## 开发说明

### 自定义样式
所有AI界面相关的样式都在`public/style.css`中以`ai-`前缀定义。

### 添加新功能
在`public/client.js`的`CursorRemoteClient`类中添加新方法。

### 修改界面
在`public/index.html`中修改AI助手标签页的HTML结构。

## 浏览器支持
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 许可证
MIT License

## 贡献
欢迎提交Issue和Pull Request！ 