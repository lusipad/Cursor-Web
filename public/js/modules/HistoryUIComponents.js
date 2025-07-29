/**
 * 历史记录UI组件
 * 负责历史记录界面的渲染和交互
 */
class HistoryUIComponents {
    constructor(container) {
        this.container = container;
        this.expandedProjects = new Set();
        this.eventListeners = new Map();
    }

    /**
     * 渲染聊天列表
     * @param {Array} chats - 聊天列表
     * @param {Object} options - 渲染选项
     */
    renderChatList(chats, options = {}) {
        const listContainer = this.container.querySelector('#chat-list');
        if (!listContainer) {
            console.error('聊天列表容器未找到');
            return;
        }

        if (!chats || chats.length === 0) {
            listContainer.innerHTML = this.renderEmptyState();
            return;
        }

        if (options.groupByProject) {
            const groupedChats = this.groupChatsByProject(chats);
            listContainer.innerHTML = this.renderGroupedChats(groupedChats);
        } else {
            listContainer.innerHTML = this.renderFlatChatList(chats);
        }

        this.bindChatListEvents();
    }

    /**
     * 渲染分组聊天列表
     * @param {Object} groupedChats - 按项目分组的聊天
     * @returns {string} HTML字符串
     */
    renderGroupedChats(groupedChats) {
        return Object.entries(groupedChats).map(([projectName, group]) => {
            const isExpanded = this.expandedProjects.has(projectName);
            const chatsHtml = isExpanded ? 
                group.chats.map(chat => this.renderChatCard(chat)).join('') : '';

            return `
                <div class="project-group">
                    <div class="project-header" data-project="${this.escapeHtml(projectName)}">
                        <span class="project-toggle ${isExpanded ? 'expanded' : ''}">
                            ${isExpanded ? '▼' : '▶'}
                        </span>
                        <span class="project-name">${this.escapeHtml(projectName)}</span>
                        <span class="project-count">(${group.chats.length})</span>
                        <span class="project-path">${this.escapeHtml(this.getDisplayPath(group.path))}</span>
                    </div>
                    <div class="project-chats ${isExpanded ? 'expanded' : 'collapsed'}">
                        ${chatsHtml}
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * 渲染平铺聊天列表
     * @param {Array} chats - 聊天列表
     * @returns {string} HTML字符串
     */
    renderFlatChatList(chats) {
        // 确保chats是数组
        if (!Array.isArray(chats)) {
            console.warn('renderFlatChatList: 期望数组但收到:', typeof chats, chats);
            return this.renderEmptyState();
        }
        
        return chats.map(chat => this.renderChatCard(chat)).join('');
    }

    /**
     * 渲染聊天卡片
     * @param {Object} chat - 聊天数据
     * @returns {string} HTML字符串
     */
    renderChatCard(chat) {
        return `
            <div class="chat-card" data-session-id="${chat.sessionId}">
                <div class="chat-header">
                    <h3 class="chat-title">${this.escapeHtml(chat.title)}</h3>
                    <div class="chat-actions">
                        <button class="btn-icon export-btn" data-session-id="${chat.sessionId}" title="导出">
                            📤
                        </button>
                    </div>
                </div>
                <div class="chat-meta">
                    <span class="chat-time">${chat.formattedTime}</span>
                    <span class="chat-count">${chat.messageCount} 条消息</span>
                    ${chat.project ? `<span class="chat-project">${this.escapeHtml(chat.project.name)}</span>` : ''}
                </div>
                <div class="chat-preview">
                    ${this.escapeHtml(chat.preview)}
                </div>
            </div>
        `;
    }

    /**
     * 渲染聊天详情
     * @param {Object} chat - 聊天详情
     */
    renderChatDetail(chat) {
        console.log('🎨 开始渲染聊天详情:', {
            sessionId: chat.sessionId,
            messageCount: chat.messages ? chat.messages.length : 0,
            hasMessages: !!chat.messages,
            title: chat.title
        });
        
        const detailContainer = this.container.querySelector('#chat-detail');
        if (!detailContainer) {
            console.error('聊天详情容器未找到');
            return;
        }

        const messagesHtml = this.renderMessages(chat.messages);
        console.log('📄 生成的消息HTML长度:', messagesHtml.length);
        console.log('📄 消息HTML预览:', messagesHtml.substring(0, 200));

        detailContainer.innerHTML = `
            <div class="detail-header">
                <h2>${this.escapeHtml(chat.title)}</h2>
                <div class="detail-actions">
                    <button id="export-html-btn" class="btn btn-secondary">导出HTML</button>
                    <button id="export-json-btn" class="btn btn-secondary">导出JSON</button>
                    <button id="close-detail-btn" class="btn btn-primary">关闭</button>
                </div>
            </div>
            <div class="detail-meta">
                <span>时间: ${chat.formattedTime}</span>
                <span>消息数: ${chat.messages.length}</span>
                ${chat.project ? `<span>项目: ${this.escapeHtml(chat.project.name)}</span>` : ''}
            </div>
            <div class="detail-messages">
                ${messagesHtml}
            </div>
        `;

        this.bindDetailEvents(chat.sessionId);
    }

    /**
     * 渲染消息列表
     * @param {Array} messages - 消息列表
     * @returns {string} HTML字符串
     */
    renderMessages(messages) {
        console.log('💬 开始渲染消息:', {
            messagesExists: !!messages,
            messagesType: typeof messages,
            messageCount: messages ? messages.length : 0,
            isArray: Array.isArray(messages)
        });
        
        if (!messages || messages.length === 0) {
            console.log('⚠️ 消息为空，显示暂无消息');
            return '<div class="no-messages">暂无消息</div>';
        }

        console.log('📝 前三条消息详情:', messages.slice(0, 3));
        
        const renderedMessages = messages.map((message, index) => {
            if (index < 3) {
                console.log(`🔍 渲染第${index + 1}条消息:`, {
                    role: message.role,
                    contentLength: message.content ? message.content.length : 0,
                    formattedTime: message.formattedTime
                });
            }
            
            return `
                <div class="message ${message.role}">
                    <div class="message-header">
                        <span class="message-role">${message.role === 'user' ? '用户' : 'AI'}</span>
                        ${message.formattedTime ? `<span class="message-time">${message.formattedTime}</span>` : ''}
                    </div>
                    <div class="message-content">
                        ${this.formatMessageContent(message.content)}
                    </div>
                </div>
            `;
        });
        
        console.log('✅ 消息渲染完成，总数:', renderedMessages.length);
        return renderedMessages.join('');
    }

    /**
     * 渲染空状态
     * @returns {string} HTML字符串
     */
    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <h3>暂无聊天记录</h3>
                <p>还没有找到任何聊天记录，请检查Cursor是否有聊天数据。</p>
            </div>
        `;
    }

    /**
     * 渲染加载状态
     */
    renderLoadingState() {
        const listContainer = this.container.querySelector('#chat-list');
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="loading-state">
                    <div class="loading-spinner"></div>
                    <p>正在加载聊天记录...</p>
                </div>
            `;
        }
    }

    /**
     * 渲染错误状态
     * @param {string} message - 错误消息
     */
    renderErrorState(message) {
        const listContainer = this.container.querySelector('#chat-list');
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="error-state">
                    <div class="error-icon">❌</div>
                    <h3>加载失败</h3>
                    <p>${this.escapeHtml(message)}</p>
                    <button class="btn btn-primary retry-btn">重试</button>
                </div>
            `;
        }
    }

    /**
     * 绑定聊天列表事件
     */
    bindChatListEvents() {
        // 项目展开/折叠
        this.container.querySelectorAll('.project-header').forEach(header => {
            header.addEventListener('click', (e) => {
                const projectName = e.currentTarget.dataset.project;
                this.toggleProject(projectName);
            });
        });

        // 聊天卡片点击
        this.container.querySelectorAll('.chat-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.closest('.chat-actions')) {
                    const sessionId = card.dataset.sessionId;
                    this.emit('chatSelected', sessionId);
                }
            });
        });

        // 导出按钮
        this.container.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sessionId = btn.dataset.sessionId;
                this.emit('exportChat', sessionId);
            });
        });

        // 重试按钮
        const retryBtn = this.container.querySelector('.retry-btn');
        if (retryBtn) {
            retryBtn.addEventListener('click', () => {
                this.emit('retry');
            });
        }
    }

    /**
     * 绑定详情页面事件
     * @param {string} sessionId - 会话ID
     */
    bindDetailEvents(sessionId) {
        const exportHtmlBtn = this.container.querySelector('#export-html-btn');
        const exportJsonBtn = this.container.querySelector('#export-json-btn');
        const closeBtn = this.container.querySelector('#close-detail-btn');

        if (exportHtmlBtn) {
            exportHtmlBtn.addEventListener('click', () => {
                this.emit('exportChat', sessionId, 'html');
            });
        }

        if (exportJsonBtn) {
            exportJsonBtn.addEventListener('click', () => {
                this.emit('exportChat', sessionId, 'json');
            });
        }

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.emit('closeDetail');
            });
        }
    }

    /**
     * 切换项目展开状态
     * @param {string} projectName - 项目名称
     */
    toggleProject(projectName) {
        if (this.expandedProjects.has(projectName)) {
            this.expandedProjects.delete(projectName);
        } else {
            this.expandedProjects.add(projectName);
        }

        const projectGroup = this.container.querySelector(`[data-project="${projectName}"]`).closest('.project-group');
        const toggle = projectGroup.querySelector('.project-toggle');
        const chatsContainer = projectGroup.querySelector('.project-chats');

        if (this.expandedProjects.has(projectName)) {
            toggle.textContent = '▼';
            toggle.classList.add('expanded');
            chatsContainer.classList.add('expanded');
            chatsContainer.classList.remove('collapsed');
        } else {
            toggle.textContent = '▶';
            toggle.classList.remove('expanded');
            chatsContainer.classList.remove('expanded');
            chatsContainer.classList.add('collapsed');
        }
    }

    /**
     * 按项目分组聊天
     * @param {Array} chats - 聊天列表
     * @returns {Object} 分组后的聊天
     */
    groupChatsByProject(chats) {
        // 确保chats是数组
        if (!Array.isArray(chats)) {
            console.warn('groupChatsByProject: 期望数组但收到:', typeof chats, chats);
            return {};
        }
        
        const groups = {};
        
        chats.forEach(chat => {
            const projectName = chat.project?.name || 'Unknown Project';
            if (!groups[projectName]) {
                groups[projectName] = {
                    name: projectName,
                    path: chat.project?.path || '',
                    chats: []
                };
            }
            groups[projectName].chats.push(chat);
        });
        
        return groups;
    }

    /**
     * 格式化消息内容
     * @param {string} content - 消息内容
     * @returns {string} 格式化后的内容
     */
    formatMessageContent(content) {
        if (!content) return '';
        
        // 简单的Markdown渲染
        return this.escapeHtml(content)
            .replace(/\n/g, '<br>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>');
    }

    /**
     * 获取显示路径
     * @param {string} fullPath - 完整路径
     * @returns {string} 显示路径
     */
    getDisplayPath(fullPath) {
        if (!fullPath) return '';
        
        const parts = fullPath.split(/[\\/]/);
        if (parts.length > 3) {
            return `.../${parts.slice(-2).join('/')}`;
        }
        return fullPath;
    }

    /**
     * HTML转义
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 事件发射器
     * @param {string} event - 事件名称
     * @param {...any} args - 事件参数
     */
    emit(event, ...args) {
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(listener => listener(...args));
    }

    /**
     * 添加事件监听器
     * @param {string} event - 事件名称
     * @param {Function} listener - 监听器函数
     */
    on(event, listener) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
    }

    /**
     * 移除事件监听器
     * @param {string} event - 事件名称
     * @param {Function} listener - 监听器函数
     */
    off(event, listener) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }
}

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HistoryUIComponents;
} else {
    window.HistoryUIComponents = HistoryUIComponents;
}