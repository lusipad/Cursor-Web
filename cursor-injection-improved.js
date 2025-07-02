// cursor-injection-improved.js
// 改进的 Cursor 注入脚本 - 更好的兼容性

(function() {
    'use strict';
    
    console.log('🚀 Cursor Remote Control - 改进版注入脚本启动');
    
    // 配置
    const WS_PORT = 3457;
    let ws = null;
    let reconnectTimer = null;
    
    // Cursor API 增强版
    const CursorAPI = {
        // 调试模式
        debug: true,
        
        log: function(...args) {
            if (this.debug) {
                console.log('[Cursor Remote]', ...args);
            }
        },
        
        // 查找元素的通用方法
        findElement: function(selectors, timeout = 5000) {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                
                const check = () => {
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            this.log('找到元素：', selector);
                            resolve(element);
                            return;
                        }
                    }
                    
                    if (Date.now() - startTime > timeout) {
                        reject(new Error('查找元素超时'));
                    } else {
                        setTimeout(check, 100);
                    }
                };
                
                check();
            });
        },
        
        // 触发 AI 对话 - 改进版
        triggerAIChat: async function(message, context) {
            this.log('开始 AI 对话：', { message, context });
            
            try {
                // 方法 1: 使用快捷键
                const tryKeyboardShortcut = () => {
                    this.log('尝试键盘快捷键...');
                    
                    // Cmd/Ctrl + K
                    const event1 = new KeyboardEvent('keydown', {
                        key: 'k',
                        code: 'KeyK',
                        keyCode: 75,
                        ctrlKey: process.platform !== 'darwin',
                        metaKey: process.platform === 'darwin',
                        bubbles: true,
                        cancelable: true
                    });
                    
                    document.dispatchEvent(event1);
                    document.activeElement?.dispatchEvent(event1);
                    
                    // 也尝试 Cmd/Ctrl + I
                    setTimeout(() => {
                        const event2 = new KeyboardEvent('keydown', {
                            key: 'i',
                            code: 'KeyI',
                            keyCode: 73,
                            ctrlKey: process.platform !== 'darwin',
                            metaKey: process.platform === 'darwin',
                            bubbles: true,
                            cancelable: true
                        });
                        document.dispatchEvent(event2);
                    }, 100);
                };
                
                // 方法 2: 查找并点击 AI 按钮
                const tryClickButton = async () => {
                    this.log('尝试查找 AI 按钮...');
                    
                    const buttonSelectors = [
                        // Cursor 特定选择器
                        '[aria-label*="AI"]',
                        '[aria-label*="Chat"]',
                        '[aria-label*="Assistant"]',
                        'button[title*="AI"]',
                        'button[title*="Chat"]',
                        // 通用选择器
                        '.ai-chat-button',
                        '.assistant-button',
                        '[data-command*="workbench.action.chat"]',
                        '.codicon-comment-discussion',
                        '.codicon-hubot',
                        // VS Code 风格选择器
                        '.action-item [class*="ai"]',
                        '.action-item [class*="chat"]',
                        '.monaco-action-bar .action-item'
                    ];
                    
                    try {
                        const button = await this.findElement(buttonSelectors, 2000);
                        button.click();
                        this.log('成功点击 AI 按钮');
                        return true;
                    } catch (e) {
                        this.log('未找到 AI 按钮');
                        return false;
                    }
                };
                
                // 尝试触发 AI 界面
                tryKeyboardShortcut();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 如果快捷键没用，尝试点击按钮
                const buttonClicked = await tryClickButton();
                
                // 等待 AI 输入框出现
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // 查找输入框
                const inputSelectors = [
                    // Cursor 特定
                    'textarea[placeholder*="Ask"]',
                    'textarea[placeholder*="Type"]',
                    'textarea[placeholder*="问"]',
                    'textarea[placeholder*="输入"]',
                    // Monaco 编辑器
                    '.monaco-inputbox textarea',
                    '.monaco-editor textarea',
                    // 通用
                    '.chat-input textarea',
                    '.ai-input textarea',
                    '[contenteditable="true"][role="textbox"]',
                    '.view-line [contenteditable="true"]'
                ];
                
                const inputElement = await this.findElement(inputSelectors, 3000);
                this.log('找到输入框：', inputElement);
                
                // 设置消息内容
                const fullMessage = context ? `${context}\n\n${message}` : message;
                
                if (inputElement.tagName === 'TEXTAREA') {
                    inputElement.value = fullMessage;
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    // contenteditable 元素
                    inputElement.textContent = fullMessage;
                    inputElement.innerHTML = fullMessage.replace(/\n/g, '<br>');
                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                this.log('已输入消息，准备发送...');
                
                // 发送消息
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // 尝试多种发送方式
                const sendMessage = async () => {
                    // 方法 1: Enter 键
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    inputElement.dispatchEvent(enterEvent);
                    
                    // 方法 2: 查找发送按钮
                    const sendButtonSelectors = [
                        'button[aria-label*="Send"]',
                        'button[aria-label*="发送"]',
                        'button[title*="Send"]',
                        '.send-button',
                        '[class*="send"][class*="button"]'
                    ];
                    
                    try {
                        const sendButton = await this.findElement(sendButtonSelectors, 1000);
                        sendButton.click();
                        this.log('点击了发送按钮');
                    } catch (e) {
                        this.log('未找到发送按钮，使用 Enter 键');
                    }
                };
                
                await sendMessage();
                
                // 等待响应
                return await this.waitForResponse();
                
            } catch (error) {
                this.log('AI 对话错误：', error);
                throw error;
            }
        },
        
        // 等待响应 - 改进版
        waitForResponse: function() {
            return new Promise((resolve, reject) => {
                const startTime = Date.now();
                const maxWait = 60000;
                let lastContent = '';
                let stableCount = 0;
                
                const responseSelectors = [
                    // Cursor 响应区域
                    '.ai-response',
                    '.chat-response',
                    '.assistant-response',
                    // Monaco 相关
                    '.monaco-editor-hover',
                    '.suggest-widget',
                    // 通用
                    '[role="log"]',
                    '.message-list-item:last-child',
                    '.chat-message:last-child'
                ];
                
                const checkResponse = async () => {
                    try {
                        const responseElement = await this.findElement(responseSelectors, 1000).catch(() => null);
                        
                        if (responseElement) {
                            const content = responseElement.textContent || '';
                            
                            // 检查内容是否稳定
                            if (content.length > 0 && content === lastContent) {
                                stableCount++;
                                if (stableCount >= 3) {
                                    this.log('AI 响应完成');
                                    resolve({
                                        content: content.trim(),
                                        html: responseElement.innerHTML,
                                        timestamp: new Date().toISOString()
                                    });
                                    return;
                                }
                            } else {
                                stableCount = 0;
                                lastContent = content;
                            }
                        }
                        
                        if (Date.now() - startTime > maxWait) {
                            reject(new Error('等待响应超时'));
                            return;
                        }
                        
                        setTimeout(checkResponse, 500);
                        
                    } catch (error) {
                        reject(error);
                    }
                };
                
                setTimeout(checkResponse, 1000);
            });
        },
        
        // 执行 VS Code 命令
        executeCommand: function(commandId) {
            this.log('执行命令：', commandId);
            
            // 尝试多种方式执行命令
            const methods = [
                // VS Code API
                () => {
                    if (window.vscode && window.vscode.postMessage) {
                        window.vscode.postMessage({
                            command: commandId
                        });
                        return true;
                    }
                    return false;
                },
                // Monaco 命令
                () => {
                    if (window.monaco && window.monaco.editor) {
                        const editor = window.monaco.editor.getEditors()[0];
                        if (editor) {
                            editor.trigger('remote', commandId, null);
                            return true;
                        }
                    }
                    return false;
                },
                // 通过菜单
                () => {
                    const commandPalette = new KeyboardEvent('keydown', {
                        key: 'p',
                        code: 'KeyP',
                        ctrlKey: true,
                        shiftKey: true,
                        bubbles: true
                    });
                    document.dispatchEvent(commandPalette);
                    
                    setTimeout(() => {
                        const input = document.querySelector('.quick-input-box input');
                        if (input) {
                            input.value = '>' + commandId;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            
                            setTimeout(() => {
                                const enter = new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    code: 'Enter',
                                    keyCode: 13,
                                    bubbles: true
                                });
                                input.dispatchEvent(enter);
                            }, 100);
                        }
                    }, 300);
                    
                    return true;
                }
            ];
            
            for (const method of methods) {
                if (method()) {
                    return Promise.resolve();
                }
            }
            
            return Promise.reject(new Error('无法执行命令'));
        }
    };
    
    // WebSocket 连接
    function connectWebSocket() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            return;
        }
        
        ws = new WebSocket(`ws://localhost:${WS_PORT}`);
        
        ws.onopen = function() {
            console.log('✅ Cursor Remote Control - WebSocket 已连接');
            clearTimeout(reconnectTimer);
            
            ws.send(JSON.stringify({
                type: 'init',
                data: {
                    version: '2.0',
                    platform: navigator.platform,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                }
            }));
        };
        
        ws.onmessage = async function(event) {
            try {
                const message = JSON.parse(event.data);
                CursorAPI.log('收到消息：', message.type);
                
                let response = {};
                
                switch (message.type) {
                    case 'ping':
                        response = { type: 'pong', timestamp: Date.now() };
                        break;
                        
                    case 'ai_chat':
                        try {
                            const result = await CursorAPI.triggerAIChat(
                                message.data.message,
                                message.data.context
                            );
                            response = {
                                type: 'ai_response',
                                success: true,
                                data: result
                            };
                        } catch (error) {
                            response = {
                                type: 'ai_response',
                                success: false,
                                error: error.message
                            };
                        }
                        break;
                        
                    case 'execute_command':
                        try {
                            await CursorAPI.executeCommand(message.data.commandId);
                            response = {
                                type: 'command_result',
                                success: true
                            };
                        } catch (error) {
                            response = {
                                type: 'command_result',
                                success: false,
                                error: error.message
                            };
                        }
                        break;
                }
                
                if (message.requestId) {
                    response.requestId = message.requestId;
                }
                
                ws.send(JSON.stringify(response));
                
            } catch (error) {
                console.error('❌ 处理消息错误：', error);
            }
        };
        
        ws.onerror = function(error) {
            console.error('❌ WebSocket 错误：', error);
        };
        
        ws.onclose = function() {
            console.log('⚠️ WebSocket 连接断开，5 秒后重连...');
            reconnectTimer = setTimeout(connectWebSocket, 5000);
        };
    }
    
    // 初始化
    function initialize() {
        console.log('🎉 Cursor Remote Control 注入成功！');
        console.log('📡 正在连接到控制服务器...');
        
        connectWebSocket();
        
        // 暴露 API 用于调试
        window.CursorRemoteAPI = CursorAPI;
        
        // 添加调试命令
        window.testAI = (message) => {
            CursorAPI.triggerAIChat(message || '你好，请回复"测试成功"').then(
                result => console.log('✅ 测试成功：', result),
                error => console.error('❌ 测试失败：', error)
            );
        };
        
        console.log('💡 提示：使用 window.testAI("你的消息") 测试 AI 对话');
    }
    
    // 启动
    initialize();
    
})();