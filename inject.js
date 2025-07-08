// inject.js - 增强版 Cursor 聊天内容同步脚本
console.log('🚀 Claude Web 增强版内容同步脚本已加载');

class EnhancedCursorContentSync {
    constructor() {
        this.ws = null;
        this.lastContent = '';
        this.chatContainer = null;
        this.syncInterval = null;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.isDebugMode = true; // 启用调试模式
        this.init();
    }

    init() {
        this.log('🔧 初始化同步系统...');

        // 显示启动通知
        this.showNotification('🔍 正在查找聊天内容...', '#2196F3');

        // 延迟初始化，等待页面完全加载
        setTimeout(() => {
            this.findAndTestContainer();
            this.connectWebSocket();
        }, 2000);
    }

    log(message, ...args) {
        if (this.isDebugMode) {
            console.log(`[Claude Web] ${message}`, ...args);
        }
    }

    findAndTestContainer() {
        this.log('🔍 开始查找聊天容器...');

        // 扩展的选择器列表，针对各种可能的 AI 聊天界面
        const selectors = [
            // Cursor 特定选择器
            '[data-testid*="chat"]',
            '[data-testid*="conversation"]',
            '[data-testid*="messages"]',
            '[data-testid*="assistant"]',
            // 通用 AI 聊天选择器
            '.chat-container', '.chat-panel', '.conversation-container',
            '.messages-container', '.chat-content', '.chat-view',
            '.chat-messages', '.conversation-messages',
            // 模糊匹配 - 包含关键词的 class
            'div[class*="chat"]', 'div[class*="conversation"]',
            'div[class*="message"]', 'div[class*="dialog"]',
            'div[class*="assistant"]', 'div[class*="ai"]',
            // 语义化 HTML 元素
            '[role="main"]', '[role="dialog"]', '[role="log"]',
            'main', 'section[class*="chat"]',
            // 布局相关 - 通常聊天在右侧
            '.right-panel', '.side-panel', '.assistant-panel',
            '.sidebar-right', '.panel-right'
        ];

        let foundContainer = null;
        let foundMethod = '';

        // 方法 1: 精确选择器匹配
        for (const selector of selectors) {
            try {
                const containers = document.querySelectorAll(selector);
                for (const container of containers) {
                    if (this.isValidChatContainer(container)) {
                        foundContainer = container;
                        foundMethod = `精确匹配：${selector}`;
                        break;
                    }
                }
                if (foundContainer) break;
            } catch (error) {
                this.log(`选择器错误 ${selector}:`, error.message);
            }
        }

        // 方法 2: 通过消息元素反向查找
        if (!foundContainer) {
            this.log('🔍 尝试通过消息元素反向查找...');
            const messageSelectors = [
                'div[class*="message"]', '.message', '[data-message]',
                '[role="listitem"]', '.chat-message', '.user-message',
                '.ai-message', '.assistant-message', '.bot-message',
                'p[class*="message"]', 'span[class*="message"]'
            ];

            for (const msgSelector of messageSelectors) {
                try {
                    const messages = document.querySelectorAll(msgSelector);
                    if (messages.length > 1) { // 至少要有 2 条消息
                        // 找到消息的共同父容器
                        const parent = messages[0].closest('div[class*="chat"], div[class*="conversation"], div[class*="panel"], main, [role="main"], section');
                        if (parent && this.isValidChatContainer(parent)) {
                            foundContainer = parent;
                            foundMethod = `消息反向查找：${msgSelector} -> ${parent.tagName}.${parent.className}`;
                            break;
                        }
                    }
                } catch (error) {
                    this.log(`消息选择器错误 ${msgSelector}:`, error.message);
                }
            }
        }

        // 方法 3: 启发式查找 - 基于内容和位置
        if (!foundContainer) {
            this.log('🔍 尝试启发式查找...');
            const allDivs = document.querySelectorAll('div');
            let bestCandidate = null;
            let bestScore = 0;

            for (const div of allDivs) {
                const score = this.calculateContainerScore(div);
                if (score > bestScore && score > 50) { // 最低分数阈值
                    bestScore = score;
                    bestCandidate = div;
                }
            }

            if (bestCandidate) {
                foundContainer = bestCandidate;
                foundMethod = `启发式查找：得分${bestScore}`;
            }
        }

        // 设置找到的容器
        if (foundContainer) {
            this.chatContainer = foundContainer;
            this.log('✅ 找到聊天容器：', foundMethod);
            this.log('容器信息：', {
                tagName: foundContainer.tagName,
                className: foundContainer.className,
                id: foundContainer.id,
                childrenCount: foundContainer.children.length,
                textLength: foundContainer.textContent.length
            });

            this.showNotification(`✅ 找到聊天区域\n${foundMethod}`, '#4CAF50');

            // 测试内容提取
            const testContent = this.getChatContent();
            if (testContent && testContent.html.length > 100) {
                this.log('✅ 内容提取测试成功，长度：', testContent.html.length);
            } else {
                this.log('⚠️ 内容提取测试失败或内容太少');
                this.showNotification('⚠️ 找到容器但内容较少', '#FF9800');
            }
        } else {
            this.log('❌ 未找到合适的聊天容器，使用 body');
            this.chatContainer = document.body;
            this.showNotification('❌ 未找到聊天区域，使用整个页面', '#FF5722');
        }

        // 输出调试信息
        this.outputDebugInfo();
    }

