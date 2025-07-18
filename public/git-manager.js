// Git 管理功能
class GitManager {
    constructor() {
        this.currentBranch = '';
        this.allBranches = [];
        this.localBranches = [];
        this.remoteBranches = [];
        this.init();
    }

    async init() {
        await this.loadBranches();
        this.bindEvents();
        this.updateCurrentBranch();
    }

    // 绑定事件
    bindEvents() {
        // 刷新分支
        document.getElementById('refresh-branches').addEventListener('click', () => {
            this.loadBranches();
        });

        // 切换分支
        document.getElementById('checkout-branch').addEventListener('click', () => {
            this.checkoutBranch();
        });

        // 更新代码
        document.getElementById('pull-code').addEventListener('click', () => {
            this.pullCode();
        });

        // 查看状态
        document.getElementById('git-status').addEventListener('click', () => {
            this.getStatus();
        });

        // 添加文件
        document.getElementById('add-files').addEventListener('click', () => {
            this.addFiles();
        });

        // 提交代码
        document.getElementById('commit-code').addEventListener('click', () => {
            this.commitCode();
        });

        // 推送代码
        document.getElementById('push-code').addEventListener('click', () => {
            this.pushCode();
        });

        // 清除输出
        document.getElementById('clear-output').addEventListener('click', () => {
            this.clearOutput();
        });

        // 回车提交
        document.getElementById('commit-message').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.commitCode();
            }
        });
    }

    // 加载分支信息
    async loadBranches() {
        try {
            this.log('正在加载分支信息...', 'info');

            const response = await fetch('/api/git/branches');
            const data = await response.json();

            if (data.success) {
                this.currentBranch = data.currentBranch;
                this.allBranches = data.allBranches;
                this.localBranches = data.localBranches;
                this.remoteBranches = data.remoteBranches || [];
                this.gitPath = data.gitPath;

                this.updateBranchSelect();
                this.updateCurrentBranch();
                this.log('分支信息加载成功', 'success');
                if (this.gitPath) {
                    this.log(`Git仓库路径: ${this.gitPath}`, 'info');
                }
            } else {
                this.log('分支信息加载失败: ' + data.message, 'error');
            }
        } catch (error) {
            this.log('分支信息加载失败: ' + error.message, 'error');
        }
    }

    // 更新分支选择器
    updateBranchSelect() {
        const select = document.getElementById('branch-select');
        select.innerHTML = '<option value="">选择分支...</option>';

        // 添加本地分支分组
        if (this.localBranches.length > 0) {
            const localGroup = document.createElement('optgroup');
            localGroup.label = '本地分支';
            
            this.localBranches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch;
                option.textContent = branch;
                if (branch === this.currentBranch) {
                    option.selected = true;
                }
                localGroup.appendChild(option);
            });
            select.appendChild(localGroup);
        }

        // 添加远程分支分组
        if (this.remoteBranches.length > 0) {
            const remoteGroup = document.createElement('optgroup');
            remoteGroup.label = '远程分支';
            
            this.remoteBranches.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch;
                option.textContent = branch;
                
                // 检查是否为当前分支的远程对应分支
                if (branch === `origin/${this.currentBranch}`) {
                    option.selected = true;
                }
                
                remoteGroup.appendChild(option);
            });
            select.appendChild(remoteGroup);
        }
    }

    // 更新当前分支显示
    updateCurrentBranch() {
        const currentBranchElement = document.getElementById('current-branch');
        currentBranchElement.textContent = this.currentBranch || '未知';
        
        // 显示Git路径信息
        const gitPathElement = document.getElementById('git-path');
        if (gitPathElement && this.gitPath) {
            gitPathElement.textContent = this.gitPath;
            gitPathElement.title = this.gitPath;
        }
    }

