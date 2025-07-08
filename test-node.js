console.log('🚀 Node.js 测试开始...');
console.log('✅ Node.js 运行正常');
console.log('🕒 当前时间：', new Date().toLocaleString());
console.log('📁 当前目录：', process.cwd());
console.log('🏷️ Node版本：', process.version);

// 简单的HTTP服务器测试
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        success: true,
        message: '测试服务器运行正常',
        url: req.url,
        method: req.method,
        timestamp: Date.now()
    }));
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`🌐 测试服务器启动成功！`);
    console.log(`📍 访问地址：http://localhost:${PORT}`);
    console.log('💡 按 Ctrl+C 停止服务器');
});

server.on('error', (error) => {
    console.error('❌ 服务器启动失败：', error.message);
    if (error.code === 'EADDRINUSE') {
        console.log('💡 端口 3000 被占用，尝试其他端口...');
        const newPort = PORT + 1;
        server.listen(newPort, () => {
            console.log(`🌐 测试服务器启动在端口 ${newPort}！`);
            console.log(`📍 访问地址：http://localhost:${newPort}`);
        });
    }
});
