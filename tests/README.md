# 测试目录

这个目录包含了项目的各种测试脚本，按类型进行了分类。

## 目录结构

```
tests/
├── unit/           # 单元测试
│   ├── test-git.js              # Git基础功能测试
│   └── test-remote-branch.js    # 远程分支功能测试
├── integration/    # 集成测试
│   ├── test-checkout.js         # 分支切换集成测试
│   ├── test-dynamic-git.js      # 动态Git路径集成测试
│   └── test-refresh-branches.js # 远程分支刷新测试
├── run-all-tests.js # 测试运行器
└── README.md       # 本文件
```

## 测试类型说明

### 单元测试 (unit/)
- **test-git.js**: 测试Git基础功能，包括分支获取、状态检查等
- **test-remote-branch.js**: 测试远程分支相关功能

### 集成测试 (integration/)
- **test-checkout.js**: 测试通过HTTP API进行分支切换的完整流程
- **test-dynamic-git.js**: 测试动态Git路径功能，包括健康检查、分支信息获取等
- **test-refresh-branches.js**: 测试远程分支刷新功能，验证git fetch的正确执行

## 运行测试

### 运行所有单元测试
```bash
node tests/unit/test-git.js
node tests/unit/test-remote-branch.js
```

### 运行所有集成测试
```bash
# 首先启动服务器
npm start

# 然后在另一个终端运行测试
node tests/integration/test-checkout.js
node tests/integration/test-dynamic-git.js
```

### 运行特定测试
```bash
# 运行Git基础功能测试
node tests/unit/test-git.js

# 运行分支切换测试
node tests/integration/test-checkout.js
```

## 注意事项

1. **集成测试需要服务器运行**: 集成测试需要先启动Web服务器（默认端口3000）
2. **Git仓库要求**: 确保在Git仓库目录中运行测试
3. **依赖安装**: 确保已安装所有必要的npm依赖

## 测试脚本说明

- 所有测试脚本都可以独立运行
- 测试脚本会输出详细的日志信息
- 如果测试失败，会显示具体的错误信息
