// 简单的Git功能测试
const { simpleGit } = require('simple-git');

async function testGit() {
    try {
        const git = simpleGit(process.cwd());
        console.log('Git实例创建成功');

        // 测试获取分支
        const branches = await git.branchLocal();
        console.log('当前分支:', branches.current);
        console.log('本地分支:', branches.all);

        // 测试获取状态
        const status = await git.status();
        console.log('Git状态:', status);

    } catch (error) {
        console.error('Git测试失败:', error.message);
    }
}

testGit();
