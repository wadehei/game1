# 儿童游戏乐园后端 - 优化建议报告

> 生成日期：2026-11-02  
> 分析范围：`src/` 全部源码（约 60 个文件）  
> 优先级定义：P0 = 必须立即修复 | P1 = 近期迭代解决 | P2 = 计划排期 | P3 = 持续改进

---

## P0：关键问题（安全漏洞 + 性能瓶颈）

### P0-1 管理员密码比较存在计时攻击信息泄漏

**文件**: `src/controllers/adminController.ts:55-58`

**问题描述**: `adminLogin` 使用 `timingSafeEqual` 前先用 `actual.length !== expectedBuf.length` 短路判定。攻击者可通过响应时间差异逐字节推测管理员密码长度。

**影响范围**: 管理员登录接口，所有暴露在网络的管理员入口。

**具体建议**:
```typescript
// 修复：统一长度后再比较，泄漏长度不影响实际密码
const actual = Buffer.from(String(password || '').padEnd(expected.length, '\0'), 'utf-8');
const expectedBuf = Buffer.from(expected, 'utf-8');
const safe = crypto.timingSafeEqual(actual, expectedBuf);
if (!safe || actual.length !== expectedBuf.length) {
  throw new UnauthorizedError('密码不正确');
}
```
> 注：更安全的做法是无论密码多长都补到固定最大长度，或在常量时间内完成比较。

**预估工作量**: 0.5h

---

### P0-2 WebSocket 消息缺乏 schema 校验

**文件**: `src/ws/wsServer.ts:278-405`

**问题描述**: WebSocket `message` 事件仅做 `JSON.parse`，除 `ping/ready/rematch/chat/leave/disband` 外所有游戏动作直接路由到 handler。恶意客户端可注入任意字段/类型，handler 内的隐式类型假设可能导致崩溃或逻辑漏洞。

**影响范围**: 全部 WebSocket 游戏（五子棋、 blackjack、UNO、炸金花、画猜、答题、间谍）。

**具体建议**:
1. 为每个游戏 handler 定义 Zod schema（类似 HTTP 路由的 `validateBody`）
2. 在 `default` 分支前加一层校验：
```typescript
const actionSchema = handler.getActionSchema?.(msg.t);
if (actionSchema) {
  const parsed = actionSchema.safeParse(msg);
  if (!parsed.success) {
    send(ws, { t: 'error', message: '无效的操作数据' });
    return;
  }
  msg = parsed.data; // 使用清洗后的数据
}
```

**预估工作量**: 8-12h（每个 handler 1-2h）

---

### P0-3 排行榜缓存服务硬编码游戏列表

**文件**: `src/services/leaderboardCacheService.ts:80-92`

**问题描述**: `invalidateAllLeaderboards` 硬编码了 11 个游戏 ID。新增游戏时极易遗漏更新，导致排行榜数据不一致。且该函数目前未被调用，是死代码。

**影响范围**: 排行榜数据一致性；未来扩展性。

**具体建议**:
- 从 `gameHandlers` 注册表动态读取游戏列表：
```typescript
import { gameHandlers } from '../ws/games/registry';
export const invalidateAllLeaderboards = async (): Promise<void> => {
  for (const gameId of Object.keys(gameHandlers)) {
    await invalidateLeaderboardCache(gameId);
  }
};
```
- 若确认不需要，直接删除此函数。

**预估工作量**: 0.5h

---

### P0-4 `getOverview` 全量加载用户表到内存

**文件**: `src/controllers/adminController.ts:68-115`

**问题描述**: `getOverview` 调用 `User.findAll()` 将全部用户加载到内存后再 filter。随着用户量增长（数千+），内存和 GC 压力显著上升。

**影响范围**: 管理后台看板接口。

**具体建议**: 改用 Sequelize 聚合查询：
```typescript
const [totalUsers, familyCount, todayActive] = await Promise.all([
  User.count(),
  User.count({ where: { openid: { [Op.like]: 'family_%' } } }),
  UserPlaytime.count({ where: { date: today }, group: 'userId' }),
]);
```

**预估工作量**: 2h

---

### P0-5 头像上传限流器 Map 无上限保护

**文件**: `src/routes/avatar.ts:36-56`

**问题描述**: `rateMap` 用 Map 存储每个 IP 的限流状态。虽然有定时器清理过期条目，但高并发下（如 DDoS）不同 IP 数量可能爆炸式增长，导致 OOM。同样的问题存在于 `userController.ts:35` 的 `pinAttempts` Map。

**影响范围**: 头像上传接口、PIN 验证接口。

