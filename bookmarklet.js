// 书签版注入脚本 - 复制此内容作为浏览器书签的URL
javascript:(function(){
    // 检查是否已经注入
    if (window.ClaudeWebSync) {
        console.log('Claude Web 同步脚本已存在');
        return;
    }

    // 创建同步类
    class CursorContentSync {
        constructor() {
            this.ws = null;
            this.lastContent = '';
            this.chatContainer = null;
            this.syncInterval = null;
            this.init();
        }

        init() {
            console.log('🚀 Claude Web 内容同步脚本已加载');
            this.connectWebSocket();
            this.startContentSync();
        }

        connectWebSocket() {
            try {
                this.ws = new WebSocket('ws://localhost:3000');

                this.ws.onopen = () => {
                    console.log('✅ WebSocket连接已建立');
                    this.sendInitialContent();
                };

                this.ws.onclose = () => {
                    console.log('❌ WebSocket连接已断开，5秒后重连...');
                    setTimeout(() => this.connectWebSocket(), 5000);
                };

                this.ws.onerror = (error) => {
                    console.log('🔥 WebSocket连接错误:', error);
                };
            } catch (error) {
                console.log('💥 WebSocket连接失败:', error);
                setTimeout(() => this.connectWebSocket(), 5000);
            }
        }

        findChatContainer() {
            const selectors = [
                '[data-testid="chat-container"]',
                '.chat-container',
                '.chat-panel',
                '.conversation-container',
                '.messages-container',
                '.chat-content',
                'div[class*="chat"]',
                'div[class*="conversation"]',
                'div[class*="message"]',
            ];

            for (const selector of selectors) {
                const container = document.querySelector(selector);
                if (container) {
                    console.log('🎯 找到聊天容器:', selector);
                    return container;
                }
            }

            const messageElements = document.querySelectorAll('div[class*="message"], .message, [data-message-id]');
            if (messageElements.length > 0) {
                const parent = messageElements[0].closest('div[class*="chat"], div[class*="conversation"], div[class*="panel"]');
                if (parent) {
                    console.log('🔍 通过消息元素找到聊天容器');
                    return parent;
                }
            }

            console.log('⚠️ 未找到聊天容器，使用整个body');
            return document.body;
        }

        getChatContent() {
            if (!this.chatContainer) {
                this.chatContainer = this.findChatContainer();
            }

            if (!this.chatContainer) {
                return null;
            }

            const clone = this.chatContainer.cloneNode(true);

            const elementsToRemove = [
                'script', 'style', '.tooltip', '.popup', '.dropdown',
                '[data-testid*="toolbar"]', '[class*="toolbar"]',
                '[class*="sidebar"]', 'button[class*="close"]',
                'button[class*="minimize"]'
            ];

            elementsToRemove.forEach(selector => {
                const elements = clone.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            });

            const allElements = clone.querySelectorAll('*');
            allElements.forEach(el => {
                const attributes = [...el.attributes];
                attributes.forEach(attr => {
                    if (attr.name.startsWith('on') || attr.name.startsWith('data-')) {
                        el.removeAttribute(attr.name);
                    }
                });
            });

            return {
                html: clone.innerHTML,
                timestamp: Date.now()
            };
        }

        sendContent(content) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({
                        type: 'html_content',
                        data: content
                    }));
                } catch (error) {
                    console.log('📤 发送内容失败:', error);
                }
            }
        }

        sendInitialContent() {
            const content = this.getChatContent();
            if (content) {
                this.sendContent(content);
                this.lastContent = content.html;
                console.log('📋 已发送初始内容');
            }
        }

        startContentSync() {
            this.syncInterval = setInterval(() => {
                const content = this.getChatContent();
                if (content && content.html !== this.lastContent) {
                    console.log('🔄 检测到内容变化，同步中...');
                    this.sendContent(content);
                    this.lastContent = content.html;
                }
            }, 2000);

            if (this.chatContainer) {
                const observer = new MutationObserver(() => {
                    const content = this.getChatContent();
                    if (content && content.html !== this.lastContent) {
                        this.sendContent(content);
                        this.lastContent = content.html;
                    }
                });

                observer.observe(this.chatContainer, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });

                console.log('👀 DOM监听器已启动');
            }
        }
    }

    // 创建全局实例
    window.ClaudeWebSync = new CursorContentSync();

    // 显示成功提示
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed; top: 20px; right: 20px; z-index: 10000;
        background: #4CAF50; color: white; padding: 15px 20px;
        border-radius: 5px; font-family: Arial, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notification.textContent = '🚀 Claude Web 同步已启动！';
    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);

})();
