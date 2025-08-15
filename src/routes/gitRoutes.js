// Git 相关路由
const express = require('express');
const router = express.Router();
const { simpleGit } = require('simple-git');

class GitRoutes {
    constructor() {
        this.git = null;
        this.currentGitPath = null;
        this.setupRoutes();
    }

    setupRoutes() {
        // 获取分支信息
        router.get('/git/branches', this.handleGetBranches.bind(this));

        // 切换分支
        router.post('/git/checkout', this.handleCheckout.bind(this));

        // 拉取最新代码
        router.post('/git/pull', this.handlePull.bind(this));

        // 获取状态
        router.get('/git/status', this.handleGetStatus.bind(this));

        // 添加文件到暂存区
        router.post('/git/add', this.handleAdd.bind(this));

        // 提交代码
        router.post('/git/commit', this.handleCommit.bind(this));

        // 推送代码
        router.post('/git/push', this.handlePush.bind(this));
    }

    // 初始化 Git 实例
    initGit(gitPath = process.cwd()) {
        try {
            const testGit = simpleGit(gitPath);
            return testGit;
        } catch (error) {
            console.log('❌ 无效的 Git 路径：', gitPath);
            return null;
        }
    }

    // 获取 Git 实例（自动检测仓库）
    getGitInstance() {
        if (!this.git) {
            this.git = this.initGit();
            this.currentGitPath = process.cwd();
        }
        return this.git;
    }

    // 检查并更新 Git 路径
    // 根据 instanceId（可选）解析工作区根目录。当前先用进程工作目录，后续可与实例配置绑定工作区。
    resolveGitRoot(instanceId){
        try{
            const fs = require('fs');
            const path = require('path');
            const cfg = require('../config');
            const primary = path.isAbsolute(cfg.instances?.file || '')
              ? cfg.instances.file
              : path.join(process.cwd(), cfg.instances?.file || 'instances.json');
            let file = primary;
            if (!fs.existsSync(file)) {
              const fallback = path.join(process.cwd(), 'config', 'instances.json');
              if (fs.existsSync(fallback)) file = fallback; else return process.cwd();
            }
            if (!instanceId) return process.cwd();
            const items = JSON.parse(fs.readFileSync(file,'utf8'));
            const arr = Array.isArray(items) ? items : [];
            const found = arr.find(x => String(x.id||'') === String(instanceId));
            if (found && typeof found.openPath === 'string' && found.openPath.trim()) {
                return found.openPath.trim();
            }
            return process.cwd();
        }catch{
            return process.cwd();
        }
    }

    checkAndUpdateGitPath(instanceId) {
        const targetPath = this.resolveGitRoot(instanceId);
        if (targetPath !== this.currentGitPath) {
            console.log(`🔄 Git 路径变更：${this.currentGitPath} -> ${targetPath}`);
            this.git = this.initGit(targetPath);
            this.currentGitPath = targetPath;
        }
        return this.git;
    }

    // 获取分支信息
    async handleGetBranches(req, res) {
        try {
            const gitInstance = this.checkAndUpdateGitPath(req.query.instance);
            if (!gitInstance) {
                return res.status(500).json({
                    success: false,
                    message: '当前目录不是有效的 Git 仓库',
                    currentPath: process.cwd()
                });
            }

            // 先执行 git fetch --prune 来更新远程分支信息并清理已删除的分支引用
            try {
                await gitInstance.fetch(['--all', '--prune']);
                console.log('✅ 远程分支信息已更新，已删除的分支引用已清理');
            } catch (fetchError) {
                console.log('⚠️  远程分支更新失败，使用本地缓存的分支信息：', fetchError.message);
            }

            const [currentBranch, allBranches] = await Promise.all([
                gitInstance.branchLocal(),
                gitInstance.branch(['-a'])
            ]);

            // 分离本地分支和远程分支
            const localBranches = currentBranch.all;
            const remoteBranches = allBranches.all.filter(branch =>
                branch.startsWith('remotes/') && !branch.endsWith('/HEAD')
            ).map(branch => branch.replace('remotes/', ''));

            res.json({
                success: true,
                currentBranch: currentBranch.current,
                allBranches: allBranches.all,
                localBranches: localBranches,
                remoteBranches: remoteBranches,
                gitPath: this.currentGitPath || process.cwd(),
                timestamp: Date.now()
            });
        } catch (error) {
            console.log('❌ Git 获取分支失败：', error.message);
            res.status(500).json({
                success: false,
                message: '获取分支信息失败',
                error: error.message
            });
        }
    }

