// 测试远程分支刷新功能
const http = require('http');

async function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, res => {
            let responseData = '';
            res.on('data', chunk => {
                responseData += chunk;
            });
            res.on('end', () => {
                resolve(responseData);
            });
        });

        req.on('error', error => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testRefreshBranches() {
    try {
        console.log('🧪 测试远程分支刷新功能...');

        // 测试1: 第一次获取分支信息
        console.log('\n📋 1. 第一次获取分支信息...');
        const firstResponse = await makeRequest('GET', '/api/git/branches');
        const firstData = JSON.parse(firstResponse);

        if (firstData.success) {
            console.log('✅ 第一次获取成功');
            console.log('📍 当前分支:', firstData.currentBranch);
            console.log('📂 本地分支数量:', firstData.localBranches.length);
            console.log('🌐 远程分支数量:', firstData.remoteBranches.length);

            if (firstData.remoteBranches.length > 0) {
                console.log('🚀 远程分支示例:', firstData.remoteBranches.slice(0, 3).join(', '));
            }
        } else {
            console.log('❌ 第一次获取失败:', firstData.message);
            return;
        }

        // 测试2: 再次获取分支信息（模拟刷新）
        console.log('\n🔄 2. 刷新分支信息...');
        const secondResponse = await makeRequest('GET', '/api/git/branches');
        const secondData = JSON.parse(secondResponse);

        if (secondData.success) {
            console.log('✅ 刷新获取成功');
            console.log('📍 当前分支:', secondData.currentBranch);
            console.log('📂 本地分支数量:', secondData.localBranches.length);
            console.log('🌐 远程分支数量:', secondData.remoteBranches.length);

            if (secondData.remoteBranches.length > 0) {
                console.log('🚀 远程分支示例:', secondData.remoteBranches.slice(0, 3).join(', '));
            }

            // 比较两次获取的结果
            console.log('\n📊 3. 比较结果...');
            const localBranchesChanged = firstData.localBranches.length !== secondData.localBranches.length;
            const remoteBranchesChanged = firstData.remoteBranches.length !== secondData.remoteBranches.length;

            if (localBranchesChanged) {
                console.log('📂 本地分支数量发生变化');
            } else {
                console.log('📂 本地分支数量未变化');
            }

            if (remoteBranchesChanged) {
                console.log('🌐 远程分支数量发生变化');
            } else {
                console.log('🌐 远程分支数量未变化');
            }

            // 检查是否有新的远程分支
            const newRemoteBranches = secondData.remoteBranches.filter(branch =>
                !firstData.remoteBranches.includes(branch)
            );

            if (newRemoteBranches.length > 0) {
                console.log('🆕 发现新的远程分支:', newRemoteBranches.join(', '));
            } else {
                console.log('ℹ️  没有发现新的远程分支');
            }

        } else {
            console.log('❌ 刷新获取失败:', secondData.message);
        }

        console.log('\n🎉 远程分支刷新功能测试完成！');
        console.log('💡 现在点击"刷新远程分支"按钮应该能获取到最新的远程分支信息');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    }
}

if (require.main === module) {
    testRefreshBranches();
}

module.exports = { testRefreshBranches };
