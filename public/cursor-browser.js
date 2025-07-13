// WebSocket 管理器
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.url = 'ws://localhost:3000/ws';
        this.isConnecting = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 2000;
        this.onMessage = null;
        this.connect();
    }

    connect() {
        if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
            return;
        }

        this.isConnecting = true;
        console.log('🔌 连接 WebSocket...');

        try {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('✅ WebSocket 连接成功');
                this.isConnecting = false;
                this.retryCount = 0;
            };

            this.ws.onmessage = (event) => {
                if (this.onMessage) {
                    this.onMessage(event);
                }
            };

            this.ws.onclose = () => {
                console.log('🔌 WebSocket 连接关闭');
                this.isConnecting = false;
                this.retryReconnect();
            };

            this.ws.onerror = (error) => {
                console.error('❌ WebSocket 连接错误：', error);
                this.isConnecting = false;
            };

        } catch (error) {
            console.error('❌ WebSocket 连接失败：', error);
            this.isConnecting = false;
            this.retryReconnect();
        }
    }

    retryReconnect() {
        if (this.retryCount >= this.maxRetries) {
            console.warn('⚠️ 达到最大重试次数，停止重连');
            return;
        }

        this.retryCount++;
        console.log(`🔄 第 ${this.retryCount} 次重连尝试...`);

        setTimeout(() => {
            this.connect();
        }, this.retryDelay * this.retryCount);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnecting = false;
    }

    getStatus() {
        if (!this.ws) return '未连接';
        const states = ['连接中', '已连接', '关闭中', '已关闭'];
        return states[this.ws.readyState] || '未知';
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
            return true;
        }
        return false;
    }
}

