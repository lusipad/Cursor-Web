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

        // 🎨 智能提取富文本内容
        extractRichContent(element) {
            // 尝试多种方法提取富文本内容
            const methods = [
                () => this.extractFromCursorMessage(element),
                () => this.extractFromMarkdownElements(element),
                () => this.extractFromCodeElements(element),
                () => this.extractPlainText(element)
            ];

            for (const method of methods) {
                try {
                    const result = method();
                    if (result && result.text.trim()) {
                        return result;
                    }
                } catch (error) {
                    console.warn('提取方法失败:', error);
                }
            }

            return {
                text: element.textContent || element.innerText || '',
                html: element.outerHTML || '',
                markdown: '',
                hasRichContent: false
            };
        }

        // 🎯 从Cursor特定结构提取消息
        extractFromCursorMessage(element) {
            // 查找Cursor消息的主要内容容器
            const contentSelectors = [
                '.message-content',
                '.chat-message-content',
                '[data-message-content]',
                '.ai-message-content',
                '.user-message-content',
                '.prose', // Cursor可能使用的富文本类
                '[contenteditable]'
            ];

            for (const selector of contentSelectors) {
                const contentEl = element.querySelector(selector) ||
                                 (element.matches(selector) ? element : null);

                if (contentEl) {
                    const html = contentEl.outerHTML || '';
                    const text = contentEl.textContent || contentEl.innerText;
                    const markdown = this.htmlToMarkdown(html);

                    return {
                        text: text.trim(),
                        html: html,
                        markdown: markdown,
                        hasRichContent: this.hasRichFormatting(html)
                    };
                }
            }

            return null;
        }

        // 📝 从Markdown元素提取
        extractFromMarkdownElements(element) {
            const markdownElements = element.querySelectorAll('pre, code, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, table');

            if (markdownElements.length > 0) {
                const html = element.outerHTML || '';
                const text = element.textContent || element.innerText;
                const markdown = this.htmlToMarkdown(html);

                return {
                    text: text.trim(),
                    html: html,
                    markdown: markdown,
                    hasRichContent: true
                };
            }

            return null;
        }

        // 💻 从代码元素提取
        extractFromCodeElements(element) {
            const codeElements = element.querySelectorAll('pre, code, .hljs, .language-');

            if (codeElements.length > 0) {
                const html = element.outerHTML || '';
                const text = element.textContent || element.innerText;

                // 保持代码块的格式
                let markdown = '';
                codeElements.forEach(codeEl => {
                    const lang = this.detectCodeLanguage(codeEl);
                    const code = codeEl.textContent || codeEl.innerText;

                    if (codeEl.tagName === 'PRE') {
                        markdown += `\n\`\`\`${lang}\n${code}\n\`\`\`\n`;
                    } else {
                        markdown += `\`${code}\``;
                    }
                });

                return {
                    text: text.trim(),
                    html: html,
                    markdown: markdown || this.htmlToMarkdown(html),
                    hasRichContent: true
                };
            }

            return null;
        }

        // 📄 提取纯文本
        extractPlainText(element) {
            const text = element.textContent || element.innerText || '';

            return {
                text: text.trim(),
                html: this.textToHtml(text),
                markdown: text.trim(),
                hasRichContent: false
            };
        }

        // 🔍 检测代码语言
        detectCodeLanguage(element) {
            const classList = element.className || '';
            const langMatch = classList.match(/language-(\w+)/);
            if (langMatch) return langMatch[1];

            const parent = element.parentElement;
            if (parent) {
                const parentClass = parent.className || '';
                const parentLangMatch = parentClass.match(/language-(\w+)/);
                if (parentLangMatch) return parentLangMatch[1];
            }

            return '';
        }

        // 🎨 检查是否有富格式
        hasRichFormatting(html) {
            const richTags = ['pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                             'blockquote', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th',
                             'strong', 'b', 'em', 'i', 'a', 'img'];

            return richTags.some(tag => html.includes(`<${tag}`));
        }

                // 🔄 HTML转Markdown（改进版）
        htmlToMarkdown(html) {
            if (!html || typeof html !== 'string') return '';

            try {
                let markdown = html;

                // 先解码HTML实体（安全方式）
                markdown = this.safeGetTextContent(html);

                // 如果没有HTML标签，直接返回清理后的文本
                if (!html.includes('<')) {
                    return markdown.trim();
                }

                // 重新使用原始HTML进行转换
                markdown = html;

                // 标题转换（更安全的方式）
                markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
                markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
                markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
                markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
                markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
                markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');

                // 粗体和斜体
                markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
                markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
                markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
                markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

                // 代码块（先处理pre code组合）
                markdown = markdown.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gi, (match, code) => {
                    return '\n```\n' + code.trim() + '\n```\n';
                });

                // 行内代码
                markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

                // 引用
                markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1');

                // 列表处理
                markdown = markdown.replace(/<ul[^>]*>(.*?)<\/ul>/gi, (match, content) => {
                    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
                });

                markdown = markdown.replace(/<ol[^>]*>(.*?)<\/ol>/gi, (match, content) => {
                    let counter = 1;
                    return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${counter++}. $1\n`);
                });

                // 链接
                markdown = markdown.replace(/<a[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, '[$2]($1)');

                // 换行和段落
                markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
                markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

                // 清理所有剩余的HTML标签
                markdown = markdown.replace(/<[^>]+>/g, '');

                // 清理多余的空白
                markdown = markdown.replace(/\n{3,}/g, '\n\n');
                markdown = markdown.replace(/^\s+|\s+$/g, '');

                return markdown;

            } catch (error) {
                console.error('HTML转Markdown错误:', error);
                // 如果转换失败，返回纯文本（安全方式）
                return this.safeGetTextContent(html);
            }
        }

        // 📝 文本转HTML
        textToHtml(text) {
            return text.replace(/\n/g, '<br>');
        }

        // 🔒 安全的HTML解析（避免TrustedHTML错误）
        safeGetTextContent(html) {
            if (!html || typeof html !== 'string') return '';

            // 直接使用正则表达式清理，不使用innerHTML
            let text = html
                .replace(/<script[^>]*>.*?<\/script>/gi, '') // 移除脚本
                .replace(/<style[^>]*>.*?<\/style>/gi, '')   // 移除样式
                .replace(/<[^>]+>/g, '')                     // 移除所有HTML标签
                .replace(/&quot;/g, '"')                     // 解码常见HTML实体
                .replace(/&apos;/g, "'")
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&nbsp;/g, ' ')
                .replace(/&[a-zA-Z0-9#]+;/g, ' ')           // 清理其他HTML实体
                .replace(/\s+/g, ' ')                       // 合并多个空格
                .trim();

            return text;
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

            // 🔗 智能合并算法 + 噪音过滤
            const uniqueContents = [];
            const contentHashes = new Set();
            let latestTimestamp = this.aiMessageBuffer[0].timestamp;
            let filteredCount = 0;

            for (const message of this.aiMessageBuffer) {
                const content = message.content.trim();

                // 🔇 过滤噪音消息
                if (this.isNoisyMessage(content)) {
                    filteredCount++;
                    continue;
                }

                const contentHash = this.hashText(content);

                if (content && !contentHashes.has(contentHash)) {
                    contentHashes.add(contentHash);
                    uniqueContents.push(content);
                    latestTimestamp = message.timestamp;
                }
            }

            // 📈 统计信息
            const originalCount = this.aiMessageBuffer.length;
            const validCount = uniqueContents.length;

            console.log(`🧹 AI消息过滤统计: ${originalCount}条原始 -> ${filteredCount}条噪音 -> ${validCount}条有效`);

            if (uniqueContents.length > 0) {
                // 🎨 智能合并：用段落分隔而不是简单空格连接
                const mergedContent = uniqueContents.join('\n\n');
                const finalHash = this.hashText(mergedContent);

                // 最终去重检查
                if (!this.sentMessages.has(finalHash)) {
                    this.sentMessages.add(finalHash);

                    const mergedMessage = {
                        id: finalHash,
                        content: mergedContent,
                        type: 'ai',
                        timestamp: latestTimestamp,
                        hasRichContent: false, // 明确标记为非富文本
                        element: `<merged-ai-response length="${mergedContent.length}">${mergedContent}</merged-ai-response>`
                    };

            if (window.wsManager) {
                window.wsManager.send({
                            type: 'cursor_message',
                            data: mergedMessage
                        });

                        console.log('📤 发送合并AI消息到 Web 界面:', {
                            length: mergedContent.length,
                            preview: mergedContent.substring(0, 100) + '...',
                            原始片段数: originalCount,
                            过滤噪音: filteredCount,
                            有效内容: validCount,
                            合并效果: `${originalCount}条 -> 1条 (去除${filteredCount}条噪音)`
                        });
                    }

                    this.lastAIFlushTime = Date.now();
                }
            } else {
                console.log('📭 所有AI消息都被过滤，无内容发送');
            }

            // 清空缓冲区
            this.aiMessageBuffer = [];
            this.bufferTimer = null;
        }

        // 🧠 判断是否为噪音消息（超级增强版）
        isNoisyMessage(text) {
            const trimmedText = text.trim();

            // 🔥 激进长度过滤：少于100个字符直接过滤
            if (trimmedText.length < 100) {
                return true;
            }

            // 🚫 重复内容检测：检查是否有重复的文本片段
            const words = trimmedText.split(/[\s\n\r]+/);
            const wordCounts = {};
            let maxRepeatCount = 0;
            let totalRepeats = 0;

            words.forEach(word => {
                if (word.length > 2) { // 只统计长度超过2的词
                    wordCounts[word] = (wordCounts[word] || 0) + 1;
                    if (wordCounts[word] > 1) {
                        maxRepeatCount = Math.max(maxRepeatCount, wordCounts[word]);
                        totalRepeats++;
                    }
                }
            });

            // 如果有词重复超过3次，或重复词过多，认为是重复内容
            if (maxRepeatCount > 3 || totalRepeats > words.length * 0.3) {
                return true;
            }

            // 🔍 内容质量检查：字符多样性
            const uniqueChars = new Set(trimmedText.toLowerCase()).size;
            if (uniqueChars < 15) {  // 字符种类太少，可能是重复内容
                return true;
            }

            // 📝 检查是否包含实质内容：必须有完整句子或段落
            const hasSentence = /[.!?。！？]\s*[A-Z\u4e00-\u9fa5]/.test(trimmedText);  // 有句子结构
            const hasMultipleWords = trimmedText.split(/\s+/).length >= 20;  // 至少20个词
            const hasChineseContent = /[\u4e00-\u9fa5]{30,}/.test(trimmedText);  // 至少30个中文字符
            const hasEnglishContent = /[a-zA-Z\s]{60,}/.test(trimmedText);  // 至少60个英文字符
            const hasCompleteThought = /[，。！？；：,;:.!?]\s*[A-Z\u4e00-\u9fa5]/.test(trimmedText);  // 完整思想

            if (!hasSentence && !hasMultipleWords && !hasChineseContent && !hasEnglishContent && !hasCompleteThought) {
                return true;  // 缺乏实质内容
            }

            // 🎯 意义内容比例检查
            const chineseChars = (trimmedText.match(/[\u4e00-\u9fa5]/g) || []).length;
            const englishWords = (trimmedText.match(/[a-zA-Z]+/g) || []).length;
            const totalMeaningful = chineseChars + englishWords * 3;
            const meaningfulRatio = totalMeaningful / trimmedText.length;

            if (meaningfulRatio < 0.6) { // 要求至少60%的有意义内容
                return true;
            }

            // 🚫 超级增强的噪音模式匹配
            const noisyPatterns = [
                // === 基础噪音模式 ===
                /^\/\/ .{1,50}$/,              // 短注释
                /^textApply$/,                // textApply
                /^type: ["'].*["']$/,         // 单独的type字段
                /^markdown: ["'].*["']$/,     // 单独的markdown字段
                /^hasRichContent:/,           // hasRichContent字段
                /^: [A-Za-z]+ >/,            // 短标签
                /^\w+Apply$/,                 // 各种Apply
                /^CursorRemote/,             // CursorRemote开头的短消息

                // === 重复性内容检测 ===
                /.*Terminal.*Terminal.*/,     // 包含多个Terminal的重复文本
                /.*node app\.js.*node app\.js/,  // 重复的命令
                /.*app\.js.*app\.js.*app\.js/,   // 多次重复app.js
                /.*更新README.*更新README/,    // 重复的任务文本
                /(.+)\1{2,}/,                 // 任何文本重复3次以上
                /(Terminal|node|app\.js){3,}/, // 特定词汇重复3次以上

                // === 生成状态和控制信息 ===
                /^Generating.*Stop.*Ctrl\+Shift.*⌫/,  // 生成控制文本
                /Generating.*StopCtrl\+Shift/,        // 生成停止快捷键
                /Stop.*Ctrl\+Shift.*⌫/,              // 停止快捷键
                /^21:\d{2}:\d{2}$/,                  // 时间戳
                /^\d{2}:\d{2}:\d{2}$/,               // 时间格式

                // === 单独的词汇和短语 ===
                /^来自 Cursor$/,              // 来源标识
                /^更新README文档$/,           // 单独的任务文本
                /^AI助手里的文字$/,           // 界面相关文本
                /^处理AI聊天区域$/,           // 任务相关文本
                /^文字颜色和格式问题$/,        // 问题描述文本
                /^看不清字$/,                // 用户反馈
                /^继续$/,                    // 简单指令
                /^好的$/,                    // 简单回应
                /^强调了120字符最小长度和100\+种$/,  // 技术描述片段
                /^展示了73%的噪音消息减少效果$/,    // 效果描述片段
                /^过滤器效果极差$/,                // 问题反馈
                /^和AI生成的差距非常大$/,          // 比较描述
                /^重复消息\+未合并$/,             // 问题描述
                /^不是动态刷新$/,                // 问题描述
                /^格式完全对不上$/,              // 格式问题

                // === 代码片段和技术内容 ===
                /^[\w\s]{1,60}$/,            // 极短的单词组合
                /^content = content\.replace/,// 代码片段
                /^return content;/,          // 代码片段
                /^typeof marked ===/,        // 代码片段
                /^renderMarkdown\(/,         // 方法调用
                /^extractMermaidDiagrams/,   // 方法调用
                /^displayCursorMessage/,     // 方法调用
                /^\$\d+$/,                   // 单独的变量引用
                /^const\s+\w+\s*=/,         // 变量声明
                /^if\s*\(/,                 // if语句
                /^function\s*\(/,           // 函数声明
                /^return\s+/,               // return语句
                /^let\s+\w+\s*=/,          // let声明
                /^var\s+\w+\s*=/,          // var声明

                // === CSS 和样式相关 ===
                /^border-/,               // CSS属性
                /^background:/,           // CSS属性
                /^margin/,                // CSS属性
                /^padding/,               // CSS属性
                /^color:/,                // CSS属性
                /^font-/,                 // CSS属性
                /^\.[\w-]+\s*\{/,        // CSS类选择器
                /^@\w+/,                  // CSS @ 规则
                /^:\w+/,                  // CSS 伪选择器
                /^rgba?\(/,              // CSS颜色值
                /^\d+px|\d+rem|\d+em/,   // CSS尺寸值

                // === 系统和界面消息 ===
                /^Loading\.{3}$/,          // Loading...
                /^Error:/,                 // 错误消息开头
                /^Updating/,              // 更新消息
                /^To-dos?\s+\d+/,        // Todo列表消息
                /^\d+\s*of\s*\d+/,       // 计数消息
                /^Successfully/,          // 成功消息
                /^Requested\s+to/,        // 请求消息
                /^Connection\s+failed/,   // 连接失败
                /^Command\s+output/,      // 命令输出
                /^\d+\s*hidden\s*lines$/i,  // hidden lines

                // === 混乱的组合文本 ===
                /^Image\w*\s*node/,      // Image开头的混乱文本
                /^\w+\.js\w*Terminal/,   // 终端相关混乱文本
                /^Terminal\w*node/,      // Terminal node组合
                /^node\w*Terminal/,      // node Terminal组合

                // === 标点符号和特殊字符 ===
                /^[{}\[\];,]+$/,           // 纯标点符号
                /^\.\w+/,                  // 点号开头的属性
                /^#\w+/,                   // 选择器
                /^\w+\s*\{\s*$/,          // CSS/JS块开始
                /^\s*\}\s*$/,             // CSS/JS块结束
                /^[⌫⌘⇧⌃]+$/,            // 特殊按键符号

                // === 中文短语和片段 ===
                /^你看日志都/,             // 中文片段
                /^颜色调整下/,             // 中文片段
                /^我看不到内容了$/,         // 中文片段
                /^现在让我/,              // 中文开头
                /^让我/,                  // 中文开头
                /^所有innerHTML都被替换了/, // 中文技术内容
                /^好的，我来/,             // 中文回应开头
                /^完成！/,                // 中文完成提示
                /^已经/,                  // 中文状态词

                // === 表情符号和标签 ===
                /^🎯 高质量$/,              // 质量标签
                /^📝 富文本$/,             // 标签
                /^✅ [^,]{1,20}$/,        // 短的完成标签
                /^🔧 [^,]{1,20}$/,        // 短的工具标签
                /^⚡ [^,]{1,20}$/,        // 短的快速标签
                /^🚀 [^,]{1,20}$/,        // 短的启动标签

                // === DOM 和浏览器相关 ===
                /^console\./,              // console调用
                /^window\./,               // window调用
                /^document\./,             // document调用
                /^\w+Element/,             // DOM元素变量
                /^\w+\.forEach/,           // forEach调用
                /^\w+\.length/,            // length属性

                // === 注释和标题 ===
                /^\/\/ 在Cursor/,            // 调试注释
                /^\/\/ 处理/,               // 处理注释
                /^\/\/ 清空/,               // 清空注释
                /^\/\/ 追加/,               // 追加注释
                /^🤔 判断是否应该合并消息$/,    // 方法名
                /^🔄 HTML转Markdown$/,      // 标题

                // === 终端和命令相关 ===
                /^Ctrl\+Shift/,          // 快捷键
                /^\d+ files edited/,         // 文件编辑统计
                /^Command/,              // 命令相关
                /^Process/,              // 进程相关
                /^Running/,              // 运行状态
                /^Starting/,             // 启动状态
                /^Stopping/              // 停止状态
            ];

            return noisyPatterns.some(pattern => pattern.test(trimmedText));
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
