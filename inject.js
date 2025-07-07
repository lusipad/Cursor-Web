// 🚀 Cursor Remote Control v2.0 - 注入脚本
(function() {
    'use strict';

    // 配置
    const CONFIG = {
        wsUrl: 'ws://localhost:3462',
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
            console.log('🚀 开始发送消息到 Cursor:', message.substring(0, 50) + '...');

            // 使用 Cursor 特定的选择器
            const inputDiv = document.querySelector('div.aislash-editor-input[contenteditable="true"]');
            if (!inputDiv) {
                console.error('❌ 未找到 Cursor 输入框 (div.aislash-editor-input[contenteditable="true"])');
                this.showDebugInfo();
                return;
            }

            console.log('✅ 找到 Cursor 输入框');

            try {
                // 确保输入框获得焦点
                inputDiv.focus();

                // 创建 clipboardData
                const clipboardData = new DataTransfer();
                clipboardData.setData('text/plain', message);

                // 创建并派发粘贴事件
                const pasteEvent = new ClipboardEvent('paste', {
                    bubbles: true,
                    cancelable: true,
                    clipboardData: clipboardData
                });

                console.log('📋 触发粘贴事件');
                inputDiv.dispatchEvent(pasteEvent);

                // 粘贴后尝试点击发送按钮
                setTimeout(() => {
                    const sendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;
                    if (sendBtn) {
                        console.log('✅ 找到发送按钮，点击发送');
                        sendBtn.click();
                        console.log('✅ 消息已发送到 Cursor');
                    } else {
                        console.warn('⚠️ 未找到发送按钮，尝试键盘发送');
                        inputDiv.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true,
                            cancelable: true
                        }));
                    }
                }, 100);

            } catch (error) {
                console.error('❌ 发送消息到 Cursor 失败：', error);
                this.showDebugInfo();
            }
        }

        showDebugInfo() {
            console.log('🔍 调试信息：');
            console.log('Cursor 特定输入框：', document.querySelector('div.aislash-editor-input[contenteditable="true"]'));
            console.log('Cursor 发送按钮：', document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement);
            console.log('所有 aislash-editor-input 元素：', document.querySelectorAll('.aislash-editor-input'));
            console.log('所有 contenteditable 元素：', document.querySelectorAll('[contenteditable="true"]'));
            console.log('所有 anysphere-icon-button 元素：', document.querySelectorAll('.anysphere-icon-button'));
            console.log('所有 codicon-arrow-up-two 元素：', document.querySelectorAll('.codicon-arrow-up-two'));
        }

        findCursorInput() {
            // 首先尝试 Cursor 特定的选择器
            const cursorSelectors = [
                'div.aislash-editor-input[contenteditable="true"]',
                'div.aislash-editor-input',
                '.aislash-editor-input[contenteditable="true"]',
                '.aislash-editor-input'
            ];

            for (const selector of cursorSelectors) {
                const element = document.querySelector(selector);
                if (element && element.offsetParent !== null) {
                    console.log('✅ 找到 Cursor 输入框：', selector, element);
                    return element;
                }
            }

            // 后备选择器 - 通用的 contenteditable 元素
            const fallbackSelectors = [
                'div[contenteditable="true"]',
                '[role="textbox"]',
                'textarea[placeholder*="问"]',
                'textarea[placeholder*="Ask"]',
                'textarea[placeholder*="输入"]',
                'textarea[placeholder*="Send"]',
                'textarea[placeholder*="Enter"]',
                'textarea[placeholder*="message"]',
                'textarea[placeholder*="chat"]'
            ];

            for (const selector of fallbackSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (element.offsetParent !== null &&
                        element.offsetHeight > 20 &&
                        !element.disabled &&
                        !element.readOnly) {
                        console.log('找到后备输入框：', selector, element);
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
            // 首先尝试 Cursor 特定的发送按钮
            const cursorSendBtn = document.querySelector('.anysphere-icon-button .codicon-arrow-up-two')?.parentElement;
            if (cursorSendBtn && cursorSendBtn.offsetParent !== null && !cursorSendBtn.disabled) {
                console.log('✅ 找到 Cursor 特定发送按钮');
                cursorSendBtn.click();
                return true;
            }

            // 更多 Cursor 按钮选择器
            const cursorButtonSelectors = [
                '.anysphere-icon-button .codicon-arrow-up-two',
                '.codicon-arrow-up-two',
                'button .codicon-arrow-up-two',
                '[class*="anysphere-icon-button"]',
                'button[class*="send"]'
            ];

            for (const selector of cursorButtonSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    const button = element.closest('button') || element.parentElement;
                    if (button && button.offsetParent !== null && !button.disabled) {
                        console.log('✅ 找到 Cursor 按钮：', selector);
                        button.click();
                        return true;
                    }
                }
            }

            // 通用发送按钮选择器
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

            // 🔄 新的智能合并策略
            this.aiMessageBuffer = []; // AI消息缓冲区
            this.userMessageBuffer = []; // 用户消息缓冲区
            this.bufferTimer = null;
            this.bufferTimeout = 8000; // 8秒缓冲窗口（平衡合并效果与响应速度）
            this.sentMessages = new Set(); // 防重复发送的哈希集合
            this.lastAIFlushTime = 0;
            this.lastAIMessageTime = 0; // 最后AI消息时间

            // 会话管理 - 用于动态刷新
            this.currentAISession = null;
            this.sessionTimeout = null;

            // 定期清理缓存（防内存泄漏）
            setInterval(() => {
                if (this.sentMessages.size > 50) {
                    console.log('🧹 清理消息缓存: 保留最近50条');
                    const messages = Array.from(this.sentMessages);
                    this.sentMessages.clear();
                    messages.slice(-50).forEach(hash => this.sentMessages.add(hash));
                }
            }, 60000);

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

            // 定期检查聊天界面（提高频率以支持动态刷新）
            setInterval(() => {
                this.scanChatInterface();
            }, 3000); // 3秒检查一次，支持动态刷新

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
            const text = element.textContent || element.innerText || '';
            const trimmedText = text.trim();

            // 🔍 更严格的长度要求 - 提高到30字符（过滤小片段但保留有效消息）
            if (!trimmedText || trimmedText.length < 30) {
                console.log(`❌ 消息太短 (${trimmedText.length}字符): "${trimmedText.substring(0, 30)}..."`);
                return false;
            }

            // 🚫 Cursor UI 特定元素过滤
            const uiElements = [
                'Chat', 'Loading Chat', 'ChatLoading Chat',
                'Planning next moves', 'Planning next moves用户说',
                'Press desired key combination and then press ENTER.',
                'Drag a view here to display.',
                'Create a new chat', 'Plan, search, build anything',
                'Plan, search, build anythingRecommended', 'Recommended',
                'Ask Cursor questions about your codebase',
                'Ask, learn, brainstorm', 'Add Context',
                'Generating.', 'Generating.Stop', 'Stop',
                'Load older messages', 'New Chat',
                'Settings', 'Help', 'Feedback',
                'textApply', 'javascriptApply', 'Apply',
                'hidden lines', 'Output'
            ];

            // 精确匹配UI元素
            for (const uiElement of uiElements) {
                if (trimmedText === uiElement ||
                    trimmedText.startsWith(uiElement + ' ') ||
                    trimmedText.endsWith(' ' + uiElement) ||
                    trimmedText.includes(uiElement + '用户说') ||
                    trimmedText.includes(uiElement + 'Output')) {
                    return false;
                }
            }

            // 🚫 过滤代码片段和技术内容
            const codePatterns = [
                /^\d+\s+hidden\s+lines?$/i,
                /^function\s*\w*\s*\(/,
                /^class\s+\w+/,
                /^const\s+\w+\s*=/,
                /^let\s+\w+\s*=/,
                /^var\s+\w+\s*=/,
                /^import\s+.+from/,
                /^export\s+(default\s+)?/,
                /^\s*\/\/.*$/,
                /^\s*\/\*.*\*\/\s*$/,
                /^if\s*\(/,
                /^for\s*\(/,
                /^while\s*\(/,
                /^return\s+/,
                /^console\./,
                /document\./,
                /window\./,
                /getElementsBy/,
                /querySelector/,
                /addEventListener/,
                /WebSocket/,
                /^\s*[{}\[\]()]+\s*$/,
                /^\s*[;,.:]+\s*$/,
                /^[\w-]+\.(js|ts|css|html|json)$/,
                /node_modules/,
                /package\.json/,
                /localhost:\d+/,
                /127\.0\.0\.1/,
                /http:\/\/|https:\/\/|ws:\/\//
            ];

            for (const pattern of codePatterns) {
                if (pattern.test(trimmedText)) {
                    return false;
                }
            }

            // 🔤 内容质量检测 - 要求60%以上中文/英文内容
            const validChars = trimmedText.match(/[\u4e00-\u9fa5a-zA-Z\s]/g) || [];
            const validRatio = validChars.length / trimmedText.length;

            if (validRatio < 0.6) {
                return false;
            }

            // ✅ 通过所有过滤条件
            return true;
        }

        parseMessage(element) {
            // 🎯 智能提取消息内容 - 优先获取富文本格式
            const messageContent = this.extractRichContent(element);
            const cleanText = messageContent.text.trim();

            if (!cleanText) return null;

            // 使用内容哈希作为 ID
            const messageId = this.hashText(cleanText);
            const messageType = this.detectMessageType(element);

            return {
                id: messageId,
                content: cleanText,
                html: messageContent.html,
                markdown: messageContent.markdown,
                type: messageType,
                timestamp: new Date().toISOString(),
                element: element.outerHTML,
                hasRichContent: messageContent.hasRichContent
            };
        }

        // 🎨 智能提取富文本内容（HTML整体输出优化版）
        extractRichContent(element) {
            // 🎯 HTML优先策略：直接获取完整的HTML结构
            try {
                // 1. 首先尝试获取完整的HTML结构
                const fullHtml = element.outerHTML || element.innerHTML || '';
                const textContent = element.textContent || element.innerText || '';

                // 2. 检查是否包含真正的富文本标签
                if (this.hasRichFormatting(fullHtml) && textContent.trim().length > 50) {
                    console.log('🎨 检测到富文本HTML结构:', {
                        htmlLength: fullHtml.length,
                        textLength: textContent.length,
                        htmlPreview: fullHtml.substring(0, 200) + '...'
                    });

                    return {
                        text: textContent.trim(),
                        html: this.cleanHtml(fullHtml), // 清理但保持结构
                        markdown: this.htmlToMarkdown(fullHtml),
                        hasRichContent: true
                    };
                }

                // 3. 尝试从子元素中提取富文本内容
                const richChildElements = element.querySelectorAll('pre, code, table, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, strong, em, b, i');
                if (richChildElements.length > 0 && textContent.trim().length > 50) {
                    // 构建包含富文本子元素的HTML
                    const richHtml = Array.from(richChildElements).map(el => el.outerHTML).join('\n');

                    console.log('🎨 从子元素提取富文本:', {
                        richElements: richChildElements.length,
                        htmlLength: richHtml.length,
                        textLength: textContent.length
                    });

                    return {
                        text: textContent.trim(),
                        html: `<div class="rich-content">${richHtml}</div>`,
                        markdown: this.htmlToMarkdown(richHtml),
                        hasRichContent: true
                    };
                }

                // 4. 检查是否是纯文本但格式良好的内容
                if (textContent.trim().length > 100 && (
                    textContent.includes('\n\n') || // 有段落结构
                    /```/.test(textContent) ||      // 包含代码块
                    /\|.*\|/.test(textContent) ||   // 包含表格
                    /^\d+\.|\*|\-/.test(textContent) // 包含列表
                )) {
                    console.log('🎨 检测到结构化文本内容');

                    return {
                        text: textContent.trim(),
                        html: `<div class="structured-text">${this.textToHtml(textContent.trim())}</div>`,
                        markdown: textContent.trim(),
                        hasRichContent: true
                    };
                }

                // 5. 默认纯文本处理
                return {
                    text: textContent.trim(),
                    html: '',
                    markdown: '',
                    hasRichContent: false
                };

            } catch (error) {
                console.warn('提取富文本内容失败:', error);
                return {
                    text: element.textContent || element.innerText || '',
                    html: '',
                    markdown: '',
                    hasRichContent: false
                };
            }
        }

        // 🧹 清理HTML但保持结构
        cleanHtml(html) {
            if (!html) return '';

            try {
                // 创建临时容器
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = html;

                // 移除危险元素
                const dangerousTags = ['script', 'iframe', 'object', 'embed', 'form', 'input'];
                dangerousTags.forEach(tag => {
                    const elements = tempDiv.querySelectorAll(tag);
                    elements.forEach(el => el.remove());
                });

                // 移除事件属性但保留样式和结构
                const allElements = tempDiv.querySelectorAll('*');
                allElements.forEach(el => {
                    Array.from(el.attributes).forEach(attr => {
                        if (attr.name.startsWith('on')) {
                            el.removeAttribute(attr.name);
                        }
                    });
                });

                // 返回清理后的HTML
                return tempDiv.innerHTML;
            } catch (error) {
                console.warn('HTML清理失败:', error);
                return html;
            }
        }

        // 📝 文本转HTML（增强版）
        textToHtml(text) {
            if (!text) return '';

            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;')
                .replace(/\n\n/g, '</p><p>')
                .replace(/\n/g, '<br>')
                .replace(/^/, '<p>')
                .replace(/$/, '</p>');
        }

        hashText(text) {
            let hash = 0;
            if (text.length === 0) return hash;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            return hash.toString();
        }

        detectMessageType(element) {
            const className = element.className || '';
            const text = element.textContent || '';
            const outerHTML = element.outerHTML || '';

            // 检查用户消息特征
            if (className.includes('user') ||
                className.includes('human') ||
                outerHTML.includes('user-message') ||
                element.style.textAlign === 'right') {
                return 'user';
            }

            // 检查AI回复特征
            if (className.includes('ai') ||
                className.includes('assistant') ||
                className.includes('bot') ||
                outerHTML.includes('ai-message') ||
                outerHTML.includes('assistant-message')) {
                return 'ai';
            }

            // 基于内容推断
            if (text.includes('我是') || text.includes('我可以') ||
                text.includes('根据') || text.includes('据用户规则') ||
                text.length > 100) {
                return 'ai';
            }

            return 'ai'; // 默认为AI消息
        }

        checkForNewMessages(node) {
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
            // 双重去重检查
            const messageHash = this.hashText(messageData.content);
            if (this.sentMessages.has(messageHash)) {
                console.log('🚫 跳过重复消息:', messageData.content.substring(0, 30) + '...');
                return;
            }

            const currentTime = Date.now();

            if (messageData.type === 'user') {
                // 💬 用户消息：立即发送，不合并
                this.userMessageBuffer.push(messageData);
                this.flushUserMessages();
            } else if (messageData.type === 'ai') {
                // 🤖 AI消息：智能缓冲合并

                // 预处理去重：避免相同内容重复加入缓冲区
                const isDuplicate = this.aiMessageBuffer.some(msg =>
                    this.hashText(msg.content) === messageHash
                );

                if (isDuplicate) {
                    console.log('🔄 缓冲区内检测到重复，跳过:', messageData.content.substring(0, 30) + '...');
                    return;
                }

                this.aiMessageBuffer.push(messageData);
                console.log('📥 AI消息已加入缓冲区:', messageData.content.substring(0, 50) + '...');

                // 只在没有定时器时才创建新定时器，避免不断重置
                if (!this.bufferTimer) {
                    this.bufferTimer = setTimeout(() => {
                        this.flushAIMessages();
                    }, this.bufferTimeout);
                    console.log(`⏰ 启动AI消息合并定时器，${this.bufferTimeout/1000}秒后发送`);
                }

                // 如果缓冲区消息太多，强制刷新
                if (this.aiMessageBuffer.length >= 10) {
                    console.log('📦 缓冲区已满(10条)，强制刷新');
                    clearTimeout(this.bufferTimer);
                    this.bufferTimer = null;
                    this.flushAIMessages();
                }
            }
        }

        flushUserMessages() {
            if (this.userMessageBuffer.length === 0) return;

            // 用户消息逐条发送
            for (const message of this.userMessageBuffer) {
                const messageHash = this.hashText(message.content);

                if (!this.sentMessages.has(messageHash)) {
                    this.sentMessages.add(messageHash);

                    if (window.wsManager) {
                        window.wsManager.send({
                            type: 'cursor_message',
                            data: message
                        });
                        console.log('📤 发送用户消息到 Web 界面:', message.content.substring(0, 80) + '...');
                    }
                }
            }

            this.userMessageBuffer = [];
        }

        flushAIMessages() {
            if (this.aiMessageBuffer.length === 0) return;

            // 📊 按时间排序
            this.aiMessageBuffer.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // 🎨 HTML整体输出策略：分离HTML内容和纯文本内容
            const htmlMessages = [];
            const textMessages = [];
            let filteredCount = 0;

            for (const message of this.aiMessageBuffer) {
                const content = message.content.trim();

                // 🔇 过滤噪音消息
                if (this.isNoisyMessage(content)) {
                    filteredCount++;
                    continue;
                }

                // 🎯 检测是否包含HTML内容
                const hasHtmlStructure = message.html && this.hasRichFormatting(message.html);
                const hasMarkdownStructure = message.markdown && message.markdown !== content;

                if (hasHtmlStructure) {
                    // 📝 保留HTML格式的消息
                    htmlMessages.push({
                        content: content,
                        html: message.html,
                        markdown: message.markdown,
                        timestamp: message.timestamp,
                        hasRichContent: true
                    });
                } else if (hasMarkdownStructure) {
                    // 📝 保留Markdown格式的消息
                    htmlMessages.push({
                        content: content,
                        html: '',
                        markdown: message.markdown,
                        timestamp: message.timestamp,
                        hasRichContent: true
                    });
                } else {
                    // 📄 纯文本消息
                    textMessages.push({
                        content: content,
                        timestamp: message.timestamp
                    });
                }
            }

            // 📈 统计信息
            const originalCount = this.aiMessageBuffer.length;
            console.log(`🧹 AI消息分类统计: ${originalCount}条原始 -> ${filteredCount}条噪音 -> ${htmlMessages.length}条富文本 + ${textMessages.length}条纯文本`);

            // 🎨 优先处理HTML富文本内容（这是核心！）
            if (htmlMessages.length > 0) {
                this.sendHtmlMessage(htmlMessages, originalCount, filteredCount);
            } else if (textMessages.length > 0) {
                this.sendTextMessage(textMessages, originalCount, filteredCount);
            } else {
                console.log('📭 所有AI消息都被过滤，无内容发送');
            }

            // 清空缓冲区
            this.aiMessageBuffer = [];
            this.bufferTimer = null;
        }

        // 🎨 发送HTML格式消息（核心方法）
        sendHtmlMessage(htmlMessages, originalCount, filteredCount) {
            // 🔗 智能HTML合并：保持HTML结构
            let mergedHtml = '';
            let mergedMarkdown = '';
            let mergedContent = '';
            let latestTimestamp = htmlMessages[0].timestamp;

            htmlMessages.forEach((msg, index) => {
                // 更新时间戳
                latestTimestamp = msg.timestamp;

                // 合并内容
                if (msg.html && this.hasRichFormatting(msg.html)) {
                    // 保持HTML结构，用div包装分隔
                    mergedHtml += (index > 0 ? '\n\n' : '') + `<div class="ai-message-section">${msg.html}</div>`;
                    mergedContent += (index > 0 ? '\n\n' : '') + msg.content;
                } else if (msg.markdown) {
                    // 保持Markdown结构
                    mergedMarkdown += (index > 0 ? '\n\n' : '') + msg.markdown;
                    mergedContent += (index > 0 ? '\n\n' : '') + msg.content;
                } else {
                    // 纯文本作为段落
                    mergedHtml += (index > 0 ? '\n\n' : '') + `<p>${this.escapeHtml(msg.content)}</p>`;
                    mergedContent += (index > 0 ? '\n\n' : '') + msg.content;
                }
            });

            // 🎯 如果有HTML内容，包装成完整的HTML文档结构
            if (mergedHtml) {
                mergedHtml = `<div class="ai-response-container">${mergedHtml}</div>`;
            }

            const finalHash = this.hashText(mergedContent);

            // 最终去重检查
            if (!this.sentMessages.has(finalHash)) {
                this.sentMessages.add(finalHash);

                const mergedMessage = {
                    id: finalHash,
                    content: mergedContent,
                    html: mergedHtml,
                    markdown: mergedMarkdown,
                    type: 'ai',
                    timestamp: latestTimestamp,
                    hasRichContent: true, // 🎯 标识为富文本！
                    element: `<ai-rich-response html-length="${mergedHtml.length}" markdown-length="${mergedMarkdown.length}">${mergedContent}</ai-rich-response>`
                };

                if (window.wsManager) {
                    window.wsManager.send({
                        type: 'cursor_message',
                        data: mergedMessage
                    });

                    console.log('🎨 发送HTML富文本消息到 Web 界面:', {
                        类型: '富文本内容',
                        html长度: mergedHtml.length,
                        markdown长度: mergedMarkdown.length,
                        内容长度: mergedContent.length,
                        原始片段数: originalCount,
                        过滤噪音: filteredCount,
                        富文本片段: htmlMessages.length,
                        hasRichContent: true,
                        htmlPreview: mergedHtml.substring(0, 150) + '...',
                        合并效果: `${originalCount}条 -> 1条富文本 (去除${filteredCount}条噪音)`
                    });
                }

                this.lastAIFlushTime = Date.now();
            }
        }

        // 📄 发送纯文本消息
        sendTextMessage(textMessages, originalCount, filteredCount) {
            // 🔗 普通文本合并
            const mergedContent = textMessages.map(msg => msg.content).join('\n\n');
            const finalHash = this.hashText(mergedContent);
            const latestTimestamp = textMessages[textMessages.length - 1].timestamp;

            if (!this.sentMessages.has(finalHash)) {
                this.sentMessages.add(finalHash);

                const mergedMessage = {
                    id: finalHash,
                    content: mergedContent,
                    html: '',
                    markdown: '',
                    type: 'ai',
                    timestamp: latestTimestamp,
                    hasRichContent: false,
                    element: `<ai-text-response length="${mergedContent.length}">${mergedContent}</ai-text-response>`
                };

                if (window.wsManager) {
                    window.wsManager.send({
                        type: 'cursor_message',
                        data: mergedMessage
                    });

                    console.log('📄 发送纯文本消息到 Web 界面:', {
                        类型: '纯文本内容',
                        长度: mergedContent.length,
                        原始片段数: originalCount,
                        过滤噪音: filteredCount,
                        文本片段: textMessages.length,
                        hasRichContent: false,
                        preview: mergedContent.substring(0, 100) + '...',
                        合并效果: `${originalCount}条 -> 1条文本 (去除${filteredCount}条噪音)`
                    });
                }

                this.lastAIFlushTime = Date.now();
            }
        }

        // 🔒 HTML转义辅助方法
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // 🧠 判断是否为噪音消息（只用明确模式过滤，不再用字数过滤）
        isNoisyMessage(text) {
            const trimmedText = text.trim();

            // 只用明确的噪音模式过滤
            const systemPatterns = [
                /Apply/i,
                /javascriptApply/i,
                /textApply/i,
                /codeApply/i,
                /markdownApply/i,
                /^const\s+\w+\s*=/,
                /^function\s*\(/,
                /^if\s*\(/,
                /^return\s+/,
                /^let\s+\w+\s*=/,
                /^var\s+\w+\s*=/,
                /=>\s*{/,
                /console\./,
                /document\./,
                /window\./,
                /querySelector/,
                /addEventListener/,
                /innerHTML|outerHTML/,
                /hasRichContent|hasRichFormatting/,
                /extractRichContent/,
                /formatMessageContent/,
                /sanitizeAndRenderHTML/,
                /Generating.*Stop.*Ctrl/i,
                /StopCtrl\+Shift/i,
                /Planning next moves/i,
                /Command line:/i,
                /Process ID.*PID/i,
                /来自 Cursor$/,
                /^Image/,
                /Terminal.*node/i,
                /Console.*标/,
                /powershell.*exe/i,
                /使用原始HTML格式.*避免转换损失/,
                /直接渲染HTML.*保持原始格式/,
                /在浏览器控制台查看日志/,
                /按.*F12.*开发者工具/,
                /当AI响应时.*应该看到/,
                /Shift\+Delete/,
                /JavaScript.*错误/,
                /包含HTML的消息/,
                /HTML整体输出/,
                /优化策略|处理思路|核心思想/,
                /^border-|^background:|^margin|^padding|^color:/,
                /^\.[\w-]+\s*\{/,
                /rgba?\(|#[0-9a-fA-F]{3,6}/,
                /mergedHtml|mergedMarkdown|mergedContent/,
                /richTags|contentHashes|messageData/,
                /flushAIMessages|sendHtmlMessage/,
                /cleanHtml|textToHtml|escapeHtml/,
            ];
            for (const pattern of systemPatterns) {
                if (pattern.test(trimmedText)) return true;
            }

            // 代码块检测
            const codePatterns = [
                /```[\s\S]*```/,
                /`[^`]{10,}`/,
                /{[\s\S]*}/,
                /\([^)]{50,}\)/,
                /\[[^\]]{30,}\]/,
            ];
            let codeMatchCount = 0;
            for (const pattern of codePatterns) {
                if (pattern.test(trimmedText)) codeMatchCount++;
            }
            if (codeMatchCount >= 2) return true;

            // 技术关键词过滤（可选）
            const techKeywords = ['JavaScript', 'HTML', 'CSS', 'function', 'method', 'variable', 'array', 'object', 'DOM', 'API'];
            let techKeywordCount = 0;
            for (const keyword of techKeywords) {
                if (trimmedText.toLowerCase().includes(keyword.toLowerCase())) techKeywordCount++;
            }
            if (techKeywordCount > 5 && trimmedText.length < 500) return true;

            // 其余一律保留
            return false;
        }

        // 兼容旧版本
        sendAIResponse(text) {
            this.sendMessage({
                id: Date.now() + Math.random(),
                content: text,
                type: 'ai',
                timestamp: new Date().toISOString()
            });
        }

        // 🎨 检查是否有富格式
        hasRichFormatting(html) {
            const richTags = ['pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                             'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
                             'strong', 'b', 'em', 'i', 'a', 'img'];

            return richTags.some(tag => html.includes(`<${tag}`));
        }

        // 🔄 HTML转Markdown（简化版，专注于保持结构）
        htmlToMarkdown(html) {
            if (!html || typeof html !== 'string') return '';

            try {
                let markdown = html;

                // 基本标签转换
                markdown = markdown.replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (match, level, content) => {
                    const hashes = '#'.repeat(parseInt(level));
                    return `\n${hashes} ${content}\n`;
                });

                markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
                markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
                markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
                markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

                // 代码块
                markdown = markdown.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
                markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

                // 清理HTML标签
                markdown = markdown.replace(/<[^>]+>/g, '');
                markdown = markdown.replace(/\n{3,}/g, '\n\n');
                markdown = markdown.trim();

                return markdown;
            } catch (error) {
                console.warn('HTML转Markdown失败:', error);
                return html.replace(/<[^>]+>/g, '');
            }
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
            },
            // 🔍 调试方法：分析当前页面的消息结构
            analyzeMessageStructure: () => {
                const container = window.aiListener.findChatContainer();
                if (!container) {
                    console.log('❌ 未找到聊天容器');
                    return;
                }

                console.log('🎯 聊天容器:', container);

                const messages = window.aiListener.findMessages(container);
                console.log(`📝 找到 ${messages.length} 条消息`);

                messages.slice(-3).forEach((msg, index) => {
                    const messageData = window.aiListener.parseMessage(msg);
                    console.log(`\n📄 消息 ${index + 1}:`);
                    console.log('- 元素:', msg);
                    console.log('- HTML:', msg.outerHTML.substring(0, 200) + '...');
                    console.log('- 解析结果:', messageData);
                    console.log('- 富文本内容:', messageData?.html?.substring(0, 200) + '...');
                    console.log('- Markdown:', messageData?.markdown?.substring(0, 200) + '...');
                });
            },
            // 🎨 强制重新扫描消息
            forceScan: () => {
                console.log('🔄 强制重新扫描消息...');
                window.aiListener.scanChatInterface();
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