**具体建议**:
1. 使用 LRU Map（如 `lru-cache` 库）设定上限（如 10000 条）
2. 或迁移到 Redis（已有 `pinProtectionService.ts` Redis 版，但未启用）
3. 作为短期方案，在 `allowRate` 中检查 Map size 并拒绝超限 IP

**预估工作量**: 2-4h

---

## P1：重要改进（架构优化 + 错误处理）

### P1-1 违反不可变性原则（普遍问题）

**涉及文件**: `userController.ts`, `gameController.ts`, `adminController.ts`, `feedbackController.ts`, `levelController.ts` 等

**问题描述**: 代码中大量直接修改 Sequelize 模型实例属性（如 `user.nickname = nickname; await user.save()`），违反了项目规则中要求的不可变模式。虽然 Sequelize 本身是有 Active Record 模式，但可以通过 service 层封装来隔离变更。

**影响范围**: 全局代码质量，调试困难，潜在并发问题。

**具体建议**:
1. 在 service 层引入 `updateUser(user, changes)` 模式，返回新对象
2. Controller 不直接修改 model 属性，改由 service 处理
3. 逐步迁移，优先处理 `updateUserInfo`、`updateGameProgress` 等高频路径

**预估工作量**: 8-16h（分阶段迁移）

---

### P1-2 测试覆盖率极低（< 5%）

**现状**: 仅有 1 个测试文件 `src/__tests__/utils/response.test.ts`，覆盖 3 个工具函数。

**影响范围**: 代码变更无安全网，回归风险高。

**具体建议（按优先级）**:
1. **核心业务逻辑**（P0）:
   - `battleChips.ts` — applyChipDelta 事务重试、grantDailyRelief 去重
   - `achievementService.ts` — evaluateAchievements 判定
   - `dailyTaskService.ts` — updateDailyTask 每日任务
2. **中间件**（P1）:
   - `auth.ts` / `adminAuth.ts` — JWT 验证路径
   - `validate.ts` — Zod 校验错误格式化
   - `errorHandler.ts` — 错误分类处理
3. **Controller**（P2）:
   - `userController.ts` — familyLogin PIN 防爆破逻辑
   - `gameController.ts` — updateGameProgress 事务流
4. **WebSocket**（P3）:
   - `roomManager.ts` — 房间生命周期管理

**目标**: 达到 80% 覆盖率（项目规则要求）

**预估工作量**: 40-60h

---

### P1-3 `wsServer.ts` 过度膨胀（470 行）

**问题描述**: 单个文件承担了 WebSocket 连接管理、消息路由、游戏生命周期、积分结算、重连处理等全部职责。

**影响范围**: 可维护性、可测试性。

**具体建议**: 拆分为：
- `ws/connection.ts` — 连接建立/鉴权/关闭
- `ws/messageRouter.ts` — 消息分发（switch/case → 策略模式）
- `ws/gameLifecycle.ts` — startGame / endGame / restartGame
- `ws/chipSettlement.ts` — settleGameChips 积分结算逻辑
- `ws/wsServer.ts` — 仅保留 initWsServer 入口

**预估工作量**: 6-8h

---

### P1-4 PIN 防爆破内存版与 Redis 版重复实现

**文件**: `src/controllers/userController.ts:35-68` vs `src/services/pinProtectionService.ts`

**问题描述**: `userController` 使用内存 Map 实现 PIN 防爆破，`pinProtectionService` 提供了 Redis 版本但未被使用。两套逻辑不一致（递增惩罚策略不同），维护成本高。

**影响范围**: 安全性、可维护性。

**具体建议**:
1. 统一使用 Redis 版本（`pinProtectionService`），移除内存 Map
2. 或明确标注内存版为唯一实现，删除 Redis 版死代码
3. 统一惩罚策略（当前内存版 5→60s/10→5min/15→30min，Redis 版 5→5min/递增翻倍→1h）

**预估工作量**: 3-4h

---

### P1-5 房间状态纯内存，进程重启全部丢失

**问题描述**: `roomManager.ts` 用 `Map<string, Room>` 管理全部房间。进程崩溃/重启时所有进行中的对局、聊天、语音全部丢失，无任何持久化或恢复机制。

**影响范围**: 用户体验（对战中断）、积分结算（可能已扣/未发）。

**具体建议**:
1. **短期**: 添加房间状态快照（每 N 秒写 Redis），重启后恢复等待中房间
2. **中期**: 积分结算加幂等键（roomId + gameId + round），重启后可补发
3. **长期**: 考虑将关键房间状态存入 Redis，支持多实例共享

**预估工作量**: 短期 4h / 中期 8h / 长期 16h+

---

### P1-6 `backupService.ts` 使用 console.log 而非 logger

**文件**: `src/services/backupService.ts:106-107`