// Git 管理功能
class GitManager {
    constructor() {
        this.currentBranch = '';
        this.allBranches = [];
        this.localBranches = [];
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

                this.updateBranchSelect();
                this.updateCurrentBranch();
                this.log('分支信息加载成功', 'success');
            } else {
                this.log('分支信息加载失败：' + data.message, 'error');
            }
        } catch (error) {
            this.log('分支信息加载失败：' + error.message, 'error');
        }
    }

    // 更新分支选择器
    updateBranchSelect() {
        const select = document.getElementById('branch-select');
        select.innerHTML = '<option value="">选择分支...</option>';

        this.localBranches.forEach(branch => {
            const option = document.createElement('option');
            option.value = branch;
            option.textContent = branch;
            if (branch === this.currentBranch) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    // 更新当前分支显示
    updateCurrentBranch() {
        const currentBranchElement = document.getElementById('current-branch');
        currentBranchElement.textContent = this.currentBranch || '未知';
    }

    // 切换分支
    async checkoutBranch() {
        const select = document.getElementById('branch-select');
        const branch = select.value;

        if (!branch) {
            this.log('请选择要切换的分支', 'error');
            return;
        }

        if (branch === this.currentBranch) {
            this.log('当前已在目标分支', 'info');
            return;
        }

        try {
            this.log(`正在切换到分支：${branch}...`, 'info');

            const response = await fetch('/api/git/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ branch })
            });

            const data = await response.json();

            if (data.success) {
                this.currentBranch = data.currentBranch;
                this.updateCurrentBranch();
                this.log(data.message, 'success');
                await this.loadBranches(); // 重新加载分支信息
            } else {
                this.log('切换分支失败：' + data.message, 'error');
            }
        } catch (error) {
            this.log('切换分支失败：' + error.message, 'error');
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
                    this.log('更新详情：' + data.result.summary, 'info');
                }
            } else {
                this.log('代码更新失败：' + data.message, 'error');
            }
        } catch (error) {
            this.log('代码更新失败：' + error.message, 'error');
        }
    }

    // 获取状态
    async getStatus() {
        try {
            this.log('正在获取 Git 状态...', 'info');

            const response = await fetch('/api/git/status');
            const data = await response.json();

            if (data.success) {
                const status = data.status;
                this.log('Git 状态获取成功', 'success');

                // 显示状态详情
                if (status.modified && status.modified.length > 0) {
                    this.log(`已修改文件：${status.modified.join(', ')}`, 'info');
                }
                if (status.not_added && status.not_added.length > 0) {
                    this.log(`未添加文件：${status.not_added.join(', ')}`, 'info');
                }
                if (status.created && status.created.length > 0) {
                    this.log(`新创建文件：${status.created.join(', ')}`, 'info');
                }
                if (status.deleted && status.deleted.length > 0) {
                    this.log(`已删除文件：${status.deleted.join(', ')}`, 'info');
                }
                if (status.renamed && status.renamed.length > 0) {
                    this.log(`已重命名文件：${status.renamed.join(', ')}`, 'info');
                }
                if (status.staged && status.staged.length > 0) {
                    this.log(`已暂存文件：${status.staged.join(', ')}`, 'info');
                }

                if (status.ahead > 0) {
                    this.log(`领先远程分支 ${status.ahead} 个提交`, 'info');
                }
                if (status.behind > 0) {
                    this.log(`落后远程分支 ${status.behind} 个提交`, 'info');
                }
            } else {
                this.log('获取 Git 状态失败：' + data.message, 'error');
            }
        } catch (error) {
            this.log('获取 Git 状态失败：' + error.message, 'error');
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
                this.log('添加文件失败：' + data.message, 'error');
            }
        } catch (error) {
            this.log('添加文件失败：' + error.message, 'error');
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
                    this.log('提交哈希：' + data.result.commit, 'info');
                }
                messageInput.value = ''; // 清空输入框
            } else {
                this.log('代码提交失败：' + data.message, 'error');
            }
        } catch (error) {
            this.log('代码提交失败：' + error.message, 'error');
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
                    this.log('推送详情：' + data.result.summary, 'info');
                }
            } else {
                this.log('代码推送失败：' + data.message, 'error');
            }
        } catch (error) {
            this.log('代码推送失败：' + error.message, 'error');
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

// 页面加载完成后，等待 .conversations 区域出现再启动同步脚本
function waitForChatContainerAndStartSync() {
    const tryFind = () => {
        const container = document.querySelector('.conversations');
        if (container) {
            console.log('✅ .conversations 区域已出现，启动同步脚本');
            window.cursorSync = new CursorSync();
        } else {
            console.log('⏳ 等待 .conversations 区域渲染...');
            setTimeout(tryFind, 500);
        }
    };
    tryFind();
}

// Cursor 同步功能
class CursorSync {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.chatContainer = null;
        this.lastContent = '';
        this.syncInterval = null;
        this.retryCount = 0;
        this.wsRetryCount = 0;
        this.maxRetries = 3;
        this.init();
    }

    init() {
        console.log('🎯 初始化 Cursor 同步器...');
        this.findChatContainer();
        this.startSync();
        this.initWebSocket();
    }

    findChatContainer() {
        // 优先 conversations 区域
        this.chatContainer = document.querySelector('.conversations') ||
            document.querySelector('.chat-container') ||
            document.querySelector('[data-testid="chat-container"]') ||
            document.querySelector('.conversation-container') ||
            document.querySelector('[contenteditable]') ||
            document.body; // 最后兜底

        if (this.chatContainer) {
            console.log('✅ 找到聊天容器', this.chatContainer);
        } else {
            console.warn('❌ 未找到聊天容器');
            // 打印所有可疑节点，便于调试
            const allCE = document.querySelectorAll('[contenteditable]');
            console.log('所有 contenteditable 元素：', allCE);
        }
    }

    startSync() {
        // 启动 HTTP 同步
        this.syncInterval = setInterval(() => {
            this.syncContent();
        }, 1000); // 每 1 秒同步一次

        console.log('🔄 HTTP 同步已启动');
    }

    async syncContent() {
        try {
            const contentPayload = this.getContent();
            console.log('准备同步内容：', contentPayload);
            if (!contentPayload) {
                console.warn('未获取到内容载荷，跳过同步');
                return;
            }
            const response = await fetch(`${this.serverUrl}/api/content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'html_content',
                    data: contentPayload
                })
            });
            if (response.ok) {
                const data = await response.json();
                console.log('同步响应：', data);
                if (data.success) {
                    console.log('✅ 内容同步成功');
                    this.retryCount = 0;
                }
            }
        } catch (error) {
            console.error('❌ 同步失败：', error);
            this.retryCount++;
            if (this.retryCount >= this.maxRetries) {
                console.warn('⚠️ 达到最大重试次数，停止同步');
                this.stop();
            }
        }
    }

    getContent() {
        if (!this.chatContainer) {
            console.warn('chatContainer 未找到');
            return null;
        }
        // 自动滚动到底部，确保所有消息渲染出来
        try {
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        } catch (e) {
            console.warn('自动滚动失败：', e);
        }
        // 直接采集 innerHTML
        const html = this.chatContainer.innerHTML || '';
        const text = this.chatContainer.textContent || '';
        const contentLength = text.length;
        console.log('采集 innerHTML 长度：', html.length, 'textContent 长度：', text.length);
        if (contentLength === 0) {
            console.warn('内容为空，不推送');
            return null;
        }
        this.lastContent = text;
        return {
            html: html,
            text: text,
            contentLength: contentLength,
            url: window.location.href,
            timestamp: Date.now()
        };
    }

    getContentPayload() {
        const content = this.getContent();
        if (!content) {
            return null;
        }
        return content;
    }

    initWebSocket() {
        // 使用全局 WebSocket 管理器
        if (!window.webSocketManager) {
            console.log('🔧 创建全局 WebSocket 管理器...');
            window.webSocketManager = new WebSocketManager();
        }

        // 监听消息
        window.webSocketManager.onMessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.warn('⚠️ 非 JSON 消息，按原始字符串处理：', event.data);
                this.handleWebSocketMessage({ type: 'raw', data: event.data });
            }
        };

        this.showNotification('📡 已连接到消息服务', '#4CAF50', 2000);
    }

    // 处理来自 WebSocket 的消息
    handleWebSocketMessage(message) {
        console.log('📥 收到 WebSocket 消息：', message.type);

        switch (message.type) {
            case 'user_message':
                this.handleUserMessage(message.data);
                break;
            case 'pong':
                // 心跳响应，无需处理
                break;
            case 'clear_content':
                console.log('🧹 收到清空内容指令');
                break;
            default:
                console.log('❓ 未知消息类型：', message.type);
        }
    }

    // 处理用户消息 - 将消息发送到 Cursor 聊天输入框
    handleUserMessage(messageText) {
        console.log('💬 收到用户消息，发送到 Cursor：', messageText);

        try {
            // 🎯 使用 Cursor 特定的选择器（基于成功的旧版本）
            const inputDiv = document.querySelector('div.aislash-editor-input[contenteditable="true"]');

            if (!inputDiv) {
                console.error('❌ 未找到 Cursor 输入框 (div.aislash-editor-input[contenteditable="true"])');
                this.showDebugInfo();
                this.tryFallbackInputMethods(messageText);
                return;
            }

            console.log('✅ 找到 Cursor 输入框');

            // 确保输入框获得焦点
            inputDiv.focus();

            // 🔑 关键：使用粘贴事件（而不是直接设置值）
            const clipboardData = new DataTransfer();
            clipboardData.setData('text/plain', messageText);

            // 创建并派发粘贴事件
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: clipboardData
            });

            console.log('📋 触发粘贴事件');
            inputDiv.dispatchEvent(pasteEvent);

            // 粘贴后尝试点击发送按钮
            setTimeout(() => {
                this.clickCursorSendButton();
            }, 100);

            console.log('✅ 消息已通过粘贴事件发送到 Cursor');
            this.showNotification('💬 消息已发送到 Cursor', '#2196F3', 3000);

        } catch (error) {
            console.error('❌ 发送消息到 Cursor 失败：', error);
            this.showNotification('❌ 发送失败，尝试备用方案', '#FF5722', 4000);
            this.tryFallbackInputMethods(messageText);
        }
    }

    // 🔘 点击 Cursor 发送按钮
    clickCursorSendButton() {
        // 🎯 使用 Cursor 特定的发送按钮选择器
        const sendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;

        if (sendBtn && sendBtn.offsetParent !== null && !sendBtn.disabled) {
            console.log('✅ 找到 Cursor 发送按钮，点击发送');
            sendBtn.click();
            console.log('✅ 消息已发送到 Cursor');
            return true;
        }

        // 备用按钮选择器
        const fallbackSelectors = [
            '.anysphere-icon-button .codicon-arrow-up-two',
            '.codicon-arrow-up-two',
            'button .codicon-arrow-up-two',
            '[class*="anysphere-icon-button"]',
            'button[class*="send"]'
        ];

        for (const selector of fallbackSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                const button = element.closest('button') || element.parentElement;
                if (button && button.offsetParent !== null && !button.disabled) {
                    console.log('✅ 找到 Cursor 备用按钮：', selector);
                    button.click();
                    return true;
                }
            }
        }

        console.warn('⚠️ 未找到发送按钮，尝试键盘发送');

        // 最后尝试键盘事件
        const inputDiv = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
        if (inputDiv) {
            inputDiv.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
            return true;
        }

        return false;
    }

    // 🔍 显示调试信息
    showDebugInfo() {
        console.log('🔍 Cursor 调试信息：');
        console.log('Cursor 特定输入框：', document.querySelector('div.aislash-editor-input[contenteditable="true"]'));
        console.log('Cursor 发送按钮：', document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement);
        console.log('所有 aislash-editor-input 元素：', document.querySelectorAll('.aislash-editor-input'));
        console.log('所有 contenteditable 元素：', document.querySelectorAll('[contenteditable="true"]'));
        console.log('所有 anysphere-icon-button 元素：', document.querySelectorAll('.anysphere-icon-button'));
        console.log('所有 codicon-arrow-up-two 元素：', document.querySelectorAll('.codicon-arrow-up-two'));
    }

    // 🛠️ 备用输入方案
    tryFallbackInputMethods(messageText) {
        console.log('🛠️ 尝试备用输入方案...');

        // 备用选择器
        const fallbackSelectors = [
            'div.aislash-editor-input',
            '.aislash-editor-input[contenteditable="true"]',
            '.aislash-editor-input',
            'div[contenteditable="true"]',
            '[role="textbox"]',
            'textarea[placeholder*="问"]',
            'textarea[placeholder*="Ask"]',
            'textarea'
        ];

        for (const selector of fallbackSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of elements) {
                if (element.offsetParent !== null &&
                    element.offsetHeight > 20 &&
                    !element.disabled &&
                    !element.readOnly) {

                    console.log('🎯 尝试备用输入框：', selector);

                    try {
                        element.focus();

                        if (element.tagName === 'TEXTAREA') {
                            element.value = messageText;
                            element.dispatchEvent(new Event('input', { bubbles: true }));
                            element.dispatchEvent(new Event('change', { bubbles: true }));
                        } else {
                            // 尝试粘贴事件
                            const clipboardData = new DataTransfer();
                            clipboardData.setData('text/plain', messageText);
                            const pasteEvent = new ClipboardEvent('paste', {
                                bubbles: true,
                                cancelable: true,
                                clipboardData: clipboardData
                            });
                            element.dispatchEvent(pasteEvent);
                        }

                        console.log('✅ 备用方案成功设置消息');
                        this.showNotification('✅ 消息已通过备用方案设置', '#4CAF50', 3000);
                        return true;

                    } catch (error) {
                        console.warn('备用方案失败：', error);
                    }
                }
            }
        }

        // 最终备用：复制到剪贴板
        console.warn('⚠️ 所有输入方案都失败，复制到剪贴板');
        this.copyToClipboard(messageText);
        this.showNotification('📋 消息已复制到剪贴板，请手动粘贴', '#FF9800', 5000);

        return false;
    }

    // 复制文本到剪贴板
    copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text);
            } else {
                // 备用方案
                const textArea = document.createElement('textarea');
                textArea.value = text;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            console.log('📋 消息已复制到剪贴板');
        } catch (error) {
            console.error('❌ 复制到剪贴板失败：', error);
        }
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('🛑 同步已停止');
        }

        // 注意：不关闭全局 WebSocket 连接，让其他实例继续使用
        console.log('🛑 CursorSync 实例已停止');

        this.showNotification('🛑 同步已停止', '#FF9800');
    }

    // 🔄 重启同步功能
    restart() {
        console.log('🔄 重启 Cursor 同步器...');

        // 先停止现有连接
        this.stop();

        // 重置重试计数
        this.retryCount = 0;
        this.wsRetryCount = 0;

        // 重新初始化
        setTimeout(() => {
            this.init();
        }, 2000); // 增加延迟时间
    }

    showNotification(text, color = '#4CAF50', duration = 4000) {
        // 移除旧通知
        const oldNotif = document.getElementById('cursor-sync-notification');
        if (oldNotif) oldNotif.remove();

        // 创建新通知
        const notification = document.createElement('div');
        notification.id = 'cursor-sync-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 999999;
            background: ${color};
            color: white;
            padding: 12px 16px;
            border-radius: 6px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 300px;
        `;
        notification.textContent = text;

        document.body.appendChild(notification);

        // 自动移除
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }
}

// 启动同步器
console.log('🎯 启动 Cursor 同步器...');

// 🔧 全局实例管理：确保只有一个实例运行
if (window.cursorSync) {
    console.log('🔄 检测到现有 CursorSync 实例，正在清理...');
    try {
        window.cursorSync.stop();
    } catch (error) {
        console.warn('⚠️ 清理现有实例时出错：', error);
    }
    window.cursorSync = null;
}

// 创建新实例
try {
    window.cursorSync = new CursorSync();
    console.log('✅ Cursor 同步器启动成功');
    console.log('🔧 使用全局 WebSocket 管理器，确保只有一个连接');
} catch (error) {
    console.error('❌ Cursor 同步器启动失败：', error);
}

// 全局控制函数
window.stopCursorSync = () => {
    if (window.cursorSync) {
        window.cursorSync.stop();
    }
};

window.restartCursorSync = () => {
    if (window.cursorSync) {
        window.cursorSync.restart();
    } else {
        console.log('🔄 重新创建 Cursor 同步器...');
        window.cursorSync = new CursorSync();
    }
};

// 强制清理所有连接
window.forceCleanup = () => {
    console.log('🧹 强制清理所有连接...');

    // 清理现有实例
    if (window.cursorSync) {
        console.log('🔄 清理现有 CursorSync 实例...');
        window.cursorSync.stop();
        window.cursorSync = null;
        console.log('✅ CursorSync 实例清理完成');
    }

    // 清理全局 WebSocket 管理器
    if (window.webSocketManager) {
        console.log('🔄 清理全局 WebSocket 管理器...');
        window.webSocketManager.disconnect();
        window.webSocketManager = null;
        console.log('✅ WebSocket 管理器清理完成');
    }

    // 清理可能存在的通知
    const notification = document.getElementById('cursor-sync-notification');
    if (notification) {
        notification.remove();
    }

    console.log('🧹 强制清理完成！');
};

// 完全重置并重新启动
window.fullReset = () => {
    console.log('🔄 完全重置 Cursor 同步器...');

    // 1. 强制清理
    window.forceCleanup();

    // 2. 等待一段时间确保清理完成
    setTimeout(() => {
        console.log('🚀 重新创建 Cursor 同步器...');
        try {
            window.cursorSync = new CursorSync();
            console.log('✅ 完全重置完成！');
        } catch (error) {
            console.error('❌ 重新创建失败：', error);
        }
    }, 1000);
};

window.debugCursorSync = () => {
    if (!window.cursorSync) {
        console.log('❌ 同步器未初始化');
        return;
    }

    const sync = window.cursorSync;
    console.log('🔍 Cursor 同步器调试信息：');
    console.log('  - 服务器：', sync.serverUrl);
    console.log('  - 聊天容器：', sync.chatContainer?.tagName);
    console.log('  - 最后内容长度：', sync.lastContent.length);
    console.log('  - HTTP 重试次数：', sync.retryCount);
    console.log('  - 同步状态：', sync.syncInterval ? '运行中' : '已停止');

    // WebSocket 管理器状态
    if (window.webSocketManager) {
        console.log('  - WebSocket 管理器状态：', window.webSocketManager.getStatus());
        console.log('  - WebSocket 管理器连接中：', window.webSocketManager.isConnecting);
        console.log('  - WebSocket 管理器重试次数：', window.webSocketManager.retryCount);
    } else {
        console.log('  - WebSocket 管理器：未初始化');
    }

    // WebSocket 管理器详细信息
    if (window.webSocketManager && window.webSocketManager.ws) {
        const states = ['连接中', '已连接', '关闭中', '已关闭'];
        console.log('  - WebSocket 状态说明：', states[window.webSocketManager.ws.readyState] || '未知');
        console.log('  - WebSocket URL:', window.webSocketManager.ws.url);
    }

    // 测试内容获取
    const content = sync.getContent();
    if (content) {
        console.log('✅ 当前内容：', content.contentLength, '字符');
    } else {
        console.log('❌ 内容获取失败');
    }

    // 测试输入框查找
    console.log('🔍 查找输入框测试：');

    // 🎯 首先测试 Cursor 特定选择器
    console.log('📍 Cursor 特定选择器测试：');
    const cursorInput = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
    console.log(`  - div.aislash-editor-input[contenteditable="true"]: ${cursorInput ? '✅ 找到' : '❌ 未找到'}`);
    if (cursorInput) {
        console.log(`    可见：${cursorInput.offsetParent !== null}, 高度：${cursorInput.offsetHeight}px`);
        console.log(`    类名："${cursorInput.className}"`);
        console.log(`    ID: "${cursorInput.id}"`);
    }

    // 测试 Cursor 发送按钮
    const cursorSendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;
    console.log(`  - Cursor 发送按钮：${cursorSendBtn ? '✅ 找到' : '❌ 未找到'}`);
    if (cursorSendBtn) {
        console.log(`    可见：${cursorSendBtn.offsetParent !== null}, 启用：${!cursorSendBtn.disabled}`);
    }

    // 通用选择器测试
    console.log('\n📍 通用选择器测试：');
    const inputSelectors = [
        'div.aislash-editor-input',
        '.aislash-editor-input',
        'div[contenteditable="true"]',
        '[contenteditable="true"]',
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="问"]',
        'textarea',
        '[role="textbox"]'
    ];

    for (const selector of inputSelectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`  - ${selector}: 找到 ${elements.length} 个元素`);
            for (let i = 0; i < elements.length; i++) {
                const el = elements[i];
                console.log(`    [${i}] 可见: ${el.offsetParent !== null}, 启用: ${!el.disabled}, 高度: ${el.offsetHeight}px`);
            }
        }
    }

    // 手动测试消息发送
    console.log('\n💡 手动测试提示：');
    console.log('  运行 testCursorMessageSending("测试消息") 来测试消息发送');
    console.log('  运行 restartCursorSync() 来重启同步器');
    console.log('  运行 checkWebSocketStatus() 来检查 WebSocket 状态');
};

