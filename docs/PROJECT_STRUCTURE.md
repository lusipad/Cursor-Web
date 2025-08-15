# 项目结构说明

本文档描述了重新整理后的项目目录结构，将测试代码、实际代码和文档进行了分离。

## 目录结构

```
Cursor-Web-2/
├── docs/                           # 📚 文档目录
│   ├── ARCHITECTURE_REFACTOR.md   # 架构重构文档
│   ├── CHANGELOG.md               # 更新日志
│   ├── CONTRIBUTING.md            # 贡献指南
│   ├── HISTORY_FEATURES.md        # 功能历史
│   ├── MESSAGE-SEND-TEST-REPORT.md # 消息发送测试报告
│   ├── PROJECT_STRUCTURE.md       # 项目结构说明（本文档）
│   ├── README.md                  # 项目说明
│   ├── README.assets/             # README资源文件
│   ├── TEST-GUIDE.md             # 测试指南
│   ├── TESTING.md                # 测试文档
│   └── USAGE.md                  # 使用说明
├── src/                           # 🔧 源代码目录
│   ├── app.js                    # 主应用入口
│   ├── config/                   # 配置文件
│   │   ├── index.js
│   │   ├── instances.json
│   │   └── serverConfig.js
│   ├── middleware/               # 中间件
│   │   ├── appMiddleware.js
│   │   └── cors.js
│   ├── routes/                   # 路由
│   │   ├── contentRoutes.js
│   │   ├── gitRoutes.js
│   │   ├── historyRoutes.js
│   │   ├── injectRoutes.js
│   │   └── instancesRoutes.js
│   ├── scripts/                  # 脚本文件
│   │   └── auto-inject-cursor.js
│   ├── services/                 # 服务层
│   │   ├── chatManager-fallback.js
│   │   ├── chatManager.js
│   │   ├── cursorHistoryManager-real.js
│   │   ├── gitService.js
│   │   ├── sqliteReader.js
│   │   └── websocketManager.js
│   └── utils/                    # 工具函数
│       ├── logger.js
│       ├── network.js
│       └── serverUtils.js
├── tests/                         # 🧪 测试目录
│   ├── README.md                 # 测试说明
│   ├── advanced-routing-test.js  # 高级路由测试
│   ├── auto-test-send.js         # 自动测试发送
│   ├── comprehensive-test.js     # 综合测试
│   ├── end-to-end-test.js        # 端到端测试
│   ├── feedback-diagnostic.js    # 反馈诊断
│   ├── message-send-test.js      # 消息发送测试
│   ├── mock-cursor-client.js     # 模拟Cursor客户端
│   ├── multi-instance-test.js    # 多实例测试
│   ├── run-all-tests.js          # 运行所有测试
│   ├── run-test.js               # 测试运行器
│   ├── send-receive-poll.js      # 发送接收轮询测试
│   ├── simple-send-test.js       # 简单发送测试
│   ├── test-config.js            # 测试配置
│   ├── test-manager.js           # 测试管理器
│   ├── test-message.json         # 测试消息
│   ├── test-report.json          # 测试报告
│   ├── test-utils.js             # 测试工具
│   └── ws-routing-test.js        # WebSocket路由测试
├── public/                        # 🌐 静态资源
│   ├── *.html                    # HTML页面
│   ├── *.js                      # 前端脚本
│   ├── style.css                 # 样式文件
│   └── js/                       # JavaScript模块
├── .github/                       # GitHub配置
├── .vs/                          # Visual Studio配置
├── .claude/                      # Claude配置
├── instances.json                # 实例配置
├── plan.md                       # 计划文档
├── package.json                  # 项目配置
├── package-lock.json             # 依赖锁定
└── 其他配置文件                   # .gitignore, .editorconfig等
```

## 目录说明

### 📚 docs/ - 文档目录
存放所有项目相关的文档，包括：
- 项目说明和使用指南
- 架构设计文档
- 测试指南和报告
- 更新日志和贡献指南

### 🔧 src/ - 源代码目录
存放所有核心应用代码，按功能模块组织：
- **app.js**: 主应用入口文件
- **config/**: 配置文件和设置
- **middleware/**: Express中间件
- **routes/**: API路由定义
- **services/**: 业务逻辑服务
- **utils/**: 通用工具函数
- **scripts/**: 自动化脚本

### 🧪 tests/ - 测试目录
存放所有测试相关文件：
- 单元测试
- 集成测试
- 端到端测试
- 测试工具和配置
- 模拟客户端

### 🌐 public/ - 静态资源
存放前端静态文件：
- HTML页面
- JavaScript脚本
- CSS样式
- 图片和其他资源

## 启动命令更新

重新组织后，启动命令已更新：

```bash
# 启动应用
npm start          # 运行 node src/app.js
npm run dev        # 运行 nodemon src/app.js

# 运行测试
npm test           # 运行 node tests/run-test.js
npm run test:comprehensive  # 运行综合测试

# 其他脚本
npm run inject     # 运行注入脚本
```

## 迁移说明

1. **文档整理**: 所有`.md`文件和`README.assets`移动到`docs/`目录
2. **代码整理**: 核心应用代码移动到`src/`目录，保持原有模块结构
3. **测试整理**: 所有测试文件移动到`tests/`目录
4. **路径更新**: `package.json`中的脚本路径已相应更新

这种结构使项目更加清晰，便于维护和开发。