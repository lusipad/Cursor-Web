// 多实例WebSocket测试脚本
const WebSocket = require('ws');
const readline = require('readline');

class MultiInstanceTester {
    constructor() {
        this.wsUrl = 'ws://127.0.0.1:3000';
        this.instances = new Map();
        this.pendingMessages = new Map();
        this.testResults = [];
        this.messageStats = {
            sent: 0,
            received: 0,
            delivery_ack: 0,
            assistant_hint: 0
        };
    }

    /**
     * 创建WebSocket实例
     */
    async createInstance(instanceId, role = 'web') {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this.wsUrl);
            const instance = {
                id: instanceId,
                role: role,
                ws: ws,
                connected: false
            };

            const timeout = setTimeout(() => {
                reject(new Error(`连接超时: ${instanceId}`));
            }, 10000);

            ws.on('open', () => {
                clearTimeout(timeout);
                console.log(`✅ 实例连接成功: ${instanceId}`);
                
                // 注册实例
                const registerMsg = {
                    type: 'register',
                    role: role,
                    instanceId: instanceId
                };
                ws.send(JSON.stringify(registerMsg));
                
                instance.connected = true;
                this.instances.set(instanceId, instance);
                resolve(instance);
            });

            ws.on('message', (data) => {
                this.handleMessage(instanceId, data);
            });

            ws.on('close', () => {
                console.log(`❌ 实例连接关闭: ${instanceId}`);
                instance.connected = false;
            });