**问题描述**: `initBackupScheduler` 中直接使用 `console.log` / `console.error`，不经过统一的 logger 系统，导致备份日志不写文件、不落盘。

**影响范围**: 运维排障能力。

**具体建议**: 替换为 `logInfo` / `logError`：
```typescript
import { logInfo, logError } from '../utils/logger';
// ...
if (r.ok) logInfo('backup', `每日自动备份完成: ${r.file}`);
else logError('backup', `每日自动备份失败: ${r.error}`);
```

**预估工作量**: 0.5h

---

### P1-7 `setInterval` 定时器泄漏

**涉及文件**: `userController.ts:38`（PIN 清理）、`avatar.ts:48`（IP 清理）、`wsServer.ts:449`（房间清理）

**问题描述**: 多个模块创建 `setInterval` 定时器，但无对应的清理机制。虽然使用了 `.unref()`，但在热重载（nodemon）或测试环境中可能导致定时器堆积。

**影响范围**: 内存泄漏（开发/测试环境）、优雅关闭不完整。

**具体建议**:
1. 将定时器注册到统一的 lifecycle manager
2. 在 `gracefulShutdown` 中统一清除
3. 测试环境中使用 fake timers

**预估工作量**: 2-3h

---

## P2：中等优先级（代码质量 + 测试覆盖）

### P2-1 大量使用 `any` 类型

**涉及文件**: `response.ts:3`（`ApiResponse<T = any>`）、`gameController.ts:258`（`progresses: any[]`）、多处 `t: any`（事务参数）

**问题描述**: 项目规则明确要求避免 `any`，使用 `unknown` 或具体类型。

**具体建议**:
```typescript
// response.ts
export interface ApiResponse<T = unknown> { ... }

// gameController.ts
function computeCareerTotals(
  progresses: GameProgress[],
  timeRows: UserPlaytime[],
  ...
)

// transaction
import { Transaction } from 'sequelize';
fn: (t: Transaction) => Promise<T>
```

**预估工作量**: 3-4h

---

### P2-2 缺少输入验证 schema

**涉及路由**:
- `PUT /api/admin/levels/:gameId/:level` — `saveLevelOverride` 手动验证
- `POST /api/admin/quiz` — `quizCreate` 手动验证（有 schema 但未通过 middleware 使用）
- `POST /api/admin/quiz/import` — `quizImport` 完全无验证

**问题描述**: 部分路由绕过 `validateBody` middleware，在 controller 内手动验证，风格不统一。

**具体建议**: 统一使用 `validateBody(quizSchema)` middleware，确保所有入口有 schema 校验。

**预估工作量**: 2h

---

### P2-3 魔术数字散布各模块

**现状**: `config/constants.ts` 已集中了大部分常量，但仍有遗漏：
- `wsServer.ts:140`: `REMATCH_AUTO_MS` 从 env 读取，默认 30s — 应入 constants
- `roomManager.ts:56-57`: `ROOM_IDLE_MS`、`VOICE_TTL_MS` — 应入 constants
- `avatar.ts:14`: `MAX_SIZE = 2 * 1024 * 1024` — 应入 constants
- `leaderboardCacheService.ts:10`: `LEADERBOARD_CACHE_TTL = 300` — 应入 constants

**预估工作量**: 1h

---

### P2-4 `updateGameProgress` 函数过长（~60 行核心逻辑）

**文件**: `src/controllers/gameController.ts:239-392`

**问题描述**: `upsertGameProgress` + `recalcUserStats` + `processNewAchievements` + `updateGameProgress` 合计约 150 行，事务嵌套复杂。

**具体建议**: 已在一定程度上拆分了子函数，进一步将 Step 1/2/3 提取为独立 service：
- `progressService.upsertProgress(...)`
- `statsService.recalcStats(...)`
- `achievementService.processNew(...)`

**预估工作量**: 4h

---

### P2-5 房间 ID 生成策略可预测

**文件**: `src/ws/roomManager.ts:74-76`

**问题描述**: 房间 ID 为 `1000 + Math.random() * 9000` 的 4 位数字，碰撞概率随房间数增加而上升，且可被猜测。

**具体建议**: 使用 `crypto.randomUUID().slice(0, 8)` 或 nanoid 生成不可预测 ID。

**预估工作量**: 0.5h

---

### P2-6 排行榜缓存无预热机制

**文件**: `src/services/leaderboardCacheService.ts`

**问题描述**: 缓存仅在查询 miss 时填充，首次访问总是慢请求。高并发时可能出现缓存击穿（多个请求同时 miss）。

**具体建议**:
1. 添加缓存预热：服务启动时 / 定时刷新热门游戏排行榜
2. 添加 singleflight 机制：同一 gameId 的并发 miss 只允许一个查询穿透

**预估工作量**: 3h

