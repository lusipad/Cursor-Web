// 🚀 Cursor 简化版同步脚本
console.log('🚀 Cursor 简化版同步脚本开始运行...');

class SimpleCursorSync {
    constructor() {
        this.serverUrl = 'http://localhost:3000';
        this.lastContent = '';
        this.chatContainer = null;
        this.syncInterval = null;
        this.init();
    }

    async init() {
        console.log('🔧 初始化同步系统...');

        try {
            await this.testServer();
            this.findChatArea();
            this.startSync();
            this.showMessage('✅ 同步已启动', '#4CAF50');
        } catch (error) {
            console.error('初始化失败：', error);
            this.showMessage('❌ 初始化失败', '#FF5722');
        }
    }

    async testServer() {
        const response = await fetch(this.serverUrl + '/api/test');
        if (!response.ok) throw new Error('服务器连接失败');
        console.log('✅ 服务器连接成功');
    }

    findChatArea() {
        console.log('🔍 查找聊天区域...');

        // 尝试多种选择器
        const selectors = [
            '[data-testid*="chat"]',
            '.chat-container',
            '.chat-panel',
            '.right-panel',
            'div[class*="chat"]',
            'div[class*="conversation"]',
            '[role="main"]',
            'main'
        ];

        let bestElement = null;
        let bestScore = 0;

        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const score = this.scoreElement(el);
                    if (score > bestScore) {
                        bestScore = score;
                        bestElement = el;
                    }
                }
            } catch (e) {
                console.warn('选择器错误：', selector);
            }
        }

        if (bestElement) {
            this.chatContainer = bestElement;
            console.log('✅ 找到聊天区域，得分：', bestScore);
        } else {
            console.log('⚠️ 使用整个页面');
            this.chatContainer = document.body;
        }
    }

    scoreElement(element) {
        let score = 0;
        try {
            const rect = element.getBoundingClientRect();
            const text = element.textContent || '';

            // 基础得分
            if (element.children.length >= 2) score += 10;
            if (text.length >= 100) score += 10;
            if (rect.width > 300) score += 5;
            if (rect.height > 200) score += 5;

            // 位置得分 - 右侧优先
            if (rect.left > window.innerWidth * 0.5) score += 20;

            // 关键词得分
            const keywords = ['chat', 'conversation', 'message', 'assistant'];
            const className = element.className.toLowerCase();
            for (const keyword of keywords) {
                if (className.includes(keyword)) score += 15;
            }

            return score;
        } catch (e) {
            return 0;
        }
    }

    getContent() {
        if (!this.chatContainer) return null;

        try {
            const clone = this.chatContainer.cloneNode(true);

            // 简单清理
            const removeList = ['script', 'style', 'button', 'input'];
            for (const tag of removeList) {
                const elements = clone.querySelectorAll(tag);
                for (const el of elements) {
                    el.remove();
                }
            }

            return {
                html: clone.innerHTML,
                timestamp: Date.now(),
                url: window.location.href
            };
        } catch (error) {
            console.error('获取内容失败：', error);
            return null;
        }
    }

    async sendToServer(content) {
        try {
            const response = await fetch(this.serverUrl + '/api/content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'html_content',
                    data: content
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('📤 发送成功：', result.contentLength, '字符');
                return true;
            }
            return false;
        } catch (error) {
            console.error('发送失败：', error);
            return false;
        }
    }

    async checkAndSync() {
        const content = this.getContent();
        if (content && content.html !== this.lastContent) {
            console.log('🔄 检测到变化，同步中...');
            const success = await this.sendToServer(content);
            if (success) {
                this.lastContent = content.html;
                this.showMessage('🔄 已同步', '#2196F3');
            }
        }
    }

    startSync() {
        console.log('🚀 开始定时同步...');

        // 立即发送一次
        this.checkAndSync();

        // 每 5 秒检查一次
        this.syncInterval = setInterval(() => {
            this.checkAndSync();
        }, 5000);
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        console.log('🛑 同步已停止');
    }

    showMessage(text, color) {
        const old = document.getElementById('cursor-msg');
        if (old) old.remove();

        const msg = document.createElement('div');
        msg.id = 'cursor-msg';
        msg.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            background: ${color}; color: white; padding: 10px 15px;
            border-radius: 5px; font-size: 14px; max-width: 250px;
        `;
        msg.textContent = text;

        document.body.appendChild(msg);
        setTimeout(() => msg.remove(), 3000);
    }
}

// 启动脚本
if (window.SimpleCursorSync) {
    console.log('⚠️ 脚本已在运行');
    alert('脚本已在运行中！');
} else {
    setTimeout(() => {
        window.SimpleCursorSync = new SimpleCursorSync();
        alert('🚀 Cursor 同步脚本已启动！\n\n专门定位右侧聊天区域\n每 5 秒自动同步');
    }, 1000);
}
            console.log('👀 定时同步已启动');
        }

        showNotification(message, color) {
            const oldNotification = document.getElementById('cursor-sync-notification');
            if (oldNotification) oldNotification.remove();

            const notification = document.createElement('div');
            notification.id = 'cursor-sync-notification';
            notification.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 99999;
                background: ${color}; color: white; padding: 12px 16px;
                border-radius: 6px; font-family: Arial, sans-serif;
                font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            notification.textContent = message;

            try {
                document.body.appendChild(notification);
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.remove();
                    }
                }, 3000);
            } catch (error) {
                console.log('通知显示失败：', error);
            }
        }
    }

    // 创建同步实例
    window.CursorSync = new CursorSync(workingWsUrl);
}

// 页面基础信息
console.log('📊 页面分析：');
console.log('  - 总元素数：', document.querySelectorAll('*').length);
console.log('  - Div 数量：', document.querySelectorAll('div').length);

// 查找可能的聊天元素
const chatKeywords = ['chat', 'conversation', 'message', 'assistant', 'ai'];
chatKeywords.forEach(keyword => {
    const elements = document.querySelectorAll(`[class*="${keyword}"]`);
    if (elements.length > 0) {
        console.log(`  - ${keyword} 元素:`, elements.length);
    }
});

// 开始连接测试
console.log('\n🔍 开始连接测试...');
alert('🔍 开始连接测试...\n请查看 Console 了解详细信息');
testWebSocketConnection();
                this.startContentSync();
            };

            this.ws.onclose = (event) => {
                this.log(`❌ WebSocket连接断开 (code: ${event.code})`);
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    this.showNotification(`🔄 连接断开，5秒后重试 (${this.retryCount}/${this.maxRetries})`, '#FF9800');
                    setTimeout(() => this.connectWebSocket(), 5000);
                } else {
                    this.showNotification('❌ 连接失败，请检查服务器是否运行', '#FF5722');
                }
            };

            this.ws.onerror = (error) => {
                this.log('🔥 WebSocket错误:', error);
                this.showNotification('🔥 连接错误，请检查服务器状态', '#FF5722');
            };

        } catch (error) {
            this.log('💥 WebSocket创建失败:', error);
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
                '.tooltip', '.popup', '.dropdown', '.overlay', '.menu',
                '[class*="toolbar"]', '[class*="sidebar"]',
                'button[class*="close"]', 'button[class*="minimize"]',
                'input', 'textarea', '.notification', '.toast', '.alert'
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
            this.log('❌ 获取内容失败:', error);
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
                this.log(`📤 内容已发送，大小: ${content.html.length} 字符`);
            } catch (error) {
                this.log('📤 发送失败:', error);
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
                this.log('🔄 检测到内容变化，同步中...');
                this.sendContent(content);
                this.lastContent = content.html;
            }
        }, 3000);

        // DOM变化监听器
        if (this.chatContainer) {
            const observer = new MutationObserver((mutations) => {
                let hasSignificantChange = false;

                mutations.forEach(mutation => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE &&
                                node.textContent &&
                                node.textContent.trim().length > 5) {
                                hasSignificantChange = true;
                                break;
                            }
                        }
                    }
                });

                if (hasSignificantChange) {
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

            this.log('👀 DOM监听器已启动');
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
            max-width: 300px; white-space: pre-line; word-wrap: break-word;
        `;
        notification.textContent = message;

        try {
            document.body.appendChild(notification);

            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 4000);
        } catch (error) {
            this.log('通知显示失败:', error);
        }
    }
}

// 创建全局实例
window.CursorContentSync = new EnhancedCursorContentSync();

console.log('✅ Claude Web 同步脚本已启动！');
console.log('💡 提示：');
console.log('  - 脚本会自动查找聊天内容并同步到 http://localhost:3000');
console.log('  - 请确保服务器正在运行 (node app.js)');
console.log('  - 查看右上角通知了解运行状态');
console.log('  - 所有调试信息都会在这个Console中显示');
