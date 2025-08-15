// 测试管理器 - 统一管理所有测试用例
// 整理和优化测试代码结构

const path = require('path');
const fs = require('fs');
const testConfig = require('./test-config');
const TestUtils = require('./test-utils');

class TestManager {
    constructor() {
        this.testSuites = new Map();
        this.testResults = [];
        this.config = {
            serverUrl: 'http://localhost:3000',
            wsUrl: 'ws://127.0.0.1:3000',
            timeout: 15000,
            retryAttempts: 3
        };
        this.setupTestSuites();
    }

    /**
     * 设置测试套件
     */
    setupTestSuites() {
        // 基础功能测试
        this.testSuites.set('basic', {
            name: '基础功能测试',
            description: '测试服务器连接、API接口、WebSocket基础功能',
            file: './comprehensive-test.js',
            priority: 1,
            enabled: true
        });

        // 多实例消息路由测试
        this.testSuites.set('multi-instance', {
            name: '多实例消息路由测试',
            description: '测试多个实例间的消息发送和路由机制',
            file: '../multi-instance-test.js',
            priority: 2,
            enabled: true
        });

        // 高级路由测试
        this.testSuites.set('advanced-routing', {
            name: '高级路由测试',
            description: '测试复杂路由场景、广播、错误处理',
            file: '../advanced-routing-test.js',
            priority: 3,
            enabled: true
        });

        // WebSocket专项测试
        this.testSuites.set('websocket', {
            name: 'WebSocket专项测试',
            description: '专门测试WebSocket连接和消息传递',
            file: './ws-routing-test.js',
            priority: 2,
            enabled: true
        });

        // 端到端测试
        this.testSuites.set('e2e', {
            name: '端到端测试',
            description: '完整的端到端功能测试',
            file: '../end-to-end-test.js',
            priority: 4,
            enabled: false // 需要真实Cursor环境
        });

        // 性能测试
        this.testSuites.set('performance', {
            name: '性能测试',
            description: '测试系统性能和负载能力',
            file: './send-receive-poll.js',
            priority: 5,
            enabled: false // 可选测试
        });
    }

