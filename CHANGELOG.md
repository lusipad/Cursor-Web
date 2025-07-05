# 变更日志

本文档记录了项目的所有重要变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

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

- `新增` - 新功能
- `修改` - 对现有功能的修改
- `弃用` - 即将删除的功能
- `移除` - 已删除的功能
- `修复` - 错误修复
- `安全` - 安全相关修复
