// 简单的HTTP服务器，不依赖Express，展示真实的Cursor聊天数据
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3002;

// 读取测试数据
let testData = [];
try {
    const dataPath = path.join(__dirname, 'test-chat-data.json');
    if (fs.existsSync(dataPath)) {
        testData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log(`📚 加载了 ${testData.length} 个测试聊天会话`);
    } else {
        console.log('⚠️  test-chat-data.json 不存在，请先运行: node test-data.js');
    }
} catch (error) {
    console.error('❌ 加载测试数据失败:', error.message);
}

// 创建HTTP服务器
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // 处理OPTIONS请求
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    try {
        // API路由 - 获取统计信息
        if (pathname === '/api/test/stats') {
            const totalMessages = testData.reduce((sum, chat) => sum + chat.messages.length, 0);
            const stats = {
                success: true,
                data: {
                    totalChats: testData.length,
                    totalMessages: totalMessages,
                    avgMessagesPerChat: Math.round(totalMessages / (testData.length || 1)),
                    extractedAt: new Date().toISOString()
                }
            };
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats));
            return;
        }
        
        // API路由 - 获取所有聊天会话（不分页，前端处理）
        if (pathname === '/api/test/chats') {
            const result = {
                success: true,
                data: testData,
                pagination: {
                    page: 1,
                    limit: testData.length,
                    total: testData.length,
                    pages: 1
                }
            };
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }
        
        // API路由 - 获取单个聊天会话
        if (pathname.startsWith('/api/test/chats/')) {
            const sessionId = pathname.replace('/api/test/chats/', '');
            const chat = testData.find(c => c.sessionId === sessionId);
            
            if (chat) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, data: chat }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Chat session not found' }));
            }
            return;
        }
        
        // API路由 - 重新生成测试数据
        if (pathname === '/api/test/regenerate' && req.method === 'POST') {
            console.log('🔄 重新生成测试数据...');
            
            // 动态导入test-data模块并运行
            try {
                delete require.cache[require.resolve('./test-data.js')];
                const { runTest } = require('./test-data.js');
                
                runTest().then(newData => {
                    if (newData && newData.length > 0) {
                        testData = newData;
                        const totalMessages = newData.reduce((sum, chat) => sum + chat.messages.length, 0);
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: `成功重新生成了 ${newData.length} 个聊天会话`,
                            data: {
                                totalChats: newData.length,
                                totalMessages: totalMessages
                            }
                        }));
                    } else {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: '重新生成数据失败' }));
                    }
                }).catch(error => {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: error.message }));
                });
                
                return;
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
                return;
            }
        }
        
        // 静态文件服务
        let filePath = pathname === '/' ? '/test.html' : pathname;
        filePath = path.join(__dirname, filePath);
        
        // 安全检查：防止目录遍历
        if (!filePath.startsWith(__dirname)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        // 获取文件扩展名并设置Content-Type
        const extname = path.extname(filePath);
        const contentTypes = {
            '.html': 'text/html',
            '.js': 'text/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
        
        const contentType = contentTypes[extname] || 'text/plain';
        
        // 读取并返回文件
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Error reading file');
                return;
            }
            
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        });
        
    } catch (error) {
        console.error('服务器错误:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
    }
});

// 启动服务器
server.listen(PORT, () => {
    console.log(`\n🚀 简单测试服务器启动成功！`);
    console.log(`📍 访问地址: http://localhost:${PORT}`);
    console.log(`📱 测试页面: http://localhost:${PORT}/test.html`);
    console.log(`📊 测试API: http://localhost:${PORT}/api/test/stats`);
    console.log(`💬 聊天数据: http://localhost:${PORT}/api/test/chats`);
    
    if (testData.length > 0) {
        const totalMessages = testData.reduce((sum, chat) => sum + chat.messages.length, 0);
        console.log(`\n📚 已加载数据:`);
        console.log(`  - ${testData.length} 个聊天会话`);
        console.log(`  - ${totalMessages} 条聊天消息`);
        console.log(`  - 平均每会话 ${Math.round(totalMessages / testData.length)} 条消息`);
    } else {
        console.log(`\n⚠️  没有测试数据，请先运行: node test-data.js`);
    }
});

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 测试服务器正在关闭...');
    server.close(() => {
        console.log('✅ 服务器已关闭');
        process.exit(0);
    });
});

// 错误处理
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ 端口 ${PORT} 已被占用`);
        console.log('💡 尝试使用其他端口或关闭占用该端口的程序');
    } else {
        console.error('❌ 服务器错误:', err);
    }
    process.exit(1);
});