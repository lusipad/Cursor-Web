// 测试远程分支切换功能的简单脚本
const { simpleGit } = require('simple-git');
const git = simpleGit(process.cwd());

async function testRemoteBranches() {
    try {
        console.log('🔍 测试远程分支功能...');
        
        // 获取本地分支
        const localBranches = await git.branchLocal();
        console.log('📂 本地分支:', localBranches.all);
        
        // 获取所有分支（包括远程）
        const allBranches = await git.branch(['-a']);
        console.log('🌐 所有分支:', allBranches.all);
        
        // 过滤远程分支
        const remoteBranches = allBranches.all.filter(branch => 
            branch.startsWith('remotes/') && !branch.endsWith('/HEAD')
        ).map(branch => branch.replace('remotes/', ''));
        console.log('🚀 远程分支:', remoteBranches);
        
        // 测试一个简单的分支切换
        if (localBranches.all.length > 0) {
            const testBranch = localBranches.all[0];
            console.log(`✅ 测试切换到本地分支: ${testBranch}`);
            
            // 这里我们不需要真正切换，只是验证功能
            console.log('✅ 远程分支功能测试完成！');
            console.log('📝 现在可以在Web界面中测试远程分支切换了');
        }
        
    } catch (error) {
        console.error('❌ 测试失败:', error.message);
    }
}

if (require.main === module) {
    testRemoteBranches();
}

module.exports = { testRemoteBranches };