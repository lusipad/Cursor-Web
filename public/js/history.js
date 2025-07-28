// 历史记录管理模块
class HistoryManager {
    constructor() {
        this.chats = [];
        this.currentChat = null;
        this.isLoading = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadChats();
    }

    bindEvents() {
        // 搜索按钮
        const searchBtn = document.getElementById('search-btn');
        const searchField = document.getElementById('history-search');
        const refreshBtn = document.getElementById('refresh-history');
        
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.searchChats());
        }
        
        if (searchField) {
            searchField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchChats();
                }
            });
            
            // 清空搜索时重新加载所有聊天
            searchField.addEventListener('input', (e) => {
                if (e.target.value === '') {
                    this.loadChats();
                }
            });
        }
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadChats());
        }
        
        // 详情面板按钮
        const closeDetailBtn = document.getElementById('close-detail');
        const exportHtmlBtn = document.getElementById('export-html');
        const exportJsonBtn = document.getElementById('export-json');
        
        if (closeDetailBtn) {
            closeDetailBtn.addEventListener('click', () => this.closeDetail());
        }
        
        if (exportHtmlBtn) {
            exportHtmlBtn.addEventListener('click', () => this.exportChat('html'));
        }
        
        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => this.exportChat('json'));
        }
    }

    async loadChats() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateStatus('正在加载...');
        
        try {
            const response = await fetch('/api/chats');
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            this.chats = await response.json();
            this.renderChatList(this.chats);
            this.updateStats(this.chats.length);
            this.updateStatus('加载完成');
            
            console.log(`📚 加载了 ${this.chats.length} 个聊天记录`);
            
        } catch (error) {
            console.error('加载聊天历史失败:', error);
            this.showError(`加载失败: ${error.message}`);
            this.updateStatus('加载失败');
        } finally {
            this.isLoading = false;
        }
    }

    async searchChats() {
        const searchField = document.getElementById('history-search');
        const query = searchField?.value?.trim();
        
        if (!query) {
            this.loadChats();
            return;
        }
        
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateStatus('正在搜索...');
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const results = await response.json();
            this.renderChatList(results);
            this.updateStats(results.length, `搜索 "${query}" 的结果`);
            this.updateStatus('搜索完成');
            
            console.log(`🔍 搜索 "${query}" 找到 ${results.length} 个结果`);
            
        } catch (error) {
            console.error('搜索失败:', error);
            this.showError(`搜索失败: ${error.message}`);
            this.updateStatus('搜索失败');
        } finally {
            this.isLoading = false;
        }
    }

    renderChatList(chats) {
        const chatList = document.getElementById('chat-list');
        if (!chatList) return;
        
        if (chats.length === 0) {
            chatList.innerHTML = `
                <div class="empty-state">
                    <h3>没有找到聊天记录</h3>
                    <p>请检查 Cursor 是否已安装并有聊天历史</p>
                </div>
            `;
            return;
        }
        
        chatList.innerHTML = chats.map(chat => this.createChatItem(chat)).join('');
        
        // 绑定点击事件
        chatList.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => {
                const sessionId = item.dataset.sessionId;
                this.selectChat(sessionId);
            });
        });
    }

    createChatItem(chat) {
        const sessionId = chat.sessionId || 'unknown';
        const shortId = sessionId.length > 8 ? sessionId.substring(0, 8) + '...' : sessionId;
        const createdAt = new Date(chat.createdAt || Date.now()).toLocaleString('zh-CN');
        const messageCount = chat.messages ? chat.messages.length : 0;
        const preview = this.getPreview(chat.messages);
        const workspaceId = chat.workspaceId || 'unknown';
        const shortWorkspace = workspaceId.length > 12 ? workspaceId.substring(0, 12) + '...' : workspaceId;
        
        return `
            <div class="chat-item" data-session-id="${sessionId}">
                <div class="chat-header">
                    <div class="chat-id">${shortId}</div>
                    <div class="chat-time">${createdAt}</div>
                </div>
                <div class="chat-preview">${preview}</div>
                <div class="chat-meta">
                    <span>工作区: ${shortWorkspace}</span>
                    <span class="message-count">${messageCount} 条消息</span>
                </div>
            </div>
        `;
    }

    getPreview(messages) {
        if (!messages || messages.length === 0) {
            return '暂无消息内容';
        }
        
        // 找到第一条用户消息作为预览
        const userMessage = messages.find(msg => msg.role === 'user');
        if (userMessage && userMessage.content) {
            const content = userMessage.content.trim();
            return content.length > 100 ? content.substring(0, 100) + '...' : content;
        }
        
        // 如果没有用户消息，使用第一条消息
        const firstMessage = messages[0];
        if (firstMessage && firstMessage.content) {
            const content = firstMessage.content.trim();
            return content.length > 100 ? content.substring(0, 100) + '...' : content;
        }
        
        return '暂无消息内容';
    }

    async selectChat(sessionId) {
        // 更新选中状态
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        const selectedItem = document.querySelector(`[data-session-id="${sessionId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
        }
        
        // 加载聊天详情
        try {
            const response = await fetch(`/api/chat/${sessionId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const chat = await response.json();
            this.currentChat = chat;
            this.showChatDetail(chat);
            
        } catch (error) {
            console.error('加载聊天详情失败:', error);
            this.showError(`加载聊天详情失败: ${error.message}`);
        }
    }

    showChatDetail(chat) {
        const detailPanel = document.getElementById('chat-detail');
        if (!detailPanel) return;
        
        // 更新详情信息
        const elements = {
            'detail-session-id': chat.sessionId || 'unknown',
            'detail-workspace': chat.workspaceId || 'unknown',
            'detail-created-at': new Date(chat.createdAt || Date.now()).toLocaleString('zh-CN'),
            'detail-message-count': chat.messages ? chat.messages.length : 0
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
        
        // 渲染消息
        this.renderMessages(chat.messages || []);
        
        // 显示详情面板
        detailPanel.style.display = 'flex';
    }

    renderMessages(messages) {
        const messagesContainer = document.getElementById('detail-messages');
        if (!messagesContainer) return;
        
        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <h3>没有消息</h3>
                    <p>这个聊天记录中没有消息内容</p>
                </div>
            `;
            return;
        }
        
        messagesContainer.innerHTML = messages.map(msg => {
            const role = msg.role || 'unknown';
            const content = msg.content || '';
            const roleText = role === 'user' ? '用户' : role === 'assistant' ? 'Cursor助手' : role;
            
            return `
                <div class="detail-message ${role}">
                    <div class="message-role ${role}">${roleText}</div>
                    <div class="message-content">${this.escapeHtml(content)}</div>
                </div>
            `;
        }).join('');
    }

    closeDetail() {
        const detailPanel = document.getElementById('chat-detail');
        if (detailPanel) {
            detailPanel.style.display = 'none';
        }
        
        // 清除选中状态
        document.querySelectorAll('.chat-item').forEach(item => {
            item.classList.remove('selected');
        });
        
        this.currentChat = null;
    }

    async exportChat(format) {
        if (!this.currentChat) {
            alert('请先选择一个聊天记录');
            return;
        }
        
        try {
            const sessionId = this.currentChat.sessionId;
            const url = `/api/chat/${sessionId}/export?format=${format}`;
            
            // 创建下载链接
            const link = document.createElement('a');
            link.href = url;
            link.download = `chat-${sessionId}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log(`📤 导出聊天记录: ${sessionId}.${format}`);
            
        } catch (error) {
            console.error('导出失败:', error);
            alert(`导出失败: ${error.message}`);
        }
    }

    updateStats(count, label = '总聊天数') {
        const totalChatsElement = document.getElementById('total-chats');
        if (totalChatsElement) {
            totalChatsElement.textContent = `${count} (${label})`;
        }
    }

    updateStatus(status) {
        const statusElement = document.getElementById('history-status');
        if (statusElement) {
            statusElement.textContent = status;
        }
    }

    showError(message) {
        const chatList = document.getElementById('chat-list');
        if (chatList) {
            chatList.innerHTML = `
                <div class="error-message">
                    <h3>错误</h3>
                    <p>${this.escapeHtml(message)}</p>
                    <button class="btn btn-secondary" onclick="historyManager.loadChats()">重试</button>
                </div>
            `;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 全局历史记录管理器实例
let historyManager = null;

// 初始化历史记录管理器的函数
function initHistoryManager() {
    if (!historyManager) {
        historyManager = new HistoryManager();
        historyManager.init();
        console.log('📚 历史记录管理器已初始化');
    }
}

// 导出给全局使用
window.initHistoryManager = initHistoryManager;
window.historyManager = historyManager;