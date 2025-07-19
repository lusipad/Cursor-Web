// 测试动态Git路径功能
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

async function testDynamicGit() {
    try {
        console.log('🧪 测试动态Git路径功能...');

        // 测试1: 检查健康状态
        console.log('\n📊 1. 检查服务器健康状态...');
        const healthResponse = await makeRequest('GET', '/health');
        const healthData = JSON.parse(healthResponse);
        console.log('✅ 服务器状态:', healthData.status);
        console.log('📁 当前工作目录:', healthData.workspace);
        console.log('🔗 Git路径:', healthData.gitPath);
        console.log('📦 是否为Git仓库:', healthData.isGitRepo);

        // 测试2: 获取分支信息
        console.log('\n📋 2. 获取分支信息...');
        const branchesResponse = await makeRequest('GET', '/api/git/branches');
        const branchesData = JSON.parse(branchesResponse);

        if (branchesData.success) {
            console.log('✅ 分支信息获取成功');
            console.log('📍 当前分支:', branchesData.currentBranch);
            console.log('📂 本地分支数量:', branchesData.localBranches.length);
            console.log('🌐 远程分支数量:', branchesData.remoteBranches.length);
            console.log('🔗 Git路径:', branchesData.gitPath);

            if (branchesData.localBranches.length > 0) {
                console.log('📝 本地分支:', branchesData.localBranches.slice(0, 3).join(', ') +
                    (branchesData.localBranches.length > 3 ? '...' : ''));
            }

            if (branchesData.remoteBranches.length > 0) {
                console.log('🚀 远程分支:', branchesData.remoteBranches.slice(0, 3).join(', ') +
                    (branchesData.remoteBranches.length > 3 ? '...' : ''));
            }
        } else {
            console.log('❌ 分支信息获取失败:', branchesData.message);
        }

        // 测试3: 获取Git状态
        console.log('\n📈 3. 获取Git状态...');
        const statusResponse = await makeRequest('GET', '/api/git/status');
        const statusData = JSON.parse(statusResponse);

        if (statusData.success) {
            console.log('✅ Git状态获取成功');
            console.log('📍 当前分支:', statusData.status.current);
            console.log('📊 工作区状态:', statusData.status.working_dir);
        } else {
            console.log('❌ Git状态获取失败:', statusData.message);
        }

        console.log('\n🎉 动态Git路径功能测试完成！');
        console.log('💡 现在你可以从任意Git仓库目录启动服务器，它会自动使用该目录的Git仓库');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    }
}

// 运行测试
testDynamicGit();
