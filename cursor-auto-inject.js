// cursor-auto-inject.js
// 自动化 AI 对话注入脚本

(function() {
    console.log('🚀 Cursor 自动化注入启动...');
    
    // 清理旧连接
    if (window.__cursorWS) {
        window.__cursorWS.close();
    }
    
    const WS_PORT = 3457;
    
    // AI 控制器
    const AIController = {
        // 查找并填充AI输入框
        async fillAIInput(message) {
            console.log('🔍 查找AI输入框...');
            
            // 可能的输入框选择器
            const selectors = [
                // Cursor AI 特定选择器
                '.composer-input textarea',
                '.chat-input textarea',
                'textarea[placeholder*="Ask"]',
                'textarea[placeholder*="Type"]',
                'textarea[placeholder*="Chat"]',
                // VS Code 通用选择器
                '.monaco-inputbox textarea',
                '.input-box textarea',
                '.quick-input-box input',
                // 通用 textarea
                'textarea:not([readonly])',
                'input[type="text"]:not([readonly])'
            ];
            
            // 尝试多次查找
            for (let attempt = 0; attempt < 10; attempt++) {
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    
                    for (const element of elements) {
                        // 检查元素是否可见和可用
                        if (element.offsetParent && !element.disabled) {
                            console.log('✅ 找到输入框:', selector);
                            
                            // 聚焦
                            element.focus();
                            element.click();
                            
                            // 清空并输入新内容
                            element.value = '';
                            
                            // 模拟真实输入
                            for (let i = 0; i < message.length; i++) {
                                element.value += message[i];
                                element.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                            
                            // 触发各种事件
                            ['input', 'change', 'keyup'].forEach(eventType => {
                                element.dispatchEvent(new Event(eventType, { bubbles: true }));
                            });
                            
                            console.log('✅ 已输入消息:', message);
                            
                            // 自动发送
                            setTimeout(() => {
                                this.sendMessage(element);
                            }, 500);
                            
                            return true;
                        }
                    }
                }
                
                // 等待一下再尝试
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            console.warn('❌ 未找到可用的输入框');
            return false;
        },
        
        // 发送消息
        sendMessage(inputElement) {
            console.log('📤 发送消息...');
            
            // 方法1: Enter键
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            
            inputElement.dispatchEvent(enterEvent);
            
            // 方法2: 查找发送按钮
            const buttonSelectors = [
                'button[aria-label*="Send"]',
                'button[aria-label*="发送"]',
                'button[title*="Send"]',
                'button:has(.codicon-send)',
                '.send-button',
                'button[type="submit"]'
            ];
            
            for (const selector of buttonSelectors) {
                const button = inputElement.parentElement?.querySelector(selector) || 
                              document.querySelector(selector);
                if (button) {
                    console.log('✅ 找到发送按钮');
                    button.click();
                    break;
                }
            }
            
            console.log('✅ 消息已发送');
        },
        
        // 触发AI对话
        async triggerAI(message) {
            console.log('🤖 触发AI对话:', message);
            
            // 先检查是否已经有打开的对话框
            const hasInput = await this.fillAIInput(message);
            
            if (!hasInput) {
                // 如果没有找到输入框，尝试打开AI对话
                console.log('📋 尝试打开AI对话...');
                
                // Cmd/Ctrl + K
                const isMac = navigator.userAgent.includes('Mac');
                const event = new KeyboardEvent('keydown', {
                    key: 'k',
                    code: 'KeyK',
                    keyCode: 75,
                    ctrlKey: !isMac,
                    metaKey: isMac,
                    bubbles: true
                });
                
                document.dispatchEvent(event);
                
                // 等待对话框打开，然后再次尝试填充
                setTimeout(() => {
                    this.fillAIInput(message);
                }, 1000);
            }
        }
    };
    
    // WebSocket 连接
    const ws = new WebSocket(`ws://localhost:${WS_PORT}`);
    window.__cursorWS = ws;
    
    ws.onopen = () => {
        console.log('✅ 已连接到控制服务器');
        ws.send(JSON.stringify({
            type: 'init',
            data: { 
                version: 'auto-1.0',
                timestamp: new Date().toISOString() 
            }
        }));
    };
    
    ws.onmessage = async (event) => {
        const msg = JSON.parse(event.data);
        console.log('📨 收到命令:', msg.type);
        
        if (msg.type === 'ai_chat') {
            // 不再显示 alert，直接处理
            await AIController.triggerAI(msg.data.message);
            
            // 返回响应
            ws.send(JSON.stringify({
                type: 'ai_response',
                success: true,
                requestId: msg.requestId,
                data: {
                    content: 'AI对话已触发',
                    timestamp: new Date().toISOString()
                }
            }));
        }
    };
    
    ws.onerror = (e) => console.error('❌ WebSocket错误:', e);
    ws.onclose = () => console.log('⚠️ WebSocket已断开');
    
    // 暴露控制器用于测试
    window.AIController = AIController;
    window.testAI = (msg) => AIController.triggerAI(msg || '测试消息');
    
    console.log('🎉 注入完成！');
    console.log('💡 使用 testAI("消息") 测试');
    console.log('💡 或使用 AIController.fillAIInput("消息") 直接填充');
})();