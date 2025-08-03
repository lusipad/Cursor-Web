#!/usr/bin/env node

/**
 * 使用示例脚本
 * 展示如何使用工作区处理器
 */

const SpecificWorkspaceProcessor = require('./process_specific_workspaces');

console.log('=== Cursor 工作区聊天记录处理器使用示例 ===\n');

// 示例1：使用默认路径
console.log('1. 使用默认路径：');
console.log('   node process_specific_workspaces.js\n');

// 示例2：指定自定义路径
console.log('2. 指定自定义路径：');
console.log('   node process_specific_workspaces.js /path/to/your/cursor/data\n');

// 示例3：常见的 Cursor 数据路径
console.log('3. 常见的 Cursor 数据路径：');
console.log('   macOS: ~/Library/Application Support/Cursor');
console.log('   Windows: %APPDATA%/Cursor');
console.log('   Linux: ~/.config/Cursor\n');

// 示例4：在当前环境中的使用方法
console.log('4. 在当前环境中的使用方法：');
console.log('   如果您有 Cursor 数据的备份，请指定路径：');
console.log('   node process_specific_workspaces.js /path/to/your/cursor/backup\n');

// 显示目标工作区列表
const WORKSPACE_IDS = [
    '01fea5ca601895f83a1944fe2f5e1969',
    '053d1e69746c5c3c761194f970b30726',
    '141b9fe1d5b9492c4e3164f842889e87',
    '1754180913505',
    '3af1ee911d5734d851239cff10744fe9',
    '4387d4ceaebe33b9c7705533effcc6b4',
    '4d72e3c523c7d9210c5f4cde52c09317',
    '526ab2fb2ec38eba2139e685ea73c850',
    '720e2a6032a336b762623d0d6311cd5b',
    '73c85449bddff1c7206913c61661ae58',
    '7c88bac0a9c7319f148c0df644f06a54',
    '83fcc12bc1813d7b2fe900720fec6345',
    '9fe16d945c1cc999808cc34adab7f039',
    'a3adbd77e5cefeae98ddfabeadadeb09',
    'a4b38d474d12fabb20619e5e6c451f2a',
    'ae0bb40ddf908e1339537d475fbe082a',
    'c096ebc03987f7ee16127eb1e5b65760',
    'c5583557dad8a8bce04a8c8d97f6dc92',
    'cd02cb52fd7ec9e5d4b76bd5bb4603d4',
    'd7a22208304ecce3296a1a756b74067d',
    'dab906f43241c1a4ed99ddcdd2ceaf2f',
    'e29778869b635c8bae5bd1b3a3fc2937',
    'e71ed70bdea26a10240825908171705b',
    'ec231fd6f1e55cd68df4e2f74f845509',
    'ext-dev',
    'f3ea30577df7bc66c9310841057a41b7',
    'ffbd04b85024db14e143bc29283711a6'
];

console.log('5. 目标工作区配置列表：');
WORKSPACE_IDS.forEach((id, index) => {
    console.log(`   ${index + 1}. ${id}`);
});

console.log(`\n总计：${WORKSPACE_IDS.length} 个工作区配置\n`);

console.log('6. 输出文件：');
console.log('   处理结果将保存到：specific_workspace_chats.json');
console.log('   格式：JSON，包含工作区信息和聊天记录\n');

console.log('7. 如果需要帮助，请查看 README_workspace_processor.md');