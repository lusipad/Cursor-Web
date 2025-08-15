const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🚀 开始打包 Cursor Web...');

// 1. 运行 pkg 打包
console.log('📦 执行 pkg 打包...');
try {
    execSync('pkg . --targets node18-win-x64 --output cursor-web.exe', { stdio: 'inherit' });
    console.log('✅ pkg 打包完成');
} catch (error) {
    console.error('❌ pkg 打包失败:', error.message);
    process.exit(1);
}

// 2. 创建发布目录
const distDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
    console.log('📁 创建 dist 目录');
}

// 3. 复制 exe 文件
const exeSource = path.join(__dirname, '..', 'cursor-web.exe');
const exeDest = path.join(distDir, 'cursor-web.exe');
if (fs.existsSync(exeSource)) {
    fs.copyFileSync(exeSource, exeDest);
    console.log('📋 复制 cursor-web.exe 到 dist 目录');
}

// 4. 复制 docs 目录
const docsSource = path.join(__dirname, '..', 'docs');
const docsDest = path.join(distDir, 'docs');
if (fs.existsSync(docsSource)) {
    // 递归复制目录
    function copyDir(src, dest) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
    
    copyDir(docsSource, docsDest);
    console.log('📚 复制 docs 目录到 dist 目录');
}

// 5. 复制其他必要文件
const filesToCopy = ['README.md', 'LICENSE', 'instances.json'];
filesToCopy.forEach(file => {
    const source = path.join(__dirname, '..', file);
    const dest = path.join(distDir, file);
    if (fs.existsSync(source)) {
        fs.copyFileSync(source, dest);
        console.log(`📋 复制 ${file} 到 dist 目录`);
    }
});

console.log('🎉 打包完成！发布文件位于 dist 目录中');
console.log('💡 使用方法：');
console.log('   1. 将 dist 目录中的所有文件复制到目标位置');
console.log('   2. 运行 cursor-web.exe');
console.log('   3. 访问 http://localhost:3000/docs 查看文档');