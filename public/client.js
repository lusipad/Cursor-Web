// 🚀 Cursor Remote Control v2.0 - 前端客户端
class CursorRemoteClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 3000;
        this.serverAddress = '';
        this.selectedModel = 'claude-4-sonnet';
        this.init();
    }

    init() {
        this.bindEvents();
        this.initTabs();
        this.loadInjectScript();
        this.initAIDemo();
        this.initMarkdownRenderer();

        // 确保DOM元素准备好后再连接WebSocket
        setTimeout(() => {
            this.updateSyncStatus('connecting');
            this.checkServerStatus();
        }, 100);
    }

    // 事件绑定
    bindEvents() {
        // 标签页切换
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.tab;
                this.switchTab(tabId);
            });
        });

        // 工作空间设置
        document.getElementById('set-workspace-btn').addEventListener('click', () => {
            this.setWorkspace();
        });

        // 复制脚本
        document.getElementById('copy-script-btn').addEventListener('click', () => {
            this.copyInjectScript();
        });

        // Git 操作
        document.getElementById('refresh-branches-btn').addEventListener('click', () => {
            this.refreshBranches();
        });

        // AI 对话
        document.getElementById('send-ai-btn').addEventListener('click', () => {
            this.sendAIMessage();
        });

        document.getElementById('ai-message').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                this.sendAIMessage();
            }
        });

        // 新增的AI界面功能
        this.bindAIEvents();
    }

    // AI界面事件绑定
    bindAIEvents() {
        // AI聊天控制按钮
        document.getElementById('clear-chat-btn').addEventListener('click', () => {
            this.clearChat();
        });

        document.getElementById('search-chat-btn').addEventListener('click', () => {
            this.toggleSearchWidget();
        });

        document.getElementById('new-chat-btn').addEventListener('click', () => {
            this.startNewChat();
        });

        document.getElementById('start-new-chat').addEventListener('click', () => {
            this.startNewChat();
        });

        // 模型选择
        document.getElementById('model-select').addEventListener('change', (e) => {
            this.selectedModel = e.target.value;
            console.log('已选择模型:', this.selectedModel);
        });

        // 加载更多消息
        document.getElementById('load-more-btn').addEventListener('click', () => {
            this.loadMoreMessages();
        });

        // 文件上传
        document.getElementById('attach-image-btn').addEventListener('click', () => {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            this.handleFileUpload(e);
        });

        // 字符计数
        document.getElementById('ai-message').addEventListener('input', (e) => {
            this.updateCharCount(e.target.value);
            this.autoResizeTextarea(e.target);
        });

        // 搜索功能
        document.getElementById('search-close-btn').addEventListener('click', () => {
            this.closeSearchWidget();
        });

        document.getElementById('search-input').addEventListener('input', (e) => {
            this.searchMessages(e.target.value);
        });

        // 搜索控制按钮
        document.getElementById('search-case-btn').addEventListener('click', () => {
            this.toggleSearchOption('case');
        });

        document.getElementById('search-word-btn').addEventListener('click', () => {
            this.toggleSearchOption('word');
        });

        document.getElementById('search-regex-btn').addEventListener('click', () => {
            this.toggleSearchOption('regex');
        });

        // 搜索导航
        document.getElementById('search-prev-btn').addEventListener('click', () => {
            this.searchNavigate('prev');
        });

        document.getElementById('search-next-btn').addEventListener('click', () => {
            this.searchNavigate('next');
        });
    }

    // 初始化标签页
    initTabs() {
        this.switchTab('workspace');
    }

    // 切换标签页
    switchTab(tabId) {
        // 移除所有活动状态
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });

        // 激活当前标签页
        document.querySelector(`[data-tab="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');
    }

    // 检查服务器状态
    async checkServerStatus() {
        try {
            const response = await fetch('/health');
            const data = await response.json();

            this.serverAddress = data.localUrl;
            this.updateConnectionStatus(true);
            this.updateCursorStatus(data.cursorConnected);
            this.updateWorkspaceInfo(data.workspace);
        } catch (error) {
            console.error('服务器连接失败:', error);
            this.updateConnectionStatus(false);
            this.serverAddress = 'http://localhost:3459';
        }

        // 无论健康检查是否成功，都尝试建立WebSocket连接
        this.connectWebSocket();
    }

    // 连接 WebSocket
    connectWebSocket() {
        if (this.ws) {
            this.ws.close();
        }

        const wsUrl = 'ws://localhost:3000?type=web';
        console.log('🔌 尝试连接WebSocket:', wsUrl);
        this.updateSyncStatus('connecting');

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('✅ WebSocket 连接成功');
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.updateSyncStatus('connected');
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'html_content') {
                    this.displayContent(data.data);
                } else {
                    this.handleWebSocketMessage(data);
                }
            } catch (error) {
                console.error('WebSocket 消息处理错误:', error);
            }
        };

        this.ws.onclose = (event) => {
            console.log('❌ WebSocket 连接关闭:', event.code, event.reason);
            this.stopHeartbeat();

            // 如果不是正常关闭，显示断开状态
            if (event.code !== 1000) {
                this.updateSyncStatus('disconnected');
                this.attemptReconnect();
            }
        };

        this.ws.onerror = (error) => {
            console.error('⚠️ WebSocket 错误:', error);
            this.updateSyncStatus('error');
        };
    }

    // 处理 WebSocket 消息
    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'pong':
                // 心跳响应
                break;
            case 'ai_response':
                this.displayAIResponse(data.data);
                break;
            case 'cursor_sync':
            case 'cursor_message':  // 🔧 修复：处理服务器发送的cursor_message消息
                this.displayCursorMessage(data.data);
                break;
            default:
                console.log('未知消息类型:', data.type, data);
        }
    }

    // 心跳检测
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping' }));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    // 重连机制
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`尝试重连... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            this.updateSyncStatus('connecting');

            setTimeout(() => {
                this.connectWebSocket();
            }, this.reconnectDelay);
        } else {
            console.error('WebSocket 重连失败，已达到最大重连次数');
            this.updateSyncStatus('error');
        }
    }

    // 更新连接状态
    updateConnectionStatus(connected) {
        const statusElement = document.getElementById('connection-status');
        if (connected) {
            statusElement.textContent = '🟢 服务器已连接';
            statusElement.style.color = '#2ecc71';
        } else {
            statusElement.textContent = '🔴 服务器未连接';
            statusElement.style.color = '#e74c3c';
        }
    }

    // 更新 Cursor 状态
    updateCursorStatus(connected) {
        const statusElement = document.getElementById('cursor-status');
        if (connected) {
            statusElement.textContent = '🟢 Cursor 已连接';
            statusElement.style.color = '#2ecc71';
        } else {
            statusElement.textContent = '🔴 Cursor 未连接';
            statusElement.style.color = '#e74c3c';
        }
    }

    // 更新工作空间信息
    updateWorkspaceInfo(workspace) {
        const infoElement = document.getElementById('workspace-info');
        if (workspace) {
            infoElement.innerHTML = `<strong>当前工作空间:</strong> ${workspace}`;
            infoElement.style.display = 'block';
        } else {
            infoElement.style.display = 'none';
        }
    }

    // 加载注入脚本
    async loadInjectScript() {
        try {
            const response = await fetch('/inject-script.js');
            const script = await response.text();

            const codeElement = document.getElementById('inject-script-code');
            codeElement.textContent = script;
        } catch (error) {
            console.error('加载注入脚本失败:', error);
            const codeElement = document.getElementById('inject-script-code');
            codeElement.textContent = '// 加载失败，请刷新页面重试';
        }
    }

    // 复制注入脚本
    copyInjectScript() {
        const codeElement = document.getElementById('inject-script-code');
        const text = codeElement.textContent;

        navigator.clipboard.writeText(text).then(() => {
            const button = document.getElementById('copy-script-btn');
            const originalText = button.textContent;
            button.textContent = '已复制！';
            button.style.background = '#2ecc71';

            setTimeout(() => {
                button.textContent = originalText;
                button.style.background = '';
            }, 2000);
        }).catch(error => {
            console.error('复制失败:', error);
            alert('复制失败，请手动复制脚本');
        });
    }

    // 设置工作空间
    async setWorkspace() {
        const path = document.getElementById('workspace-path').value.trim();
        if (!path) {
            alert('请输入工作空间路径');
            return;
        }

        try {
            const response = await fetch('/api/workspace', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path })
            });

            const data = await response.json();
            if (data.success) {
                this.updateWorkspaceInfo(data.workspace);
                this.showMessage('工作空间设置成功', 'success');
            } else {
                this.showMessage(data.error || '设置失败', 'error');
            }
        } catch (error) {
            console.error('设置工作空间失败:', error);
            this.showMessage('设置失败', 'error');
        }
    }

    // 刷新分支
    async refreshBranches() {
        const button = document.getElementById('refresh-branches-btn');
        const originalText = button.textContent;
        button.textContent = '刷新中...';
        button.disabled = true;

        try {
            const response = await fetch('/api/git/branches');
            const data = await response.json();

            if (data.success) {
                this.displayBranches(data.branches);
            } else {
                this.showMessage(data.error || '获取分支失败', 'error');
            }
        } catch (error) {
            console.error('获取分支失败:', error);
            this.showMessage('获取分支失败', 'error');
        } finally {
            button.textContent = originalText;
            button.disabled = false;
        }
    }

    // 显示分支列表
    displayBranches(branches) {
        const listElement = document.getElementById('branches-list');
        listElement.innerHTML = '';

        branches.forEach(branch => {
            const branchElement = document.createElement('div');
            branchElement.className = `branch-item ${branch.isCurrent ? 'current' : ''}`;

            const nameElement = document.createElement('span');
            nameElement.textContent = branch.name;
            if (branch.isCurrent) {
                nameElement.textContent += ' (当前)';
            }

            const buttonElement = document.createElement('button');
            buttonElement.textContent = '切换';
            buttonElement.disabled = branch.isCurrent;
            buttonElement.addEventListener('click', () => {
                this.checkoutBranch(branch.name);
            });

            branchElement.appendChild(nameElement);
            branchElement.appendChild(buttonElement);
            listElement.appendChild(branchElement);
        });
    }

    // 切换分支
    async checkoutBranch(branchName) {
        try {
            const response = await fetch('/api/git/checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ branch: branchName })
            });

            const data = await response.json();
            if (data.success) {
                this.showMessage(data.message || '切换成功', 'success');
                this.refreshBranches(); // 刷新分支列表
            } else {
                this.showMessage(data.error || '切换失败', 'error');
            }
        } catch (error) {
            console.error('切换分支失败:', error);
            this.showMessage('切换分支失败', 'error');
        }
    }

    // 发送 AI 消息
    async sendAIMessage() {
        const messageElement = document.getElementById('ai-message');
        const message = messageElement.value.trim();

        if (!message) {
            alert('请输入消息内容');
            return;
        }

        // 显示用户消息
        this.displayChatMessage(message, 'user');
        messageElement.value = '';
        this.updateCharCount('');

        // 通过WebSocket发送到Cursor
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'send_to_cursor',
                    data: { message: message }
                }));

                // 显示发送状态
                const statusElement = document.createElement('div');
                statusElement.className = 'chat-message system';
                statusElement.innerHTML = `
                    <div class="message-header">
                        <span class="sync-indicator">📤</span>
                        <span class="message-type">系统</span>
                        <span class="sync-label">发送到 Cursor</span>
                    </div>
                    <div class="message-content">正在发送消息到Cursor...</div>
                    <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
                `;

                const messagesContainer = document.getElementById('messages-container');
                if (messagesContainer) {
                    messagesContainer.appendChild(statusElement);
                    messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }

                // 3秒后移除状态消息
                setTimeout(() => {
                    if (statusElement.parentNode) {
                        statusElement.parentNode.removeChild(statusElement);
                    }
                }, 3000);

            } else {
                this.displayChatMessage('WebSocket连接断开，无法发送到Cursor', 'system');
            }
        } catch (error) {
            console.error('发送到Cursor失败:', error);
            this.displayChatMessage('发送到Cursor失败: ' + error.message, 'system');
        }
    }

    // 显示聊天消息
    displayChatMessage(message, sender) {
        const messagesElement = document.getElementById('chat-messages');
        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${sender}`;
        messageElement.textContent = message;

        messagesElement.appendChild(messageElement);
        messagesElement.scrollTop = messagesElement.scrollHeight;
    }

    // 显示 AI 回复
    displayAIResponse(response) {
        this.displayChatMessage(response.message || '收到 AI 回复', 'ai');
    }

    // 显示消息
    showMessage(message, type = 'info') {
        const messageElement = document.createElement('div');
        messageElement.className = `message message-${type}`;
        messageElement.textContent = message;

        // 添加样式
        messageElement.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            animation: slideIn 0.3s ease-out;
        `;

        switch (type) {
            case 'success':
                messageElement.style.background = '#2ecc71';
                break;
            case 'error':
                messageElement.style.background = '#e74c3c';
                break;
            default:
                messageElement.style.background = '#3498db';
        }

        document.body.appendChild(messageElement);

        // 3秒后自动消失
        setTimeout(() => {
            messageElement.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                document.body.removeChild(messageElement);
            }, 300);
        }, 3000);
    }

    // === 新增的AI界面功能方法 ===

    // 清空聊天
    clearChat() {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.innerHTML = '';
        }
        // 同时清空旧的聊天区域
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) {
            chatMessages.innerHTML = '';
        }
        this.showMessage('聊天记录已清空', 'info');
    }

    // 开始新对话
    startNewChat() {
        this.clearChat();
        this.showMessage('已开始新对话', 'info');
    }

    // 切换搜索框
    toggleSearchWidget() {
        const searchWidget = document.getElementById('search-widget');
        const isVisible = searchWidget.style.display !== 'none';
        searchWidget.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
            document.getElementById('search-input').focus();
        }
    }

    // 关闭搜索框
    closeSearchWidget() {
        document.getElementById('search-widget').style.display = 'none';
        this.clearSearchHighlight();
    }

    // 更新字符计数
    updateCharCount(text) {
        const charCount = document.getElementById('char-count');
        if (charCount) {
            charCount.textContent = `${text.length}/10000`;

            // 根据字符数改变颜色
            if (text.length > 9000) {
                charCount.style.color = '#ff6b6b';
            } else if (text.length > 8000) {
                charCount.style.color = '#feca57';
            } else {
                charCount.style.color = '#6a6a6a';
            }
        }
    }

    // 自动调整文本框高度
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';

        // 更新发送按钮状态
        const sendBtn = document.getElementById('send-ai-btn');
        if (sendBtn) {
            sendBtn.disabled = textarea.value.trim().length === 0;
        }
    }

    // 处理文件上传
    handleFileUpload(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        const file = files[0];
        if (!file.type.startsWith('image/')) {
            this.showMessage('只支持图片文件', 'error');
            return;
        }

        if (file.size > 10 * 1024 * 1024) { // 10MB
            this.showMessage('文件大小不能超过10MB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.showImagePreview(e.target.result, file.name);
        };
        reader.readAsDataURL(file);
    }

    // 显示图片预览
    showImagePreview(src, fileName) {
        const aiMessage = document.getElementById('ai-message');
        const preview = document.createElement('div');
        preview.className = 'image-preview';
        preview.style.cssText = `
            margin-bottom: 8px;
            padding: 8px;
            background: #2d2d30;
            border-radius: 4px;
            border: 1px solid #3e3e42;
        `;

        preview.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <img src="${src}" alt="${fileName}" style="max-width: 50px; max-height: 50px; border-radius: 4px;">
                <div style="flex: 1; color: #cccccc; font-size: 12px;">
                    <div>${fileName}</div>
                    <div style="color: #6a6a6a; font-size: 10px;">图片已附加</div>
                </div>
                <button onclick="this.parentNode.parentNode.remove()" style="background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 16px;">×</button>
            </div>
        `;

        aiMessage.parentNode.insertBefore(preview, aiMessage);
    }

    // 加载更多消息
    loadMoreMessages() {
        this.showMessage('正在加载更多消息...', 'info');

        setTimeout(() => {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                const oldMessage = document.createElement('div');
                oldMessage.className = 'chat-message ai';
                oldMessage.innerHTML = `
                    <div>这是一条历史消息示例</div>
                    <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
                `;
                messagesContainer.insertBefore(oldMessage, messagesContainer.firstChild);
            }
            this.showMessage('已加载更多消息', 'info');
        }, 1000);
    }

    // 搜索消息
    searchMessages(query) {
        if (!query.trim()) {
            this.clearSearchHighlight();
            document.getElementById('search-results').textContent = '0/0';
            return;
        }

        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        const messages = messagesContainer.querySelectorAll('.chat-message');
        let matches = 0;

        this.clearSearchHighlight();

        messages.forEach(message => {
            const text = message.textContent.toLowerCase();
            if (text.includes(query.toLowerCase())) {
                matches++;
                this.highlightText(message, query);
            }
        });

        document.getElementById('search-results').textContent = `${matches}/${messages.length}`;
    }

    // 高亮搜索文本
    highlightText(element, query) {
        const text = element.innerHTML;
        const regex = new RegExp(`(${query})`, 'gi');
        element.innerHTML = text.replace(regex, '<mark style="background: #feca57; color: #2d2d30; padding: 2px 4px; border-radius: 2px;">$1</mark>');
    }

    // 清除搜索高亮
    clearSearchHighlight() {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            const marks = messagesContainer.querySelectorAll('mark');
            marks.forEach(mark => {
                mark.outerHTML = mark.innerHTML;
            });
        }
    }

    // 切换搜索选项
    toggleSearchOption(option) {
        const button = document.getElementById(`search-${option}-btn`);
        if (button) {
            button.classList.toggle('active');

            // 重新搜索
            const query = document.getElementById('search-input').value;
            if (query) {
                this.searchMessages(query);
            }
        }
    }

    // 搜索导航
    searchNavigate(direction) {
        const marks = document.querySelectorAll('#messages-container mark');
        if (marks.length === 0) return;

        if (direction === 'next') {
            if (marks.length > 0) {
                marks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        } else {
            if (marks.length > 0) {
                marks[marks.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }

    // 重写显示聊天消息方法以支持新界面
    displayChatMessage(message, sender) {
        // 优先使用新的消息容器
        let messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) {
            // 如果新容器不存在，使用旧的
            messagesContainer = document.getElementById('chat-messages');
        }

        if (!messagesContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${sender}`;

        const timestamp = new Date().toLocaleTimeString();
        const formattedMessage = this.formatMessageContent(message);

        messageElement.innerHTML = `
            <div class="message-content markdown-content">${formattedMessage}</div>
            <div class="message-timestamp">${timestamp}</div>
        `;

        messagesContainer.appendChild(messageElement);

        // 🎨 渲染Emoji表情
        this.renderEmojis(messageElement);

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 初始化Markdown渲染器
    initMarkdownRenderer() {
        // 等待库加载完成
        setTimeout(() => {
            if (typeof marked !== 'undefined') {
                // 配置marked
                marked.setOptions({
                    breaks: true,
                    gfm: true,
                    highlight: function(code, lang) {
                        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                            try {
                                return hljs.highlight(code, { language: lang }).value;
                            } catch (err) {}
                        }
                        return code;
                    }
                });
                console.log('✅ Markdown渲染器初始化完成');
            }

            // 初始化Mermaid
            if (typeof mermaid !== 'undefined') {
                mermaid.initialize({
                    startOnLoad: true,
                    theme: 'default',
                    securityLevel: 'loose',
                    fontFamily: 'monospace'
                });
                console.log('✅ Mermaid图表渲染器初始化完成');
            }
        }, 500);
    }

    // 初始化AI演示消息
    initAIDemo() {
        // 延迟一秒后添加示例消息
        setTimeout(() => {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                const welcomeMarkdown = `
# 👋 欢迎使用 AI 助手！

现在您可以在这里看到**Cursor中的AI对话内容**了。

## ✨ 功能特性

- 🔄 在Cursor中与AI对话
- 📱 消息会自动同步到这里
- 🔍 支持搜索和管理功能
- 📝 **支持Markdown渲染**
- 📊 **支持Mermaid图表**
- 🎨 **支持Emoji表情** 😊

## 🚀 快速开始

\`\`\`javascript
// 在Cursor控制台中运行注入脚本
console.log("Hello from Cursor! 🎯");
\`\`\`

> 💡 **提示**: 现在消息显示效果更加美观了！
                `;

                const welcomeMessage = document.createElement('div');
                welcomeMessage.className = 'chat-message ai';
                welcomeMessage.innerHTML = `
                    <div class="message-content markdown-content">${this.renderMarkdown(welcomeMarkdown)}</div>
                    <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
                `;
                messagesContainer.appendChild(welcomeMessage);

                // 渲染Emoji
                this.renderEmojis(welcomeMessage);
            }
        }, 1000);
    }

    // 显示从Cursor同步过来的消息
    displayCursorMessage(messageData) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        console.log('🎯 接收到Cursor消息:', {
            type: messageData.type,
            hasRichContent: messageData.hasRichContent,
            contentLength: messageData.content?.length,
            hasHtml: !!messageData.html,
            hasMarkdown: !!messageData.markdown
        });

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${messageData.type} cursor-sync`;
        messageElement.dataset.messageId = messageData.id;

        const timestamp = new Date(messageData.timestamp).toLocaleTimeString();

        // 🎨 使用新的格式化方法，传入完整的消息数据
        const content = this.formatMessageContent(messageData);

        // 🏷️ 添加富文本指示器
        const richContentBadge = messageData.hasRichContent ?
            '<span class="rich-content-badge">📝 富文本</span>' : '';

        messageElement.innerHTML = `
            <div class="message-header">
                <span class="sync-indicator">🔄</span>
                <span class="message-type">${messageData.type === 'user' ? '👤 用户' : '🤖 AI'}</span>
                <span class="sync-label">来自 Cursor</span>
                ${richContentBadge}
            </div>
            <div class="message-content markdown-content">${content}</div>
            <div class="message-timestamp">${timestamp}</div>
        `;

        messagesContainer.appendChild(messageElement);

        // 🎨 渲染Emoji表情
        this.renderEmojis(messageElement);

        // 📊 处理Mermaid图表（如果有的话）
        setTimeout(() => {
            const mermaidElements = messageElement.querySelectorAll('.mermaid');
            mermaidElements.forEach((element) => {
                if (typeof mermaid !== 'undefined') {
                    try {
                        mermaid.init(undefined, element);
                    } catch (error) {
                        console.warn('Mermaid初始化失败:', error);
                    }
                }
            });
        }, 200);

        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // 显示更详细的通知
        const contentType = messageData.hasRichContent ? '富文本' : '普通文本';
        this.showMessage(`同步了一条${messageData.type === 'user' ? '用户' : 'AI'}消息 (${contentType})`, 'info');
    }

    // 🎨 渲染Markdown内容
    renderMarkdown(content) {
        if (!content || typeof marked === 'undefined') {
            return this.escapeHtml(content || '');
        }

        try {
            // 预处理Mermaid图表
            content = this.extractMermaidDiagrams(content);

            // 渲染Markdown
            let html = marked.parse(content);

            // 后处理数学公式
            html = this.renderMathFormulas(html);

            return html;
        } catch (error) {
            console.error('Markdown渲染错误:', error);
            return this.escapeHtml(content);
        }
    }

    // 📊 提取并渲染Mermaid图表
    extractMermaidDiagrams(content) {
        const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
        let mermaidCounter = 0;

        return content.replace(mermaidRegex, (match, diagram) => {
            const diagramId = `mermaid-${Date.now()}-${mermaidCounter++}`;

            // 延迟渲染Mermaid图表
            setTimeout(() => {
                const element = document.getElementById(diagramId);
                if (element && typeof mermaid !== 'undefined') {
                    try {
                        mermaid.render(`mermaid-svg-${diagramId}`, diagram.trim(), (svgCode) => {
                            element.innerHTML = svgCode;
                        });
                    } catch (error) {
                        console.error('Mermaid渲染错误:', error);
                        element.innerHTML = `<pre><code>${this.escapeHtml(diagram)}</code></pre>`;
                    }
                }
            }, 100);

            return `<div class="mermaid-container"><div id="${diagramId}" class="mermaid">${this.escapeHtml(diagram.trim())}</div></div>`;
        });
    }

    // 🔢 渲染数学公式
    renderMathFormulas(html) {
        if (typeof katex === 'undefined') return html;

        try {
            // 处理行内数学公式 $...$
            html = html.replace(/\$([^$]+)\$/g, (match, formula) => {
                try {
                    return katex.renderToString(formula, { displayMode: false });
                } catch (error) {
                    return match;
                }
            });

            // 处理块级数学公式 $$...$$
            html = html.replace(/\$\$([\s\S]+?)\$\$/g, (match, formula) => {
                try {
                    return katex.renderToString(formula, { displayMode: true });
                } catch (error) {
                    return match;
                }
            });
        } catch (error) {
            console.error('数学公式渲染错误:', error);
        }

        return html;
    }

    // 🎨 渲染Emoji表情
    renderEmojis(element) {
        if (typeof twemoji !== 'undefined' && element) {
            try {
                twemoji.parse(element, {
                    className: 'emoji',
                    folder: 'svg',
                    ext: '.svg'
                });
            } catch (error) {
                console.error('Emoji渲染错误:', error);
            }
        }
    }

    // 🔒 HTML转义
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 格式化消息内容（增强的格式处理）
    formatMessageContent(messageData) {
        // 如果传入的是字符串，兼容旧格式
        if (typeof messageData === 'string') {
            return this.formatLongText(messageData);
        }

        // 如果是消息对象，优先使用富文本格式
        if (messageData && typeof messageData === 'object') {
            const content = messageData.content || '';
            const html = messageData.html || '';
            const markdown = messageData.markdown || '';
            const hasRichContent = messageData.hasRichContent || false;

            console.log('📝 处理消息格式:', {
                hasRichContent,
                hasHtml: !!html,
                hasMarkdown: !!markdown,
                contentPreview: content.substring(0, 100) + '...'
            });

            // 🎯 新的优先级：HTML > Markdown > 纯文本
            // 既然都是网页环境，直接使用HTML避免转换损失
            if (hasRichContent && html && this.hasRichFormatting(html)) {
                console.log('✅ 使用原始HTML格式 (避免转换损失)');
                return this.sanitizeAndRenderHTML(html);
            } else if (hasRichContent && markdown && markdown !== content) {
                console.log('✅ 使用Markdown格式');
                return this.renderMarkdown(markdown);
            } else {
                console.log('📄 使用智能格式化的纯文本');
                return this.formatLongText(content);
            }
        }

        // 默认使用长文本格式化
        return this.formatLongText(messageData);
    }

    // 🎨 智能格式化长文本（新增方法）
    formatLongText(text) {
        if (!text) return '';

        // 预处理：识别和保护特殊格式
        const processedText = this.preprocessText(text);

        // 如果包含Markdown标记，直接渲染Markdown
        if (this.containsMarkdownSyntax(processedText)) {
            return this.renderMarkdown(processedText);
        }

        // 否则进行智能段落化处理
        return this.convertToReadableFormat(processedText);
    }

    // 🔍 预处理文本，识别特殊格式（保守版）
    preprocessText(text) {
        // 只处理明确需要分段的格式，避免过度分割
        let processed = text
            // 只在连续编号列表之间添加换行，且确保是真正的列表
            .replace(/(\d+\.\s+[^\n]{20,}?)(\s{2,})(\d+\.\s+)/g, '$1\n\n$3')
            // 只在明确的功能列表块之间添加换行
            .replace(/([✅❌🔥📊🎯🚀🔧⚡💡🎨📝🔍🛡️][^\n✅❌🔥📊🎯🚀🔧⚡💡🎨📝🔍🛡️]{30,}?)(\s{2,})([✅❌🔥📊🎯🚀🔧⚡💡🎨📝🔍🛡️])/g, '$1\n\n$3')
            // 处理Markdown标题
            .replace(/(#{1,6}\s+[^\n]+)(\s+)(#{1,6}\s+)/g, '$1\n\n$3')
            // 仅在长句子后的明确段落转换处添加换行
            .replace(/([。！？]\s*)([A-Z\u4e00-\u9fa5]{1}[^。！？]{50,})/g, '$1\n\n$2');

        return processed;
    }

    // 🔍 检查是否包含Markdown语法
    containsMarkdownSyntax(text) {
        const markdownPatterns = [
            /#{1,6}\s+/,          // 标题
            /\*{1,2}[^*]+\*{1,2}/, // 加粗/斜体
            /`[^`]+`/,            // 行内代码
            /```[\s\S]*?```/,     // 代码块
            /^\s*[-*+]\s+/m,      // 列表
            /^\s*\d+\.\s+/m,      // 有序列表
            /\[.*?\]\(.*?\)/,     // 链接
            /^\s*>\s+/m           // 引用
        ];

        return markdownPatterns.some(pattern => pattern.test(text));
    }

    // 🎨 转换为可读格式
    convertToReadableFormat(text) {
        // 1. 分割成逻辑段落
        const paragraphs = this.splitIntoLogicalParagraphs(text);

        // 2. 格式化每个段落
        const formattedParagraphs = paragraphs.map(paragraph => {
            return this.formatParagraph(paragraph);
        });

        // 3. 组合成最终HTML
        return formattedParagraphs.join('\n\n');
    }

    // 📄 分割成逻辑段落（优化版）
    splitIntoLogicalParagraphs(text) {
        // 首先按明确的段落分隔符分割
        const majorParagraphs = text.split(/\n\s*\n/);

        const finalParagraphs = [];

        majorParagraphs.forEach(paragraph => {
            const trimmed = paragraph.trim();
            if (trimmed.length < 20) return; // 过滤太短的段落

            // 检查是否是功能列表块（连续的特殊符号开头的行）
            if (this.isFeatureListBlock(trimmed)) {
                // 按行分割功能列表
                const lines = trimmed.split(/\n/);
                lines.forEach(line => {
                    const cleanLine = line.trim();
                    if (cleanLine.length > 10 && /^[✅❌🔥📊🎯🚀🔧⚡💡🎨📝🔍🛡️]/.test(cleanLine)) {
                        finalParagraphs.push(cleanLine);
                    }
                });
            } else if (this.isNumberedListBlock(trimmed)) {
                // 按编号分割列表
                const items = trimmed.split(/(?=\d+\.\s+)/);
                items.forEach(item => {
                    const cleanItem = item.trim();
                    if (cleanItem.length > 10) {
                        finalParagraphs.push(cleanItem);
                    }
                });
            } else {
                // 普通段落，保持完整性，减少不必要的分割
                if (trimmed.length > 200) {
                    // 只有很长的段落才尝试分割
                    const sentences = this.splitBySentenceEndings(trimmed);
                    if (sentences.length > 1 && sentences.every(s => s.length > 50)) {
                        sentences.forEach(sentence => {
                            finalParagraphs.push(sentence);
                        });
                    } else {
                        // 如果分割后的句子太短，保持原段落
                        finalParagraphs.push(trimmed);
                    }
                } else {
                    // 短段落保持完整
                    finalParagraphs.push(trimmed);
                }
            }
        });

        return finalParagraphs.filter(p => p.length > 10);
    }

    // 🔍 检查是否是功能列表块
    isFeatureListBlock(text) {
        const lines = text.split(/\n/);
        let featureLines = 0;
        lines.forEach(line => {
            if (/^[✅❌🔥📊🎯🚀🔧⚡💡🎨📝🔍🛡️]/.test(line.trim())) {
                featureLines++;
            }
        });
        return featureLines >= 2 && featureLines / lines.length > 0.5;
    }

    // 🔍 检查是否是编号列表块
    isNumberedListBlock(text) {
        const numberedItems = text.match(/\d+\.\s+/g);
        return numberedItems && numberedItems.length >= 2;
    }

    // 📄 按句子结束分割（超保守策略）
    splitBySentenceEndings(text) {
        // 只在非常明确的主题转换点分割
        const majorBreaks = text.split(/([。！？])\s*(?=[A-Z\u4e00-\u9fa5][^a-z，。]{20,})/);
        const result = [];

        for (let i = 0; i < majorBreaks.length; i += 2) {
            const sentence = majorBreaks[i];
            const punctuation = majorBreaks[i + 1] || '';
            if (sentence && sentence.trim().length > 80) { // 确保是足够长的有意义句子
                result.push((sentence + punctuation).trim());
            }
        }

        // 如果没有找到合适的分割点，或分割后段落太少，保持原文
        return result.length >= 2 ? result : [text];
    }

    // 🎨 格式化单个段落
    formatParagraph(paragraph) {
        if (!paragraph || paragraph.length < 10) return '';

        // 检查段落类型并应用相应格式
        if (/^\d+\.\s+/.test(paragraph)) {
            // 编号列表项
            return `<div class="numbered-item">${this.escapeHtml(paragraph)}</div>`;
        } else if (/^[✅❌🔥📊🎯🚀🔧⚡💡🎨📝🔍🛡️]/.test(paragraph)) {
            // 特殊符号开头的功能点
            return `<div class="feature-item">${this.escapeHtml(paragraph)}</div>`;
        } else if (/[：:]$/.test(paragraph.trim())) {
            // 以冒号结尾的标题
            return `<div class="section-title">${this.escapeHtml(paragraph)}</div>`;
        } else {
            // 普通段落
            return `<div class="text-paragraph">${this.escapeHtml(paragraph)}</div>`;
        }
    }

    // 🧹 安全渲染HTML内容（优化版）
    sanitizeAndRenderHTML(html) {
        if (!html) return '';

        console.log('🎨 直接渲染HTML，保持原始格式');

        // 创建临时容器来安全处理HTML
        const tempDiv = document.createElement('div');

        try {
            tempDiv.innerHTML = html;

            // 安全处理：移除潜在危险的标签和属性
            const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form'];
            dangerousTags.forEach(tagName => {
                const elements = tempDiv.querySelectorAll(tagName);
                elements.forEach(el => el.remove());
            });

            // 移除危险的事件属性
            const allElements = tempDiv.querySelectorAll('*');
            allElements.forEach(el => {
                // 移除所有 on* 事件属性
                Array.from(el.attributes).forEach(attr => {
                    if (attr.name.startsWith('on')) {
                        el.removeAttribute(attr.name);
                    }
                });
                // 移除 javascript: 链接
                if (el.href && el.href.startsWith('javascript:')) {
                    el.removeAttribute('href');
                }
            });

            // 优化代码块显示
            const codeBlocks = tempDiv.querySelectorAll('pre code');
            codeBlocks.forEach(codeBlock => {
                // 添加代码块样式类
                codeBlock.classList.add('hljs');

                // 如果有语法高亮库，应用高亮
                if (typeof hljs !== 'undefined') {
                    try {
                        hljs.highlightElement(codeBlock);
                    } catch (error) {
                        console.warn('代码高亮失败:', error);
                    }
                }
            });

            // 优化表格样式
            const tables = tempDiv.querySelectorAll('table');
            tables.forEach(table => {
                table.classList.add('ai-response-table');
            });

            // 优化列表样式
            const lists = tempDiv.querySelectorAll('ul, ol');
            lists.forEach(list => {
                list.classList.add('ai-response-list');
            });

            // 优化引用块样式
            const blockquotes = tempDiv.querySelectorAll('blockquote');
            blockquotes.forEach(blockquote => {
                blockquote.classList.add('ai-response-quote');
            });

            // 确保链接在新窗口打开
            const links = tempDiv.querySelectorAll('a[href]');
            links.forEach(link => {
                if (!link.getAttribute('target')) {
                    link.setAttribute('target', '_blank');
                    link.setAttribute('rel', 'noopener noreferrer');
                }
            });

            return tempDiv.innerHTML;

        } catch (error) {
            console.error('HTML渲染错误:', error);
            // 如果HTML处理失败，回退到安全的文本显示
            return this.escapeHtml(tempDiv.textContent || html);
        }
    }

    // 🎨 检查HTML是否包含富格式
    hasRichFormatting(html) {
        const richTags = ['pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                         'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
                         'strong', 'b', 'em', 'i', 'a', 'img'];

        return richTags.some(tag => html.includes(`<${tag}`));
    }

    // 更新同步状态
    updateSyncStatus(status) {
        console.log('🔄 更新同步状态:', status);

        let statusText = '';
        let statusClass = '';

        switch (status) {
            case 'connected':
                statusText = '🟢 WebSocket 已连接';
                statusClass = 'connected';
                break;
            case 'disconnected':
                statusText = '🔴 WebSocket 已断开';
                statusClass = 'disconnected';
                break;
            case 'error':
                statusText = '⚠️ WebSocket 连接错误';
                statusClass = 'disconnected';
                break;
            case 'connecting':
                statusText = '🔄 WebSocket 连接中...';
                statusClass = 'connecting';
                break;
            default:
                statusText = '🔄 同步中...';
                statusClass = 'connecting';
        }

        // 使用现有的 updateStatus 函数
        this.updateStatus(statusText, statusClass);
    }

    displayContent(contentData) {
        if (contentData && contentData.html) {
            // 直接显示HTML内容
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                messagesContainer.innerHTML = contentData.html;
            }

            // 更新时间戳
            const timestamp = new Date(contentData.timestamp).toLocaleTimeString();
            this.updateStatus(`已同步 ${timestamp}`, 'connected');

            // 滚动到底部
            this.scrollToBottom();
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messages-container');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    updateStatus(message, type) {
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status ${type}`;
        }
    }
}

// 添加动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }

    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    new CursorRemoteClient();
});
