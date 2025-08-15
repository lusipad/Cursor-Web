/**
 * 测试配置文件
 * 统一管理所有测试的配置参数
 */

module.exports = {
    // 服务器配置
    server: {
        host: 'localhost',
        port: 3000,
        wsPort: 3000,
        baseUrl: 'http://localhost:3000',
        wsUrl: 'ws://localhost:3000'
    },

    // 测试超时配置
    timeouts: {
        connection: 5000,      // WebSocket连接超时
        message: 10000,        // 消息等待超时
        test: 30000,          // 单个测试超时
        suite: 300000         // 测试套件超时
    },

    // 多实例测试配置
    multiInstance: {
        instances: [
            { id: 'test-instance-1', role: 'cursor' },
            { id: 'test-instance-2', role: 'cursor' },
            { id: 'default', role: 'cursor' }
        ],
        testMessages: [
            { from: 'test-instance-1', to: 'test-instance-2', content: 'Hello from instance 1' },
            { from: 'test-instance-2', to: 'default', content: 'Hello from instance 2' },
            { from: 'default', to: 'test-instance-1', content: 'Hello from default' },
            { from: 'test-instance-1', to: 'default', content: 'Final test message' }
        ]
    },

    // 高级路由测试配置
    advancedRouting: {
        testScenarios: [
            'point-to-point',
            'broadcast',
            'error-handling',
            'concurrent-messaging'
        ],
        concurrentConnections: 5,
        messagesPerConnection: 10
    },

    // WebSocket测试配置
    websocket: {
        maxConnections: 10,
        reconnectAttempts: 3,
        reconnectDelay: 1000,
        heartbeatInterval: 30000
    },

    // 性能测试配置
    performance: {
        loadTest: {
            connections: 50,
            messagesPerConnection: 100,
            duration: 60000
        },
        stressTest: {
            connections: 100,
            messagesPerConnection: 200,
            duration: 120000
        }
    },

    // 报告配置
    reporting: {
        outputDir: './tests',
        formats: ['json', 'html'],
        includeDetails: true,
        saveFailedTests: true
    },

    // 日志配置
    logging: {
        level: 'info',
        enableConsole: true,
        enableFile: false,
        logFile: './tests/test.log'
    },

    // 测试环境配置
    environment: {
        development: {
            verbose: true,
            debugMode: true,
            skipCleanup: false
        },
        production: {
            verbose: false,
            debugMode: false,
            skipCleanup: true
        }
    }
};