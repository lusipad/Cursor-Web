# Cursor Web 系统测试指南

## 概述

本项目提供了完整的测试套件，用于验证 Cursor Web 系统的各项功能。测试覆盖了 WebSocket 连接、消息传递、注入脚本、API 接口等核心功能。

## 测试类型

### 1. 综合测试 (Comprehensive Test)
- **文件**: `tests/comprehensive-test.js`
- **用途**: 全面测试系统的所有核心功能
- **覆盖范围**:
  - HTTP 服务器连接
  - API 接口响应
  - WebSocket 连接和注册
  - 消息发送功能
  - 注入脚本文件完整性
  - 静态文件访问
  - POST API 功能

### 2. WebSocket 路由测试
- **文件**: `tests/ws-routing-test.js`
- **用途**: 专门测试 WebSocket 消息路由功能

### 3. 单元测试
- **文件**: `tests/run-all-tests.js`
- **用途**: 运行单元测试和集成测试

## 运行测试

### 前提条件

1. **启动服务器**
   ```bash
   npm run dev
   ```
   确保服务器在 `http://localhost:3000` 运行

2. **启动注入服务** (可选)
   ```bash
   npm run inject
   ```
   用于测试 Cursor 注入功能

### 测试命令

#### 快速测试 (推荐)
```bash
npm test
```
这将运行完整的综合测试套件，并生成详细报告。

#### 直接运行综合测试
```bash
npm run test:comprehensive
```

#### WebSocket 专项测试
```bash
npm run test:ws
```

#### 单元测试
```bash
npm run test:unit
```

#### 集成测试
```bash
npm run test:integration
```

#### 使用测试启动器
```bash
node run-test.js
```

## 测试报告

### 控制台输出
测试运行时会在控制台显示实时结果：
- ✅ **PASS**: 测试通过
- ❌ **FAIL**: 测试失败

### 测试报告文件
综合测试完成后会生成 `tests/test-report.json` 文件，包含：
- 测试总结统计
- 详细的测试结果
- 时间戳信息

### 报告示例
```
📊 测试报告
==================================================
总测试数: 15
通过: 13
失败: 2
成功率: 86.7%

❌ 失败的测试:
  - API状态接口: 错误: 404 Not Found
  - POST API: 错误: 500 Internal Server Error
```

## 测试功能详解

### 1. 服务器连接测试
- 验证 HTTP 服务器是否正常响应
- 检查基本的网络连接

### 2. API 接口测试
- `/api/test` - 测试接口
- `/api/status` - 状态查询
- `/api/inject/processes` - 注入进程信息
- `/api/history/chats` - 聊天历史

### 3. WebSocket 功能测试
- 连接建立
- 客户端注册
- 消息发送和接收
- 连接状态管理

### 4. 注入脚本测试
- `public/cursor-browser.js` - 主注入脚本
- `public/inject-lite.js` - 轻量注入脚本
- `scripts/auto-inject-cursor.js` - 自动注入脚本
- 验证脚本文件完整性和关键功能

### 5. 静态文件测试
- HTML 页面访问
- CSS 样式文件
- JavaScript 客户端脚本
- 注入脚本文件

## 故障排除

### 常见问题

1. **服务器连接失败**
   - 确保运行 `npm run dev`
   - 检查端口 3000 是否被占用
   - 验证防火墙设置

2. **WebSocket 连接失败**
   - 检查 WebSocket 服务是否启动
   - 验证端口配置
   - 查看服务器日志

3. **API 接口测试失败**
   - 检查路由配置
   - 验证中间件设置
   - 查看错误日志

4. **注入脚本测试失败**
   - 确保脚本文件存在
   - 检查文件权限
   - 验证脚本语法

### 调试技巧

1. **查看详细日志**
   ```bash
   DEBUG=* npm test
   ```

2. **单独测试特定功能**
   ```bash
   node tests/comprehensive-test.js
   ```

3. **检查服务器状态**
   ```bash
   curl http://localhost:3000/api/status
   ```

4. **验证 WebSocket 连接**
   ```bash
   wscat -c ws://localhost:3000
   ```

## 自定义测试

### 添加新测试

1. 在 `tests/comprehensive-test.js` 中添加新的测试方法
2. 在 `runAllTests()` 方法中调用新测试
3. 更新测试文档

### 测试配置

可以通过修改 `CursorWebTester` 类的构造函数来调整：
- 服务器 URL
- WebSocket URL
- 超时时间
- 测试实例 ID

## 持续集成

### GitHub Actions (示例)
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run dev &
      - run: sleep 5
      - run: npm test
```

## 性能测试

### 负载测试
可以修改测试脚本来进行负载测试：
- 增加并发连接数
- 发送大量消息
- 测试长时间运行稳定性

### 内存泄漏检测
```bash
node --inspect tests/comprehensive-test.js
```

## 贡献指南

1. 添加新功能时，请同时添加相应的测试
2. 确保所有测试通过后再提交代码
3. 更新测试文档以反映新的测试内容
4. 遵循现有的测试代码风格和命名约定

---

**注意**: 测试过程中可能会产生临时文件和连接，测试完成后会自动清理。如果测试异常中断，可能需要手动清理相关资源。