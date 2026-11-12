# Week 5 SDD 规格说明

> Specification-Driven Development: Spec → Test → Implement

## 生成时间
2026-11-03

## 任务总览

| # | 任务 | 优先级 | 目标 | 预估工时 |
|---|------|--------|------|---------|
| 1 | E2E 端到端测试 | P1 | 核心流程覆盖 | 12h |
| 2 | 双因素认证 (2FA) | P0 | TOTP 验证 | 8h |
| 3 | 操作审计日志 | P1 | 管理员操作追踪 | 6h |
| 4 | 安全扫描 | P2 | 渗透测试 | 4h |
| 5 | 后端 Dockerfile | P1 | 容器化 | 2h |

---

## 任务 1: E2E 端到端测试 (Playwright)

### Spec (规格说明)

**测试文件与场景**：

| 文件 | 场景 | 优先级 |
|------|------|--------|
| `tests/battle.spec.ts` | WebSocket 对战流程 | P0 |
| `tests/leaderboard.spec.ts` | 排行榜展示/刷新 | P1 |
| `tests/daily-task.spec.ts` | 每日任务完成/领奖 | P1 |
| `tests/feedback.spec.ts` | 反馈提交/列表 | P2 |
| `tests/chips.spec.ts` | 积分系统（对战结算） | P0 |
| `tests/admin.spec.ts` | 管理后台操作 | P1 |

**核心测试流程**：

#### battle.spec.ts
```typescript
// 对战流程
1. 用户 A 创建房间
2. 用户 B 加入房间
3. 双方准备就绪
4. 游戏开始
5. 游戏结束（胜利/失败/平局）
6. 积分结算验证
```

#### chips.spec.ts
```typescript
// 积分流程
1. 记录初始积分
2. 完成对战
3. 验证积分变化（胜利 +10，失败 -5）
4. 验证每日救济金
```

#### admin.spec.ts
```typescript
// 管理后台
1. 管理员登录
2. 查看数据概览
3. 用户管理（搜索、修改积分）
4. 关卡配置修改
5. 题库管理
```

### Test (测试标准)

**验收条件**：
1. ✅ 所有测试文件可通过 `npm run test:e2e` 执行
2. ✅ 核心流程（对战、积分）100% 覆盖
3. ✅ 测试报告生成（HTML reporter）
4. ✅ 失败时自动截图

**运行命令**：
```bash
cd children-games-frontend
npm run test:e2e
```

### Implement (实现要求)

**测试结构**：
```typescript
import { test, expect } from '@playwright/test';

test.describe('Battle System', () => {
  test.beforeEach(async ({ page }) => {
    // 登录、进入对战页面
  });

  test('should create room and join', async ({ page }) => {
    // 创建房间
    // 验证房间号
  });
});
```

**注意事项**：
- 使用 test.describe 分组
- beforeEach 处理登录
- 使用 data-testid 选择器
- 等待 WebSocket 连接建立

---

## 任务 2: 双因素认证 (2FA)

### Spec (规格说明)

**依赖安装**：
```bash
cd children-games-backend
npm install otplib qrcode
npm install -D @types/qrcode
```

**数据模型扩展**：
```typescript
// src/models/Admin.ts 或扩展 User.ts
interface AdminAttributes {
  id: number;
  username: string;
  passwordHash: string;
  totpSecret: string | null;      // TOTP 密钥
  twoFactorEnabled: boolean;      // 是否启用 2FA
}
```

**API 设计**：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/admin/2fa/setup | 生成 TOTP 密钥和二维码 |
| POST | /api/admin/2fa/verify | 验证 6 位验证码，绑定 2FA |
| POST | /api/admin/2fa/disable | 解绑 2FA（需密码验证） |
| POST | /api/admin/login | 修改：支持 2FA 验证码 |

**登录流程变更**：
```
原流程：用户名+密码 → JWT Token
新流程：用户名+密码 → 临时 Token → 输入 2FA 验证码 → JWT Token
```

### Test (测试标准)

**单元测试**：
- TOTP 密钥生成正确
- 验证码校验（正确/错误/过期）
- 2FA 绑定/解绑流程
- 登录流程（启用/未启用 2FA）

**验收条件**：
1. ✅ 管理员可绑定 2FA（扫描二维码）
2. ✅ 登录时需输入 6 位验证码
3. ✅ 验证码 30 秒过期
4. ✅ 错误验证码拒绝登录

### Implement (实现要求)

**新增文件**：
- `src/services/twoFactorService.ts` — TOTP 逻辑
- `src/controllers/twoFactorController.ts` — 2FA API
- `src/routes/admin/2fa.ts` — 2FA 路由

**修改文件**：
- `src/models/Admin.ts` — 添加字段
- `src/controllers/adminController.ts` — 登录流程
- `database/init.sql` — 添加字段

