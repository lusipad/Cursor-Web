// 测试远程分支切换的脚本
const http = require('http');

async function testCheckout() {
    try {
        console.log('🧪 测试远程分支切换功能...');
        
        // 测试1: 获取分支信息
        const branchesResponse = await makeRequest('GET', '/api/git/branches');
        const branchesData = JSON.parse(branchesResponse);
        
        console.log('📋 当前分支:', branchesData.currentBranch);
        console.log('📂 本地分支:', branchesData.localBranches.length);
        console.log('🌐 远程分支:', branchesData.remoteBranches?.length || 'NOT AVAILABLE');
        
        // 处理远程分支
        let remoteBranches = [];
        if (branchesData.allBranches) {
            remoteBranches = branchesData.allBranches.filter(branch => 
                branch.startsWith('remotes/') && !branch.endsWith('/HEAD')
            ).map(branch => branch.replace('remotes/', ''));
        }
        
        console.log('🚀 检测到的远程分支:', remoteBranches);
        
        if (remoteBranches.length > 0) {
            const testRemoteBranch = remoteBranches[0];
            console.log(`🔄 准备测试切换到远程分支: ${testRemoteBranch}`);
            
            // 测试2: 切换到远程分支
            const checkoutData = { 
                branch: testRemoteBranch,
                createNew: true 
            };
            
            console.log('📤 发送请求:', JSON.stringify(checkoutData));
            
            try {
                const checkoutResponse = await makeRequest('POST', '/api/git/checkout', checkoutData);
                const checkoutResult = JSON.parse(checkoutResponse);
                
                if (checkoutResult.success) {
                    console.log('✅ 远程分支切换成功!');
                    console.log('📍 新分支:', checkoutResult.currentBranch);
                    console.log('📨 消息:', checkoutResult.message);
                } else {
                    console.log('❌ 远程分支切换失败:', checkoutResult.message);
                }
            } catch (error) {
                console.log('❌ 请求失败:', error.message);
            }
        } else {
            console.log('ℹ️  未找到远程分支，跳过切换测试');
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    }
}

function makeRequest(method, path, data = null) {
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

        const req = http.request(options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            res.on('end', () => {
                resolve(responseData);
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

if (require.main === module) {
    testCheckout();
}

module.exports = { testCheckout };