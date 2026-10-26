# GitHub Actions Workflows

## CI（ci.yml）

**触发条件：** push 到 `main`/`develop`，或向其发 PR。

两个独立 job：

| Job | 步骤 |
| --- | --- |
| **Frontend** | `npm ci` → `lint:check` → `typecheck`（vue-tsc）→ `test:run`（vitest）→ `build`（vite） |
| **Backend** | `npm ci` → `lint:check` → `build`（tsc）→ `test`（vitest） |

单机单版本（Node 20.x）。后端单测不依赖 MySQL/Redis（仅纯函数用例）；协议回归（`tests/ws-*.mjs`）需要真实服务与数据库，属于本地手动回归套件，不在 CI 内。

## 部署为什么不在 CI 里

实际部署走仓库根目录的 `deploy.sh`（本地构建 → tar 管道 SSH 上传 → pm2 重启，详见 `COMMANDS.md`「一键部署」）。此前的 GitHub Actions 部署 workflow 属于未验证的摆设（服务器侧安装依赖会因工作区布局差异失败），已删除。若将来要迁移到 Actions 部署，需先解决：

1. 服务器上的 `npm install --omit=dev`（生产目录不含 git 与 devDependencies，注意 `prepare` 脚本已做降级守卫）；
2. 部署机 secrets（SSH key、路径、PM2 应用名）；
3. 与 `deploy.sh` 的「后端必须解压到 `backend/dist/`、PM2 root 启动」约定保持一致。
