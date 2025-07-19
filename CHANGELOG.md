# 变更日志

本文档记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## 最新更新 (v2.1.0)

**测试套件重构** - 重新组织了项目的测试结构，提供了完整的测试管理解决方案：
- 🧪 按类型分类的测试目录结构
- 🚀 智能测试运行器
- 📚 详细的测试文档
- 🔧 简化的测试命令


### 新增
- 添加了 `.gitignore` 文件，忽略 node_modules 等文件
- 添加了 `.editorconfig` 文件，统一代码风格
- 添加了 `.gitattributes` 文件，配置 Git 属性
- 添加了 `.nvmrc` 文件，指定 Node.js 版本
- 添加了 VS Code 项目设置文件
- 添加了 MIT 许可证文件
- 添加了 GitHub Actions CI 工作流
- 添加了贡献指南文档
- 添加了变更日志文件

### 改进
- 重新组织了测试脚本结构，按类型分类到 `tests/` 目录
- 创建了单元测试目录 `tests/unit/` 和集成测试目录 `tests/integration/`
- 添加了测试运行器 `tests/run-all-tests.js`，支持运行所有测试或特定类型测试
- 创建了详细的测试文档 `tests/README.md`
- 更新了 `package.json` 中的测试脚本，添加了 `test:unit` 和 `test:integration` 命令
- 更新了主 README.md，添加了完整的测试指南和说明

### 重构
- 将 `test-git.js` 移动到 `tests/unit/test-git.js`
- 将 `test-remote-branch.js` 移动到 `tests/unit/test-remote-branch.js`
- 将 `test-checkout.js` 移动到 `tests/integration/test-checkout.js`
- 将 `test-dynamic-git.js` 移动到 `tests/integration/test-dynamic-git.js`
- 删除了根目录中的原始测试文件，保持项目结构整洁

## [2.1.0] - 2024-12-19

### 新增
- 完整的测试套件组织和管理系统
- 测试运行器支持批量运行和分类测试
- 详细的测试文档和使用指南

### 改进
- 测试脚本按功能类型重新组织
- 提供了多种测试运行方式
- 增强了项目的可维护性和可测试性

### 重构
- 测试文件结构优化，提高代码组织性
- 统一了测试运行接口

## [2.0.0] - 2024-12-XX

### 新增
- 实现了 Git 仓库管理功能
- 支持分支查看和切换
- 添加了代码同步功能
- 实现了动态 Git 路径检测
- 添加了健康检查 API

### 改进
- 优化了 WebSocket 连接稳定性
- 改进了错误处理机制
- 增强了用户界面响应性

## [1.0.0] - 2024-01-XX

### 新增
- 实现了 Cursor AI 对话同步功能
- 支持双向消息同步（Cursor ↔ Web）
- 实现了 WebSocket 实时通信
- 添加了现代化的 Web 界面
- 支持消息搜索和过滤
- 添加了连接状态指示器
- 实现了消息格式化和语法高亮
- 添加了自动重连机制

### 技术栈
- Node.js + Express 后端服务器
- WebSocket 实时通信
- 原生 JavaScript 前端
- CSS3 现代化样式
- Cursor 集成脚本注入

### 文件结构
- `app.js` - 主服务器文件
- `inject.js` - Cursor 注入脚本
- `public/` - 前端静态文件
  - `index.html` - 主页面
  - `client.js` - 客户端脚本
  - `style.css` - 样式文件
- `package.json` - 项目配置
- `README.md` - 项目说明

---

## 版本标签说明

- `新增` - 新功能或特性
- `改进` - 对现有功能的增强或优化
- `修改` - 对现有功能的修改
- `重构` - 代码结构重组，不改变功能
- `弃用` - 即将删除的功能
- `移除` - 已删除的功能
- `修复` - 错误修复
- `安全` - 安全相关修复
- `文档` - 文档更新或改进
