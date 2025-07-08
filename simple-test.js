// 简化测试脚本 - 仅测试最基本的WebSocket连接
javascript:(function(){
    // 显示执行提示
    alert('开始测试WebSocket连接...');

    try {
        const ws = new WebSocket('ws://localhost:3000');

        ws.onopen = function() {
            alert('✅ WebSocket连接成功！将发送测试消息...');
            ws.send(JSON.stringify({
                type: 'test',
                content: '<div>这是一条测试消息 from ' + window.location.href + '</div>',
                timestamp: Date.now()
            }));
            setTimeout(() => ws.close(), 1000);
        };

        ws.onerror = function(error) {
            alert('❌ WebSocket连接失败: ' + error);
        };

        ws.onclose = function(event) {
            alert('🔌 WebSocket已关闭 (code: ' + event.code + ')');
        };

    } catch (error) {
        alert('💥 WebSocket创建异常: ' + error.message);
    }
})();
