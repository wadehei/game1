#!/bin/bash

# 代码规范工具快速安装脚本（npm 版）
# 使用方法: ./setup-code-style.sh（在项目根目录执行）

set -e

echo "🚀 开始配置代码规范工具..."

if [ ! -f ".editorconfig" ]; then
    echo "❌ 错误：请在项目根目录（game1/）运行此脚本"
    exit 1
fi

echo ""
echo "📦 安装前端依赖（npm install 会自动触发 prepare → husky）..."
(cd children-games-frontend && npm install)

echo ""
echo "📦 安装后端依赖..."
(cd children-games-backend && npm install)

echo ""
echo "✅ 验证安装..."

if (cd children-games-frontend && npm run lint:check > /dev/null 2>&1); then
    echo "✅ 前端 ESLint 通过"
else
    echo "⚠️  前端 ESLint 有警告（warn 不阻塞提交，可稍后处理）"
fi

if (cd children-games-backend && npm run lint:check > /dev/null 2>&1); then
    echo "✅ 后端 ESLint 通过"
else
    echo "⚠️  后端 ESLint 有警告（warn 不阻塞提交，可稍后处理）"
fi

echo ""
echo "🎉 配置完成！"
echo ""
echo "📝 常用命令（在各子包内执行）："
echo "  - 仅检查:   npm run lint:check"
echo "  - 自动修复: npm run lint"
echo "  - 类型检查: npm run typecheck（前端）/ npm run build（后端）"
echo "  - 单元测试: npm run test:run（前端）/ npm test（后端）"
echo ""
echo "💡 提交代码时会自动运行检查（Husky + lint-staged，fail-closed）"
echo ""
echo "📖 详细说明请查看: CODE_STYLE_GUIDE.md"
