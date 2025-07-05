// 🚀 Cursor Remote Control v2.0 - 注入脚本
(function() {
    'use strict';

    // 配置
    const CONFIG = {
        wsUrl: 'ws://localhost:3460',
        reconnectDelay: 3000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 30000
    };

    // 全局变量
    let ws = null;
    let reconnectAttempts = 0;
    let heartbeatTimer = null;
    let isConnected = false;

    // WebSocket 管理器
    class WSManager {
        constructor() {
            this.messageQueue = [];
            this.connect();
        }

        connect() {
            if (ws && ws.readyState === WebSocket.OPEN) {
                return;
            }

            try {
                ws = new WebSocket(CONFIG.wsUrl);
                this.bindEvents();
            } catch (error) {
                console.error('WebSocket 连接失败：', error);
                this.scheduleReconnect();
            }
        }

        bindEvents() {
            ws.onopen = () => {
                console.log('✅ WebSocket 连接成功');
                isConnected = true;
                reconnectAttempts = 0;
                this.startHeartbeat();
                this.flushMessageQueue();
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('消息解析失败：', error);
                }
            };

            ws.onclose = () => {
                console.log('WebSocket 连接关闭');
                isConnected = false;
                this.stopHeartbeat();
                this.scheduleReconnect();
            };

            ws.onerror = (error) => {
                console.error('WebSocket 错误：', error);
                isConnected = false;
            };
        }

        handleMessage(data) {
            switch (data.type) {
                case 'ping':
                    this.send({ type: 'pong' });
                    break;
                case 'ai_chat':
                    this.handleAIChat(data);
                    break;
                case 'web_message':
                    this.handleWebMessage(data);
                    break;
                default:
                    console.log('未知消息类型：', data.type);
            }
        }

        handleAIChat(data) {
            if (data.data && data.data.message) {
                this.sendToCursor(data.data.message);
            }
        }

        handleWebMessage(data) {
            if (data.data && data.data.message) {
                console.log('📥 收到 Web 消息：', data.data.message.substring(0, 50) + '...');
                this.sendToCursor(data.data.message);
            }
        }

        sendToCursor(message) {
            const inputElement = this.findCursorInput();
            if (inputElement) {
                console.log('准备发送消息到 Cursor:', message.substring(0, 50) + '...');

                // 清空现有内容
                if (inputElement.tagName.toLowerCase() === 'textarea') {
                    inputElement.value = message;
                } else if (inputElement.contentEditable === 'true') {
                    inputElement.textContent = message;
                }

                inputElement.focus();

                // 触发各种事件以确保 Cursor 识别输入
                const events = ['input', 'change', 'keyup', 'paste'];
                events.forEach(eventType => {
                    inputElement.dispatchEvent(new Event(eventType, {
                        bubbles: true,
                        cancelable: true
                    }));
                });

                // 尝试触发键盘事件
                inputElement.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    bubbles: true,
                    cancelable: true
                }));

                // 延迟自动发送
                setTimeout(() => {
                    if (this.clickSendButton()) {
                        console.log('✅ 消息已发送到 Cursor');
                    } else {
                        console.warn('⚠️ 未找到发送按钮，请手动发送');
                    }
                }, 200);

            } else {
                console.warn('❌ 未找到 Cursor 输入框');
            }
        }

        findCursorInput() {
            // 根据 Cursor 界面结构的多种策略查找输入框
            const selectors = [
                // 基于 placeholder 的选择器
                'textarea[placeholder*="问"]',
                'textarea[placeholder*="Ask"]',
                'textarea[placeholder*="输入"]',
                'textarea[placeholder*="Send"]',
                'textarea[placeholder*="Enter"]',
                'textarea[placeholder*="message"]',
                'textarea[placeholder*="chat"]',

                // 基于类名的选择器
                'textarea[class*="chat"]',
                'textarea[class*="input"]',
                'textarea[class*="message"]',
                'textarea[class*="composer"]',

                // 基于数据属性的选择器
                'textarea[data-testid*="chat"]',
                'textarea[data-testid*="input"]',
                'textarea[data-testid*="message"]',

                // 基于 ID 的选择器
                'textarea[id*="chat"]',
                'textarea[id*="input"]',
                'textarea[id*="message"]',

                // 编辑器相关
                'div[contenteditable="true"]',
                '[role="textbox"]'
            ];

            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (element.offsetParent !== null &&
                        element.offsetHeight > 20 &&
                        !element.disabled &&
                        !element.readOnly) {
                        console.log('找到输入框：', selector, element);
                        return element;
                    }
                }
            }

            // 最后尝试查找所有可见的 textarea
            const textareas = document.querySelectorAll('textarea');
            for (const textarea of textareas) {
                if (textarea.offsetParent !== null &&
                    textarea.offsetHeight > 20 &&
                    !textarea.disabled &&
                    !textarea.readOnly &&
                    textarea.style.display !== 'none') {
                    console.log('找到通用输入框：', textarea);
                    return textarea;
                }
            }

            console.warn('未找到合适的输入框');
            return null;
        }

        clickSendButton() {
            // 多种策略查找发送按钮
            const buttonSelectors = [
                // 基于文本内容
                'button:contains("发送")',
                'button:contains("Send")',
                'button:contains("提交")',
                'button:contains("Submit")',

                // 基于类名
                'button[class*="send"]',
                'button[class*="submit"]',
                'button[class*="chat"]',
                'button[class*="message"]',

                // 基于标题
                'button[title*="发送"]',
                'button[title*="Send"]',
                'button[title*="提交"]',
                'button[title*="Submit"]',

                // 基于 aria-label
                'button[aria-label*="发送"]',
                'button[aria-label*="Send"]',
                'button[aria-label*="Submit"]',

                // 基于数据属性
                'button[data-testid*="send"]',
                'button[data-testid*="submit"]',
                'button[data-testid*="chat"]'
            ];

            // 先尝试选择器查找
            for (const selector of buttonSelectors) {
                try {
                    const button = document.querySelector(selector);
                    if (button && button.offsetParent !== null && !button.disabled) {
                        console.log('找到发送按钮 (选择器):', selector, button);
                        button.click();
                        return true;
                    }
                } catch (error) {
                    // 某些选择器可能不被支持，继续尝试下一个
                }
            }

            // 遍历所有按钮检查文本内容
            const buttons = document.querySelectorAll('button');
            for (const button of buttons) {
                if (!button.offsetParent || button.disabled) continue;

                const text = (button.textContent || '').toLowerCase().trim();
                const title = (button.title || '').toLowerCase();
                const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();

                // 检查文本、标题或 aria-label 是否包含发送相关词汇
                const sendKeywords = ['send', '发送', 'submit', '提交', '确定', 'ok'];
                const containsSendKeyword = sendKeywords.some(keyword =>
                    text.includes(keyword) || title.includes(keyword) || ariaLabel.includes(keyword)
                );

                if (containsSendKeyword) {
                    console.log('找到发送按钮 (文本匹配):', text, button);
                    button.click();
                    return true;
                }
            }

            // 最后尝试查找可能的图标按钮（通常在输入框附近）
            const inputElement = this.findCursorInput();
            if (inputElement) {
                const parent = inputElement.closest('form, div[class*="chat"], div[class*="input"], div[class*="composer"]');
                if (parent) {
                    const nearbyButtons = parent.querySelectorAll('button');
                    for (const button of nearbyButtons) {
                        if (button.offsetParent !== null && !button.disabled) {
                            // 如果是最后一个按钮，很可能是发送按钮
                            const allNearbyButtons = Array.from(nearbyButtons).filter(b =>
                                b.offsetParent !== null && !b.disabled
                            );
                            if (button === allNearbyButtons[allNearbyButtons.length - 1]) {
                                console.log('找到发送按钮 (位置推测):', button);
                                button.click();
                                return true;
                            }
                        }
                    }
                }
            }

            console.warn('❌ 未找到发送按钮');
            return false;
        }

        send(data) {
            if (isConnected && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(data));
            } else {
                this.messageQueue.push(data);
            }
        }

        flushMessageQueue() {
            while (this.messageQueue.length > 0) {
                const message = this.messageQueue.shift();
                this.send(message);
            }
        }

        startHeartbeat() {
            this.stopHeartbeat();
            heartbeatTimer = setInterval(() => {
                if (isConnected) {
                    this.send({ type: 'ping' });
                }
            }, CONFIG.heartbeatInterval);
        }

        stopHeartbeat() {
            if (heartbeatTimer) {
                clearInterval(heartbeatTimer);
                heartbeatTimer = null;
            }
        }

        scheduleReconnect() {
            if (reconnectAttempts < CONFIG.maxReconnectAttempts) {
                reconnectAttempts++;
                console.log(`准备重连... (${reconnectAttempts}/${CONFIG.maxReconnectAttempts})`);

                setTimeout(() => {
                    this.connect();
                }, CONFIG.reconnectDelay);
            } else {
                console.error('已达到最大重连次数，停止重连');
            }
        }
    }

    // AI 对话监听器
    class AIResponseListener {
        constructor() {
            this.isListening = false;
            this.observer = null;
            this.processedMessages = new Set();
            this.lastMessageCount = 0;
            this.start();
        }

        start() {
            if (this.isListening) return;

            this.isListening = true;

            // 监听 DOM 变化
            this.observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.checkForNewMessages(node);
                        }
                    });
                });
            });

            this.observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true
            });

            // 定期检查聊天界面（降低频率，减少重复）
            setInterval(() => {
                this.scanChatInterface();
            }, 10000); // 从2000改为10000毫秒（10秒）

            // 初始扫描
            setTimeout(() => {
                this.scanChatInterface();
            }, 1000);
        }

        scanChatInterface() {
            try {
                const chatContainer = this.findChatContainer();
                if (chatContainer) {
                    this.extractAllMessages(chatContainer);
                }
            } catch (error) {
                console.error('扫描聊天界面失败：', error);
            }
        }

        findChatContainer() {
            // 根据提供的 HTML 结构查找聊天容器
            const selectors = [
                '.composer-bar .conversations',
                '.messages-container',
                '.chat-messages',
                '.conversation-container',
                '[data-testid="chat-messages"]',
                '.pane-body .conversations'
            ];

            for (const selector of selectors) {
                const container = document.querySelector(selector);
                if (container) {
                    return container;
                }
            }

            // 备用策略：查找包含多个消息的容器
            const potentialContainers = document.querySelectorAll('div');
            for (const container of potentialContainers) {
                const messageElements = container.querySelectorAll('[data-message-index], .chat-message, .message, [class*="message"]');
                if (messageElements.length >= 2) {
                    return container;
                }
            }

            return null;
        }

        extractAllMessages(container) {
            const messages = this.findMessages(container);

            messages.forEach(messageElement => {
                const messageData = this.parseMessage(messageElement);
                if (messageData && !this.processedMessages.has(messageData.id)) {
                    this.processedMessages.add(messageData.id);
                    this.sendMessage(messageData);
                }
            });
        }

        findMessages(container) {
            const messageSelectors = [
                '[data-message-index]',
                '.chat-message',
                '.message',
                '[class*="message"]',
                '[class*="bubble"]',
                '[id*="bubble"]'
            ];

            const messages = [];

            for (const selector of messageSelectors) {
                const elements = container.querySelectorAll(selector);
                elements.forEach(el => {
                    if (this.isValidMessage(el)) {
                        messages.push(el);
                    }
                });
            }

            return messages;
        }

        isValidMessage(element) {
            const text = element.textContent || element.innerText;
            if (!text || text.trim().length < 10) return false;

            // 过滤掉系统消息和界面元素
            const excludePatterns = [
                'Load older messages',
                'file-input',
                'button',
                'textarea',
                'input',
                'Copy',
                'Send',
                'Enter',
                'Ctrl',
                'placeholder',
                'class=',
                'id=',
                'style=',
                'onClick=',
                'addEventListener',
                'querySelector',
                'getElementById',
                'console.log',
                'function',
                'const ',
                'let ',
                'var ',
                'return',
                'if (',
                'for (',
                'while (',
                '{ }',
                '[]',
                '()',
                '+=',
                '=>',
                'import',
                'export',
                'require',
                'module',
                'npm',
                'yarn',
                'git',
                'localhost',
                'http://',
                'https://',
                'ws://',
                '127.0.0.1',
                '3459',
                '3460',
                'WebSocket',
                'connectWebSocket',
                'updateSyncStatus',
                'updateWorkspaceInfo',
                'checkServerStatus',
                'serverAddress',
                'this.connectWebSocket',
                'this.updateConnectionStatus',
                'this.serverAddress',
                'this.updateWorkspaceInfo',
                'client.js',
                'inject.js',
                'app.js',
                'public/',
                'node_modules',
                'package.json'
            ];

            // 检查是否包含代码或技术内容
            for (const pattern of excludePatterns) {
                if (text.includes(pattern)) {
                    return false;
                }
            }

            // 检查是否主要是标点符号和数字
            const textOnly = text.replace(/[^\u4e00-\u9fa5\w\s]/g, '');
            if (textOnly.length < text.length * 0.5) {
                return false;
            }

            // 检查是否是时间戳格式
            if (/^\d{2}:\d{2}:\d{2}$/.test(text.trim())) {
                return false;
            }

            return true;
        }

        parseMessage(element) {
            const text = element.textContent || element.innerText;
            const cleanText = text.trim();

            // 使用内容哈希作为ID，确保相同内容不会重复发送
            const messageId = this.hashText(cleanText);

            // 尝试确定消息类型
            const messageType = this.detectMessageType(element);

            return {
                id: messageId,
                content: cleanText,
                type: messageType,
                timestamp: new Date().toISOString(),
                element: element.outerHTML
            };
        }

        hashText(text) {
            let hash = 0;
            if (text.length === 0) return hash;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // 转换为32位整数
            }
            return hash.toString();
        }

        detectMessageType(element) {
            const className = element.className || '';
            const innerHTML = element.innerHTML || '';

            // 检查是否是用户消息
            if (className.includes('user') ||
                className.includes('human') ||
                innerHTML.includes('user-message') ||
                element.style.textAlign === 'right') {
                return 'user';
            }

            // 检查是否是AI回复
            if (className.includes('ai') ||
                className.includes('assistant') ||
                className.includes('bot') ||
                innerHTML.includes('ai-message') ||
                innerHTML.includes('assistant-message')) {
                return 'ai';
            }

            // 基于内容和位置推测
            const text = element.textContent || '';
            if (text.includes('我是') || text.includes('我可以') || text.includes('根据')) {
                return 'ai';
            }

            return 'ai'; // 默认为AI消息
        }

        checkForNewMessages(node) {
            // 检查新添加的节点是否是消息
            if (this.isValidMessage(node)) {
                const messageData = this.parseMessage(node);
                if (messageData && !this.processedMessages.has(messageData.id)) {
                    this.processedMessages.add(messageData.id);
                    this.sendMessage(messageData);
                }
            }

            // 检查子节点
            const childMessages = this.findMessages(node);
            childMessages.forEach(messageElement => {
                const messageData = this.parseMessage(messageElement);
                if (messageData && !this.processedMessages.has(messageData.id)) {
                    this.processedMessages.add(messageData.id);
                    this.sendMessage(messageData);
                }
            });
        }

        sendMessage(messageData) {
            if (window.wsManager) {
                window.wsManager.send({
                    type: 'cursor_message',
                    data: messageData
                });
                console.log('📤 发送消息到 Web 界面：', messageData.type, messageData.content.substring(0, 50) + '...');
            }
        }

        // 兼容旧版本的方法
        sendAIResponse(text) {
            this.sendMessage({
                id: Date.now() + Math.random(),
                content: text,
                type: 'ai',
                timestamp: new Date().toISOString()
            });
        }
    }

    // 初始化
    function init() {
        console.log('🚀 Cursor Remote Control v2.0 注入脚本已加载');

        // 创建 WebSocket 管理器
        window.wsManager = new WSManager();

        // 创建 AI 响应监听器
        window.aiListener = new AIResponseListener();

        // 暴露调试接口
        window.CursorRemoteDebug = {
            wsManager: window.wsManager,
            aiListener: window.aiListener,
            status: () => ({
                connected: isConnected,
                reconnectAttempts: reconnectAttempts,
                wsUrl: CONFIG.wsUrl
            }),
            sendTest: (message) => {
                window.wsManager.sendToCursor(message);
            }
        };

        console.log('✅ 初始化完成，调试接口已暴露到 window.CursorRemoteDebug');
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
