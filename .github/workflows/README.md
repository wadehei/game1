# GitHub Actions Workflows

本项目配置了完整的 CI/CD 流程，包括自动化测试、构建和部署。

## 📋 Workflows 列表

### 1. CI (持续集成)

**触发条件：**
- Push 到 `main` 或 `develop` 分支
- Pull Request 到 `main` 或 `develop` 分支

**执行步骤：**
1. 构建共享包 (`packages/shared`)
2. 前端测试（lint、类型检查、单元测试、覆盖率）
3. 后端测试（lint、类型检查、单元测试、覆盖率）
4. 构建验证（仅在 push 时）
5. 上传覆盖率报告到 Codecov

**Node 版本：** 18.x, 20.x

### 2. Deploy (部署)

**触发条件：**
- CI workflow 在 `main` 分支成功后自动触发
- 手动触发（workflow_dispatch）

**执行步骤：**
1. 构建共享包、前端、后端
2. 通过 SCP 上传前端静态文件
3. 通过 SCP 上传后端编译文件
4. 同步后端依赖
5. 重启 PM2 服务

---

## 🔐 配置 Secrets

部署 workflow 需要配置以下 GitHub Secrets：

### 服务器信息

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `SERVER_HOST` | 服务器 IP 或域名 | `49.232.231.35` |
| `SERVER_USERNAME` | SSH 用户名 | `root` |
| `SSH_PRIVATE_KEY` | SSH 私钥（用于免密登录） | 见下方生成方法 |

### 部署路径

| Secret 名称 | 说明 | 示例 |
|------------|------|------|
| `FRONTEND_PATH` | 前端部署路径 | `/home/songshaohui/children-games/frontend` |
| `BACKEND_PATH` | 后端部署路径 | `/home/songshaohui/children-games/backend/dist` |
| `PM2_APP_NAME` | PM2 应用名称 | `children-games-api` |

---

## 🔑 生成 SSH 密钥

### 1. 在本地生成密钥对

```bash
ssh-keygen -t ed25519 -C "github-actions"
```

- 保存路径建议使用 `~/.ssh/github_actions`
- 密码留空（自动化使用）

### 2. 添加公钥到服务器

```bash
# 将公钥内容追加到服务器的 authorized_keys
cat ~/.ssh/github_actions.pub | ssh root@49.232.231.35 "cat >> ~/.ssh/authorized_keys"
```

### 3. 添加私钥到 GitHub Secrets

```bash
# 复制私钥内容（包括 BEGIN 和 END 行）
cat ~/.ssh/github_actions
```

在 GitHub 仓库：
- Settings → Secrets and variables → Actions
- 点击 "New repository secret"
- Name: `SSH_PRIVATE_KEY`
- Value: 粘贴私钥内容

---

## 📊 查看运行状态

### 在 GitHub 查看

1. 进入仓库页面
2. 点击 "Actions" 标签
3. 选择对应的 workflow 查看运行详情

### 徽章（可选）

在 README.md 中添加状态徽章：

```markdown
![CI](https://github.com/wadehei/game1/actions/workflows/ci.yml/badge.svg)
![Deploy](https://github.com/wadehei/game1/actions/workflows/deploy.yml/badge.svg)
```

---

## 🛠️ 手动触发部署

如果需要手动触发部署（不等待 CI 完成）：

1. 进入 Actions 页面
2. 左侧选择 "Deploy" workflow
3. 右侧点击 "Run workflow"
4. 选择分支（默认 main）
5. 点击 "Run workflow" 按钮

---

## 📝 Workflow 自定义

### 修改 CI 触发条件

编辑 `.github/workflows/ci.yml`：

```yaml
on:
  push:
    branches: [main, develop, 'feature/*']  # 添加更多分支
  pull_request:
    branches: [main]  # 仅在 PR 到 main 时触发
```

### 添加测试覆盖率要求

在 CI workflow 中添加覆盖率检查：

```yaml
- name: Check coverage threshold
  run: |
    npm run test:coverage
    # 检查覆盖率是否达到 80%
    node -e "const cov = require('./coverage/coverage-summary.json'); if (cov.total.lines.pct < 80) process.exit(1)"
```

### 添加 Slack 通知

在 Deploy workflow 末尾添加：

```yaml
- name: Notify Slack
  if: success()
  uses: slackapi/slack-github-action@v1.26.0
  with:
    payload: |
      {
        "text": "✅ Deployment successful: ${{ github.repository }}@${{ github.ref_name }}"
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

---

## 🐛 常见问题

### Q: CI 失败但本地正常？

A: 检查以下几点：
- Node 版本差异（CI 使用 18.x 和 20.x）
- 环境变量缺失（CI 环境没有本地 .env）
- 依赖版本不一致（使用 `npm ci` 而非 `npm install`）

### Q: 部署失败 "Permission denied"？

A: 检查：
- SSH 私钥格式正确（包含 BEGIN/END 行）
- 服务器公钥已添加到 `~/.ssh/authorized_keys`
- SSH 端口正确（默认 22）

### Q: 如何跳过自动部署？

A: 在 commit message 中添加 `[skip ci]`：

```bash
git commit -m "docs: update README [skip ci]"
```

---

## 📚 相关文档

- [GitHub Actions 文档](https://docs.github.com/en/actions)
- [部署指南](../DEPLOY.md)
- [命令参考](../COMMANDS.md)
