# Cursor Web 架构重构说明

## 重构目标

将原来的单页面Tab切换架构改为多页面独立架构，避免一个功能模块出现问题影响整个应用。

## 架构变化

### 原来架构（单页面Tab）
```
index.html (包含所有Tab)
├── 聊天 Tab
├── 历史记录 Tab  
├── 实例管理 Tab
├── Git管理 Tab
└── 系统诊断 Tab
```

**问题：**
- 所有功能在同一个页面，JavaScript模块相互依赖
- 一个模块出错可能影响整个应用
- 页面加载时间长，包含所有功能的代码
- 内存占用大

### 新架构（多页面独立）
```
index.html (导航首页)
├── chat.html (聊天页面)
├── history-new.html (历史记录页面)
├── instances-standalone.html (实例管理页面)
├── git.html (Git管理页面)
└── diagnostic-standalone.html (系统诊断页面)
```

**优势：**
- 每个页面只加载自己需要的功能模块
- 模块间完全隔离，一个页面出错不影响其他页面
- 页面加载更快，按需加载
- 内存占用更少
- 便于维护和调试

## 页面说明

### 1. 导航首页 (`index.html`)
- 功能：提供功能导航和快速操作
- 特点：轻量级，只包含导航逻辑
- 依赖：`instance-utils.js`, `instance-banner.js`

### 2. 聊天页面 (`chat.html`)
- 功能：与Cursor进行实时对话
- 特点：完整的聊天功能，支持Markdown渲染
- 依赖：`marked.js`, `module-loader.js`, `InjectBar.js`, `AuditLogger.js`

### 3. 历史记录页面 (`history-new.html`)
- 功能：查看和管理聊天历史
- 特点：独立的历史记录管理
- 依赖：`instance-utils.js`

### 4. 实例管理页面 (`instances-standalone.html`)
- 功能：管理Cursor实例和注入状态
- 特点：独立的实例管理功能
- 依赖：`instances-tab.js`, `instance-utils.js`

### 5. Git管理页面 (`git.html`)
- 功能：管理Git分支和代码版本
- 特点：独立的Git操作界面
- 依赖：`git-manager.js`, `instance-utils.js`

### 6. 系统诊断页面 (`diagnostic-standalone.html`)
- 功能：检查系统状态和连接情况
- 特点：独立的诊断工具
- 依赖：`DiagnosticQuickStatus.js`, `instance-utils.js`

## 技术实现

### 1. 页面间通信
- 通过URL参数传递实例信息：`?instance=xxx`
- 使用`instance-utils.js`统一管理实例状态
- 通过localStorage共享配置信息

### 2. 模块加载策略
- 每个页面只加载必要的JavaScript模块
- 使用动态加载避免不必要的依赖
- 保持模块间的松耦合

### 3. 样式管理
- 共享`style.css`保持UI一致性
- 每个页面可以有自己的专用样式
- 响应式设计适配不同屏幕

## 部署说明

### 1. 文件结构
```
public/
├── index.html (导航首页)
├── chat.html (聊天页面)
├── git.html (Git管理页面)
├── instances-standalone.html (实例管理页面)
├── diagnostic-standalone.html (系统诊断页面)
├── history-new.html (历史记录页面)
├── style.css (共享样式)
└── js/ (JavaScript模块)
```

### 2. 路由配置
- 所有页面都通过Express静态文件服务提供
- 无需额外的路由配置
- 支持直接访问各个功能页面

### 3. 实例管理
- 每个页面都支持实例选择
- 通过`instance-utils.js`统一管理
- 支持URL参数传递实例信息

## 使用方式

### 1. 访问方式
- 首页：`http://localhost:3000/`
- 聊天：`http://localhost:3000/chat.html`
- Git管理：`http://localhost:3000/git.html`
- 实例管理：`http://localhost:3000/instances-standalone.html`
- 系统诊断：`http://localhost:3000/diagnostic-standalone.html`
- 历史记录：`http://localhost:3000/history-new.html`

### 2. 实例切换
- 在任何页面都可以通过URL参数切换实例：`?instance=xxx`
- 实例信息会在页面间保持同步
- 支持通过实例选择页面进行切换

## 维护建议

### 1. 模块开发
- 新功能建议创建独立的页面
- 保持模块间的低耦合
- 共享功能提取到公共模块

### 2. 错误处理
- 每个页面独立处理自己的错误
- 使用try-catch包装关键操作
- 提供友好的错误提示

### 3. 性能优化
- 按需加载JavaScript模块
- 避免在页面间传递大量数据
- 合理使用缓存机制

## 总结

通过这次重构，我们实现了：
1. **模块化架构**：每个功能独立运行，互不影响
2. **更好的性能**：按需加载，减少内存占用
3. **易于维护**：模块独立，便于开发和调试
4. **用户体验**：页面加载更快，功能更稳定

这种架构更适合生产环境使用，能够提供更稳定可靠的服务。
