// 增强版书签脚本 - 处理常见的注入失败问题
javascript:(function(){
    console.log('🚀 开始加载 Claude Web 增强版同步脚本...');

    // 检查是否已经注入
    if (window.ClaudeWebSync) {
        alert('Claude Web 同步脚本已存在并运行中！');
        return;
    }

    // 增强版同步类
    class EnhancedCursorSync {
        constructor() {
            this.ws = null;
            this.lastContent = '';
            this.chatContainer = null;
            this.syncInterval = null;
            this.retryCount = 0;
            this.maxRetries = 3;
            this.init();
        }

        init() {
            console.log('🔧 初始化同步系统...');

            // 显示启动通知
            this.showNotification('🔍 正在查找聊天内容...', '#2196F3');

            // 延迟查找容器，等待页面完全加载
            setTimeout(() => {
                this.findAndTestContainer();
                this.connectWebSocket();
            }, 1000);
        }

        findAndTestContainer() {
            console.log('🔍 开始查找聊天容器...');

            // 扩展的选择器列表
            const selectors = [
                // AI聊天相关
                '[data-testid="chat-container"]',
                '[data-testid="conversation"]',
                '[data-testid="chat-panel"]',
                // 通用聊天容器
                '.chat-container', '.chat-panel', '.conversation-container',
                '.messages-container', '.chat-content', '.chat-view',
                // 模糊匹配
                'div[class*="chat"]', 'div[class*="conversation"]',
                'div[class*="message"]', 'div[class*="dialog"]',
                // AI助手特定
                '[role="main"]', '[role="dialog"]', 'main',
                // 尝试右侧面板
                '.right-panel', '.side-panel', '.assistant-panel'
            ];

            let foundContainer = null;
            let foundMethod = '';

            // 方法1: 精确匹配
            for (const selector of selectors) {
                const container = document.querySelector(selector);
                if (container && container.children.length > 0) {
                    foundContainer = container;
                    foundMethod = `精确匹配: ${selector}`;
                    break;
                }
            }

            // 方法2: 通过消息元素反向查找
            if (!foundContainer) {
                const messageSelectors = [
                    'div[class*="message"]', '.message', '[data-message]',
                    '[role="listitem"]', '.chat-message', '.user-message',
                    '.ai-message', '.assistant-message'
                ];

                for (const msgSelector of messageSelectors) {
                    const messages = document.querySelectorAll(msgSelector);
                    if (messages.length > 0) {
                        // 找到消息的共同父容器
                        const parent = messages[0].closest('div[class*="chat"], div[class*="conversation"], div[class*="panel"], main, [role="main"]');
                        if (parent) {
                            foundContainer = parent;
                            foundMethod = `通过消息反向查找: ${msgSelector} -> ${parent.tagName}`;
                            break;
                        }
                    }
                }
            }

            // 方法3: 查找包含大量内容的右侧div
            if (!foundContainer) {
                const allDivs = document.querySelectorAll('div');
                for (const div of allDivs) {
                    if (div.children.length > 5 && div.textContent.length > 100) {
                        const rect = div.getBoundingClientRect();
                        // 检查是否在页面右侧
                        if (rect.right > window.innerWidth * 0.5 && rect.height > 200) {
                            foundContainer = div;
                            foundMethod = '启发式查找: 右侧内容丰富的div';
                            break;
                        }
                    }
                }
            }

            // 设置容器
            if (foundContainer) {
                this.chatContainer = foundContainer;
                console.log('✅ 找到聊天容器:', foundMethod);
                this.showNotification(`✅ 找到聊天区域\n${foundMethod}`, '#4CAF50');

                // 测试内容提取
                const testContent = this.getChatContent();
                if (testContent && testContent.html.length > 50) {
                    console.log('✅ 内容提取测试成功，长度:', testContent.html.length);
                } else {
                    console.log('⚠️ 内容提取测试失败或内容太少');
                    this.showNotification('⚠️ 找到容器但内容较少', '#FF9800');
                }
            } else {
                console.log('❌ 未找到合适的聊天容器');
                this.chatContainer = document.body;
                this.showNotification('❌ 未找到聊天区域，使用整个页面', '#FF5722');
            }
        }

        connectWebSocket() {
            console.log('🔌 尝试连接 WebSocket...');

            // 智能选择协议
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//localhost:3000`;

            try {
                this.ws = new WebSocket(wsUrl);

                this.ws.onopen = () => {
                    console.log('✅ WebSocket连接成功');
                    this.showNotification('✅ 连接服务器成功！', '#4CAF50');
                    this.retryCount = 0;
                    this.sendInitialContent();
                    this.startContentSync();
                };

                this.ws.onclose = (event) => {
                    console.log(`❌ WebSocket连接断开 (code: ${event.code})`);
                    if (this.retryCount < this.maxRetries) {
                        this.retryCount++;
                        this.showNotification(`🔄 连接断开，${5}秒后重试 (${this.retryCount}/${this.maxRetries})`, '#FF9800');
                        setTimeout(() => this.connectWebSocket(), 5000);
                    } else {
                        this.showNotification('❌ 连接失败，请检查服务器', '#FF5722');
                    }
                };

                this.ws.onerror = (error) => {
                    console.log('🔥 WebSocket错误:', error);
                    this.showNotification('🔥 连接错误，检查防火墙设置', '#FF5722');
                };

            } catch (error) {
                console.log('💥 WebSocket创建失败:', error);
                this.showNotification('💥 WebSocket不可用', '#FF5722');
            }
        }

        getChatContent() {
            if (!this.chatContainer) return null;

            try {
                const clone = this.chatContainer.cloneNode(true);

                // 移除干扰元素
                const removeSelectors = [
                    'script', 'style', 'link[rel="stylesheet"]',
                    '.tooltip', '.popup', '.dropdown', '.overlay',
                    '[data-testid*="toolbar"]', '[class*="toolbar"]',
                    '[class*="sidebar"]', 'button[class*="close"]',
                    'button[class*="minimize"]', '.menu'
                ];

                removeSelectors.forEach(selector => {
                    clone.querySelectorAll(selector).forEach(el => el.remove());
                });

                // 清理属性
                clone.querySelectorAll('*').forEach(el => {
                    [...el.attributes].forEach(attr => {
                        if (attr.name.startsWith('on') ||
                            attr.name.startsWith('data-') ||
                            attr.name === 'style') {
                            el.removeAttribute(attr.name);
                        }
                    });
                });

                return {
                    html: clone.innerHTML,
                    timestamp: Date.now(),
                    url: window.location.href,
                    title: document.title
                };
            } catch (error) {
                console.log('❌ 获取内容失败:', error);
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
                    console.log('📤 内容已发送，大小:', content.html.length);
                } catch (error) {
                    console.log('📤 发送失败:', error);
                }
            }
        }

        sendInitialContent() {
            const content = this.getChatContent();
            if (content) {
                this.sendContent(content);
                this.lastContent = content.html;
                console.log('📋 初始内容已发送');
            }
        }

        startContentSync() {
            // 定时检查
            this.syncInterval = setInterval(() => {
                const content = this.getChatContent();
                if (content && content.html !== this.lastContent) {
                    console.log('🔄 内容变化，同步中...');
                    this.sendContent(content);
                    this.lastContent = content.html;
                }
            }, 3000);

            // DOM监听
            if (this.chatContainer) {
                const observer = new MutationObserver(() => {
                    setTimeout(() => {
                        const content = this.getChatContent();
                        if (content && content.html !== this.lastContent) {
                            this.sendContent(content);
                            this.lastContent = content.html;
                        }
                    }, 500);
                });

                observer.observe(this.chatContainer, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });

                console.log('👀 DOM监听已启动');
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
                max-width: 300px; white-space: pre-line;
            `;
            notification.textContent = message;
            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 4000);
        }
    }

    // 创建全局实例
    window.ClaudeWebSync = new EnhancedCursorSync();

})();
