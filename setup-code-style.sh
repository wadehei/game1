#!/bin/bash

# 代码规范工具快速安装脚本
# 使用方法: ./setup-code-style.sh

set -e

echo "🚀 开始配置代码规范工具..."

# 检查是否在项目根目录
if [ ! -f ".editorconfig" ]; then
    echo "❌ 错误：请在项目根目录（game1/）运行此脚本"
    exit 1
fi

# 安装前端依赖
echo ""
echo "📦 安装前端依赖..."
cd children-games-frontend
pnpm install
cd ..

# 安装后端依赖
echo ""
echo "📦 安装后端依赖..."
cd children-games-backend
pnpm install
cd ..

# 初始化 Husky
echo ""
echo "🔧 初始化 Husky..."
cd children-games-frontend
pnpm prepare
cd ..

# 验证安装
echo ""
echo "✅ 验证安装..."

# 检查 ESLint
if cd children-games-frontend && pnpm lint:check > /dev/null 2>&1; then
    echo "✅ 前端 ESLint 配置成功"
else
    echo "⚠️  前端 ESLint 有警告（可稍后修复）"
fi

if cd children-games-backend && pnpm lint:check > /dev/null 2>&1; then
    echo "✅ 后端 ESLint 配置成功"
else
    echo "⚠️  后端 ESLint 有警告（可稍后修复）"
fi

echo ""
echo "🎉 配置完成！"
echo ""
echo "📝 使用方法："
echo "  - 手动检查: pnpm lint:check"
echo "  - 自动修复: pnpm lint"
echo "  - 格式化: pnpm format"
echo ""
echo "💡 提交代码时会自动运行检查（Husky + lint-staged）"
echo ""
echo "📖 详细说明请查看: CODE_STYLE_GUIDE.md"
