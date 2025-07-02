// start.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('启动 Cursor Remote Control...');

// 启动服务器
const server = spawn('node', ['server.js'], {
    stdio: 'inherit',
    cwd: __dirname
});

// 监听退出事件
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    server.kill();
    process.exit();
});

// 显示注入说明
setTimeout(() => {
    console.log(`
════════════════════════════════════════════════════════════════
                        注入脚本说明
════════════════════════════════════════════════════════════════

1. 打开 Cursor IDE

2. 打开开发者工具:
   - Windows/Linux: Ctrl+Shift+I
   - macOS: Cmd+Option+I

3. 在控制台中粘贴并运行 cursor-injection.js 的内容

4. 或者使用以下命令自动注入:
   
   fetch('http://localhost:3456/inject.js')
     .then(r => r.text())
     .then(eval);

5. 成功后将看到 "Cursor Remote Control 注入脚本已加载" 消息

════════════════════════════════════════════════════════════════
`);
}, 2000);