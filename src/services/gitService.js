const { simpleGit } = require('simple-git');
const config = require('../config');
const logger = require('../utils/logger');

class GitService {
    constructor() {
        this.git = null;
        this.currentGitPath = null;
        this.initGit();
    }

    /**
     * 初始化Git实例
     * @param {string} gitPath Git仓库路径
     * @returns {Object|null} Git实例或null
     */
    initGit(gitPath = config.git.defaultPath) {
        try {
            const testGit = simpleGit(gitPath);
            this.git = testGit;
            this.currentGitPath = gitPath;
            logger.git('Git实例初始化成功', { path: gitPath });
            return testGit;
        } catch (error) {
            logger.failure('无效的Git路径', { path: gitPath, error: error.message });
            return null;
        }
    }

    /**
     * 获取Git实例（自动检测仓库）
     * @returns {Object} Git实例
     */
    getGitInstance() {
        if (!this.git) {
            this.git = this.initGit();
            this.currentGitPath = config.git.defaultPath;
        }
        return this.git;
    }

    /**
     * 检查并更新Git路径
     * @returns {Object|null} Git实例或null
     */
    checkAndUpdateGitPath() {
        const currentPath = process.cwd();
        if (currentPath !== this.currentGitPath) {
            logger.git('Git路径变更', {
                oldPath: this.currentGitPath,
                newPath: currentPath
            });
            this.git = this.initGit(currentPath);
            this.currentGitPath = currentPath;
        }
        return this.git;
    }

    /**
     * 获取分支信息
     * @returns {Promise<Object>} 分支信息
     */
    async getBranches() {
        try {
            const gitInstance = this.checkAndUpdateGitPath();
            if (!gitInstance) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            // 先执行 git fetch --prune 来更新远程分支信息并清理已删除的分支引用
            try {
                await gitInstance.fetch(config.git.fetchOptions);
                logger.success('远程分支信息已更新，已删除的分支引用已清理');
            } catch (fetchError) {
                logger.warning('远程分支更新失败，使用本地缓存的分支信息', { error: fetchError.message });
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

            return {
                success: true,
                currentBranch: currentBranch.current,
                allBranches: allBranches.all,
                localBranches: localBranches,
                remoteBranches: remoteBranches,
                gitPath: process.cwd(),
                timestamp: Date.now()
            };
        } catch (error) {
            logger.failure('Git获取分支失败', { error: error.message });
            throw error;
        }
    }

    /**
     * 切换分支
     * @param {string} branch 分支名称
     * @param {boolean} createNew 是否创建新分支
     * @returns {Promise<Object>} 切换结果
     */
    async checkoutBranch(branch, createNew = false) {
        try {
            const gitInstance = this.checkAndUpdateGitPath();
            if (!gitInstance) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            if (!branch) {
                throw new Error('分支名称不能为空');
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

            logger.success('Git分支切换成功', {
                targetBranch: targetBranch,
                currentBranch: newBranch.current
            });

            return {
                success: true,
                message: `已切换到分支: ${targetBranch}`,
                currentBranch: newBranch.current,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.failure('Git切换分支失败', { error: error.message });
            throw error;
        }
    }

    /**
     * 拉取最新代码
     * @returns {Promise<Object>} 拉取结果
     */
    async pull() {
        try {
            const gitInstance = this.checkAndUpdateGitPath();
            if (!gitInstance) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            const result = await gitInstance.pull();
            logger.success('Git代码更新成功', { result });

            return {
                success: true,
                message: '代码更新成功',
                result: result,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.failure('Git拉取失败', { error: error.message });
            throw error;
        }
    }

    /**
     * 获取Git状态
     * @returns {Promise<Object>} Git状态
     */
    async getStatus() {
        try {
            const gitInstance = this.checkAndUpdateGitPath();
            if (!gitInstance) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            const status = await gitInstance.status();
            return {
                success: true,
                status: status,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.failure('Git状态获取失败', { error: error.message });
            throw error;
        }
    }

    /**
     * 添加文件到暂存区
     * @param {string|Array} files 文件路径
     * @returns {Promise<Object>} 添加结果
     */
    async addFiles(files = '.') {
        try {
            const gitInstance = this.checkAndUpdateGitPath();
            if (!gitInstance) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            await gitInstance.add(files);
            logger.success('Git文件已添加到暂存区', { files });

            return {
                success: true,
                message: '文件已添加到暂存区',
                files: files,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.failure('Git添加文件失败', { error: error.message });
            throw error;
        }
    }

    /**
     * 提交代码
     * @param {string} message 提交信息
     * @returns {Promise<Object>} 提交结果
     */
    async commit(message) {
        try {
            const gitInstance = this.checkAndUpdateGitPath();
            if (!gitInstance) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            if (!message) {
                throw new Error('提交信息不能为空');
            }

            const result = await gitInstance.commit(message);
            logger.success('Git代码提交成功', { message, result });

            return {
                success: true,
                message: '代码提交成功',
                result: result,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.failure('Git提交失败', { error: error.message });
            throw error;
        }
    }

    /**
     * 推送代码
     * @returns {Promise<Object>} 推送结果
     */
    async push() {
        try {
            const gitInstance = this.checkAndUpdateGitPath();
            if (!gitInstance) {
                throw new Error('当前目录不是有效的Git仓库');
            }

            const result = await gitInstance.push();
            logger.success('Git代码推送成功', { result });

            return {
                success: true,
                message: '代码推送成功',
                result: result,
                timestamp: Date.now()
            };
        } catch (error) {
            logger.failure('Git推送失败', { error: error.message });
            throw error;
        }
    }
}

module.exports = new GitService();
