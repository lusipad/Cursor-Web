# Simple Web Client 迁移指南

## 概述

本指南将帮助您从原来的单一文件 `simple-client.js` 迁移到新的模块化架构。

## 迁移步骤

### 1. 备份原文件

首先备份您当前的 `simple-client.js` 文件：

```bash
cp public/simple-client.js public/simple-client.js.backup
```

### 2. 更新HTML文件

在您的HTML文件中，将原来的脚本引用：

```html
<!-- 旧版本 -->
<script src="simple-client.js"></script>
```

替换为：

```html
<!-- 新版本 -->
<script src="js/modules/module-loader.js"></script>
```

### 3. 验证文件结构

确保您有以下文件结构：

```
public/
├── js/
│   ├── modules/
│   │   ├── module-loader.js
│   │   ├── WebSocketManager.js
│   │   ├── ContentManager.js
│   │   ├── StatusManager.js
│   │   ├── UIManager.js
│   │   ├── EventManager.js
│   │   └── DebugManager.js
│   ├── SimpleWebClient.js
│   ├── README.md
│   └── test-modules.html
└── simple-client.js.backup
```

### 4. 测试新版本

1. 打开浏览器开发者工具
2. 访问您的应用
3. 检查控制台是否有错误信息
4. 验证所有功能是否正常工作

### 5. 更新自定义代码（如果有）

如果您在原版本中有自定义代码，需要相应更新：

#### 旧版本的自定义代码：

```javascript
// 旧版本
window.simpleClient.ws.send(JSON.stringify({ type: 'custom_message', data: 'hello' }));
```

#### 新版本的自定义代码：

```javascript
// 新版本
window.simpleClient.sendMessage('hello');
// 或者
window.simpleClient.wsManager.send({ type: 'custom_message', data: 'hello' });
```

## 功能对比

| 功能 | 旧版本 | 新版本 |
|------|--------|--------|
| WebSocket连接 | `simpleClient.ws` | `simpleClient.wsManager` |
| 发送消息 | `simpleClient.ws.send()` | `simpleClient.sendMessage()` |
| 检查连接 | `simpleClient.ws.readyState` | `simpleClient.isConnected()` |
| 强制清除 | `forceClear()` | `simpleClient.forceClear()` |
| 手动重连 | 手动调用 `connectWebSocket()` | `simpleClient.reconnect()` |
| 调试功能 | 全局函数 | 全局函数（保持不变） |

## 新功能

### 1. 更好的状态管理

```javascript
// 获取完整状态信息
const status = window.simpleClient.getStatus();
console.log(status);
```

### 2. 模块化访问

```javascript
// 直接访问各个管理器
const wsManager = window.simpleClient.wsManager;
const contentManager = window.simpleClient.contentManager;
const uiManager = window.simpleClient.uiManager;
```

### 3. 增强的调试功能

```javascript
// 新增的调试命令
debugConnection();  // 查看连接状态
debugContent();     // 查看内容状态
```

## 常见问题

### Q: 模块加载失败怎么办？

A: 检查以下几点：
1. 确保所有模块文件都在正确的路径下
2. 检查浏览器控制台是否有404错误
3. 确认文件权限正确

### Q: 功能不工作怎么办？

A: 使用调试命令检查状态：
```javascript
debugWebClient();
debugConnection();
debugContent();
```

### Q: 如何回滚到旧版本？

A: 恢复备份文件并更新HTML：
```html
<script src="simple-client.js"></script>
```

### Q: 新版本会影响性能吗？

A: 新版本经过优化，性能应该与旧版本相当或更好。模块化架构有助于更好的代码分割和缓存。

## 测试清单

迁移完成后，请测试以下功能：

- [ ] 页面正常加载
- [ ] WebSocket连接正常
- [ ] 内容同步正常
- [ ] 清除功能正常
- [ ] 重连功能正常
- [ ] 调试命令正常
- [ ] 没有控制台错误

## 支持

如果在迁移过程中遇到问题，请：

1. 检查浏览器控制台错误信息
2. 使用调试命令获取状态信息
3. 参考 `README.md` 文档
4. 查看 `test-modules.html` 测试页面

## 版本兼容性

新版本与旧版本在API层面保持兼容，但建议使用新的模块化接口以获得更好的可维护性。
