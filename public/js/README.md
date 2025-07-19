# Simple Web Client - 模块化重构

## 概述

这是一个模块化的Web客户端重构版本，将原来的单一文件拆分为多个功能明确、职责单一的模块。

## 模块结构

### 核心模块

#### 1. WebSocketManager.js
**职责**: WebSocket连接管理
- WebSocket连接建立和维护
- 自动重连机制
- 心跳检测
- 消息发送
- 连接状态管理

**主要方法**:
- `connect()` - 建立连接
- `send(message)` - 发送消息
- `isConnected()` - 检查连接状态
- `manualReconnect()` - 手动重连

#### 2. ContentManager.js
**职责**: 内容管理
- 内容更新处理
- 内容变化检测
- 清理时间戳管理
- 内容状态维护

**主要方法**:
- `handleContentUpdate(contentData)` - 处理内容更新
- `handleClearContent(data)` - 处理内容清理
- `setClearTimestamp(timestamp)` - 设置清理时间戳
- `getCurrentContent()` - 获取当前内容

#### 3. StatusManager.js
**职责**: 状态管理
- 连接状态检查
- 内容轮询（备用方案）
- 定时器管理
- 状态更新

**主要方法**:
- `startStatusCheck()` - 开始状态检查
- `startContentPolling()` - 开始内容轮询
- `checkCursorStatus()` - 检查Cursor状态
- `stopAll()` - 停止所有定时器

#### 4. UIManager.js
**职责**: 用户界面管理
- DOM操作
- 内容显示
- 样式应用
- 滚动控制
- 通知显示

**主要方法**:
- `displayContent(contentData)` - 显示内容
- `updateStatus(message, type)` - 更新状态
- `scrollToBottom(container)` - 滚动到底部
- `showClearNotification()` - 显示清理通知

#### 5. EventManager.js
**职责**: 事件管理
- 事件绑定和解绑
- 用户交互处理
- 全局事件管理
- 事件清理

**主要方法**:
- `init()` - 初始化所有事件
- `bindSendMessageEvents()` - 绑定发送消息事件
- `bindClearEvents()` - 绑定清除事件
- `unbindAllEvents()` - 解绑所有事件

#### 6. DebugManager.js
**职责**: 调试功能
- 调试工具函数
- 状态信息获取
- 全局调试命令
- 错误诊断

**主要方法**:
- `setupGlobalDebugFunctions()` - 设置全局调试函数
- `getClientStatus()` - 获取客户端状态
- `printDetailedDebugInfo()` - 打印详细调试信息

### 主控制器

#### SimpleWebClient.js
**职责**: 主控制器
- 模块协调
- 回调函数设置
- 整体流程控制
- 公共API提供

**主要方法**:
- `init()` - 初始化客户端
- `cleanup()` - 清理资源
- `getStatus()` - 获取状态
- `forceClear()` - 强制清除
- `reconnect()` - 手动重连

### 模块加载器

#### module-loader.js
**职责**: 模块加载管理
- 依赖关系管理
- 按顺序加载模块
- 模块可用性检查
- 错误处理

## 使用方法

### 1. 基本使用

在HTML中引入模块加载器：

```html
<script src="js/modules/module-loader.js"></script>
```

模块加载器会自动按正确顺序加载所有模块，然后初始化主客户端。

### 2. 调试功能

重构后提供了更丰富的调试功能：

```javascript
// 查看Web客户端状态
debugWebClient();

// 查看清理状态
debugClearStatus();

// 查看连接状态
debugConnection();

// 查看内容状态
debugContent();

// 强制清除所有内容
forceClear();
```

### 3. 编程接口

```javascript
// 获取客户端实例
const client = window.simpleClient;

// 检查连接状态
if (client.isConnected()) {
    console.log('已连接');
}

// 发送消息
client.sendMessage('Hello World');

// 获取状态信息
const status = client.getStatus();
console.log(status);

// 强制清除
client.forceClear();

// 手动重连
client.reconnect();
```

## 模块依赖关系

```
SimpleWebClient
├── WebSocketManager
├── ContentManager
├── StatusManager
├── UIManager
├── EventManager
│   ├── WebSocketManager
│   ├── ContentManager
│   └── UIManager
└── DebugManager
    ├── WebSocketManager
    ├── ContentManager
    └── UIManager
```

## 优势

1. **职责分离**: 每个模块都有明确的职责，便于维护和测试
2. **可扩展性**: 新功能可以通过添加新模块或扩展现有模块实现
3. **可测试性**: 每个模块都可以独立测试
4. **可重用性**: 模块可以在其他项目中重用
5. **代码组织**: 代码结构更清晰，便于理解和维护
6. **错误隔离**: 单个模块的错误不会影响其他模块

## 迁移指南

从原来的 `simple-client.js` 迁移到新版本：

1. 替换HTML中的脚本引用：
   ```html
   <!-- 旧版本 -->
   <script src="simple-client.js"></script>

   <!-- 新版本 -->
   <script src="js/modules/module-loader.js"></script>
   ```

2. 更新调试命令调用（如果有的话）
3. 更新自定义事件处理（如果有的话）

## 注意事项

1. 确保所有模块文件都在正确的路径下
2. 模块加载器会自动处理依赖关系
3. 如果某个模块加载失败，整个客户端将无法初始化
4. 调试功能在开发环境中使用，生产环境可以移除

## 故障排除

### 模块加载失败
- 检查文件路径是否正确
- 检查浏览器控制台是否有错误信息
- 确认所有模块文件都存在

### 功能异常
- 使用调试命令检查各模块状态
- 检查WebSocket连接状态
- 查看浏览器控制台错误信息

### 性能问题
- 检查是否有内存泄漏（使用浏览器开发工具）
- 确认定时器是否正确清理
- 检查事件监听器是否正确解绑