    /**
     * 运行所有启用的测试
     */
    async runAllTests() {
        console.log('🧪 开始运行测试套件...');
        console.log('='.repeat(60));
        
        const enabledTests = Array.from(this.testSuites.entries())
            .filter(([_, suite]) => suite.enabled)
            .sort(([_, a], [__, b]) => a.priority - b.priority);

        let totalTests = 0;
        let passedTests = 0;
        let failedTests = 0;

        for (const [key, suite] of enabledTests) {
            console.log(`\n📋 运行测试套件: ${suite.name}`);
            console.log(`📝 描述: ${suite.description}`);
            console.log('-'.repeat(50));

            try {
                const result = await this.runTestSuite(key, suite);
                totalTests += result.total;
                passedTests += result.passed;
                failedTests += result.failed;
                
                this.testResults.push({
                    suite: key,
                    name: suite.name,
                    ...result,
                    timestamp: new Date().toISOString()
                });

                if (result.success) {
                    console.log(`✅ ${suite.name} 完成 (${result.passed}/${result.total})`);
                } else {
                    console.log(`❌ ${suite.name} 失败 (${result.passed}/${result.total})`);
                }

            } catch (error) {
                console.error(`💥 ${suite.name} 执行异常:`, error.message);
                failedTests++;
                totalTests++;
            }

            // 测试间隔
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        this.generateFinalReport(totalTests, passedTests, failedTests);
        await this.saveTestReport();
    }

    /**
     * 运行单个测试套件
     */
    async runTestSuite(key, suite) {
        const testFile = path.resolve(__dirname, suite.file);
        
        if (!fs.existsSync(testFile)) {
            throw new Error(`测试文件不存在: ${testFile}`);
        }

        // 根据测试类型选择运行方式
        switch (key) {
            case 'multi-instance':
                return await this.runMultiInstanceTest(testFile);
            case 'advanced-routing':
                return await this.runAdvancedRoutingTest(testFile);
            case 'basic':
                return await this.runComprehensiveTest(testFile);
            default:
                return await this.runGenericTest(testFile);
        }
    }

    /**
     * 运行多实例测试
     */
    async runMultiInstanceTest(testFile) {
        const MultiInstanceTester = require(testFile);
        const tester = new MultiInstanceTester();
        
        try {
            await tester.runBasicTest();
            const stats = tester.getTestStats();
            
            return {
                success: stats.successRate >= 75,
                total: stats.totalTests,
                passed: stats.passedTests,
                failed: stats.failedTests,
                successRate: stats.successRate,
                details: stats
            };
        } finally {
            await tester.cleanup();
        }
    }

    /**
     * 运行高级路由测试
     */
    async runAdvancedRoutingTest(testFile) {
        const AdvancedRoutingTester = require(testFile);
        const tester = new AdvancedRoutingTester();
        
        try {
            await tester.runAdvancedTests();
            const stats = tester.getAdvancedStats();
            
            return {
                success: stats.overallRate >= 70,
                total: stats.totalTests,
                passed: stats.passedTests,
                failed: stats.failedTests,
                successRate: stats.overallRate,
                details: stats
            };
        } finally {
            await tester.cleanup();
        }
    }

    /**
     * 运行综合测试
     */
    async runComprehensiveTest(testFile) {
        const CursorWebTester = require(testFile);
        const tester = new CursorWebTester();
        
        try {
            await tester.runAllTests();
            const results = tester.getResults();
            
            const passed = results.filter(r => r.success).length;
            const total = results.length;
            
            return {
                success: passed / total >= 0.8,
                total: total,
                passed: passed,
                failed: total - passed,
                successRate: (passed / total * 100).toFixed(1),
                details: results
            };
        } finally {
            await tester.cleanup();
        }
    }

    /**
     * 运行通用测试
     */
    async runGenericTest(testFile) {
        // 简单的文件执行测试
        return new Promise((resolve, reject) => {
            const { spawn } = require('child_process');
            const child = spawn('node', [testFile], {
                stdio: 'pipe',
                cwd: path.dirname(testFile)
            });

            let output = '';
            let errorOutput = '';

            child.stdout.on('data', (data) => {
                output += data.toString();
                process.stdout.write(data);
            });

            child.stderr.on('data', (data) => {
                errorOutput += data.toString();
                process.stderr.write(data);
            });

            child.on('close', (code) => {
                const success = code === 0;
                resolve({
                    success: success,
                    total: 1,
                    passed: success ? 1 : 0,
                    failed: success ? 0 : 1,
                    successRate: success ? 100 : 0,
                    output: output,
                    error: errorOutput
                });
            });

            child.on('error', (error) => {
                reject(error);
            });

            // 超时处理
            setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error('测试超时'));
            }, this.config.timeout);
        });
    }

    /**
     * 生成最终报告
     */
    generateFinalReport(total, passed, failed) {
        console.log('\n' + '='.repeat(80));
        console.log('📊 测试套件执行完成');
        console.log('='.repeat(80));
        
        const successRate = total > 0 ? (passed / total * 100).toFixed(1) : 0;
        
        console.log(`\n📈 总体统计:`);
        console.log(`  📋 总测试数: ${total}`);
        console.log(`  ✅ 通过数: ${passed}`);
        console.log(`  ❌ 失败数: ${failed}`);
        console.log(`  📊 成功率: ${successRate}%`);
        
        console.log(`\n📋 测试套件详情:`);
        for (const result of this.testResults) {
            const status = result.success ? '✅' : '❌';
            console.log(`  ${status} ${result.name}: ${result.passed}/${result.total} (${result.successRate}%)`);
        }
        
        if (successRate >= 80) {
            console.log('\n🎉 测试套件整体通过！');
        } else if (successRate >= 60) {
            console.log('\n⚠️ 测试套件部分通过，需要关注失败项。');
        } else {
            console.log('\n❌ 测试套件存在严重问题，需要修复。');
        }
        
        console.log('\n' + '='.repeat(80));
    }

    /**
     * 保存测试报告
     */
    async saveTestReport() {
        const reportPath = path.join(__dirname, 'test-suite-report.json');
        const report = {
            timestamp: new Date().toISOString(),
            config: this.config,
            testSuites: Object.fromEntries(this.testSuites),
            results: this.testResults,
            summary: {
                totalSuites: this.testResults.length,
                passedSuites: this.testResults.filter(r => r.success).length,
                failedSuites: this.testResults.filter(r => !r.success).length
            }
        };
        
        try {
            await TestUtils.generateTestReport(report, reportPath);
            console.log(`📄 测试报告已保存: ${reportPath}`);
        } catch (error) {
            console.error('❌ 保存测试报告失败:', error.message);
        }
    }

    /**
     * 运行指定的测试套件
     */
    async runSpecificTest(testKey) {
        const suite = this.testSuites.get(testKey);
        if (!suite) {
            throw new Error(`未找到测试套件: ${testKey}`);
        }
        
        console.log(`🧪 运行指定测试: ${suite.name}`);
        const result = await this.runTestSuite(testKey, suite);
        
        console.log(`\n📊 测试结果:`);
        console.log(`  ✅ 通过: ${result.passed}`);
        console.log(`  ❌ 失败: ${result.failed}`);
        console.log(`  📈 成功率: ${result.successRate}%`);
        
        return result;
    }

    /**
     * 列出所有可用的测试套件
     */
    listTestSuites() {
        console.log('📋 可用的测试套件:');
        console.log('='.repeat(50));
        
        for (const [key, suite] of this.testSuites) {
            const status = suite.enabled ? '✅' : '⏸️';
            console.log(`${status} ${key}: ${suite.name}`);
            console.log(`   📝 ${suite.description}`);
            console.log(`   📁 ${suite.file}`);
            console.log(`   🔢 优先级: ${suite.priority}`);
            console.log('');
        }
    }
}

// 命令行接口
if (require.main === module) {
    const testManager = new TestManager();
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        // 运行所有测试
        testManager.runAllTests().catch(console.error);
    } else if (args[0] === 'list') {
        // 列出测试套件
        testManager.listTestSuites();
    } else if (args[0] === 'run' && args[1]) {
        // 运行指定测试
        testManager.runSpecificTest(args[1]).catch(console.error);
    } else {
        console.log('用法:');
        console.log('  node test-manager.js          # 运行所有测试');
        console.log('  node test-manager.js list     # 列出测试套件');
        console.log('  node test-manager.js run <key> # 运行指定测试');
    }
}

module.exports = TestManager;