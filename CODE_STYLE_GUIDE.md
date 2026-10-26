# 代码规范指南

本文档说明项目的代码规范工具配置与使用方式（包管理器为 **npm**，勿用 pnpm）。

## 配置概览

| 工具 | 用途 | 配置位置 |
| --- | --- | --- |
| ESLint 9 (flat config) | 代码质量检查 | `children-games-{frontend,backend}/eslint.config.js` |
| Prettier 3 | 代码格式化 | `children-games-{frontend,backend}/.prettierrc` |
| Husky 9 | Git hooks | 根目录 `.husky/pre-commit` |
| lint-staged | 只检查暂存文件 | 两端 `package.json` 的 `lint-staged` 字段 |

## 安装与初始化

```bash
# 前端（在 children-games-frontend 内执行；npm install 会自动触发 prepare → husky）
npm install

# 后端同上
npm install
```

`prepare` 脚本带降级守卫：在无 husky 可用的环境（如生产服务器 `npm install --omit=dev`、CI）会跳过而非报错。手动激活钩子：任一子包内执行 `npm run prepare`。

## 常用命令

```bash
# 前端（children-games-frontend）
npm run lint          # ESLint 检查并自动修复
npm run lint:check    # 仅检查（CI 使用，有 error 即失败）
npm run typecheck     # vue-tsc 全量类型检查
npm run test:run      # vitest 单测

# 后端（children-games-backend）
npm run lint
npm run lint:check
npm run build         # tsc 编译（含类型检查）
npm test              # vitest 单测
```

## 规则要点

### Prettier（两端一致）

```json
{
  "singleQuote": true,        // 单引号
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "always",
  "endOfLine": "auto"         // 保留文件现有换行符，不做 CRLF/LF 强转
}
```

> 历史说明：早期配置曾为 `semi: false` + `endOfLine: "lf"`，与全仓分号 + Windows CRLF 现状冲突，产生 3 万余条假 lint 错误；2026-10-25 起改为与现状一致（分号保留、eol auto），`.gitattributes` 已加 `* text=auto` 保证 repo 内存储规范化。

### ESLint 约定

- `prettier/prettier` 通过 `eslint-plugin-prettier/recommended` 接入（配置块必须最后加载）。
- TS 文件关闭 `no-undef` / `no-unused-vars`（交给 tsc / `@typescript-eslint/no-unused-vars`）。
- 宽松为 **warn** 的规则：`no-console`、`no-explicit-any`、`no-non-null-assertion`、`no-process-exist` 等——warn 不阻塞 CI，但建议新代码不要新增。
- 严格为 **error** 的规则：`no-debugger`、`prefer-const`、`no-var`、`no-throw-literal`、`prefer-promise-reject-errors`、`vue/attribute-hyphenation`。
- 后端关闭 `@typescript-eslint/no-empty-object-type`（Sequelize `interface XxxAttributes extends InferAttributes<Xxx> {}` 惯用法）。
- 前端 `.vue` 文件与 TS 文件使用同一套宽松级别；`vue/no-mutating-props` 暂为 warn（对战组件共享 events 袋的既有设计，待类型化批次治理）。

### Git 提交流程

`.husky/pre-commit`（fail-closed）依次在两端运行 `lint-staged`：暂存的 `*.ts`/`*.vue` 会被 ESLint --fix + Prettier 格式化，失败则提交中断。临时跳过（不推荐）：`git commit --no-verify`。

## 编辑器集成（VS Code）

安装 ESLint + Prettier 扩展，`.vscode/settings.json`：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "explicit" }
}
```
