#!/usr/bin/env node

/*
 * 测试运行器 - 快速启动Cursor Web系统测试
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('🧪 Cursor Web 系统测试启动器');
console.log('================================');

// 检查测试文件是否存在
const testFile = path.join(__dirname, 'tests', 'comprehensive-test.js');
if (!fs.existsSync(testFile)) {
  console.error('❌ 测试文件不存在:', testFile);
  process.exit(1);
}

// 检查Node.js版本
const nodeVersion = process.version;
console.log(`📋 Node.js版本: ${nodeVersion}`);

// 检查依赖
const packagePath = path.join(__dirname, 'package.json');
if (fs.existsSync(packagePath)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    console.log(`📦 项目: ${pkg.name} v${pkg.version}`);
  } catch (error) {
    console.log('⚠️ 无法读取package.json');
  }
}

console.log('\n🚀 启动测试...');
console.log('提示: 请确保服务器已运行 (npm run dev)');
console.log('');

// 运行测试
const testProcess = spawn('node', [testFile], {
  stdio: 'inherit',
  cwd: __dirname
});

testProcess.on('close', (code) => {
  console.log('');
  if (code === 0) {
    console.log('🎉 测试完成 - 所有测试通过!');
  } else {
    console.log('💥 测试完成 - 存在失败的测试');
    console.log('请查看上方的详细报告');
  }
  process.exit(code);
});

testProcess.on('error', (error) => {
  console.error('❌ 测试启动失败:', error.message);
  process.exit(1);
});

// 处理中断信号
process.on('SIGINT', () => {
  console.log('\n⏹️ 测试被用户中断');
  testProcess.kill('SIGINT');
  process.exit(1);
});