    // 判断是否为有效的聊天容器
    isValidChatContainer(element) {
        if (!element || !element.children) return false;

        const childCount = element.children.length;
        const textLength = element.textContent.length;
        const rect = element.getBoundingClientRect();

        // 基本条件检查
        return childCount >= 2 &&
               textLength >= 50 &&
               rect.width > 200 &&
               rect.height > 100;
    }

    // 计算容器得分（用于启发式查找）
    calculateContainerScore(element) {
        let score = 0;

        try {
            const rect = element.getBoundingClientRect();
            const childCount = element.children.length;
            const textLength = element.textContent.length;
            const className = element.className.toLowerCase();

            // 基础分数
            if (childCount >= 5) score += 20;
            if (textLength >= 200) score += 20;
            if (rect.width > 300) score += 10;
            if (rect.height > 300) score += 10;

            // 位置加分（右侧或占据大部分屏幕）
            if (rect.right > window.innerWidth * 0.6) score += 15;
            if (rect.width > window.innerWidth * 0.3) score += 10;

            // 类名关键词加分
            const keywords = ['chat', 'conversation', 'message', 'assistant', 'ai', 'dialog'];
            keywords.forEach(keyword => {
                if (className.includes(keyword)) score += 15;
            });

            // 惩罚项
            if (className.includes('sidebar') && rect.width < 300) score -= 20;
            if (className.includes('menu')) score -= 20;
            if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE') score -= 100;

        } catch (error) {
            return 0;
        }

        return score;
    }

    outputDebugInfo() {
        this.log('📊 页面调试信息:');
        this.log('  - URL:', window.location.href);
        this.log('  - Title:', document.title);
        this.log('  - 总div数量:', document.querySelectorAll('div').length);

        // 列出前10个有意义的class名称
        const classNames = new Set();
        document.querySelectorAll('div[class]').forEach(div => {
            if (div.className && div.className.length < 100) {
                div.className.split(' ').forEach(cls => {
                    if (cls.length > 3) classNames.add(cls);
                });
            }
        });

        this.log('  - 主要 class 名称：', Array.from(classNames).slice(0, 20));
    }

    connectWebSocket() {
        this.log('🔌 尝试连接 WebSocket...');

        // 智能选择协议
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//localhost:3000`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.log('✅ WebSocket 连接成功');
                this.showNotification('✅ 连接服务器成功！', '#4CAF50');
                this.retryCount = 0;
                this.sendInitialContent();
                this.startContentSync();
            };

