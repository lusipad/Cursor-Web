// 高级消息路由测试脚本
// 测试复杂的消息路由场景，包括广播、点对点、错误处理等

const MultiInstanceTester = require('./multi-instance-test');

class AdvancedRoutingTester extends MultiInstanceTester {
    constructor() {
        super();
        this.routingTests = [];
        this.broadcastTests = [];
        this.errorTests = [];
    }

    /**
     * 运行高级路由测试套件
     */
    async runAdvancedTests() {
        console.log('\n🧪 开始高级消息路由测试...');
        
        try {
            // 1. 创建多个实例
            await this.setupTestInstances();
            
            // 2. 点对点路由测试
            await this.runPointToPointTests();
            
            // 3. 广播消息测试
            await this.runBroadcastTests();
            
            // 4. 错误处理测试
            await this.runErrorHandlingTests();
            
            // 5. 并发消息测试
            await this.runConcurrentTests();
            
            // 6. 生成详细报告
            this.generateAdvancedReport();
            
        } catch (error) {
            console.error('❌ 高级测试失败:', error.message);
        }
    }

    /**
     * 设置测试实例
     */
    async setupTestInstances() {
        console.log('\n1️⃣ 设置测试实例...');
        
        const instances = [
            { id: 'sender-1', role: 'web' },
            { id: 'sender-2', role: 'web' },
            { id: 'receiver-1', role: 'web' },
            { id: 'receiver-2', role: 'web' },
            { id: 'default', role: 'web' },
            { id: 'broadcast-test', role: 'web' }
        ];

        for (const inst of instances) {
            await this.createInstance(inst.id, inst.role);
            console.log(`✅ 实例创建: ${inst.id}`);
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        console.log('⏳ 等待所有实例稳定...');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    /**
     * 点对点路由测试
     */
    async runPointToPointTests() {
        console.log('\n2️⃣ 点对点路由测试...');
        
        const testCases = [
            {
                name: '基础点对点',
                from: 'sender-1',
                to: 'receiver-1',
                content: '点对点测试消息 1'
            },
            {
                name: '反向点对点',
                from: 'receiver-1',
                to: 'sender-1',
                content: '反向点对点测试消息'
            },
            {
                name: '跨实例通信',
                from: 'sender-2',
                to: 'receiver-2',
                content: '跨实例通信测试'
            },
            {
                name: '发送到default',
                from: 'sender-1',
                to: 'default',
                content: '发送到默认实例'
            },
            {
                name: '从default发送',
                from: 'default',
                to: 'receiver-1',
                content: '从默认实例发送'
            }
        ];

        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            console.log(`\n📤 ${testCase.name}: ${testCase.from} -> ${testCase.to}`);
            
            const startTime = Date.now();
            const msgId = await this.sendMessage(testCase.from, testCase.to, testCase.content);
            
            const result = await this.waitForFeedback(msgId, 12000);
            const endTime = Date.now();
            
            this.routingTests.push({
                name: testCase.name,
                from: testCase.from,
                to: testCase.to,
                msgId: msgId,
                success: result.success,
                responseTime: endTime - startTime,
                details: result
            });

            if (result.success) {
                console.log(`✅ ${testCase.name} 成功 (${result.responseTime}ms)`);
            } else {
                console.log(`❌ ${testCase.name} 失败: ${result.reason}`);
            }

            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }

    /**
     * 广播消息测试
     */
    async runBroadcastTests() {
        console.log('\n3️⃣ 广播消息测试...');
        
        const broadcastCases = [
            {
                name: '广播到所有实例',
                from: 'broadcast-test',
                to: '*', // 广播标识
                content: '广播测试消息 - 发送给所有实例'
            },
            {
                name: '从default广播',
                from: 'default',
                to: '*',
                content: '从默认实例广播的消息'
            }
        ];

        for (const testCase of broadcastCases) {
            console.log(`\n📡 ${testCase.name}`);
            
            // 发送广播消息到多个目标
            const targets = ['receiver-1', 'receiver-2', 'sender-1', 'default'];
            const msgIds = [];
            
            for (const target of targets) {
                if (target !== testCase.from) {
                    const msgId = await this.sendMessage(testCase.from, target, 
                        `${testCase.content} (目标: ${target})`);
                    msgIds.push({ msgId, target });
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }

            // 等待所有消息的反馈
            let successCount = 0;
            for (const { msgId, target } of msgIds) {
                const result = await this.waitForFeedback(msgId, 10000);
                if (result.success) {
                    successCount++;
                    console.log(`  ✅ 到 ${target}: 成功`);
                } else {
                    console.log(`  ❌ 到 ${target}: 失败`);
                }
            }

            this.broadcastTests.push({
                name: testCase.name,
                from: testCase.from,
                totalTargets: msgIds.length,
                successCount: successCount,
                successRate: (successCount / msgIds.length * 100).toFixed(1)
            });

            console.log(`📊 广播成功率: ${successCount}/${msgIds.length} (${(successCount / msgIds.length * 100).toFixed(1)}%)`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    /**
     * 错误处理测试
     */
    async runErrorHandlingTests() {
        console.log('\n4️⃣ 错误处理测试...');
        
        const errorCases = [
            {
                name: '发送到不存在的实例',
                from: 'sender-1',
                to: 'non-existent-instance',
                content: '发送到不存在的实例',
                expectError: true
            },
            {
                name: '空消息内容',
                from: 'sender-1',
                to: 'receiver-1',
                content: '',
                expectError: false
            },
            {
                name: '超长消息内容',
                from: 'sender-1',
                to: 'receiver-1',
                content: 'A'.repeat(10000), // 10KB消息
                expectError: false
            },
            {
                name: '特殊字符消息',
                from: 'sender-1',
                to: 'receiver-1',
                content: '🚀💡📊🔥 特殊字符测试 "引号" \'单引号\' \n换行\t制表符',
                expectError: false
            }
        ];

        for (const testCase of errorCases) {
            console.log(`\n🧪 ${testCase.name}`);
            
            try {
                const msgId = await this.sendMessage(testCase.from, testCase.to, testCase.content);
                const result = await this.waitForFeedback(msgId, 8000);
                
                const hasError = result.pending?.delivery_error || false;
                const testPassed = testCase.expectError ? hasError : result.success;
                
                this.errorTests.push({
                    name: testCase.name,
                    expectError: testCase.expectError,
                    actualError: hasError,
                    success: result.success,
                    testPassed: testPassed,
                    details: result
                });

                if (testPassed) {
                    console.log(`✅ ${testCase.name}: 符合预期`);
                } else {
                    console.log(`❌ ${testCase.name}: 不符合预期`);
                }
                
            } catch (error) {
                console.log(`⚠️ ${testCase.name}: 发送异常 - ${error.message}`);
                this.errorTests.push({
                    name: testCase.name,
                    expectError: testCase.expectError,
                    actualError: true,
                    success: false,
                    testPassed: testCase.expectError,
                    exception: error.message
                });
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    /**
     * 并发消息测试
     */
    async runConcurrentTests() {
        console.log('\n5️⃣ 并发消息测试...');
        
        const concurrentCount = 10;
        const promises = [];
        const startTime = Date.now();
        
        console.log(`📤 同时发送 ${concurrentCount} 条消息...`);
        
        for (let i = 0; i < concurrentCount; i++) {
            const from = i % 2 === 0 ? 'sender-1' : 'sender-2';
            const to = i % 2 === 0 ? 'receiver-1' : 'receiver-2';
            const content = `并发测试消息 ${i + 1}/${concurrentCount}`;
            
            const promise = (async () => {
                const msgId = await this.sendMessage(from, to, content);
                const result = await this.waitForFeedback(msgId, 15000);
                return { msgId, result, index: i + 1 };
            })();
            
            promises.push(promise);
        }

        const results = await Promise.all(promises);
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        let successCount = 0;
        for (const { result, index } of results) {
            if (result.success) {
                successCount++;
                console.log(`  ✅ 并发消息 ${index}: 成功`);
            } else {
                console.log(`  ❌ 并发消息 ${index}: 失败`);
            }
        }

        const successRate = (successCount / concurrentCount * 100).toFixed(1);
        console.log(`\n📊 并发测试结果:`);
        console.log(`  总消息数: ${concurrentCount}`);
        console.log(`  成功数: ${successCount}`);
        console.log(`  成功率: ${successRate}%`);
        console.log(`  总耗时: ${totalTime}ms`);
        console.log(`  平均耗时: ${(totalTime / concurrentCount).toFixed(1)}ms/消息`);
    }

    /**
     * 生成高级测试报告
     */
    generateAdvancedReport() {
        console.log('\n' + '='.repeat(80));
        console.log('📋 高级消息路由测试报告');
        console.log('='.repeat(80));
        
        // 点对点测试结果
        console.log('\n🎯 点对点路由测试:');
        let p2pSuccess = 0;
        for (const test of this.routingTests) {
            const status = test.success ? '✅' : '❌';
            console.log(`  ${status} ${test.name}: ${test.from} -> ${test.to} (${test.responseTime}ms)`);
            if (test.success) p2pSuccess++;
        }
        const p2pRate = this.routingTests.length > 0 ? 
            (p2pSuccess / this.routingTests.length * 100).toFixed(1) : 0;
        console.log(`  📈 点对点成功率: ${p2pRate}% (${p2pSuccess}/${this.routingTests.length})`);

        // 广播测试结果
        console.log('\n📡 广播消息测试:');
        for (const test of this.broadcastTests) {
            console.log(`  📊 ${test.name}: ${test.successCount}/${test.totalTargets} (${test.successRate}%)`);
        }

        // 错误处理测试结果
        console.log('\n🛡️ 错误处理测试:');
        let errorTestPassed = 0;
        for (const test of this.errorTests) {
            const status = test.testPassed ? '✅' : '❌';
            const expectStr = test.expectError ? '期望错误' : '期望成功';
            const actualStr = test.actualError ? '实际错误' : '实际成功';
            console.log(`  ${status} ${test.name}: ${expectStr}, ${actualStr}`);
            if (test.testPassed) errorTestPassed++;
        }
        const errorTestRate = this.errorTests.length > 0 ? 
            (errorTestPassed / this.errorTests.length * 100).toFixed(1) : 0;
        console.log(`  📈 错误处理测试通过率: ${errorTestRate}% (${errorTestPassed}/${this.errorTests.length})`);

        // 总体评估
        console.log('\n🏆 总体评估:');
        const allTests = this.routingTests.length + this.broadcastTests.length + this.errorTests.length;
        const allSuccess = p2pSuccess + this.broadcastTests.reduce((sum, test) => 
            sum + (test.successRate === '100.0' ? 1 : 0), 0) + errorTestPassed;
        const overallRate = allTests > 0 ? (allSuccess / allTests * 100).toFixed(1) : 0;
        
        console.log(`  📊 总测试数: ${allTests}`);
        console.log(`  ✅ 通过数: ${allSuccess}`);
        console.log(`  📈 总体通过率: ${overallRate}%`);
        
        // 性能统计
        console.log('\n⚡ 性能统计:');
        const responseTimes = this.routingTests
            .filter(test => test.success)
            .map(test => test.responseTime);
        
        if (responseTimes.length > 0) {
            const avgTime = (responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length).toFixed(1);
            const minTime = Math.min(...responseTimes);
            const maxTime = Math.max(...responseTimes);
            console.log(`  📊 平均响应时间: ${avgTime}ms`);
            console.log(`  ⚡ 最快响应: ${minTime}ms`);
            console.log(`  🐌 最慢响应: ${maxTime}ms`);
        }

        console.log('\n' + '='.repeat(80));
        
        if (overallRate >= 85) {
            console.log('🎉 高级消息路由测试全面通过！系统运行良好。');
        } else if (overallRate >= 70) {
            console.log('⚠️ 高级消息路由测试基本通过，但存在一些问题需要关注。');
        } else {
            console.log('❌ 高级消息路由测试存在严重问题，需要立即修复。');
        }
        
        // 调用基础报告
        this.generateReport();
    }
}

// 主函数
async function main() {
    const tester = new AdvancedRoutingTester();
    
    console.log('🚀 高级消息路由测试工具启动');
    console.log('确保服务器正在运行: http://localhost:3000');
    
    const args = process.argv.slice(2);
    
    if (args.includes('--basic')) {
        await tester.runBasicTest();
    } else if (args.includes('--interactive') || args.includes('-i')) {
        await tester.interactiveMode();
    } else {
        await tester.runAdvancedTests();
    }
    
    await tester.cleanup();
}

// 启动
if (require.main === module) {
    main().catch(error => {
        console.error('❌ 程序执行失败:', error);
        process.exit(1);
    });
}

module.exports = AdvancedRoutingTester;