---

### P2-7 Sequelize `sync()` 不适合生产环境

**文件**: `src/models/index.ts:42-51`

**问题描述**: `initModels` 对每个模型调用 `sync()`，在生产环境可能意外修改表结构。虽然有 `syncMissingColumns` 补齐列的逻辑，但 `sync()` 本身的行为不可预测。

**具体建议**: 生产环境使用 migration 代替 sync；开发环境保留 sync 但加 `alter: true` 显式声明。

**预估工作量**: 16-24h（需编写完整 migration 体系）

---

## P3：低优先级（代码风格 + 文档完善）

### P3-1 日志消息 emoji 使用不一致

**现状**: 部分日志用 emoji（`✅ 数据库连接成功`、`🚀 服务器已启动`），部分不用。生产环境 JSON 日志中 emoji 增加解析复杂度。

**具体建议**: 生产环境日志去除 emoji，仅在开发环境的 console 输出保留。可在 `createLogEntry` 中根据 env 决定是否包含 emoji。

**预估工作量**: 1h

---

### P3-2 缺少 JSDoc 文档

**现状**: 关键函数缺少 JSDoc 注释，如：
- `buildLast7DaysChart`、`computeCareerTotals`（userController.ts）
- `settleGameChips`、`snapshotFor`（wsServer.ts）
- `applyChipDelta`、`grantDailyRelief`（battleChips.ts）

**具体建议**: 为所有导出函数和复杂内部函数添加 JSDoc，说明参数、返回值、副作用。

**预估工作量**: 4-6h

---

### P3-3 API 响应格式与 Swagger 定义不完全一致

**问题描述**: `utils/response.ts` 定义 `ApiResponse<T>` 为 `{ code, message, data? }`，但 Swagger 文档中部分接口使用 `success` 字段。实际代码统一使用 `code`。

**具体建议**: 统一 Swagger 注释与实际响应格式，确保文档与代码一致。

**预估工作量**: 3-4h

---

### P3-4 缺少 API 版本策略

**问题描述**: 所有接口挂在 `/api` 下，无版本前缀。未来 breaking change 时难以并行维护 v1/v2。

**具体建议**: 预留 `/api/v1` 路由前缀，当前接口全部迁移到 v1 下。添加 redirect 中间件兼容旧路径。

**预估工作量**: 2-3h

---

### P3-5 缺少项目 CLAUDE.md / CONTRIBUTING.md

**问题描述**: 项目缺少 AI 辅助开发指引和贡献者指南。

**具体建议**: 
1. 添加 `CLAUDE.md`，说明项目结构、开发规范、测试要求
2. 添加 `CONTRIBUTING.md`，说明 PR 流程、代码规范

**预估工作量**: 2h

---

### P3-6 排行榜日志产生大量 info 级别输出

**文件**: `src/services/leaderboardCacheService.ts:34,51,67`

**问题描述**: 每次缓存命中/未命中/清除都记录 info 日志，高流量时产生大量日志噪声。

**具体建议**: 降级为 `debug` 级别，或仅在 miss 时记录。

**预估工作量**: 0.5h

---

### P3-7 `logger.ts` 中 `logDebug` 的冗余 env 检查

**文件**: `src/utils/logger.ts:95,100`

**问题描述**: `logDebug` 先检查 `NODE_ENV === 'production'` return，后面又检查 `NODE_ENV !== 'production'` 才 console.debug，逻辑冗余。

**具体建议**: 简化为：
```typescript
export const logDebug = (...): void => {
  if (process.env.NODE_ENV === 'production') return;
  const entry = createLogEntry('debug', source, message, detail);
  appBuffer.push(entry);
  console.debug(`[DEBUG][${source}]`, message, detail || '');
  // timer setup...
};
```

**预估工作量**: 0.5h

---

## 汇总统计

| 优先级 | 数量 | 总预估工作量 | 建议完成时间 |
|--------|------|-------------|-------------|
| **P0** | 5 项 | 13-18h | 1-2 周内 |
| **P1** | 7 项 | 62-93h | 1-2 个月内 |
| **P2** | 7 项 | 29-41h | 2-3 个月内 |
| **P3** | 7 项 | 10-15h | 持续改进 |

**总计**: 26 项优化建议，预估总工作量 114-167 小时。

---

## 建议执行路径

1. **第 1 周**（P0 全部）: 修复安全漏洞 + 性能瓶颈
2. **第 2-3 周**（P1 高价值项）: P1-2 测试覆盖 + P1-3 文件拆分 + P1-4 统一 PIN 实现
3. **第 4-6 周**（P1 剩余 + P2）: 架构优化、类型安全、常量整理
4. **持续**（P3）: 穿插在日常开发中逐步完善