    // 切换分支
    async handleCheckout(req, res) {
        try {
            const gitInstance = this.checkAndUpdateGitPath(req.query.instance);
            if (!gitInstance) {
                return res.status(500).json({
                    success: false,
                    message: '当前目录不是有效的 Git 仓库',
                    currentPath: process.cwd()
                });
            }

            const { branch, createNew } = req.body;
            if (!branch) {
                return res.status(400).json({
                    success: false,
                    message: '分支名称不能为空'
                });
            }

            // 检查是否为远程分支
            const isRemoteBranch = branch.startsWith('origin/');
            let targetBranch = branch;

            if (isRemoteBranch && createNew) {
                // 从远程分支创建新的本地分支
                const localBranchName = branch.replace('origin/', '');
                await gitInstance.checkoutBranch(localBranchName, branch);
                targetBranch = localBranchName;
            } else if (isRemoteBranch && !createNew) {
                // 直接切换到远程分支（需要本地已存在同名分支）
                const localBranchName = branch.replace('origin/', '');

                // 检查本地分支是否存在
                const localBranches = await gitInstance.branchLocal();
                if (localBranches.all.includes(localBranchName)) {
                    await gitInstance.checkout(localBranchName);
                    targetBranch = localBranchName;
                } else {
                    // 本地分支不存在，创建新的本地分支
                    await gitInstance.checkoutBranch(localBranchName, branch);
                    targetBranch = localBranchName;
                }
            } else {
                // 本地分支切换
                await gitInstance.checkout(branch);
            }

            const newBranch = await gitInstance.branchLocal();

            res.json({
                success: true,
                message: `已切换到分支：${targetBranch}`,
                currentBranch: newBranch.current,
                timestamp: Date.now()
            });
        } catch (error) {
            console.log('❌ Git 切换分支失败：', error.message);
            res.status(500).json({
                success: false,
                message: '切换分支失败',
                error: error.message
            });
        }
    }

    // 拉取最新代码
    async handlePull(req, res) {
        try {
            const gitInstance = this.checkAndUpdateGitPath(req.query.instance);
            if (!gitInstance) {
                return res.status(500).json({
                    success: false,
                    message: '当前目录不是有效的 Git 仓库',
                    currentPath: process.cwd()
                });
            }

            const result = await gitInstance.pull();

            res.json({
                success: true,
                message: '代码更新成功',
                result: result,
                timestamp: Date.now()
            });
        } catch (error) {
            console.log('❌ Git 拉取失败：', error.message);
            res.status(500).json({
                success: false,
                message: '代码更新失败',
                error: error.message
            });
        }
    }

    // 获取状态
    async handleGetStatus(req, res) {
        try {
            const gitInstance = this.checkAndUpdateGitPath(req.query.instance);
            if (!gitInstance) {
                return res.status(500).json({
                    success: false,
                    message: '当前目录不是有效的 Git 仓库',
                    currentPath: process.cwd()
                });
            }

            const status = await gitInstance.status();

            res.json({
                success: true,
                status: status,
                timestamp: Date.now()
            });
        } catch (error) {
            console.log('❌ Git 状态获取失败：', error.message);
            res.status(500).json({
                success: false,
                message: '获取 Git 状态失败',
                error: error.message
            });
        }
    }

    // 添加文件到暂存区
    async handleAdd(req, res) {
        try {
            const gitInstance = this.checkAndUpdateGitPath(req.query.instance);
            if (!gitInstance) {
                return res.status(500).json({
                    success: false,
                    message: '当前目录不是有效的 Git 仓库',
                    currentPath: process.cwd()
                });
            }

            const { files } = req.body;
            const filesToAdd = files || '.';

            await gitInstance.add(filesToAdd);

            res.json({
                success: true,
                message: '文件已添加到暂存区',
                files: filesToAdd,
                timestamp: Date.now()
            });
        } catch (error) {
            console.log('❌ Git 添加文件失败：', error.message);
            res.status(500).json({
                success: false,
                message: '添加文件失败',
                error: error.message
            });
        }
    }

    // 提交代码
    async handleCommit(req, res) {
        try {
            const gitInstance = this.checkAndUpdateGitPath(req.query.instance);
            if (!gitInstance) {
                return res.status(500).json({
                    success: false,
                    message: '当前目录不是有效的 Git 仓库',
                    currentPath: process.cwd()
                });
            }

            const { message } = req.body;
            if (!message) {
                return res.status(400).json({
                    success: false,
                    message: '提交信息不能为空'
                });
            }

            const result = await gitInstance.commit(message);

            res.json({
                success: true,
                message: '代码提交成功',
                result: result,
                timestamp: Date.now()
            });
        } catch (error) {
            console.log('❌ Git 提交失败：', error.message);
            res.status(500).json({
                success: false,
                message: '代码提交失败',
                error: error.message
            });
        }
    }

    // 推送代码
    async handlePush(req, res) {
        try {
            const gitInstance = this.checkAndUpdateGitPath();
            if (!gitInstance) {
                return res.status(500).json({
                    success: false,
                    message: '当前目录不是有效的 Git 仓库',
                    currentPath: process.cwd()
                });
            }

            const result = await gitInstance.push();

            res.json({
                success: true,
                message: '代码推送成功',
                result: result,
                timestamp: Date.now()
            });
        } catch (error) {
            console.log('❌ Git 推送失败：', error.message);
            res.status(500).json({
                success: false,
                message: '代码推送失败',
                error: error.message
            });
        }
    }

    // 获取路由
    getRouter() {
        return router;
    }
}

module.exports = GitRoutes;
