/**
 * 工作区历史记录管理器
 * 负责管理按工作区平铺的历史记录界面
 */
class HistoryManager {
    constructor(container) {
        this.container = container;
        this.apiClient = new HistoryApiClient();
        this.service = new HistoryService(this.apiClient);
        
        // 状态管理
        this.workspaces = null;
        this.currentWorkspace = null;
        this.searchQuery = '';
        this.isLoading = false;
        this.currentModal = null;
    }

    /**
     * 初始化
     */
    async init() {
        this.bindEvents();
        await this.loadWorkspaces();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 搜索事件
        const searchInput = this.container.querySelector('.workspace-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearch.bind(this));
        }

        // 刷新按钮
        const refreshBtn = this.container.querySelector('.btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', this.refresh.bind(this));
        }

        // 模态框关闭事件
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeModal();
            }
        });

        // ESC键关闭模态框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentModal) {
                this.closeModal();
            }
        });
    }

    /**
     * 加载工作区列表
     */
    async loadWorkspaces() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();
        
        try {
            console.log('🔄 开始加载工作区数据...');
            // 获取所有聊天记录
            const chats = await this.service.getChatList({});
            console.log('📊 获取到聊天记录数量:', chats ? chats.length : 0);
            console.log('📊 聊天记录示例:', chats ? chats.slice(0, 2) : 'No data');
            
            // 按工作区分组
            this.workspaces = this.groupChatsByWorkspace(chats);
            console.log('🏢 分组后的工作区数量:', this.workspaces ? this.workspaces.length : 0);
            console.log('🏢 工作区示例:', this.workspaces ? this.workspaces.slice(0, 2) : 'No workspaces');
            
        } catch (error) {
            console.error('❌ 加载工作区失败:', error);
            this.showError(error.message || '加载工作区失败');
        } finally {
            this.isLoading = false;
            this.renderWorkspaces();
            this.hideLoading();
        }
    }

    /**
     * 按工作区分组聊天记录
     * @param {Array} chats - 聊天记录列表
     * @returns {Array} 工作区列表
     */
    groupChatsByWorkspace(chats) {
        const workspaceMap = new Map();
        
        chats.forEach(chat => {
            const workspacePath = chat.workspacePath || 'unknown';
            const workspaceName = this.getWorkspaceName(workspacePath);
            
            if (!workspaceMap.has(workspacePath)) {
                workspaceMap.set(workspacePath, {
                    name: workspaceName,
                    path: workspacePath,
                    chats: [],
                    lastActivity: null,
                    expanded: false // 初始化为折叠状态
                });
            }
            
            const workspace = workspaceMap.get(workspacePath);
            workspace.chats.push(chat);
            
            // 更新最后活动时间
            const chatTime = new Date(chat.timestamp || chat.createdAt);
            if (!workspace.lastActivity || chatTime > workspace.lastActivity) {
                workspace.lastActivity = chatTime;
            }
        });
        
        // 转换为数组并按最后活动时间排序
        return Array.from(workspaceMap.values())
            .sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
    }

    /**
     * 从路径获取工作区名称
     * @param {string} path - 工作区路径
     * @returns {string} 工作区名称
     */
    getWorkspaceName(path) {
        if (!path || path === 'unknown') {
            return '未知工作区';
        }
        
        // 如果路径只是一个单独的目录名（如"global"），直接返回
        if (!path.includes('/') && !path.includes('\\')) {
            return path;
        }
        
        // 对于完整路径，返回完整路径而不是只有最后一部分
        return path;
    }

    /**
     * 处理搜索
     */
    async handleSearch() {
        const searchInput = this.container.querySelector('.workspace-search-input');
        if (!searchInput) return;
        
        const query = searchInput.value.trim().toLowerCase();
        this.searchQuery = query;
        
        this.renderWorkspaces();
    }

    /**
     * 渲染工作区列表
     */
    renderWorkspaces() {
        const grid = this.container.querySelector('.workspace-grid');
        if (!grid) return;

        if (this.isLoading) {
            grid.innerHTML = '<div class="loading-workspace">正在加载工作区...</div>';
            return;
        }

        if (!this.workspaces || this.workspaces.length === 0) {
            grid.innerHTML = '<div class="loading-workspace">暂无工作区数据</div>';
            return;
        }

        // 过滤工作区
        let filteredWorkspaces = this.workspaces;
        if (this.searchQuery) {
            filteredWorkspaces = this.workspaces.filter(workspace => 
                workspace.name.toLowerCase().includes(this.searchQuery) ||
                workspace.path.toLowerCase().includes(this.searchQuery)
            );
        }

        if (filteredWorkspaces.length === 0) {
            grid.innerHTML = '<div class="loading-workspace">未找到匹配的工作区</div>';
            return;
        }

        // 渲染工作区可折叠列表
        grid.innerHTML = filteredWorkspaces.map(workspace => this.renderWorkspaceAccordion(workspace)).join('');

        // 绑定折叠展开事件 - 只绑定到expand-icon
        grid.querySelectorAll('.expand-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止事件冒泡
                const workspacePath = icon.closest('.workspace-accordion').dataset.workspacePath;
                this.toggleWorkspace(workspacePath);
            });
        });

        // 绑定聊天项点击事件
        grid.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation(); // 防止触发工作区折叠
                const sessionId = item.dataset.sessionId;
                this.showChatDetail(sessionId);
            });
        });
    }

    /**
     * 渲染可折叠的工作区
     * @param {Object} workspace - 工作区数据
     * @returns {string} HTML字符串
     */
    renderWorkspaceAccordion(workspace) {
        const chatCount = workspace.chats.length;
        const lastActivity = workspace.lastActivity ? 
            this.formatRelativeTime(workspace.lastActivity) : '无活动';
        
        // 按时间分组聊天记录
        const chatGroups = this.groupChatsByTime(workspace.chats);
        const isExpanded = workspace.expanded || false;

        return `
            <div class="workspace-accordion" data-workspace-path="${workspace.path}">
                <div class="workspace-header" data-workspace-path="${workspace.path}">
                    <div class="workspace-header-content">
                        <div class="workspace-icon">📁</div>
                        <div class="workspace-info">
                            <h3 class="workspace-name" title="${workspace.name}">${workspace.name}</h3>
                            <div class="workspace-path" title="${workspace.path}">${workspace.path}</div>
                        </div>
                    </div>
                    <div class="workspace-stats">
                        <span class="chat-count">${chatCount} 个会话</span>
                        <span class="last-activity">${lastActivity}</span>
                        <span class="expand-icon ${isExpanded ? 'expanded' : ''}">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M4.427 9.573l3.396-3.396a.25.25 0 01.354 0l3.396 3.396a.25.25 0 01-.177.427H4.604a.25.25 0 01-.177-.427z"/>
                            </svg>
                        </span>
                    </div>
                </div>
                <div class="workspace-content ${isExpanded ? 'expanded' : 'collapsed'}">
                    <div class="workspace-detail-stats">
                        <div class="stat-item">
                            <span class="stat-value">${workspace.chats.length}</span>
                            <span class="stat-label">总会话数</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${this.getTotalMessages(workspace.chats)}</span>
                            <span class="stat-label">总消息数</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${workspace.lastActivity ? this.formatRelativeTime(workspace.lastActivity) : '无'}</span>
                            <span class="stat-label">最后活动</span>
                        </div>
                    </div>
                    <div class="chat-groups">
                        ${chatGroups.map(group => this.renderChatGroup(group)).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 切换工作区展开/折叠状态
     * @param {string} workspacePath - 工作区路径
     */
    toggleWorkspace(workspacePath) {
        const workspace = this.workspaces.find(w => w.path === workspacePath);
        if (!workspace) return;

        workspace.expanded = !workspace.expanded;
        
        // 直接操作DOM元素，避免重新渲染整个列表
        const accordionElement = this.container.querySelector(`[data-workspace-path="${workspacePath}"]`);
        if (accordionElement) {
            const expandIcon = accordionElement.querySelector('.expand-icon');
            const content = accordionElement.querySelector('.workspace-content');
            
            if (workspace.expanded) {
                expandIcon.classList.add('expanded');
                content.classList.remove('collapsed');
                content.classList.add('expanded');
            } else {
                expandIcon.classList.remove('expanded');
                content.classList.remove('expanded');
                content.classList.add('collapsed');
            }
        }
    }

    // 弹窗相关方法已移除，改为可折叠展开方式

    /**
     * 按时间分组聊天记录
     * @param {Array} chats - 聊天记录列表
     * @returns {Array} 分组后的聊天记录
     */
    groupChatsByTime(chats) {
        const groups = new Map();
        const now = new Date();
        
        chats.forEach(chat => {
            const chatDate = new Date(chat.timestamp || chat.createdAt);
            const daysDiff = Math.floor((now - chatDate) / (1000 * 60 * 60 * 24));
            
            let groupKey;
            if (daysDiff === 0) {
                groupKey = '今天';
            } else if (daysDiff === 1) {
                groupKey = '昨天';
            } else if (daysDiff < 7) {
                groupKey = '本周';
            } else if (daysDiff < 30) {
                groupKey = '本月';
            } else {
                groupKey = '更早';
            }
            
            if (!groups.has(groupKey)) {
                groups.set(groupKey, []);
            }
            groups.get(groupKey).push(chat);
        });
        
        // 转换为数组并排序
        const groupOrder = ['今天', '昨天', '本周', '本月', '更早'];
        return groupOrder
            .filter(key => groups.has(key))
            .map(key => ({
                title: key,
                chats: groups.get(key).sort((a, b) => 
                    new Date(b.timestamp || b.createdAt) - new Date(a.timestamp || a.createdAt)
                )
            }));
    }

    /**
     * 渲染聊天分组
     * @param {Object} group - 聊天分组数据
     * @returns {string} HTML字符串
     */
    renderChatGroup(group) {
        return `
            <div class="chat-group">
                <div class="chat-group-header">
                    <h4 class="chat-group-title">${group.title}</h4>
                    <span class="chat-group-count">${group.chats.length}</span>
                </div>
                <div class="chat-items">
                    ${group.chats.map(chat => this.renderChatItem(chat)).join('')}
                </div>
            </div>
        `;
    }

    /**
     * 渲染聊天项
     * @param {Object} chat - 聊天数据
     * @returns {string} HTML字符串
     */
    renderChatItem(chat) {
        const title = chat.title || chat.firstMessage || '无标题会话';
        const preview = this.getChatPreview(chat);
        const time = this.formatTime(new Date(chat.timestamp || chat.createdAt));
        const messageCount = chat.messageCount || (chat.messages ? chat.messages.length : 0);

        return `
            <div class="chat-item" data-session-id="${chat.sessionId || chat.id}">
                <div class="chat-item-header">
                    <h5 class="chat-item-title" title="${title}">${title}</h5>
                    <span class="chat-item-time">${time}</span>
                </div>
                <div class="chat-item-preview">${preview}</div>
                <div class="chat-item-meta">
                    <span class="message-count">${messageCount} 条消息</span>
                </div>
            </div>
        `;
    }

    /**
     * 获取聊天预览文本
     * @param {Object} chat - 聊天数据
     * @returns {string} 预览文本
     */
    getChatPreview(chat) {
        if (chat.preview) {
            return chat.preview;
        }
        
        if (chat.messages && chat.messages.length > 0) {
            const firstUserMessage = chat.messages.find(msg => msg.role === 'user');
            if (firstUserMessage) {
                return firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? '...' : '');
            }
        }
        
        return '暂无预览内容';
    }

    // selectChat 方法已移除，改为使用 showChatDetail

    /**
     * 获取总消息数
     * @param {Array} chats - 聊天列表
     * @returns {number} 总消息数
     */
    getTotalMessages(chats) {
        return chats.reduce((total, chat) => {
            return total + (chat.messageCount || (chat.messages ? chat.messages.length : 0));
        }, 0);
    }

    /**
     * 格式化时间
     * @param {Date} date - 日期对象
     * @returns {string} 格式化后的时间
     */
    formatTime(date) {
        if (!date || isNaN(date.getTime())) {
            return '未知时间';
        }
        
        const now = new Date();
        const diff = now - date;
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (minutes < 1) {
            return '刚刚';
        } else if (minutes < 60) {
            return `${minutes}分钟前`;
        } else if (hours < 24) {
            return `${hours}小时前`;
        } else if (days < 7) {
            return `${days}天前`;
        } else {
            return date.toLocaleDateString('zh-CN');
        }
    }

    /**
     * 格式化相对时间
     * @param {Date} date - 日期对象
     * @returns {string} 相对时间字符串
     */
    formatRelativeTime(date) {
        return this.formatTime(date);
    }

    /**
     * 显示加载状态
     */
    showLoading() {
        const grid = this.container.querySelector('.workspace-grid');
        if (grid) {
            grid.innerHTML = '<div class="loading-workspace">正在加载工作区...</div>';
        }
    }

    /**
     * 隐藏加载状态
     */
    hideLoading() {
        // 加载状态会在renderWorkspaces中被替换，这里不需要特殊处理
        console.log('隐藏加载状态');
    }

    /**
     * 导出聊天
     * @param {string} sessionId - 会话ID
     * @param {string} format - 导出格式
     */
    async exportChat(sessionId, format = 'html') {
        try {
            this.updateStatus('正在导出聊天记录...');
            await this.service.exportChat(sessionId, format);
            this.updateStatus('导出完成');
        } catch (error) {
            console.error('导出失败:', error);
            this.showError('导出失败: ' + error.message);
            this.updateStatus('导出失败');
        }
    }

    /**
     * 显示聊天详情页面
     * @param {string} sessionId - 会话ID
     */
    async showChatDetail(sessionId) {
        try {
            // 获取聊天详情
            const chatDetail = await this.service.getChatDetail(sessionId);
            
            // 创建详情页面HTML
            const detailHtml = this.renderChatDetailPage(chatDetail);
            
            // 隐藏工作区列表，显示详情页面
            const workspaceGrid = this.container.querySelector('.workspace-grid');
            const detailContainer = this.container.querySelector('.chat-detail-container') || 
                this.createChatDetailContainer();
            
            workspaceGrid.style.display = 'none';
            detailContainer.style.display = 'block';
            detailContainer.innerHTML = detailHtml;
            
            // 绑定返回按钮事件
            const backBtn = detailContainer.querySelector('.back-btn');
            if (backBtn) {
                backBtn.addEventListener('click', () => this.hideChatDetail());
            }
            
        } catch (error) {
            console.error('❌ 加载聊天详情失败:', error);
            this.showError('加载聊天详情失败: ' + error.message);
        }
    }

    /**
     * 创建聊天详情容器
     * @returns {HTMLElement} 详情容器元素
     */
    createChatDetailContainer() {
        const container = document.createElement('div');
        container.className = 'chat-detail-container';
        container.style.display = 'none';
        this.container.appendChild(container);
        return container;
    }

    /**
     * 渲染聊天详情页面
     * @param {Object} chatDetail - 聊天详情数据
     * @returns {string} HTML字符串
     */
    renderChatDetailPage(chatDetail) {
        const title = chatDetail.title || chatDetail.firstMessage || '无标题会话';
        const time = this.formatTime(new Date(chatDetail.timestamp || chatDetail.createdAt));
        const messageCount = chatDetail.messages ? chatDetail.messages.length : 0;
        
        return `
            <div class="chat-detail-page">
                <div class="chat-detail-header">
                    <button class="back-btn">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M8.354 1.646a.5.5 0 0 1 0 .708L3.707 7H14.5a.5.5 0 0 1 0 1H3.707l4.647 4.646a.5.5 0 0 1-.708.708l-5.5-5.5a.5.5 0 0 1 0-.708l5.5-5.5a.5.5 0 0 1 .708 0z"/>
                        </svg>
                        返回
                    </button>
                    <div class="chat-detail-info">
                        <h2 class="chat-detail-title">${title}</h2>
                        <div class="chat-detail-meta">
                            <span class="chat-time">${time}</span>
                            <span class="message-count">${messageCount} 条消息</span>
                        </div>
                    </div>
                </div>
                <div class="chat-detail-content">
                    ${this.renderChatMessages(chatDetail.messages || [])}
                </div>
            </div>
        `;
    }

    /**
     * 渲染聊天消息列表
     * @param {Array} messages - 消息列表
     * @returns {string} HTML字符串
     */
    renderChatMessages(messages) {
        if (!messages || messages.length === 0) {
            return '<div class="no-messages">暂无消息</div>';
        }
        
        return messages.map(message => {
            const isUser = message.role === 'user';
            const content = message.content || message.text || '';
            const time = message.timestamp ? this.formatTime(new Date(message.timestamp)) : '';
            
            return `
                <div class="message ${isUser ? 'user-message' : 'assistant-message'}">
                    <div class="message-header">
                        <span class="message-role">${isUser ? '用户' : '助手'}</span>
                        ${time ? `<span class="message-time">${time}</span>` : ''}
                    </div>
                    <div class="message-content">${this.formatMessageContent(content)}</div>
                </div>
            `;
        }).join('');
    }

    /**
     * 格式化消息内容
     * @param {string} content - 消息内容
     * @returns {string} 格式化后的HTML
     */
    formatMessageContent(content) {
        if (!content) return '';
        
        // 简单的Markdown渲染
        return content
            .replace(/\n/g, '<br>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }

    /**
     * 隐藏聊天详情页面
     */
    hideChatDetail() {
        const workspaceGrid = this.container.querySelector('.workspace-grid');
        const detailContainer = this.container.querySelector('.chat-detail-container');
        
        if (workspaceGrid) workspaceGrid.style.display = 'block';
        if (detailContainer) detailContainer.style.display = 'none';
    }

    /**
     * 关闭详情面板
     */
    closeDetail() {
        const detailPanel = this.container.querySelector('.chat-detail');
        if (detailPanel) {
            detailPanel.style.display = 'none';
        }
        
        this.currentChat = null;
        
        // 清除选中状态
        const selectedItems = this.container.querySelectorAll('.chat-item.selected');
        selectedItems.forEach(item => item.classList.remove('selected'));
    }

    /**
     * 渲染当前聊天列表
     */
    renderCurrentChats() {
        // 聊天列表渲染已在index.html中实现
        // 这里保留方法以确保兼容性
    }

    /**
     * 刷新数据
     */
    async refresh() {
        this.service.clearCache();
        await this.loadWorkspaces();
    }

    /**
     * 显示错误信息
     * @param {string} message - 错误消息
     */
    showError(message) {
        const grid = this.container.querySelector('.workspace-grid');
        if (grid) {
            grid.innerHTML = `<div class="loading-workspace">错误: ${message}</div>`;
        }
        
        // 同时在控制台输出
        console.error('HistoryManager Error:', message);
        
        // 显示用户友好的错误提示
        if (window.showNotification) {
            window.showNotification(message, 'error');
        }
    }

    /**
     * 获取当前状态
     * @returns {Object} 当前状态
     */
    getState() {
        return {
            workspaces: this.workspaces,
            currentWorkspace: this.currentWorkspace,
            searchQuery: this.searchQuery,
            isLoading: this.isLoading
        };
    }

    /**
     * 销毁管理器
     */
    destroy() {
        // 关闭模态框
        this.closeModal();

        // 清理缓存
        this.service.clearCache();

        // 重置状态
        this.workspaces = null;
        this.currentWorkspace = null;
        this.isLoading = false;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistoryManager;
} else {
    window.HistoryManager = HistoryManager;
}