// 切换分支
    async checkoutBranch() {
        const select = document.getElementById('branch-select');
        const branch = select.value;

        if (!branch) {
            this.log('请选择要切换的分支', 'error');
            return;
        }

        // 检查是否为远程分支
        const isRemoteBranch = branch.startsWith('origin/');
        
        if (!isRemoteBranch && branch === this.currentBranch) {
            this.log('当前已在目标分支', 'info');
            return;
        }

        try {
            let message = `正在切换到分支: ${branch}...`;
            
            // 如果是远程分支，提示将创建本地分支
            if (isRemoteBranch) {
                const localBranchName = branch.replace('origin/', '');
                if (!this.localBranches.includes(localBranchName)) {
                    message = `正在从远程分支 ${branch} 创建本地分支 ${localBranchName}...`;
                } else {
                    message = `正在切换到本地分支: ${localBranchName}...`;
                }
            }

            this.log(message, 'info');

            const response = await fetch('/api/git/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    branch,
                    createNew: isRemoteBranch
                })
            });

            const data = await response.json();

            if (data.success) {
                this.currentBranch = data.currentBranch;
                this.updateCurrentBranch();
                this.log(data.message, 'success');
                await this.loadBranches(); // 重新加载分支信息
            } else {
                this.log('切换分支失败: ' + data.message, 'error');
            }
        } catch (error) {
            this.log('切换分支失败: ' + error.message, 'error');
        }
    }

    // 拉取代码
    async pullCode() {
        try {
            this.log('正在更新代码...', 'info');

            const response = await fetch('/api/git/pull', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                this.log('代码更新成功', 'success');
                if (data.result && data.result.summary) {
                    this.log('更新详情: ' + data.result.summary, 'info');
                }
            } else {
                this.log('代码更新失败: ' + data.message, 'error');
            }
        } catch (error) {
            this.log('代码更新失败: ' + error.message, 'error');
        }
    }

    // 获取状态
    async getStatus() {
        try {
            this.log('正在获取Git状态...', 'info');

            const response = await fetch('/api/git/status');
            const data = await response.json();

            if (data.success) {
                const status = data.status;
                this.log('Git状态获取成功', 'success');

                // 显示状态详情
                if (status.modified && status.modified.length > 0) {
                    this.log(`已修改文件: ${status.modified.join(', ')}`, 'info');
                }
                if (status.not_added && status.not_added.length > 0) {
                    this.log(`未添加文件: ${status.not_added.join(', ')}`, 'info');
                }
                if (status.created && status.created.length > 0) {
                    this.log(`新创建文件: ${status.created.join(', ')}`, 'info');
                }
                if (status.deleted && status.deleted.length > 0) {
                    this.log(`已删除文件: ${status.deleted.join(', ')}`, 'info');
                }
                if (status.renamed && status.renamed.length > 0) {
                    this.log(`已重命名文件: ${status.renamed.join(', ')}`, 'info');
                }
                if (status.staged && status.staged.length > 0) {
                    this.log(`已暂存文件: ${status.staged.join(', ')}`, 'info');
                }

                if (status.ahead > 0) {
                    this.log(`领先远程分支 ${status.ahead} 个提交`, 'info');
                }
                if (status.behind > 0) {
                    this.log(`落后远程分支 ${status.behind} 个提交`, 'info');
                }
            } else {
                this.log('获取Git状态失败: ' + data.message, 'error');
            }
        } catch (error) {
            this.log('获取Git状态失败: ' + error.message, 'error');
        }
    }

    // 添加文件
    async addFiles() {
        try {
            this.log('正在添加文件到暂存区...', 'info');

            const response = await fetch('/api/git/add', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ files: '.' })
            });

            const data = await response.json();

            if (data.success) {
                this.log('文件已添加到暂存区', 'success');
            } else {
                this.log('添加文件失败: ' + data.message, 'error');
            }
        } catch (error) {
            this.log('添加文件失败: ' + error.message, 'error');
        }
    }

    // 提交代码
    async commitCode() {
        const messageInput = document.getElementById('commit-message');
        const message = messageInput.value.trim();

        if (!message) {
            this.log('请输入提交信息', 'error');
            messageInput.focus();
            return;
        }

        try {
            this.log('正在提交代码...', 'info');

            const response = await fetch('/api/git/commit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message })
            });

            const data = await response.json();

            if (data.success) {
                this.log('代码提交成功', 'success');
                if (data.result && data.result.commit) {
                    this.log('提交哈希: ' + data.result.commit, 'info');
                }
                messageInput.value = ''; // 清空输入框
            } else {
                this.log('代码提交失败: ' + data.message, 'error');
            }
        } catch (error) {
            this.log('代码提交失败: ' + error.message, 'error');
        }
    }

    // 推送代码
    async pushCode() {
        try {
            this.log('正在推送代码...', 'info');

            const response = await fetch('/api/git/push', {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                this.log('代码推送成功', 'success');
                if (data.result && data.result.summary) {
                    this.log('推送详情: ' + data.result.summary, 'info');
                }
            } else {
                this.log('代码推送失败: ' + data.message, 'error');
            }
        } catch (error) {
            this.log('代码推送失败: ' + error.message, 'error');
        }
    }

    // 记录日志
    log(message, type = 'info') {
        const logContainer = document.getElementById('git-log');
        const timestamp = new Date().toLocaleTimeString();

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;

        logEntry.innerHTML = `
            <div class="log-timestamp">[${timestamp}]</div>
            <div class="log-message">${message}</div>
        `;

        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;

        // 限制日志条目数量
        while (logContainer.children.length > 50) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }

    // 清除输出
    clearOutput() {
        document.getElementById('git-log').innerHTML = '';
    }
}

// 页面加载完成后初始化Git管理器
document.addEventListener('DOMContentLoaded', () => {
    window.gitManager = new GitManager();
});
