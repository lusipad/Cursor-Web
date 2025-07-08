// 🚀 Cursor HTTP 同步脚本 - 专为 Cursor 环境设计
console.log('🚀 Claude Web HTTP 同步脚本开始加载...');

class CursorHttpSync {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.lastContent = '';
        this.chatContainer = null;
        this.syncInterval = null;
        this.isRunning = false;
        this.retryCount = 0;
        this.maxRetries = 3;

        this.init();
    }

    async init() {
        console.log('🔧 初始化 HTTP 同步系统...');

        // 测试服务器连接
        try {
            await this.testConnection();
            this.showNotification('✅ 服务器连接成功', '#4CAF50');
        } catch (error) {
            this.showNotification('❌ 服务器连接失败', '#FF5722');
            console.error('服务器连接失败:', error);
            return;
        }

        // 查找聊天容器
        await this.findChatContainer();

        // 开始同步
        this.startSync();
    }

    async testConnection() {
        const response = await fetch(`${this.serverUrl}/api/test`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        console.log('✅ 服务器测试响应:', data);
        return data;
    }

    async findChatContainer() {
        console.log('🔍 查找Cursor右侧聊天容器...');

        // Cursor专用选择器 - 针对右侧AI聊天面板
        const cursorSelectors = [
            // Cursor AI 聊天面板的特定选择器
            '[data-testid="chat-panel"]',
            '[data-testid="ai-chat"]',
            '[data-testid="assistant-panel"]',
            '.chat-panel',
            '.ai-chat-panel',
            '.assistant-panel',
            '.right-panel',
            '.sidebar-right',

            // 通用聊天选择器，但优先右侧
            '[data-testid*="chat"]',
            '[data-testid*="conversation"]',
            '[data-testid*="messages"]',
            '.chat-container',
            '.messages-container',
            '.conversation-container',

            // CSS选择器匹配
            'div[class*="chat"]',
            'div[class*="conversation"]',
            'div[class*="message"]',
            'div[class*="assistant"]',
            'div[class*="ai"]',

            // 语义化标签
            '[role="main"]',
            'main',
            'section'
        ];

        let bestContainer = null;
        let bestScore = 0;

        for (const selector of cursorSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const score = this.evaluateChatContainer(element);
                    if (score > bestScore) {
                        bestScore = score;
                        bestContainer = element;
                    }
                }
            } catch (error) {
                console.warn(`选择器错误 ${selector}:`, error);
            }
        }

        if (bestContainer) {
            this.chatContainer = bestContainer;
            console.log('✅ 找到聊天容器:', {
                selector: bestContainer.tagName + '.' + bestContainer.className,
                score: bestScore,
                children: bestContainer.children.length,
                textLength: bestContainer.textContent.length,
                position: this.getElementPosition(bestContainer)
            });
            this.showNotification('✅ 找到右侧聊天区域', '#4CAF50');
        } else {
            console.log('⚠️ 未找到理想容器，使用启发式查找...');
            bestContainer = this.findByHeuristics();
            if (bestContainer) {
                this.chatContainer = bestContainer;
                this.showNotification('⚠️ 使用启发式找到聊天区域', '#FF9800');
            } else {
                console.log('❌ 完全找不到合适容器，使用document.body');
                this.chatContainer = document.body;
                this.showNotification('❌ 使用整个页面（未找到聊天区域）', '#FF5722');
            }
        }
    }

    evaluateChatContainer(element) {
        let score = 0;

        try {
            const rect = element.getBoundingClientRect();
            const children = element.children.length;
            const textLength = element.textContent.length;
            const className = element.className.toLowerCase();
            const id = element.id.toLowerCase();

            // 基础得分
            if (children >= 2) score += 15;
            if (textLength >= 50) score += 15;
            if (rect.width > 200) score += 10;
            if (rect.height > 150) score += 10;

            // 位置得分 - 重点关注右侧
            const screenWidth = window.innerWidth;
            const elementCenter = rect.left + rect.width / 2;

            // 如果元素在屏幕右半部分，加分
            if (elementCenter > screenWidth * 0.5) score += 25;
            // 如果元素在屏幕右三分之一，额外加分
            if (elementCenter > screenWidth * 0.66) score += 15;
            // 如果元素占据屏幕右侧大部分，额外加分
            if (rect.right > screenWidth * 0.8 && rect.width > screenWidth * 0.3) score += 20;

            // 关键词得分
            const chatKeywords = ['chat', 'conversation', 'message', 'assistant', 'ai', 'claude'];
            const panelKeywords = ['panel', 'sidebar', 'right', 'side'];

            chatKeywords.forEach(keyword => {
                if (className.includes(keyword) || id.includes(keyword)) score += 20;
            });

            panelKeywords.forEach(keyword => {
                if (className.includes(keyword) || id.includes(keyword)) score += 15;
            });

            // 内容质量得分
            const textContent = element.textContent.toLowerCase();
            if (textContent.includes('claude') || textContent.includes('assistant') || textContent.includes('ai')) {
                score += 25;
            }

            // 如果包含对话特征（问答模式）
            if (this.hasConversationPattern(element)) {
                score += 30;
            }

            return score;
        } catch (error) {
            return 0;
        }
    }

    hasConversationPattern(element) {
        try {
            const text = element.textContent;
            const hasUserMessages = text.includes('用户') || text.includes('User') || text.includes('你');
            const hasAssistantMessages = text.includes('助手') || text.includes('Assistant') || text.includes('Claude');
            const hasQuestions = (text.match(/\?|？/g) || []).length >= 2;

            return hasUserMessages || hasAssistantMessages || hasQuestions;
        } catch (error) {
            return false;
        }
    }

    findByHeuristics() {
        console.log('🔍 启动启发式查找...');

        // 查找包含对话内容的元素
        const allDivs = document.querySelectorAll('div');
        let candidates = [];

        for (const div of allDivs) {
            try {
                const rect = div.getBoundingClientRect();
                const text = div.textContent;

                // 基本条件
                if (rect.width < 200 || rect.height < 100 || text.length < 50) continue;

                // 位置筛选 - 只考虑右侧元素
                if (rect.left < window.innerWidth * 0.4) continue;

                const score = this.evaluateChatContainer(div);
                if (score > 30) {
                    candidates.push({ element: div, score: score });
                }
            } catch (error) {
                continue;
            }
        }

        // 按分数排序
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length > 0) {
            console.log('📊 启发式候选容器:', candidates.slice(0, 3).map(c => ({
                score: c.score,
                className: c.element.className,
                children: c.element.children.length
            })));
            return candidates[0].element;
        }

        return null;
    }

    getElementPosition(element) {
        const rect = element.getBoundingClientRect();
        return {
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
            centerX: rect.left + rect.width / 2,
            isRightSide: rect.left > window.innerWidth * 0.5
        };
    }

    getChatContent() {
        if (!this.chatContainer) return null;

        try {
            // 克隆容器以避免修改原始DOM
            const clone = this.chatContainer.cloneNode(true);

            // 更精确的清理 - 保留聊天消息，移除界面元素
            const removeSelectors = [
                'script', 'style', 'noscript', 'link',
                'button:not([class*="message"])', // 保留消息中的按钮
                'input', 'textarea',
                '.toolbar', '.menu', '.popup', '.tooltip',
                '.notification', '.toast', '.alert',
                '[class*="toolbar"]:not([class*="message"])',
                '[class*="menu"]:not([class*="message"])',
                '[class*="button"]:not([class*="message"])',
                '[class*="input"]:not([class*="message"])',
                // 移除导航和控制元素
                'nav', 'header:not([class*="message"])', 'footer',
                '.navigation', '.controls', '.settings'
            ];

            removeSelectors.forEach(selector => {
                try {
                    clone.querySelectorAll(selector).forEach(el => el.remove());
                } catch (e) {
                    // 忽略选择器错误
                }
            });

            // 清理属性，但保留一些有用的类名
            clone.querySelectorAll('*').forEach(el => {
                try {
                    const attrs = [...el.attributes];
                    attrs.forEach(attr => {
                        if (attr.name.startsWith('on') ||
                            attr.name.startsWith('data-') ||
                            attr.name === 'style' ||
                            attr.name === 'contenteditable') {
                            el.removeAttribute(attr.name);
                        }
                    });
                } catch (e) {
                    // 忽略属性清理错误
                }
            });

            const content = {
                html: clone.innerHTML,
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title,
                containerInfo: {
                    className: this.chatContainer.className,
                    tagName: this.chatContainer.tagName,
                    children: this.chatContainer.children.length,
                    position: this.getElementPosition(this.chatContainer)
                }
            };

            // 验证内容质量
            if (content.html.length < 100) {
                console.warn('⚠️ 提取的内容较少，可能未找到正确的聊天区域');
            }

            return content;

        } catch (error) {
            console.error('获取内容失败:', error);
            return null;
        }
    }

    async sendContent(content) {
        try {
            const response = await fetch(`${this.serverUrl}/api/content`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    type: 'html_content',
                    data: content
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            if (result.success) {
                console.log(`📤 内容发送成功: ${result.contentLength} 字符`);
                this.retryCount = 0; // 重置重试计数
                return true;
            } else {
                throw new Error(result.message);
            }

        } catch (error) {
            console.error('发送内容失败:', error);
            this.retryCount++;

            if (this.retryCount <= this.maxRetries) {
                this.showNotification(`⚠️ 发送失败，重试中... (${this.retryCount}/${this.maxRetries})`, '#FF9800');
            } else {
                this.showNotification('❌ 发送失败，已达到最大重试次数', '#FF5722');
            }
            return false;
        }
    }

    async checkForChanges() {
        const content = this.getChatContent();

        if (content && content.html !== this.lastContent) {
            console.log('🔄 检测到内容变化，同步中...');

            const success = await this.sendContent(content);
            if (success) {
                this.lastContent = content.html;
                this.showNotification('🔄 聊天内容已同步', '#2196F3');
            }
        }
    }

    startSync() {
        if (this.isRunning) return;

        this.isRunning = true;
        console.log('🚀 开始定时同步...');

        // 发送初始内容
        this.checkForChanges();

        // 每4秒检查一次
        this.syncInterval = setInterval(() => {
            this.checkForChanges();
        }, 4000);

        // 添加DOM监听器（如果可能）
        if (this.chatContainer) {
            try {
                const observer = new MutationObserver(() => {
                    // 延迟检查，避免频繁触发
                    setTimeout(() => {
                        this.checkForChanges();
                    }, 1000);
                });

                observer.observe(this.chatContainer, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });

                console.log('👀 DOM 监听器已启动');
            } catch (error) {
                console.warn('DOM 监听器启动失败:', error);
            }
        }

        this.showNotification('🚀 右侧聊天同步已启动！\n每4-5秒自动同步', '#4CAF50');
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.isRunning = false;
        console.log('🛑 同步已停止');
        this.showNotification('🛑 同步已停止', '#FF9800');
    }

    showNotification(message, color = '#2196F3') {
        // 移除旧通知
        const oldNotification = document.getElementById('cursor-http-notification');
        if (oldNotification) {
            oldNotification.remove();
        }

        const notification = document.createElement('div');
        notification.id = 'cursor-http-notification';
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            background: ${color}; color: white; padding: 12px 16px;
            border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 14px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 300px; white-space: pre-line; word-wrap: break-word;
            border: 1px solid rgba(255,255,255,0.1);
        `;
        notification.textContent = message;

        try {
            document.body.appendChild(notification);

            // 5秒后自动移除
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.opacity = '0';
                    notification.style.transform = 'translateX(100%)';
                    notification.style.transition = 'all 0.3s ease';
                    setTimeout(() => notification.remove(), 300);
                }
            }, 5000);
        } catch (error) {
            console.error('通知显示失败:', error);
        }
    }
}

// 防止重复初始化
if (window.CursorHttpSync) {
    console.log('❌ HTTP 同步脚本已经运行中');
    alert('🔄 Cursor HTTP同步脚本已运行！\n\n✅ 专门定位右侧AI聊天区域\n🔄 每4秒自动检查内容变化');
} else {
    // 延迟初始化，确保页面加载完成
    setTimeout(() => {
        console.log('🚀 启动 Cursor HTTP 同步...');
        window.CursorHttpSync = new CursorHttpSync();

        // 显示启动完成提示
        setTimeout(() => {
            alert('🔄 Cursor HTTP同步脚本已启动！\n\n✅ 专门定位右侧AI聊天区域\n🔄 每4秒自动检查内容变化');
        }, 2000);
    }, 1000);
}
