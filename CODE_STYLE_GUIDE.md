# 代码规范配置指南

本文档说明如何配置和使用项目的代码规范工具。

## 配置概览

### 已配置工具

- **ESLint**: 代码质量检查（TypeScript + Vue 3）
- **Prettier**: 代码格式化
- **Husky**: Git hooks 管理
- **lint-staged**: 仅对暂存文件进行检查和格式化

### 配置文件位置

```
game1/
├── .editorconfig                          # 编辑器配置
├── .husky/pre-commit                      # Git pre-commit hook
└── children-games-frontend/
    ├── eslint.config.js                   # ESLint 配置（前端）
    ├── .prettierrc                        # Prettier 配置（前端）
    └── package.json                       # lint-staged 配置
└── children-games-backend/
    ├── eslint.config.js                   # ESLint 配置（后端）
    ├── .prettierrc                        # Prettier 配置（后端）
    └── package.json                       # lint-staged 配置
```

## 安装依赖

```bash
# 前端
cd children-games-frontend
pnpm install

# 后端
cd children-games-backend
pnpm install
```

## 使用方法

### 1. 手动运行检查和格式化

```bash
# 前端
cd children-games-frontend
pnpm lint              # 运行 ESLint 并自动修复
pnpm lint:check        # 仅检查，不修复
pnpm format            # 运行 Prettier 格式化
pnpm format:check      # 仅检查格式

# 后端
cd children-games-backend
pnpm lint              # 运行 ESLint 并自动修复
pnpm lint:check        # 仅检查，不修复
pnpm format            # 运行 Prettier 格式化
pnpm format:check      # 仅检查格式
```

### 2. 自动检查（Git commit 时）

配置 Husky 后，每次 `git commit` 会自动运行 `lint-staged`，对暂存的文件进行：
- ESLint 检查 + 自动修复
- Prettier 格式化

如果检查失败，commit 会被阻止，需要先修复问题。

### 3. 初始化 Husky（首次配置）

```bash
# 在项目根目录执行
cd children-games-frontend
pnpm prepare

# 或手动初始化
npx husky install
```

## 规则说明

### ESLint 规则

#### 前端（Vue 3 + TypeScript）

- **推荐规则集**: `eslint:recommended` + `@typescript-eslint/recommended` + `plugin:vue/recommended`
- **类型检查**: 启用 TypeScript 严格模式检查
- **Vue 特定**:
  - `vue/multi-word-component-names`: off（允许单词组件名）
  - `vue/no-v-html`: warn（警告使用 v-html）
  - `vue/attribute-hyphenation`: error（强制属性使用 kebab-case）
- **通用**:
  - `no-console`: warn（禁止 console.log，允许 console.warn/error）
  - `prefer-const`: error（优先使用 const）
  - `@typescript-eslint/no-explicit-any`: warn（警告使用 any）

#### 后端（Express + TypeScript）

- **推荐规则集**: `eslint:recommended` + `@typescript-eslint/recommended`
- **Node.js 特定**:
  - `no-process-exit`: warn（警告使用 process.exit）
  - `no-throw-literal`: error（禁止抛出字面量）
- **错误处理**:
  - `prefer-promise-reject-errors`: error（Promise reject 必须使用 Error 对象）

### Prettier 规则

```json
{
  "semi": false,              // 不加分号
  "singleQuote": true,        // 使用单引号
  "tabWidth": 2,              // 缩进 2 空格
  "trailingComma": "es5",     // ES5 尾随逗号
  "printWidth": 100,          // 每行最大 100 字符
  "arrowParens": "always",    // 箭头函数总是加括号
  "endOfLine": "lf"           // 使用 LF 换行符
}
```

## 编辑器集成

### VS Code

安装以下扩展：
- ESLint
- Prettier - Code formatter

在 `.vscode/settings.json` 中添加：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

### WebStorm / IntelliJ IDEA

1. **Settings** → **Languages & Frameworks** → **JavaScript** → **Code Quality Tools**
2. 启用 ESLint 和 Prettier
3. 设置 "Run on save"

## 常见问题

### Q: Commit 时被 Husky 阻止怎么办？

A: 运行以下命令修复问题：

```bash
# 前端
cd children-games-frontend
pnpm lint
pnpm format

# 后端
cd children-games-backend
pnpm lint
pnpm format

# 然后重新 add 和 commit
git add .
git commit -m "your message"
```

### Q: 如何临时跳过 Husky 检查？

A: 使用 `--no-verify` 参数（不推荐）：

```bash
git commit -m "your message" --no-verify
```

### Q: ESLint 报错太多怎么办？

A: 可以先运行自动修复：

```bash
pnpm lint          # 自动修复可修复的问题
pnpm lint:check    # 查看剩余问题，手动修复
```

### Q: 如何添加自定义规则？

A: 编辑对应的 `eslint.config.js` 文件，在 `rules` 对象中添加规则。

## 持续改进

建议定期运行完整检查：

```bash
# 前端
cd children-games-frontend
pnpm lint:check && pnpm format:check

# 后端
cd children-games-backend
pnpm lint:check && pnpm format:check
```

## 下一步

- [ ] 配置 CI/CD 自动运行 lint 检查
- [ ] 添加更多 ESLint 规则（根据项目需求）
- [ ] 考虑添加 stylelint（CSS 检查）
