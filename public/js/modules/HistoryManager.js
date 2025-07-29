/**
 * 历史记录管理器
 * 负责协调UI组件和服务层
 */
class HistoryManager {
    constructor(container) {
        this.container = container;
        this.apiClient = new HistoryApiClient();
        this.service = new HistoryService(this.apiClient);
        this.ui = new HistoryUIComponents(container);
        
        // 状态管理
        this.currentChats = null;
        this.currentChat = null;
        this.currentOptions = {
            view: 'list', // 'list' 或 'grid'
            groupBy: 'none', // 'none', 'project', 'date'
            sortBy: 'time', // 'time', 'title'
            sortOrder: 'desc' // 'asc', 'desc'
        };
        this.searchQuery = '';
        this.isLoading = false;
    }

    /**
     * 初始化
     */
    async init() {
        this.bindEvents();
        await this.loadChats();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 绑定UI事件
        this.ui.on('chatSelected', (sessionId) => {
            this.selectChat(sessionId);
        });
        
        this.ui.on('exportChat', (sessionId, format) => {
            this.exportChat(sessionId, format);
        });
        
        this.ui.on('search', (query) => {
            this.searchQuery = query;
            this.handleSearch();
        });
        
        this.ui.on('refresh', () => {
            this.refresh();
        });
        
        this.ui.on('viewChange', (view) => {
            this.currentOptions.view = view;
            this.renderCurrentChats();
        });
        
        this.ui.on('groupChange', (groupBy) => {
            this.currentOptions.groupBy = groupBy;
            this.renderCurrentChats();
        });
        
        this.ui.on('sortChange', (sortBy, sortOrder) => {
            this.currentOptions.sortBy = sortBy;
            this.currentOptions.sortOrder = sortOrder;
            this.renderCurrentChats();
        });
        
        this.ui.on('closeDetail', () => {
            this.closeDetail();
        });
    }

    /**
     * 绑定UI事件（兼容性方法）
     */
    bindUIEvents() {
        // 这个方法保持为空，实际绑定在bindEvents中完成
        // 保留此方法以确保向后兼容性
    }

    /**
     * 加载聊天记录
     * @param {Object} options - 加载选项
     */
    async loadChats(options = {}) {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateStatus('正在加载聊天记录...');
        this.ui.renderLoadingState();
        
        try {
            const mergedOptions = { ...this.currentOptions, ...options };
            const chats = await this.service.getChatList(mergedOptions);
            
            this.currentChats = chats;
            this.renderCurrentChats();
            this.updateStats(chats.length);
            this.updateStatus('加载完成');
            
        } catch (error) {
            console.error('加载聊天记录失败:', error);
            this.ui.renderErrorState(error.message || '加载聊天记录失败');
            this.updateStatus('加载失败');
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 处理搜索
     */
    async handleSearch() {
        const searchField = this.container.querySelector('#history-search');
        if (!searchField) return;
        
        const query = searchField.value.trim();
        this.searchQuery = query;
        
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.updateStatus('正在搜索...');
        this.ui.renderLoadingState();
        
        try {
            let chats;
            if (query) {
                chats = await this.service.searchChats(query, this.currentOptions);
            } else {
                chats = await this.service.getChatList(this.currentOptions);
            }
            
            this.currentChats = chats;
            this.renderCurrentChats();
            this.updateStats(chats.length, query ? '搜索结果' : '总聊天数');
            this.updateStatus(query ? '搜索完成' : '加载完成');
            
        } catch (error) {
            console.error('搜索失败:', error);
            this.ui.renderErrorState(error.message || '搜索失败');
            this.updateStatus('搜索失败');
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 选择聊天
     * @param {string} sessionId - 会话ID
     */
    async selectChat(sessionId) {
        try {
            this.updateStatus('正在加载聊天详情...');
            const chatDetail = await this.service.getChatDetail(sessionId);
            console.log('🔍 前端获取到的聊天详情:', {
                sessionId: chatDetail.sessionId,
                messageCount: chatDetail.messages ? chatDetail.messages.length : 0,
                hasMessages: !!chatDetail.messages,
                messagesType: typeof chatDetail.messages,
                title: chatDetail.title
            });
            if (chatDetail.messages && chatDetail.messages.length > 0) {
                console.log('📝 前三条消息示例:', chatDetail.messages.slice(0, 3));
            }
            this.currentChat = chatDetail;
            this.showChatDetail(chatDetail);
            this.updateStatus('聊天详情加载完成');
        } catch (error) {
            console.error('加载聊天详情失败:', error);
            this.showError('加载聊天详情失败: ' + error.message);
            this.updateStatus('加载聊天详情失败');
        }
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
     * 显示聊天详情
     * @param {Object} chat - 聊天详情
     */
    showChatDetail(chat) {
        this.ui.renderChatDetail(chat);
        
        // 显示详情面板
        const detailPanel = this.container.querySelector('.chat-detail');
        if (detailPanel) {
            detailPanel.style.display = 'block';
        }
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
        if (this.currentChats) {
            this.ui.renderChatList(this.currentChats, this.currentOptions);
        }
    }

    /**
     * 刷新数据
     */
    async refresh() {
        this.service.clearCache();
        await this.loadChats();
    }

    /**
     * 更新统计信息
     * @param {number} count - 数量
     * @param {string} label - 标签
     */
    updateStats(count, label = '总聊天数') {
        const statsElement = this.container.querySelector('.history-stats');
        if (statsElement) {
            statsElement.innerHTML = `
                <span class="stats-item">
                    <span class="stats-label">${label}:</span>
                    <span class="stats-value">${count}</span>
                </span>
            `;
        }
    }

    /**
     * 更新状态信息
     * @param {string} status - 状态文本
     */
    updateStatus(status) {
        const statusElement = this.container.querySelector('.history-status');
        if (statusElement) {
            statusElement.textContent = status;
        }
        
        // 同时更新全局状态
        if (window.updateStatus) {
            window.updateStatus(status);
        }
    }

    /**
     * 显示错误信息
     * @param {string} message - 错误消息
     */
    showError(message) {
        this.ui.renderErrorState(message);
        
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
            currentChats: this.currentChats,
            currentChat: this.currentChat,
            currentOptions: this.currentOptions,
            searchQuery: this.searchQuery,
            isLoading: this.isLoading
        };
    }

    /**
     * 设置选项
     * @param {Object} options - 新选项
     */
    setOptions(options) {
        this.currentOptions = { ...this.currentOptions, ...options };
        this.renderCurrentChats();
    }

    /**
     * 销毁管理器
     */
    destroy() {
        // 清理事件监听器
        this.ui.eventListeners.clear();

        // 清理缓存
        this.service.clearCache();

        // 重置状态
        this.currentChat = null;
        this.currentChats = null;
        this.isLoading = false;
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistoryManager;
} else {
    window.HistoryManager = HistoryManager;
}