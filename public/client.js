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

        const wsUrl = 'ws://localhost:3460?type=web';
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
                this.handleWebSocketMessage(data);
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
                this.displayCursorMessage(data.data);
                break;
            default:
                console.log('未知消息类型:', data.type);
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
        messageElement.innerHTML = `
            <div>${message}</div>
            <div class="message-timestamp">${timestamp}</div>
        `;

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // 初始化AI演示消息
    initAIDemo() {
        // 延迟一秒后添加示例消息
        setTimeout(() => {
            const messagesContainer = document.getElementById('messages-container');
            if (messagesContainer) {
                const welcomeMessage = document.createElement('div');
                welcomeMessage.className = 'chat-message ai';
                welcomeMessage.innerHTML = `
                    <div>👋 欢迎使用 AI 助手！</div>
                    <div>现在您可以在这里看到Cursor中的AI对话内容了。</div>
                    <div>• 在Cursor中与AI对话</div>
                    <div>• 消息会自动同步到这里</div>
                    <div>• 支持搜索和管理功能</div>
                    <div class="message-timestamp">${new Date().toLocaleTimeString()}</div>
                `;
                messagesContainer.appendChild(welcomeMessage);
            }
        }, 1000);
    }

    // 显示从Cursor同步过来的消息
    displayCursorMessage(messageData) {
        const messagesContainer = document.getElementById('messages-container');
        if (!messagesContainer) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${messageData.type} cursor-sync`;
        messageElement.dataset.messageId = messageData.id;

        const timestamp = new Date(messageData.timestamp).toLocaleTimeString();
        const content = this.formatMessageContent(messageData.content);

        messageElement.innerHTML = `
            <div class="message-header">
                <span class="sync-indicator">🔄</span>
                <span class="message-type">${messageData.type === 'user' ? '用户' : 'AI'}</span>
                <span class="sync-label">来自 Cursor</span>
            </div>
            <div class="message-content">${content}</div>
            <div class="message-timestamp">${timestamp}</div>
        `;

        messagesContainer.appendChild(messageElement);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // 显示通知
        this.showMessage(`同步了一条${messageData.type === 'user' ? '用户' : 'AI'}消息`, 'info');
    }

    // 格式化消息内容
    formatMessageContent(content) {
        // 处理长消息
        if (content.length > 1000) {
            return content.substring(0, 1000) + '...';
        }

        // 处理代码块
        content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

        // 处理行内代码
        content = content.replace(/`([^`]+)`/g, '<code>$1</code>');

        // 处理换行
        content = content.replace(/\n/g, '<br>');

        return content;
    }

    // 更新同步状态
    updateSyncStatus(status) {
        console.log('🔄 更新同步状态:', status);

        // 更新所有同步状态元素（顶部状态栏和AI助手标签页）
        const syncStatuses = document.querySelectorAll('.sync-status');
        const syncIndicators = document.querySelectorAll('#sync-indicator');
        const syncStatusTexts = document.querySelectorAll('#sync-status-text');

        if (syncIndicators.length === 0 || syncStatusTexts.length === 0) {
            console.error('❌ 同步状态元素未找到');
            return;
        }

        // 清除所有状态类
        syncStatuses.forEach(syncStatus => {
            syncStatus.classList.remove('connected', 'disconnected', 'error');
        });

        let indicator = '';
        let statusText = '';
        let statusClass = '';

        switch (status) {
            case 'connected':
                indicator = '✅';
                statusText = '同步已连接';
                statusClass = 'connected';
                break;
            case 'disconnected':
                indicator = '❌';
                statusText = '同步已断开';
                statusClass = 'disconnected';
                break;
            case 'error':
                indicator = '⚠️';
                statusText = '同步错误';
                statusClass = 'disconnected';
                break;
            case 'connecting':
                indicator = '🔄';
                statusText = '同步连接中...';
                statusClass = '';
                break;
            default:
                indicator = '🔄';
                statusText = '同步中...';
                statusClass = '';
        }

        // 更新所有指示器
        syncIndicators.forEach(el => {
            el.textContent = indicator;
        });

        syncStatusTexts.forEach(el => {
            el.textContent = statusText;
        });

        // 添加状态类
        if (statusClass) {
            syncStatuses.forEach(syncStatus => {
                syncStatus.classList.add(statusClass);
            });
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