            ws.on('error', (error) => {
                clearTimeout(timeout);
                console.error(`❌ 实例连接错误 ${instanceId}:`, error.message);
                reject(error);
            });
        });
    }

    /**
     * 处理接收到的消息
     */
    handleMessage(instanceId, data) {
        try {
            const message = JSON.parse(data.toString());
            this.messageStats.received++;
            
            console.log(`📥 ${instanceId} 收到消息:`, message.type, message.msgId ? `(${message.msgId})` : '');
            
            switch (message.type) {
                case 'register_ack':
                    console.log(`✅ ${instanceId} 注册确认`);
                    break;
                case 'delivery_ack':
                    this.handleDeliveryAck(message);
                    break;
                case 'delivery_error':
                    console.log(`❌ 投递失败: ${message.msgId} - ${message.reason}`);
                    break;
                case 'assistant_hint':
                    this.handleAssistantHint(message);
                    break;
                case 'user_message':
                    console.log(`💬 ${instanceId} 收到用户消息: ${message.data}`);
                    break;
                default:
                    console.log(`ℹ️ ${instanceId} 未知消息类型: ${message.type}`);
            }
        } catch (error) {
            console.error(`❌ 解析消息失败 ${instanceId}:`, error.message);
        }
    }

    /**
     * 处理投递确认
     */
    handleDeliveryAck(message) {
        this.messageStats.delivery_ack++;
        const pending = this.pendingMessages.get(message.msgId);
        if (pending) {
            pending.delivery_ack = true;
            console.log(`✅ 消息投递确认: ${message.msgId}`);
        }
    }

    /**
     * 处理助手提示
     */
    handleAssistantHint(message) {
        this.messageStats.assistant_hint++;
        const pending = this.pendingMessages.get(message.msgId);
        if (pending) {
            pending.assistant_hint = true;
            console.log(`💡 助手提示: ${message.msgId}`);
        }
    }

    /**
     * 发送消息
     */
    async sendMessage(fromInstanceId, toInstanceId, content) {
        const fromInstance = this.instances.get(fromInstanceId);
        if (!fromInstance || !fromInstance.connected) {
            throw new Error(`发送实例不存在或未连接: ${fromInstanceId}`);
        }

        const msgId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const message = {
            type: 'user_message',
            targetInstanceId: toInstanceId,
            data: content,
            msgId: msgId
        };

        // 记录待确认消息
        this.pendingMessages.set(msgId, {
            fromInstanceId,
            toInstanceId,
            content,
            sentAt: Date.now(),
            delivery_ack: false,
            assistant_hint: false
        });

        fromInstance.ws.send(JSON.stringify(message));
        this.messageStats.sent++;
        
        console.log(`📤 发送消息: ${fromInstanceId} -> ${toInstanceId} (${msgId})`);
        return msgId;
    }

    /**
     * 等待消息反馈
     */
    async waitForFeedback(msgId, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const checkInterval = setInterval(() => {
                const pending = this.pendingMessages.get(msgId);
                if (!pending) {
                    clearInterval(checkInterval);
                    reject(new Error('消息记录不存在'));
                    return;
                }

                const elapsed = Date.now() - startTime;
                if (elapsed >= timeout) {
                    clearInterval(checkInterval);
                    this.pendingMessages.delete(msgId);
                    reject(new Error('等待反馈超时'));
                    return;
                }

                // 检查是否收到确认
                if (pending.delivery_ack || pending.assistant_hint) {
                    clearInterval(checkInterval);
                    this.pendingMessages.delete(msgId);
                    resolve({
                        responseTime: elapsed,
                        delivery_ack: pending.delivery_ack,
                        assistant_hint: pending.assistant_hint
                    });
                }
            }, 100);
        });
    }

    /**
     * 运行基础测试
     */
    async runBasicTest() {
        console.log('🧪 开始多实例消息路由测试...');
        
        try {
            // 1. 创建测试实例
            console.log('\n1️⃣ 创建测试实例...');
            await this.createInstance('test-instance-1', 'web');
            await this.createInstance('test-instance-2', 'web');
            
            // 等待连接稳定
            console.log('⏳ 等待连接稳定...');
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // 2. 定义测试消息
            const testMessages = [
                { from: 'test-instance-1', to: 'test-instance-2', content: '测试消息1: Hello from instance 1' },
                { from: 'test-instance-2', to: 'test-instance-1', content: '测试消息2: Hello from instance 2' },
                { from: 'test-instance-1', to: 'test-instance-2', content: '测试消息3: 中文消息测试' },
                { from: 'test-instance-2', to: 'test-instance-1', content: '测试消息4: Final test message' }
            ];
            
            console.log('\n📤 开始发送测试消息...');
            
            // 发送测试消息
            for (let i = 0; i < testMessages.length; i++) {
                const test = testMessages[i];
                console.log(`\n🔄 测试 ${i + 1}/${testMessages.length}: ${test.from} -> ${test.to}`);
                
                try {
                    const msgId = await this.sendMessage(test.from, test.to, test.content);
                    const result = await this.waitForFeedback(msgId, 8000);
                    
                    this.testResults.push({
                        success: true,
                        from: test.from,
                        to: test.to,
                        content: test.content,
                        responseTime: result.responseTime,
                        delivery_ack: result.delivery_ack,
                        assistant_hint: result.assistant_hint
                    });
                    
                    console.log(`✅ 测试成功 (${result.responseTime}ms)`);
                } catch (error) {
                    this.testResults.push({
                        success: false,
                        from: test.from,
                        to: test.to,
                        content: test.content,
                        error: error.message
                    });
                    
                    console.log(`❌ 测试失败: ${error.message}`);
                }
                
                // 测试间隔
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 生成报告
            this.generateReport();
            
        } catch (error) {
            console.error('❌ 测试执行失败:', error.message);
        }
    }
    
    /**
     * 生成测试报告
     */
    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📊 多实例消息路由测试报告');
        console.log('='.repeat(60));
        
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        const successRate = totalTests > 0 ? (passedTests / totalTests * 100).toFixed(1) : 0;
        
        console.log(`\n📈 测试统计:`);
        console.log(`  📋 总测试数: ${totalTests}`);
        console.log(`  ✅ 通过数: ${passedTests}`);
        console.log(`  ❌ 失败数: ${failedTests}`);
        console.log(`  📊 成功率: ${successRate}%`);
        
        console.log(`\n📊 消息统计:`);
        console.log(`  📤 发送: ${this.messageStats.sent}`);
        console.log(`  📥 接收: ${this.messageStats.received}`);
        console.log(`  ✅ 投递确认: ${this.messageStats.delivery_ack}`);
        console.log(`  💡 助手提示: ${this.messageStats.assistant_hint}`);
        
        if (this.testResults.length > 0) {
            console.log(`\n📋 详细结果:`);
            this.testResults.forEach((result, index) => {
                const status = result.success ? '✅' : '❌';
                const time = result.responseTime ? ` (${result.responseTime}ms)` : '';
                const error = result.error ? ` - ${result.error}` : '';
                console.log(`  ${status} 测试${index + 1}: ${result.from} -> ${result.to}${time}${error}`);
            });
        }
        
        console.log('\n' + '='.repeat(60));
        
        if (successRate >= 80) {
            console.log('🎉 多实例消息测试通过！');
        } else {
            console.log('⚠️ 多实例消息测试存在问题，请检查日志。');
        }
    }
    
    /**
     * 关闭所有连接
     */
    async cleanup() {
        console.log('\n🧹 清理资源...');
        for (const [id, instance] of this.instances) {
            if (instance.ws && instance.connected) {
                instance.ws.close();
                console.log(`🔌 关闭连接: ${id}`);
            }
        }
        this.instances.clear();
    }
    
    /**
     * 获取测试统计信息
     */
    getTestStats() {
        const totalTests = this.testResults.length;
        const passedTests = this.testResults.filter(r => r.success).length;
        const failedTests = totalTests - passedTests;
        const successRate = totalTests > 0 ? (passedTests / totalTests * 100).toFixed(1) : 0;
        
        return {
            totalTests,
            passedTests,
            failedTests,
            successRate: parseFloat(successRate),
            messageStats: this.messageStats,
            testResults: this.testResults,
            instanceCount: this.instances.size,
            pendingMessages: this.pendingMessages.size
        };
    }
}

// 主函数
async function main() {
    const tester = new MultiInstanceTester();
    
    // 检查命令行参数
    const args = process.argv.slice(2);
    
    if (args.includes('--interactive') || args.includes('-i')) {
        console.log('交互式模式暂未实现');
    } else {
        // 自动测试模式
        await tester.runBasicTest();
        await tester.cleanup();
    }
}

// 错误处理
process.on('uncaughtException', (error) => {
    console.error('💥 未捕获的异常:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 未处理的Promise拒绝:', reason);
    process.exit(1);
});

// 启动
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序执行失败:', error);
        process.exit(1);
    });
}

module.exports = MultiInstanceTester;