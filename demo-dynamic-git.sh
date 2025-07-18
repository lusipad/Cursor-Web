#!/bin/bash

# 动态Git路径功能演示脚本
echo "🚀 动态Git路径功能演示"
echo "================================"

# 获取当前目录
CURRENT_DIR=$(pwd)
echo "📍 当前目录: $CURRENT_DIR"

# 检查是否为Git仓库
if [ -d ".git" ]; then
    echo "✅ 当前目录是Git仓库"
    git branch --show-current
else
    echo "❌ 当前目录不是Git仓库"
fi

echo ""
echo "📋 使用方法："
echo "1. 在任意Git仓库目录下运行: node app.js"
echo "2. 服务器会自动检测并使用该目录的Git仓库"
echo "3. 所有Git操作都会在该仓库中进行"
echo ""
echo "💡 示例："
echo "   cd /path/to/your/project"
echo "   node /path/to/claude-web/app.js"
echo ""
echo "🔧 功能特性："
echo "   ✅ 自动检测Git仓库"
echo "   ✅ 支持本地分支切换"
echo "   ✅ 支持远程分支切换"
echo "   ✅ 动态路径管理"
echo "   ✅ 错误处理和提示"
echo ""
echo "🌐 访问地址："
echo "   http://localhost:3000"
echo ""
echo "📊 健康检查："
echo "   http://localhost:3000/health"
echo ""
echo "🎯 现在你可以从任意Git仓库目录启动服务器了！" 