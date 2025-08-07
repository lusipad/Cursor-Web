// 简单的测试数据生成脚本
const fs = require('fs');
const path = require('path');

// 生成测试聊天数据
function generateTestData() {
    console.log('🎯 生成测试聊天数据...');
    
    const testData = [
        {
            sessionId: "session-1",
            project: {
                name: "AI/ML咨询",
                rootPath: "Cursor全局聊天",
                fileCount: 7
            },
            messages: [
                {
                    role: "user",
                    content: "请帮我分析一下这个机器学习模型的性能"
                },
                {
                    role: "assistant", 
                    content: "我来帮您分析这个机器学习模型的性能。首先，让我们看看模型的准确率、精确率、召回率等关键指标..."
                }
            ],
            date: "2024-01-15T10:30:00.000Z",
            workspaceId: "global",
            dbPath: "global"
        },
        {
            sessionId: "session-2",
            project: {
                name: "React开发咨询",
                rootPath: "d:\\Repos\\React-Project",
                fileCount: 25
            },
            messages: [
                {
                    role: "user",
                    content: "如何在React中实现状态管理？"
                },
                {
                    role: "assistant",
                    content: "在React中实现状态管理有多种方式，包括useState、useReducer、Context API，以及第三方库如Redux、Zustand等..."
                }
            ],
            date: "2024-01-14T15:20:00.000Z",
            workspaceId: "react-project",
            dbPath: "react-project"
        },
        {
            sessionId: "session-3",
            project: {
                name: "Python开发咨询",
                rootPath: "d:\\Repos\\Python-Project",
                fileCount: 18
            },
            messages: [
                {
                    role: "user",
                    content: "如何使用Python处理JSON数据？"
                },
                {
                    role: "assistant",
                    content: "Python处理JSON数据非常简单，可以使用内置的json模块。主要方法包括json.loads()、json.dumps()等..."
                }
            ],
            date: "2024-01-13T09:45:00.000Z",
            workspaceId: "python-project",
            dbPath: "python-project"
        },
        {
            sessionId: "session-4",
            project: {
                name: "Node.js开发咨询",
                rootPath: "d:\\Repos\\NodeJS-Project",
                fileCount: 32
            },
            messages: [
                {
                    role: "user",
                    content: "如何创建一个Express.js服务器？"
                },
                {
                    role: "assistant",
                    content: "创建Express.js服务器需要先安装Express，然后创建app实例，定义路由，最后启动服务器监听端口..."
                }
            ],
            date: "2024-01-12T14:15:00.000Z",
            workspaceId: "nodejs-project",
            dbPath: "nodejs-project"
        },
        {
            sessionId: "session-5",
            project: {
                name: "数据库咨询",
                rootPath: "d:\\Repos\\Database-Project",
                fileCount: 12
            },
            messages: [
                {
                    role: "user",
                    content: "MySQL和PostgreSQL有什么区别？"
                },
                {
                    role: "assistant",
                    content: "MySQL和PostgreSQL都是流行的关系型数据库，但它们在特性、性能、扩展性等方面有所不同..."
                }
            ],
            date: "2024-01-11T11:30:00.000Z",
            workspaceId: "database-project",
            dbPath: "database-project"
        }
    ];
    
    // 保存到文件
    const outputFile = 'test-chat-data.json';
    fs.writeFileSync(outputFile, JSON.stringify(testData, null, 2), 'utf8');
    
    console.log(`✅ 成功生成 ${testData.length} 个测试聊天会话`);
    console.log(`💾 数据已保存到 ${outputFile}`);
    
    return testData;
}

// 运行生成
if (require.main === module) {
    generateTestData();
}

module.exports = { generateTestData }; 