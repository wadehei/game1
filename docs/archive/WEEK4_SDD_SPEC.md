# Week 4 SDD 规格说明

> Specification-Driven Development: Spec → Test → Implement

## 生成时间
2026-11-03

## 任务总览

| # | 任务 | 优先级 | 目标 |
|---|------|--------|------|
| 1 | 后端单元测试 | P0 | 覆盖率 2% → 80% |
| 2 | 前端组件测试 | P1 | 覆盖率 10% → 60% |
| 3 | Sentry 错误监控 | P0 | 前后端接入 |
| 4 | 慢查询 + Redis 监控 | P1 | 数据库/缓存可观测 |
| 5 | Swagger API 文档 | P2 | 路由注解覆盖率 > 80% |

---

## 任务 1: 后端单元测试覆盖率 → 80%

### Spec (规格说明)

**目标文件与测试要求**：

| 模块 | 文件路径 | 测试类型 | 最低用例数 | 覆盖场景 |
|------|----------|----------|------------|----------|
| auth middleware | `src/middleware/auth.ts` | 单元 | 10 | JWT 验证、Token 过期、无效 Token、权限检查 |
| adminAuth middleware | `src/middleware/adminAuth.ts` | 单元 | 8 | 管理员验证、Session 检查 |
| userController | `src/controllers/userController.ts` | 单元 | 20 | 登录、注册、PIN 验证/防爆破、生涯数据 |
| wsServer | `src/services/wsServer.ts` | 单元 | 15 | 连接管理、房间 CRUD、消息分发、断线重连 |
| gameController | `src/controllers/gameController.ts` | 单元 | 10 | 游戏启动、进度保存、结算 |
| adminController | `src/controllers/adminController.ts` | 单元 | 10 | 数据概览、用户管理、反馈处理 |
| leaderboardCacheService | `src/services/leaderboardCacheService.ts` | 单元 | 8 | 缓存读写、失效、重建 |
| battleChips | `src/utils/battleChips.ts` | 单元 | 8 | 积分计算、结算逻辑 |
| errorHandler | `src/middleware/errorHandler.ts` | 单元 | 6 | 错误分类、响应格式 |
| validate | `src/middleware/validate.ts` | 单元 | 6 | 请求参数校验 |

**测试文件命名规范**：
- 单元测试：`tests/unit/{moduleName}.test.ts`
- 集成测试：`tests/integration/{routeName}.test.ts`

**Mock 策略**：
- 数据库：使用 `vi.mock()` mock Sequelize models
- Redis：mock `ioredis` 方法
- JWT：使用真实 `jsonwebtoken` 生成测试 Token

### Test (测试标准)

**覆盖率要求**：
- 语句覆盖 (Statements): ≥ 80%
- 分支覆盖 (Branches): ≥ 75%
- 函数覆盖 (Functions): ≥ 80%
- 行覆盖 (Lines): ≥ 80%

**验收命令**：
```bash
cd children-games-backend
npm run test:coverage
# 输出覆盖率报告，检查上述指标
```

**关键测试场景**：
1. auth middleware：Token 缺失/过期/伪造 → 返回 401
2. userController PIN 防爆破：连续 5 次失败 → 锁定 15 分钟
3. wsServer：房间满员后加入 → 返回错误
4. 积分结算：胜利/失败/平局 → 正确计算金币变化

### Implement (实现要求)

**测试结构**：
```typescript
describe('ModuleName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('functionName', () => {
    it('should ... when ...', async () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

**禁止事项**：
- ❌ 不使用真实数据库连接
- ❌ 不测试第三方库内部实现
- ❌ 不写依赖执行顺序的测试

---

## 任务 2: 前端组件测试 → 60%

### Spec (规格说明)

**目标文件与测试要求**：

| 类型 | 文件/目录 | 测试要求 |
|------|-----------|----------|
| pages | `src/pages/HomePage.vue` | 渲染、路由跳转、API 调用 |
| pages | `src/pages/LoginPage.vue` | 表单验证、登录流程 |
| pages | `src/pages/GamePage.vue` | 游戏初始化、状态管理 |
| components | `src/components/GameCard.vue` | props 渲染、点击事件 |
| components | `src/components/UserInfo.vue` | 用户信息展示 |
| components | `src/components/PinInput.vue` | PIN 输入、验证回调 |
| api | `src/api/user.ts` | API 函数返回格式 |
| api | `src/api/game.ts` | API 函数返回格式 |
| store | `src/store/user.ts` | Pinia 状态管理 |
| store | `src/store/game.ts` | Pinia 状态管理 |
| composables | `src/composables/useWebSocket.ts` | WS 连接、消息处理 |
| composables | `src/composables/useCountdown.ts` | 倒计时逻辑 |

**测试文件命名**：`src/__tests__/{type}/{FileName}.test.ts`

### Test (测试标准)

**覆盖率要求**：
- 文件覆盖率: ≥ 60%（42/69 文件）
- 关键组件: 100% 覆盖（LoginPage, UserInfo, PinInput）

**验收命令**：
```bash
cd children-games-frontend
npm run test:coverage
```

**关键测试场景**：
1. LoginPage：输入错误密码 → 显示错误提示
2. PinInput：输入 6 位 PIN → 触发提交回调
3. useWebSocket：连接断开 → 自动重连

### Implement (实现要求)

**组件测试模板**：
```typescript
import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import Component from '@/components/Component.vue';