// 添加手动测试函数
window.testCursorMessageSending = (message = '这是一个测试消息') => {
    if (!window.cursorSync) {
        console.log('❌ cursorSync 未初始化');
        return;
    }

    console.log('🧪 手动测试消息发送：', message);
    window.cursorSync.handleUserMessage(message);
};



// 添加 WebSocket 状态检查函数
window.checkWebSocketStatus = () => {
    console.log('🔍 WebSocket 状态检查：');

    if (window.webSocketManager) {
        console.log('✅ WebSocket 管理器已初始化');
        console.log('  - 连接状态：', window.webSocketManager.getStatus());
        console.log('  - 连接中：', window.webSocketManager.isConnecting);
        console.log('  - 重试次数：', window.webSocketManager.retryCount);
        console.log('  - 最大重试次数：', window.webSocketManager.maxRetries);

        if (window.webSocketManager.ws) {
            const states = ['连接中', '已连接', '关闭中', '已关闭'];
            console.log('  - WebSocket 状态：', states[window.webSocketManager.ws.readyState] || '未知');
            console.log('  - URL:', window.webSocketManager.ws.url);
            console.log('  - 协议：', window.webSocketManager.ws.protocol);
        }
    } else {
        console.log('❌ WebSocket 管理器未初始化');
    }

    if (window.cursorSync) {
        console.log('✅ CursorSync 实例已初始化');
    } else {
        console.log('❌ CursorSync 实例未初始化');
    }
};

