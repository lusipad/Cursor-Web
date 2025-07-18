# 动态Git路径功能

## 概述

现在Claude Web支持动态Git路径功能，这意味着你可以从任意Git仓库目录启动服务器，它会自动检测并使用该目录的Git仓库。

## 功能特性

✅ **自动检测Git仓库** - 服务器启动时自动检测当前目录是否为Git仓库  
✅ **支持本地分支切换** - 可以切换到任意本地分支  
✅ **支持远程分支切换** - 可以切换到远程分支，自动创建本地分支  
✅ **动态路径管理** - 实时检测工作目录变化  
✅ **错误处理和提示** - 友好的错误信息和状态提示  
✅ **路径信息显示** - 在Web界面显示当前Git仓库路径  

## 使用方法

### 基本用法

1. **在任意Git仓库目录下启动服务器：**
   ```bash
   cd /path/to/your/project
   node /path/to/claude-web/app.js
   ```

2. **服务器会自动检测并使用该目录的Git仓库**

3. **访问Web界面：**
   ```
   http://localhost:3000
   ```

### 示例场景

#### 场景1：从项目A启动
```bash
cd /home/user/project-a
node /path/to/claude-web/app.js
```
- 所有Git操作都在project-a中进行
- 分支切换、提交、推送等操作都针对project-a

#### 场景2：从项目B启动
```bash
cd /home/user/project-b
node /path/to/claude-web/app.js
```
- 所有Git操作都在project-b中进行
- 分支切换、提交、推送等操作都针对project-b

## API接口

### 健康检查
```
GET /health
```
返回信息包括：
- `workspace`: 当前工作目录
- `gitPath`: Git仓库路径
- `isGitRepo`: 是否为有效的Git仓库

### 获取分支信息
```
GET /api/git/branches
```
返回信息包括：
- `currentBranch`: 当前分支
- `localBranches`: 本地分支列表
- `remoteBranches`: 远程分支列表
- `gitPath`: Git仓库路径

### 其他Git操作
所有Git API都会自动使用当前检测到的Git仓库：
- `POST /api/git/checkout` - 切换分支
- `POST /api/git/pull` - 拉取代码
- `GET /api/git/status` - 获取状态
- `POST /api/git/add` - 添加文件
- `POST /api/git/commit` - 提交代码
- `POST /api/git/push` - 推送代码

## 错误处理

### 非Git仓库目录
如果在非Git仓库目录启动服务器：
- API会返回错误信息：`"当前目录不是有效的Git仓库"`
- 健康检查会显示 `isGitRepo: false`
- Web界面会显示相应的错误提示

### 路径变更检测
- 服务器会实时检测工作目录变化
- 如果检测到路径变更，会自动重新初始化Git实例
- 控制台会显示路径变更日志

## 测试

### 运行测试脚本
```bash
# 测试动态Git功能
node test-dynamic-git.js

# 测试远程分支功能
node test-remote-branch.js

# 运行演示脚本
./demo-dynamic-git.sh
```

### 手动测试
1. 启动服务器
2. 访问 `http://localhost:3000/health` 检查状态
3. 访问 `http://localhost:3000` 使用Web界面
4. 测试分支切换、提交等功能

## 技术实现

### 核心组件

1. **动态Git实例管理**
   ```javascript
   let git = null;
   let currentGitPath = null;
   ```

2. **Git实例初始化**
   ```javascript
   function initGit(gitPath = process.cwd()) {
       const testGit = simpleGit(gitPath);
       return testGit;
   }
   ```

3. **路径检测和更新**
   ```javascript
   function checkAndUpdateGitPath() {
       const currentPath = process.cwd();
       if (currentPath !== currentGitPath) {
           git = initGit(currentPath);
           currentGitPath = currentPath;
       }
       return git;
   }
   ```

### 安全特性

- 自动验证Git仓库有效性
- 错误边界处理
- 友好的错误提示
- 路径安全检查

## 兼容性

- ✅ Node.js 14+
- ✅ 所有主流操作系统
- ✅ 支持所有Git仓库类型
- ✅ 向后兼容原有功能

## 更新日志

### v1.1.0 (当前版本)
- ✨ 新增动态Git路径功能
- ✨ 支持从任意Git仓库目录启动
- ✨ 自动检测和切换Git仓库
- ✨ 增强的错误处理和提示
- ✨ 改进的Web界面显示

### v1.0.0
- 🎉 初始版本发布
- ✨ 基本的Git管理功能
- ✨ WebSocket聊天同步
- ✨ Cursor集成支持 