describe('Component', () => {
  it('renders correctly', () => {
    const wrapper = mount(Component, {
      props: { /* ... */ }
    });
    expect(wrapper.text()).toContain('expected');
  });
});
```

**Mock 策略**：
- API：`vi.mock('@/api/...')`
- Router：`vi.mock('vue-router')`
- Store：使用 `createPinia()` + `setActivePinia()`

---

## 任务 3: Sentry 错误监控接入

### Spec (规格说明)

**后端接入**：
```typescript
// src/utils/sentry.ts
import * as Sentry from '@sentry/node';

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
    ],
  });
}
```

**前端接入**：
```typescript
// src/utils/sentry.ts
import * as Sentry from '@sentry/vue';

export function initSentry(app, router) {
  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      new Sentry.BrowserTracing({ router }),
    ],
    tracesSampleRate: 0.1,
  });
}
```

**错误捕获范围**：
- 未捕获异常 (uncaughtException)
- 未处理 Promise 拒绝 (unhandledRejection)
- Express 错误中间件
- WebSocket 错误
- Vue 组件错误 (errorHandler)

### Test (测试标准)

**验收条件**：
1. ✅ `npm install @sentry/node @sentry/vue` 成功
2. ✅ 后端 `Sentry.init()` 在 app.ts 顶部调用
3. ✅ 前端 `Sentry.init()` 在 main.ts 调用
4. ✅ 环境变量 `SENTRY_DSN` 配置在 `.env.example`
5. ✅ 手动抛出错误 → Sentry 后台收到

### Implement (实现要求)

**文件变更清单**：
- `children-games-backend/package.json` — 添加依赖
- `children-games-backend/src/utils/sentry.ts` — 新建
- `children-games-backend/src/app.ts` — 初始化 Sentry
- `children-games-frontend/package.json` — 添加依赖
- `children-games-frontend/src/utils/sentry.ts` — 新建
- `children-games-frontend/src/main.ts` — 初始化 Sentry
- `.env.example` — 添加 SENTRY_DSN 占位

---

## 任务 4: 慢查询日志 + Redis 监控

### Spec (规格说明)

**慢查询日志**：
```typescript
// src/config/database.ts
export const sequelize = new Sequelize({
  // ...
  benchmark: true,
  logging: (sql, time) => {
    if (time > SLOW_QUERY_THRESHOLD) {
      logWarn(`Slow query (${time}ms): ${sql}`);
    }
  },
});
```

**Redis 监控**：
```typescript
// src/services/redisMonitor.ts
export class RedisMonitor {
  private hits = 0;
  private misses = 0;
  private latencySum = 0;

  recordHit(latency: number) { /* ... */ }
  recordMiss(latency: number) { /* ... */ }
  getStats() { /* hitRate, avgLatency */ }
}
```

**监控指标**：
| 指标 | 阈值 | 告警方式 |
|------|------|----------|
| 慢查询 (>1s) | >10次/分钟 | 日志 WARN |
| Redis 命中率 | <80% | 日志 WARN |
| Redis 延迟 | >100ms | 日志 WARN |

### Test (测试标准)

**验收条件**：
1. ✅ Sequelize `benchmark: true` 配置生效
2. ✅ 慢查询 (>1s) 被记录到 `logs/slow-query-YYYY-MM-DD.log`
3. ✅ Redis 命中率统计可通过 API 查询：`GET /admin/redis-stats`
4. ✅ 监控数据按分钟聚合，保留 1 小时

### Implement (实现要求)

**新增文件**：
- `src/services/redisMonitor.ts` — Redis 监控类
- `src/routes/admin.ts` — 添加 `/admin/redis-stats` 端点

**修改文件**：
- `src/config/database.ts` — 添加 benchmark 和慢查询检测
- `src/utils/redis.ts` — 集成 RedisMonitor

---

## 任务 5: Swagger API 文档完善

### Spec (规格说明)

**路由注解格式**：
```typescript
/**
 * @swagger
 * /api/user/login:
 *   post:
 *     summary: 用户登录
 *     tags: [User]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: 认证失败
 */
```

**目标路由文件**：
| 文件 | 端点数 | 优先级 |
|------|--------|--------|
| `routes/user.ts` | 10 | P0 |
| `routes/game.ts` | 8 | P0 |
| `routes/admin.ts` | 6 | P1 |
| `routes/room.ts` | 5 | P1 |
| `routes/feedback.ts` | 3 | P2 |
| `routes/level.ts` | 2 | P2 |
| `routes/avatar.ts` | 2 | P2 |
| `routes/voice.ts` | 2 | P2 |
| `routes/logs.ts` | 1 | P2 |

### Test (测试标准)

**验收条件**：
1. ✅ 访问 `/api-docs` 显示完整 API 列表
2. ✅ 每个端点有 summary、description、parameters、responses
3. ✅ 路由注解覆盖率 > 80%（39/49 端点）
4. ✅ Schema 引用正确，无 undefined 错误

### Implement (实现要求)

**注释位置**：路由文件中的 router.get/post/put/delete 前一行

**Tags 分类**：
- User — 用户相关
- Game — 游戏相关
- Admin — 管理后台
- Room — 房间管理
- Feedback — 用户反馈
- Level — 关卡进度
- Avatar — 头像管理
- Voice — 语音管理

---

## 执行计划

### 并行 Subagent 分配

| Agent | 任务 | 依赖 |
|-------|------|------|
| Agent A | 后端测试 (auth + middleware) | 无 |
| Agent B | 后端测试 (controllers) | 无 |
| Agent C | 后端测试 (services + utils) | 无 |
| Agent D | 前端测试 (pages + components) | 无 |
| Agent E | 前端测试 (api + store + composables) | 无 |
| Agent F | Sentry 接入 | 无 |
| Agent G | 慢查询 + Redis 监控 | 无 |
| Agent H | Swagger 文档 | 无 |

### 验收流程

1. 各 Agent 完成实现
2. 运行测试/构建验证
3. 合并代码
4. 最终覆盖率检查
