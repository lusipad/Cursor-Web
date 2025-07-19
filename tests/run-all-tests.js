#!/usr/bin/env node

/**
 * 测试运行器 - 运行所有测试脚本
 */

const { spawn } = require('child_process');
const path = require('path');

// 测试配置
const tests = {
    unit: [
        'tests/unit/test-git.js',
        'tests/unit/test-remote-branch.js'
    ],
    integration: [
        'tests/integration/test-checkout.js',
        'tests/integration/test-dynamic-git.js'
    ]
};

// 颜色输出
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function runTest(testPath) {
    return new Promise((resolve, reject) => {
        log(`\n🧪 运行测试: ${testPath}`, 'cyan');

        const testProcess = spawn('node', [testPath], {
            stdio: 'inherit',
            shell: true
        });

        testProcess.on('close', (code) => {
            if (code === 0) {
                log(`✅ 测试通过: ${testPath}`, 'green');
                resolve();
            } else {
                log(`❌ 测试失败: ${testPath} (退出码: ${code})`, 'red');
                reject(new Error(`测试失败，退出码: ${code}`));
            }
        });

        testProcess.on('error', (error) => {
            log(`❌ 测试执行错误: ${testPath}`, 'red');
            log(`错误信息: ${error.message}`, 'red');
            reject(error);
        });
    });
}

async function runUnitTests() {
    log('\n📋 开始运行单元测试...', 'blue');

    for (const test of tests.unit) {
        try {
            await runTest(test);
        } catch (error) {
            log(`单元测试失败: ${test}`, 'red');
            throw error;
        }
    }

    log('✅ 所有单元测试完成', 'green');
}

async function runIntegrationTests() {
    log('\n📋 开始运行集成测试...', 'blue');
    log('⚠️  注意: 集成测试需要服务器运行在端口3000', 'yellow');

    for (const test of tests.integration) {
        try {
            await runTest(test);
        } catch (error) {
            log(`集成测试失败: ${test}`, 'red');
            throw error;
        }
    }

    log('✅ 所有集成测试完成', 'green');
}

async function runAllTests() {
    const startTime = Date.now();

    log('🚀 开始运行所有测试...', 'bright');

    try {
        // 运行单元测试
        await runUnitTests();

        // 运行集成测试
        await runIntegrationTests();

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        log(`\n🎉 所有测试完成！总耗时: ${duration}秒`, 'green');

    } catch (error) {
        log(`\n❌ 测试运行失败: ${error.message}`, 'red');
        process.exit(1);
    }
}

// 命令行参数处理
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    log('测试运行器使用说明:', 'bright');
    log('  node tests/run-all-tests.js          # 运行所有测试');
    log('  node tests/run-all-tests.js --unit   # 只运行单元测试');
    log('  node tests/run-all-tests.js --integration  # 只运行集成测试');
    log('  node tests/run-all-tests.js --help   # 显示帮助信息');
    process.exit(0);
}

if (args.includes('--unit')) {
    runUnitTests().catch(error => {
        log(`❌ 单元测试失败: ${error.message}`, 'red');
        process.exit(1);
    });
} else if (args.includes('--integration')) {
    runIntegrationTests().catch(error => {
        log(`❌ 集成测试失败: ${error.message}`, 'red');
        process.exit(1);
    });
} else {
    runAllTests();
}
