# Cursor Web 测试套件

本目录包含了 Cursor Web 系统的完整测试套件，提供了统一的测试管理和执行框架。

## 目录结构

```
tests/
├── README.md                 # 本文档
├── test-manager.js           # 测试管理器（主入口）
├── test-config.js            # 测试配置文件
├── test-utils.js             # 测试工具类
├── comprehensive-test.js     # 综合测试
├── message-send-test.js      # 消息发送测试
├── run-all-tests.js          # 批量测试运行器
├── send-receive-poll.js      # 发送接收轮询测试
└── ws-routing-test.js        # WebSocket路由测试
```

## 测试套件说明

### 1. 基础测试套件
- **文件**: `../simple-send-test.js`
- **功能**: 基本的消息发送和接收功能测试
- **优先级**: 高

### 2. 多实例测试套件
- **文件**: `../multi-instance-test.js`
- **功能**: 多个WebSocket实例间的消息路由测试
- **优先级**: 高
- **特性**: 支持自定义实例配置，详细的统计报告

### 3. 高级路由测试套件
- **文件**: `../advanced-routing-test.js`
- **功能**: 复杂路由场景测试，包括点对点、广播、错误处理
- **优先级**: 高

### 4. WebSocket测试套件
- **文件**: `ws-routing-test.js`
- **功能**: WebSocket连接和路由的专项测试
- **优先级**: 中

### 5. 端到端测试套件
- **文件**: `../end-to-end-test.js`
- **功能**: 完整的端到端功能测试
- **优先级**: 中

### 6. 性能测试套件
- **文件**: `../auto-test-send.js`
- **功能**: 自动化性能和压力测试
- **优先级**: 低

## 快速开始

### 运行所有测试

```bash
# 使用测试管理器运行所有启用的测试
node tests/test-manager.js

# 或者使用npm脚本（如果已配置）
npm test
```

### 运行特定测试套件

```bash
# 运行多实例测试
node tests/test-manager.js multi-instance

# 运行高级路由测试
node tests/test-manager.js advanced-routing

# 运行WebSocket测试
node tests/test-manager.js websocket
```

### 查看可用测试套件

```bash
node tests/test-manager.js --list
```

## 配置说明

### 服务器配置

在 `test-config.js` 中可以配置：

```javascript
server: {
    host: 'localhost',
    port: 3000,
    wsPort: 3000,
    baseUrl: 'http://localhost:3000',
    wsUrl: 'ws://localhost:3000'
}
```

### 超时配置

```javascript
timeouts: {
    connection: 5000,      // WebSocket连接超时
    message: 10000,        // 消息等待超时
    test: 30000,          // 单个测试超时
    suite: 300000         // 测试套件超时
}
```

### 多实例测试配置

```javascript
multiInstance: {
    instances: [
        { id: 'test-instance-1', role: 'cursor' },
        { id: 'test-instance-2', role: 'cursor' },
        { id: 'default', role: 'cursor' }
    ],
    testMessages: [
        // 测试消息配置
    ]
}
```

## 测试报告

测试完成后会生成以下报告：

- **JSON格式**: `test-suite-report.json` - 机器可读的详细报告
- **HTML格式**: `test-suite-report.html` - 人类友好的可视化报告

### 报告内容包括：

- 测试总数、通过数、失败数
- 成功率统计
- 每个测试的详细结果
- 错误信息和堆栈跟踪
- 执行时间统计
- 环境信息

## 工具类使用

`TestUtils` 类提供了常用的测试辅助功能：

```javascript
const TestUtils = require('./test-utils');

// 创建WebSocket连接
const ws = await TestUtils.createWebSocketConnection('test-instance', 'cursor');

// 发送消息并等待确认
const result = await TestUtils.sendMessageAndWait(ws, {
    type: 'user_message',
    fromInstance: 'test-instance-1',
    toInstance: 'test-instance-2',
    content: 'Hello'
});

// 生成测试报告
await TestUtils.generateTestReport(results, './report.json');
```

## 开发指南

### 添加新的测试套件

1. 在 `test-manager.js` 的 `testSuites` 中添加配置：

```javascript
'new-test': {
    name: '新测试套件',
    description: '测试描述',
    file: '../new-test.js',
    priority: 'medium',
    enabled: true
}
```

2. 如果需要特殊的运行逻辑，在 `runSpecificTest` 方法中添加处理：

```javascript
case 'new-test':
    return await this.runNewTest(suite);
```

### 测试最佳实践

1. **使用配置文件**: 所有可配置的参数都应该放在 `test-config.js` 中
2. **使用工具类**: 复用 `TestUtils` 中的通用功能
3. **错误处理**: 确保所有异步操作都有适当的错误处理
4. **资源清理**: 测试结束后清理WebSocket连接等资源
5. **详细日志**: 提供足够的日志信息用于调试

### 调试技巧

1. **启用详细模式**:
   ```bash
   DEBUG=true node tests/test-manager.js
   ```

2. **查看服务器日志**: 确保服务器正在运行并检查日志输出

3. **单独运行测试**: 先单独运行有问题的测试套件

4. **检查网络连接**: 确保WebSocket连接正常

## 故障排除

### 常见问题

1. **连接超时**
   - 检查服务器是否运行
   - 检查端口是否正确
   - 增加超时时间

2. **消息路由失败**
   - 检查实例ID是否正确
   - 检查角色配置
   - 查看服务器路由日志

3. **测试不稳定**
   - 增加等待时间
   - 检查并发测试冲突
   - 确保资源正确清理

### 获取帮助

如果遇到问题，请：

1. 查看测试报告中的错误信息
2. 检查服务器日志
3. 运行单个测试套件进行调试
4. 查看相关的测试文档

## 更新日志

- **v1.0.0**: 初始版本，包含基础测试套件
- **v1.1.0**: 添加测试管理器和统一配置
- **v1.2.0**: 添加工具类和HTML报告生成
- **v1.3.0**: 优化多实例测试和错误处理