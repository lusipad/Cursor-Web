// 服务器配置
const path = require('path');

const config = {
    // 服务器配置
    server: {
        port: process.env.PORT || 3000,
        host: process.env.HOST || '0.0.0.0', // 允许所有IP访问，支持局域网连接
        publicPath: path.join(__dirname, '..', 'public')
    },

    // 中间件配置
    middleware: {
        jsonLimit: '50mb',
        cors: {
            origin: '*',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            headers: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization']
        }
    },

    // WebSocket 配置
    websocket: {
        heartbeatInterval: 30000, // 30秒心跳检测
        clientTimeout: 1000, // 客户端关闭超时
        // 新增：是否广播 html_content 到 WebSocket（默认关闭，仅调试用）
        broadcastHtmlEnabled: false
    },

    // Git 配置
    git: {
        fetchOptions: ['--all', '--prune'],
        defaultFiles: '.'
    },

    // 日志配置
    logging: {
        enabled: true,
        level: process.env.LOG_LEVEL || 'info'
    },

  // 启动行为
  startup: {
    // 启动时自动拉起默认实例（openPath=程序目录）
    autoLaunchDefaultInstance: true,
    // 启动后自动进行注入（launch 时已自带注入；如仅 scan 模式可用此开关）
    autoInjectOnBoot: true,
    // 默认注入的实例 ID（为空则使用 'default'）
    autoInjectInstanceId: 'default',
    // 延迟毫秒数，等待服务就绪
    delayMs: 1200
  },

    // 调试配置
    debug: {
        // 若置为 true，且 testCursorPath 存在，则优先使用该路径作为 Cursor 根目录
        useTestCursorPath: true,
        // 建议用于本机调试的用户目录（例如 D:\\test）
        testCursorPath: process.platform === 'win32' ? 'D:\\test' : null
    },

    // Cursor 历史数据库根目录（可由环境变量覆盖）
    cursor: {
        // 优先级：环境变量 CURSOR_STORAGE_PATH > DEBUG_CURSOR_PATH > (debug.useTestCursorPath ? debug.testCursorPath : null)
        storagePath: process.env.CURSOR_STORAGE_PATH || process.env.DEBUG_CURSOR_PATH || null
    }
};

module.exports = config;
