// cursor-injection.js
// Cursor IDE 注入脚本 - 用于控制IDE内部功能

(function() {
    'use strict';
    
    // WebSocket连接配置
    const WS_PORT = 3457;
    let ws = null;
    let reconnectTimer = null;
    
    // Cursor API 接口封装
    const CursorAPI = {
        // 获取当前编辑器实例
        getActiveEditor: function() {
            if (window.monaco && window.monaco.editor) {
                const editors = window.monaco.editor.getEditors();
                return editors.find(e => e.hasTextFocus()) || editors[0];
            }
            return null;
        },
        
        // 获取当前文件内容
        getCurrentFileContent: function() {
            const editor = this.getActiveEditor();
            if (editor) {
                return {
                    content: editor.getValue(),
                    language: editor.getModel()?.getLanguageId(),
                    path: editor.getModel()?.uri?.path
                };
            }
            return null;
        },
        
        // 触发AI对话
        triggerAIChat: async function(message, context) {
            return new Promise((resolve, reject) => {
                try {
                    // 方法1: 通过快捷键触发
                    const triggerShortcut = () => {
                        const event = new KeyboardEvent('keydown', {
                            key: 'k',
                            code: 'KeyK',
                            ctrlKey: true,
                            metaKey: process.platform === 'darwin',
                            bubbles: true
                        });
                        document.dispatchEvent(event);
                    };
                    
                    // 方法2: 查找并点击AI按钮
                    const clickAIButton = () => {
                        const selectors = [
                            '[aria-label*="AI"]',
                            '[title*="AI"]',
                            'button[class*="ai-chat"]',
                            '.composer-button',
                            '[data-test*="ai"]'
                        ];
                        
                        for (const selector of selectors) {
                            const button = document.querySelector(selector);
                            if (button) {
                                button.click();
                                return true;
                            }
                        }
                        return false;
                    };
                    
                    // 尝试触发AI对话
                    if (!clickAIButton()) {
                        triggerShortcut();
                    }
                    
                    // 等待输入框出现
                    setTimeout(() => {
                        const inputSelectors = [
                            'textarea[placeholder*="Ask"]',
                            'textarea[placeholder*="Type"]',
                            '.composer-input textarea',
                            '[contenteditable="true"][role="textbox"]'
                        ];
                        
                        let inputElement = null;
                        for (const selector of inputSelectors) {
                            inputElement = document.querySelector(selector);
                            if (inputElement) break;
                        }
                        
                        if (inputElement) {
                            // 设置消息内容
                            const fullMessage = context ? `${context}\n\n${message}` : message;
                            
                            if (inputElement.tagName === 'TEXTAREA') {
                                inputElement.value = fullMessage;
                                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                            } else {
                                inputElement.textContent = fullMessage;
                                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            
                            // 发送消息
                            setTimeout(() => {
                                const enterEvent = new KeyboardEvent('keydown', {
                                    key: 'Enter',
                                    code: 'Enter',
                                    keyCode: 13,
                                    bubbles: true
                                });
                                inputElement.dispatchEvent(enterEvent);
                                
                                // 监听响应
                                this.waitForResponse(resolve, reject);
                            }, 100);
                        } else {
                            reject('找不到AI输入框');
                        }
                    }, 500);
                    
                } catch (error) {
                    reject(error.message);
                }
            });
        },
        
        // 等待AI响应
        waitForResponse: function(resolve, reject) {
            const startTime = Date.now();
            const maxWait = 60000; // 60秒超时
            let lastResponseLength = 0;
            let stableCount = 0;
            
            const checkResponse = () => {
                try {
                    // 查找响应容器
                    const responseSelectors = [
                        '.composer-response',
                        '.ai-response',
                        '[data-test*="response"]',
                        '.message-content:last-child'
                    ];
                    
                    let responseElement = null;
                    for (const selector of responseSelectors) {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            responseElement = elements[elements.length - 1];
                            break;
                        }
                    }
                    
                    if (responseElement) {
                        const currentLength = responseElement.textContent.length;
                        
                        // 检查响应是否稳定（不再变化）
                        if (currentLength === lastResponseLength && currentLength > 0) {
                            stableCount++;
                            if (stableCount >= 3) { // 连续3次检查长度不变
                                resolve({
                                    content: responseElement.textContent.trim(),
                                    html: responseElement.innerHTML,
                                    timestamp: new Date().toISOString()
                                });
                                return;
                            }
                        } else {
                            stableCount = 0;
                            lastResponseLength = currentLength;
                        }
                    }
                    
                    // 超时检查
                    if (Date.now() - startTime > maxWait) {
                        reject('等待响应超时');
                        return;
                    }
                    
                    // 继续检查
                    setTimeout(checkResponse, 500);
                    
                } catch (error) {
                    reject(error.message);
                }
            };
            
            setTimeout(checkResponse, 1000);
        },
        
        // 执行命令
        executeCommand: function(commandId) {
            if (window.vscode) {
                return window.vscode.commands.executeCommand(commandId);
            } else if (window.cursorAPI && window.cursorAPI.commands) {
                return window.cursorAPI.commands.executeCommand(commandId);
            }
            return Promise.reject('无法访问命令API');
        }
    };
    
    // WebSocket 连接管理
    function connectWebSocket() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            return;
        }
        
        ws = new WebSocket(`ws://localhost:${WS_PORT}`);
        
        ws.onopen = function() {
            console.log('WebSocket连接已建立');
            clearTimeout(reconnectTimer);
            
            // 发送初始化消息
            ws.send(JSON.stringify({
                type: 'init',
                data: {
                    platform: navigator.platform,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString()
                }
            }));
        };
        
        ws.onmessage = async function(event) {
            try {
                const message = JSON.parse(event.data);
                console.log('收到消息:', message);
                
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
                        
                    case 'get_file_content':
                        const fileContent = CursorAPI.getCurrentFileContent();
                        response = {
                            type: 'file_content',
                            data: fileContent
                        };
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
                        
                    default:
                        response = {
                            type: 'error',
                            message: '未知的消息类型'
                        };
                }
                
                // 添加请求ID以便追踪
                if (message.requestId) {
                    response.requestId = message.requestId;
                }
                
                ws.send(JSON.stringify(response));
                
            } catch (error) {
                console.error('处理消息时出错:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    error: error.message,
                    requestId: message.requestId
                }));
            }
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket错误:', error);
        };
        
        ws.onclose = function() {
            console.log('WebSocket连接已关闭');
            // 5秒后重连
            reconnectTimer = setTimeout(connectWebSocket, 5000);
        };
    }
    
    // 初始化
    function initialize() {
        console.log('Cursor Remote Control 注入脚本已加载');
        
        // 连接WebSocket
        connectWebSocket();
        
        // 监听页面可见性变化
        document.addEventListener('visibilitychange', function() {
            if (!document.hidden) {
                connectWebSocket();
            }
        });
        
        // 暴露API到全局（用于调试）
        window.CursorRemoteAPI = CursorAPI;
    }
    
    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
    
})();