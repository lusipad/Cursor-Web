// 调试版注入脚本 - 帮助分析为什么注入失败
javascript:(function(){
    console.log('=== 开始调试注入脚本 ===');

    // 1. 检查基本环境
    console.log('1. 环境检查:');
    console.log('  - URL:', window.location.href);
    console.log('  - User Agent:', navigator.userAgent);
    console.log('  - 是否支持WebSocket:', typeof WebSocket !== 'undefined');
    console.log('  - 是否在HTTPS:', window.location.protocol === 'https:');

    // 2. 检查安全策略
    console.log('2. 安全策略检查:');
    try {
        const testWS = new WebSocket('ws://localhost:3000');
        console.log('  - WebSocket创建成功');
        testWS.close();
    } catch (error) {
        console.log('  - WebSocket创建失败:', error.message);
    }

    // 3. 检查DOM环境
    console.log('3. DOM环境检查:');
    console.log('  - document可用:', typeof document !== 'undefined');
    console.log('  - 页面加载状态:', document.readyState);
    console.log('  - body存在:', !!document.body);

    // 4. 查找可能的聊天容器
    console.log('4. 聊天容器检查:');
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

    selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`  - 找到 ${elements.length} 个元素匹配: ${selector}`);
        }
    });

    // 5. 检查所有可能的消息元素
    console.log('5. 消息元素检查:');
    const messageSelectors = [
        'div[class*="message"]',
        '.message',
        '[data-message-id]',
        '[role="listitem"]',
        '.chat-message',
        '.conversation-turn'
    ];

    messageSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
            console.log(`  - 找到 ${elements.length} 个消息元素: ${selector}`);
            // 显示前几个元素的class
            Array.from(elements).slice(0, 3).forEach((el, index) => {
                console.log(`    [${index}] class: "${el.className}"`);
            });
        }
    });

    // 6. 检查页面的所有div元素（前10个）
    console.log('6. 页面结构分析:');
    const allDivs = document.querySelectorAll('div');
    console.log(`  - 总共找到 ${allDivs.length} 个div元素`);

    // 显示前10个有class的div
    Array.from(allDivs)
        .filter(div => div.className)
        .slice(0, 10)
        .forEach((div, index) => {
            console.log(`  [${index}] div.className: "${div.className}"`);
        });

    // 7. 尝试创建简单的WebSocket连接测试
    console.log('7. WebSocket连接测试:');
    try {
        const ws = new WebSocket('ws://localhost:3000');

        ws.onopen = function() {
            console.log('  ✅ WebSocket连接成功！');
            ws.send(JSON.stringify({
                type: 'debug',
                message: 'Debug injection test',
                timestamp: Date.now(),
                url: window.location.href
            }));
            ws.close();
        };

        ws.onerror = function(error) {
            console.log('  ❌ WebSocket连接失败:', error);
        };

        ws.onclose = function(event) {
            console.log(`  🔌 WebSocket已关闭 (code: ${event.code})`);
        };

    } catch (error) {
        console.log('  💥 WebSocket创建异常:', error.message);
    }

    // 8. 显示调试完成提示
    const debugNotification = document.createElement('div');
    debugNotification.style.cssText = `
        position: fixed; top: 20px; left: 20px; z-index: 10000;
        background: #2196F3; color: white; padding: 15px 20px;
        border-radius: 5px; font-family: Arial, sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); max-width: 300px;
    `;
    debugNotification.textContent = '🔍 调试信息已输出到Console';
    document.body.appendChild(debugNotification);

    setTimeout(() => {
        if (debugNotification.parentNode) {
            debugNotification.parentNode.removeChild(debugNotification);
        }
    }, 5000);

    console.log('=== 调试完成，请查看上述输出 ===');

})();
