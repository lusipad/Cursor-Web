// 服务器工具函数
const { networkInterfaces } = require('os');

// 获取本机IP地址
function getLocalIP() {
    const nets = networkInterfaces();

    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // 跳过非IPv4和内部地址
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

// 优雅关闭服务器
function gracefulShutdown(server, websocketManager, signal) {
    console.log(`\n🛑 收到 ${signal} 信号，正在关闭服务器...`);

    // 设置强制退出超时
    const forceExitTimeout = setTimeout(() => {
        console.log('⏰ 强制退出超时，立即关闭');
        process.exit(1);
    }, 10000); // 10秒超时

    // 通知所有客户端并关闭 WebSocket 连接
    websocketManager.notifyServerShutdown().then(() => {
        console.log('📱 所有客户端已断开');

        // 关闭服务器
        server.close((err) => {
            clearTimeout(forceExitTimeout);
            if (err) {
                console.log('❌ 服务器关闭失败:', err.message);
                process.exit(1);
            } else {
                console.log('✅ 服务器已优雅关闭');
                process.exit(0);
            }
        });
    });

    // 如果服务器关闭超时，强制关闭
    setTimeout(() => {
        console.log('⏰ 服务器关闭超时，强制关闭');
        clearTimeout(forceExitTimeout);
        process.exit(1);
    }, 5000);
}

// 设置进程信号监听
function setupProcessHandlers(server, websocketManager) {
    // 监听关闭信号
    process.on('SIGINT', () => gracefulShutdown(server, websocketManager, 'SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown(server, websocketManager, 'SIGTERM'));

    // 处理未捕获的异常
    process.on('uncaughtException', (error) => {
        console.error('💥 未捕获的异常:', error);
        gracefulShutdown(server, websocketManager, 'uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 未处理的Promise拒绝:', reason);
        gracefulShutdown(server, websocketManager, 'unhandledRejection');
    });
}

// 打印服务器启动信息
function printServerInfo(port) {
    console.log('🚀 Cursor Web 服务器已启动！');
    console.log(`📍 本地访问：http://localhost:${port}`);
    console.log(`🌐 局域网访问：http://${getLocalIP()}:${port}`);
    console.log(`🔌 WebSocket: ws://localhost:${port}`);
    console.log(`📡 HTTP API: http://localhost:${port}/api/`);
    console.log('📊 服务器状态：等待连接...\n');
    console.log('💡 支持的连接方式：');
    console.log('  - WebSocket (推荐用于浏览器)');
    console.log('  - HTTP API (适用于 Cursor 等受限环境)');
    console.log('  - 测试连接：GET /api/test');
    console.log('  - 发送内容：POST /api/content');
    console.log('  - 获取状态：GET /api/status\n');
}

module.exports = {
    getLocalIP,
    gracefulShutdown,
    setupProcessHandlers,
    printServerInfo
};