// 检查所有可能的 WebSocket 连接
window.checkAllWebSockets = () => {
    console.log('🔍 检查所有 WebSocket 连接...');

    // 检查全局实例
    if (window.cursorSync) {
        console.log('✅ 找到全局 cursorSync 实例');
        if (window.cursorSync.ws) {
            const states = ['连接中', '已连接', '关闭中', '已关闭'];
            console.log(`  - WebSocket 状态：${states[window.cursorSync.ws.readyState] || '未知'}`);
        } else {
            console.log('  - 无 WebSocket 连接');
        }
    } else {
        console.log('❌ 未找到全局 cursorSync 实例');
    }

    // 检查是否有其他 WebSocket 连接
    console.log('🔍 检查页面中的所有 WebSocket 连接...');
    const allElements = document.querySelectorAll('*');
    let wsCount = 0;

    for (const element of allElements) {
        if (element._websocket || element.websocket) {
            wsCount++;
            console.log(`  - 发现 WebSocket 连接 #${wsCount}:`, element);
        }
    }

    if (wsCount === 0) {
        console.log('✅ 页面中未发现其他 WebSocket 连接');
    } else {
        console.log(`⚠️ 发现 ${wsCount} 个其他 WebSocket 连接`);
    }
};

console.log('✨ Cursor 同步脚本加载完成！');
console.log('💡 使用说明：');
console.log('  - 脚本会自动开始双向同步');
console.log('  - HTTP 同步：Cursor → Web (每 5 秒检查)');
console.log('  - WebSocket：Web → Cursor (实时接收)');
console.log('  - stopCursorSync() - 停止同步');
console.log('  - restartCursorSync() - 重启同步');
console.log('  - debugCursorSync() - 查看调试信息');
console.log('  - testCursorMessageSending("消息") - 手动测试发送');

console.log('  - checkWebSocketStatus() - 检查 WebSocket 状态');
console.log('  - checkAllWebSockets() - 检查所有 WebSocket 连接');
console.log('  - forceCleanup() - 强制清理所有连接');
console.log('  - fullReset() - 完全重置并重新启动');
console.log('  - 确保服务器在 localhost:3000 运行');
console.log('🎯 现在可以从 Web 界面发送消息到 Cursor 了！');
console.log('🔧 使用全局 WebSocket 管理器，确保只有一个连接');

// 页面卸载时自动清理
window.addEventListener('beforeunload', () => {
    if (window.cursorSync) {
        console.log('🧹 页面卸载，自动清理连接...');
        window.cursorSync.stop();
    }
});