**TOTP 配置**：
```typescript
import { authenticator } from 'otplib';

const secret = authenticator.generateSecret();
const token = authenticator.generate(secret);
const isValid = authenticator.verify({ token, secret });
```

---

## 任务 3: 操作审计日志

### Spec (规格说明)

**数据表设计**：
```sql
CREATE TABLE audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admin_id INT NOT NULL,
  action VARCHAR(50) NOT NULL,        -- 'user.update', 'user.delete', 'level.config', etc.
  target_type VARCHAR(50),            -- 'user', 'level', 'question', etc.
  target_id INT,                      -- 被操作对象的 ID
  details JSON,                       -- 操作详情（修改前/后的值）
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_id (admin_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);
```

**审计动作列表**：

| action | 说明 |
|--------|------|
| admin.login | 管理员登录 |
| admin.logout | 管理员登出 |
| user.update | 修改用户信息 |
| user.delete | 删除用户 |
| user.chips.adjust | 调整用户积分 |
| level.config.update | 修改关卡配置 |
| question.create | 创建题目 |
| question.update | 修改题目 |
| question.delete | 删除题目 |
| feedback.reply | 回复反馈 |

**API 设计**：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/admin/audit-logs | 查询审计日志（分页） |
| GET | /api/admin/audit-logs/:id | 查询单条详情 |

**中间件设计**：
```typescript
// src/middleware/auditLog.ts
export function auditLog(action: string) {
  return async (req, res, next) => {
    // 1. 记录原始响应方法
    const originalJson = res.json.bind(res);
    
    // 2. 拦截响应
    res.json = (data) => {
      if (res.statusCode < 400) {
        // 3. 记录审计日志
        await recordAuditLog(req, action, data);
      }
      return originalJson(data);
    };
    
    next();
  };
}
```

### Test (测试标准)

**单元测试**：
- 审计日志记录正确
- 查询分页正常
- 操作详情 JSON 格式正确

**验收条件**：
1. ✅ 管理员操作自动记录审计日志
2. ✅ 可通过 API 查询审计日志
3. ✅ 日志包含操作人、时间、IP、详情
4. ✅ 日志保留 90 天

### Implement (实现要求)

**新增文件**：
- `src/models/AuditLog.ts` — Sequelize 模型
- `src/services/auditLogService.ts` — 审计日志服务
- `src/middleware/auditLog.ts` — 审计中间件

**修改文件**：
- `src/routes/admin.ts` — 应用审计中间件
- `database/init.sql` — 添加表
- `src/controllers/adminController.ts` — 记录详情

---

## 任务 4: 安全扫描

### Spec (规格说明)

**扫描工具**：
- `npm audit` — 依赖漏洞扫描
- `snyk` — 高级安全扫描（可选）
- OWASP ZAP — 渗透测试（可选）

**扫描范围**：
1. npm 依赖漏洞
2. SQL 注入测试
3. XSS 测试
4. CSRF 测试
5. 认证绕过测试
6. 权限提升测试

### Test (测试标准)

**验收条件**：
1. ✅ `npm audit` 无高危漏洞
2. ✅ 安全扫描报告生成
3. ✅ 已知漏洞已修复或有缓解措施

### Implement (实现要求)

**执行命令**：
```bash
cd children-games-backend
npm audit
npm audit fix

# 可选：安装 snyk
npx snyk test
```

**报告格式**：
- 漏洞数量（高危/中危/低危）
- 修复建议
- 缓解措施

---

## 任务 5: 后端 Dockerfile

### Spec (规格说明)

**Dockerfile 内容**：
```dockerfile
# 构建阶段
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

# 生产阶段
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3002
CMD ["node", "dist/app.js"]
```

### Test (测试标准)

**验收条件**：
1. ✅ Docker 镜像构建成功
2. ✅ 容器启动正常
3. ✅ 健康检查通过
4. ✅ 镜像体积 < 200MB

### Implement (实现要求)

**新增文件**：
- `children-games-backend/Dockerfile`
- `children-games-backend/.dockerignore`

**修改文件**：
- `docker-compose.yml` — 确认 backend 服务配置正确

---

## 执行计划

### 并行 Subagent 分配

| Agent | 任务 | 依赖 |
|-------|------|------|
| Agent A | E2E 测试 - 对战/积分 | 无 |
| Agent B | E2E 测试 - 管理/排行榜 | 无 |
| Agent C | 2FA 双因素认证 | 无 |
| Agent D | 审计日志 | 无 |
| Agent E | 安全扫描 + Dockerfile | 无 |

### 验收流程

1. 各 Agent 完成实现
2. 运行测试/构建验证
3. 合并代码
4. 最终安全检查
