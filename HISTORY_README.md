# Cursor 历史记录浏览器

现代化的 Cursor 聊天记录查看工具，基于 cursor-view-main 的设计思路实现。

## 功能特性

### 🏗️ 分层设计架构
- **目录-workspace-session 分层设计**
- **智能项目识别**：自动从 workspace 数据库提取项目信息
- **工作区关联**：将聊天记录与具体项目工作区关联

### 🔍 数据获取
- **全面数据库搜索**：自动发现所有 SQLite 数据库文件
- **多级目录扫描**：
  - `globalStorage` - 全局存储
  - `workspaceStorage` - 工作区存储
  - `extensions` - 扩展存储
- **智能项目识别**：从工作区数据库提取项目名称和路径

### 🎨 现代 UI 设计
- **Material-UI 组件库**：现代化的用户界面
- **响应式设计**：支持桌面和移动设备
- **项目分组视图**：按项目组织聊天记录
- **实时搜索**：快速查找聊天记录
- **详情页**：完整的对话查看体验

### 📤 导出功能
- **HTML 格式**：美观的网页导出
- **JSON 格式**：结构化数据导出
- **批量导出**：支持单个或批量聊天记录导出

## 项目结构

```
Cursor-Web/
├── services/
│   └── historyService.js          # 核心业务逻辑层
├── routes/
│   └── historyRoutes.js           # API 路由层
├── frontend/
│   ├── src/
│   │   ├── App.js                 # 主应用组件
│   │   ├── components/
│   │   │   ├── ChatList.js        # 聊天列表组件
│   │   │   └── ChatDetail.js      # 聊天详情组件
│   │   └── index.js               # 应用入口
│   └── package.json               # 前端依赖
├── public/
│   ├── css/
│   │   └── history-styles.css     # 样式文件
│   └── js/
│       └── modules/
│           └── HistoryManager.js  # 历史管理器
└── HISTORY_README.md              # 历史记录功能文档
```

## 快速开始

### 1. 安装依赖

#### 后端依赖
```bash
npm install express sql.js cors
```

#### 前端依赖
```bash
cd frontend
npm install
```

### 2. 启动应用

#### 启动后端服务
```bash
node server.js
```
服务将在 http://localhost:3001 启动

#### 启动前端开发服务器
```bash
cd frontend
npm start
```
前端将在 http://localhost:3000 启动

### 3. 访问应用

打开浏览器访问 http://localhost:3000 即可使用历史记录浏览器。

## API 接口

### 获取所有聊天记录
```
GET /api/history/chats
```

### 获取特定聊天详情
```
GET /api/history/chat/:sessionId
```

### 搜索聊天记录
```
GET /api/history/search?query=关键词
```

### 导出聊天记录
```
GET /api/history/chat/:sessionId/export?format=html|json
```

### 获取工作区列表
```
GET /api/history/workspaces
```

## 数据模型

### 聊天会话 (Chat Session)
```javascript
{
  sessionId: "string",           // 会话唯一标识
  title: "string",              // 会话标题
  preview: "string",            // 预览内容
  messages: [Message],          // 消息列表
  project: {
    name: "string",             // 项目名称
    rootPath: "string"          // 项目根路径
  },
  workspaceId: "string",        // 工作区ID
  lastModified: "timestamp",    // 最后修改时间
  formattedTime: "string"       // 格式化时间
}
```

### 消息 (Message)
```javascript
{
  role: "user|assistant",       // 消息角色
  content: "string",            // 消息内容
  timestamp: "timestamp",       // 消息时间戳
  formattedTime: "string"       // 格式化时间
}
```

## 项目特色

### 1. 智能项目识别
从工作区数据库自动提取项目名称，避免手动配置：

- 分析 `history.entries` 获取文件路径
- 提取 `debug.selectedroot` 项目根路径  
- 读取 Git 仓库信息
- 路径智能清理和规范化

### 2. 全面的数据库发现
自动发现和扫描所有可能的 SQLite 数据库：

- **全局存储**：用户全局设置和配置
- **工作区存储**：项目特定的数据和缓存
- **扩展存储**：扩展相关的数据

### 3. 现代化的用户体验
- **Material-UI 设计系统**：一致的设计语言
- **响应式布局**：适配各种屏幕尺寸
- **实时交互**：流畅的用户交互体验
- **项目分组**：按项目组织聊天记录

### 4. 高性能数据处理
- **缓存机制**：减少重复数据库读取
- **分页加载**：大量数据的分页处理
- **索引优化**：快速搜索和过滤

## 开发指南

### 添加新的数据源
在 `historyService.js` 中扩展 `findAllSessionDbs` 方法：

```javascript
const newSearchPaths = [
  path.join(cursorRoot, 'new', 'path'),
  // 添加更多路径
];
```

### 自定义项目识别
修改 `getProjectInfoFromWorkspace` 方法：

```javascript
// 添加新的项目信息提取逻辑
const newProjectData = db.exec("SELECT ... FROM ...");
```

### 扩展导出格式
在 `historyRoutes.js` 中添加新的导出格式：

```javascript
// 在 exportChat 方法中添加新的格式支持
if (format === 'new-format') {
  // 实现新的导出逻辑
}
```

## 技术栈

- **后端**：Node.js + Express + SQLite
- **前端**：React + Material-UI
- **数据库**：SQLite (sql.js)
- **样式**：Material-UI + CSS-in-JS
- **构建工具**：Create React App

## 性能优化

### 1. 缓存策略
- **会话缓存**：5分钟缓存过期
- **工作区缓存**：项目信息本地缓存
- **响应缓存**：API响应级别的缓存

### 2. 数据优化
- **延迟加载**：按需加载聊天记录
- **分页处理**：大量数据的分页展示
- **索引优化**：基于时间戳的排序优化

### 3. 用户体验优化
- **骨架屏**：加载状态的占位符
- **错误处理**：友好的错误提示
- **离线支持**：基础功能的离线使用

## 故障排除

### 常见问题

1. **找不到 Cursor 目录**
   - 确保已安装 Cursor
   - 检查用户主目录下的 `AppData/Roaming/Cursor`

2. **数据库文件未找到**
   - 确认 Cursor 已使用过聊天功能
   - 检查是否有 `.sqlite` 或 `.vscdb` 文件

3. **项目识别不准确**
   - 检查工作区数据库是否完整
   - 确认项目路径是否正确

### 调试模式
```bash
# 启用调试日志
DEBUG=cursor-history:* npm start
```

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发规范
- 遵循 ESLint 配置
- 使用 Prettier 格式化代码
- 添加适当的测试用例
- 更新相关文档

### 提交规范
- 使用语义化提交信息
- 添加详细的变更描述
- 更新版本号和变更日志

## 许可证

MIT License - 详见 LICENSE 文件