            this.ws.onclose = (event) => {
                this.log(`❌ WebSocket 连接断开 (code: ${event.code})`);
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    this.showNotification(`🔄 连接断开，5秒后重试 (${this.retryCount}/${this.maxRetries})`, '#FF9800');
                    setTimeout(() => this.connectWebSocket(), 5000);
                } else {
                    this.showNotification('❌ 连接失败，请检查服务器', '#FF5722');
                }
            };

            this.ws.onerror = (error) => {
                this.log('🔥 WebSocket 错误：', error);
                this.showNotification('🔥 连接错误，检查防火墙设置', '#FF5722');
            };

        } catch (error) {
            this.log('💥 WebSocket 创建失败：', error);
            this.showNotification('💥 WebSocket 不可用', '#FF5722');
        }
    }

    getChatContent() {
        if (!this.chatContainer) return null;

        try {
            const clone = this.chatContainer.cloneNode(true);

            // 移除干扰元素
            const removeSelectors = [
                'script', 'style', 'link[rel="stylesheet"]',
                '.tooltip', '.popup', '.dropdown', '.overlay', '.menu',
                '[data-testid*="toolbar"]', '[class*="toolbar"]',
                '[class*="sidebar"]', 'button[class*="close"]',
                'button[class*="minimize"]', 'input', 'textarea',
                '.notification', '.toast', '.alert'
            ];

            removeSelectors.forEach(selector => {
                try {
                    clone.querySelectorAll(selector).forEach(el => el.remove());
                } catch (e) {
                    // 忽略选择器错误
                }
            });

            // 清理属性
            clone.querySelectorAll('*').forEach(el => {
                try {
                    [...el.attributes].forEach(attr => {
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

            return {
                html: clone.innerHTML,
                timestamp: Date.now(),
                url: window.location.href,
                title: document.title,
                containerInfo: {
                    tagName: this.chatContainer.tagName,
                    className: this.chatContainer.className,
                    childrenCount: this.chatContainer.children.length
                }
            };
        } catch (error) {
            this.log('❌ 获取内容失败：', error);
            return null;
        }
    }

    sendContent(content) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    type: 'html_content',
                    data: content
                }));
                this.log(`📤 内容已发送，大小：${content.html.length} 字符`);
            } catch (error) {
                this.log('📤 发送失败：', error);
            }
        }
    }

    sendInitialContent() {
        const content = this.getChatContent();
        if (content) {
            this.sendContent(content);
            this.lastContent = content.html;
            this.log('📋 初始内容已发送');
        }
    }

    startContentSync() {
        // 定时检查内容变化
        this.syncInterval = setInterval(() => {
            const content = this.getChatContent();
            if (content && content.html !== this.lastContent) {
                this.log('🔄 内容变化，同步中...');
                this.sendContent(content);
                this.lastContent = content.html;
            }
        }, 3000);

        // DOM 变化监听器
        if (this.chatContainer) {
            const observer = new MutationObserver((mutations) => {
                let hasSignificantChange = false;

                mutations.forEach(mutation => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        // 检查是否有文本内容的新增
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE &&
                                node.textContent &&
                                node.textContent.trim().length > 10) {
                                hasSignificantChange = true;
                                break;
                            }
                        }
                    }
                });

                if (hasSignificantChange) {
                    // 延迟一点再同步，等待 DOM 稳定
                    setTimeout(() => {
                        const content = this.getChatContent();
                        if (content && content.html !== this.lastContent) {
                            this.sendContent(content);
                            this.lastContent = content.html;
                        }
                    }, 1000);
                }
            });

            observer.observe(this.chatContainer, {
                childList: true,
                subtree: true,
                characterData: true
            });

            this.log('👀 DOM 监听器已启动');
        }
    }

    showNotification(message, color = '#2196F3') {
        // 移除旧通知
        const oldNotification = document.getElementById('claude-web-notification');
        if (oldNotification) {
            oldNotification.remove();
        }

        const notification = document.createElement('div');
        notification.id = 'claude-web-notification';
        notification.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            background: ${color}; color: white; padding: 12px 16px;
            border-radius: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 320px; white-space: pre-line; word-wrap: break-word;
        `;
        notification.textContent = message;

        try {
            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 5000);
        } catch (error) {
            this.log('通知显示失败：', error);
        }
    }
}

// 检查页面加载状态并启动
function initCursorSync() {
    // 防止重复初始化
    if (window.CursorContentSync) {
        console.log('Claude Web 同步脚本已存在');
        return;
    }

    console.log('🚀 启动 Claude Web 同步脚本...');
    window.CursorContentSync = new EnhancedCursorContentSync();
}

// 根据页面加载状态选择初始化时机
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCursorSync);
} else {
    // 页面已加载，延迟一秒以确保所有资源都准备好
    setTimeout(initCursorSync, 1000);
}
