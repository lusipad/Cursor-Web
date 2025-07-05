# 贡献指南

感谢您对 Cursor AI Chat Sync 项目的关注！我们欢迎各种形式的贡献。

## 如何贡献

### 报告问题
- 使用 GitHub Issues 报告 bug
- 提供详细的重现步骤
- 包含相关的错误信息和截图

### 功能请求
- 在 Issues 中描述您想要的功能
- 说明为什么这个功能很有用
- 提供可能的实现方案

### 代码贡献
1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 开发环境设置

### 前置要求
- Node.js 18.x 或更高版本
- npm 或 yarn 包管理器
- Git

### 本地开发
```bash
# 克隆项目
git clone https://github.com/your-username/cursor-ai-chat-sync.git
cd cursor-ai-chat-sync

# 安装依赖
npm install

# 启动开发服务器
npm start
```

### 项目结构
```
claude-web/
├── app.js          # 主服务器文件
├── inject.js       # Cursor 注入脚本
├── package.json    # 项目配置
├── public/         # 前端静态文件
│   ├── index.html  # 主页面
│   ├── client.js   # 客户端脚本
│   └── style.css   # 样式文件
└── README.md       # 项目说明
```

## 代码规范

### JavaScript 规范
- 使用 2 空格缩进
- 使用单引号
- 语句结尾使用分号
- 遵循 ESLint 配置

### 提交信息规范
- 使用清晰的提交信息
- 格式：`type(scope): description`
- 类型：feat, fix, docs, style, refactor, test, chore

示例：
```
feat(sync): add real-time message synchronization
fix(ui): resolve responsive layout issues
docs(readme): update installation instructions
```

## 测试

### 运行测试
```bash
npm test
```

### 测试覆盖率
```bash
npm run test:coverage
```

## 发布流程

1. 确保所有测试通过
2. 更新版本号
3. 更新 CHANGELOG.md
4. 创建 tag
5. 推送到主分支

## 问题和支持

如果您在贡献过程中遇到问题，请：
1. 查看现有的 Issues
2. 查看文档和 README
3. 创建新的 Issue 寻求帮助

## 许可证

通过贡献此项目，您同意您的贡献将在 MIT 许可证下授权。

---

再次感谢您的贡献！🙏
