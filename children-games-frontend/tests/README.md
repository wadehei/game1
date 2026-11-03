# E2E 测试指南

本目录包含儿童游戏乐园前端项目的端到端测试。

## 测试文件

| 文件             | 描述                   | 测试用例数 |
| ---------------- | ---------------------- | ---------- |
| `battle.spec.ts` | WebSocket 对战流程测试 | 18         |
| `chips.spec.ts`  | 积分系统测试           | 13         |
| `games.spec.ts`  | 单机游戏功能测试       | 10         |

## 运行测试

### 前置条件

1. 确保后端服务正在运行：

   ```bash
   cd ../children-games-backend
   npm run dev
   ```

2. 确保前端开发服务器正在运行（测试会自动启动，或手动启动）：
   ```bash
   npm run dev
   ```

### 运行命令

```bash
# 运行所有 E2E 测试
npm run test:e2e

# 只运行对战测试
npx playwright test tests/battle.spec.ts

# 只运行积分测试
npx playwright test tests/chips.spec.ts

# 使用 UI 模式运行（可视化调试）
npm run test:e2e:ui

# 查看测试报告
npm run test:e2e:report
```

## 测试覆盖

### battle.spec.ts - 对战系统

1. **房间创建**
   - 用户 A 创建房间 → 验证房间号生成
   - 创建房间后 WebSocket 应连接成功

2. **房间加入**
   - 用户 B 加入房间 → 验证双方就位
   - 验证座位网格显示

3. **准备流程**
   - 房主可以点击准备按钮

4. **游戏状态**
   - 状态栏应显示正确的游戏阶段
   - 游戏操作区应显示正确的按钮

5. **房间功能**
   - 房主可以解散房间
   - 可以退出房间
   - 可以复制邀请链接

6. **不同游戏类型**
   - 可以创建 gomoku/blackjack/zjh/quiz/draw/spy/uno 游戏房间

### chips.spec.ts - 积分系统

1. **基础查询**
   - 记录初始积分
   - 积分显示在个人中心
   - 可以查看对战生涯数据

2. **对战结算**
   - 胜利后积分应增加 +10
   - 失败后积分应减少 -5
   - 积分不应为负数

3. **每日救济金**
   - 每日救济金领取入口
   - 每日救济金领取后积分增加

4. **历史记录**
   - 积分历史记录列表
   - 通过 API 验证历史记录数据

5. **投注明细**
   - 投注明细组件显示

6. **边界情况**
   - 未登录时积分应为 0 或跳转登录
   - 积分显示格式化（无科学计数法）

## data-testid 属性

测试使用 `data-testid` 属性选择元素，主要 testid 包括：

### 对战页面

| testid             | 描述             | 文件                  |
| ------------------ | ---------------- | --------------------- |
| `ws-connected`     | WebSocket 已连接 | room.vue              |
| `ws-connecting`    | WebSocket 连接中 | room.vue              |
| `room-topbar`      | 房间顶栏         | TopBar.vue            |
| `room-id`          | 房间号显示       | TopBar.vue            |
| `exit-btn`         | 退出按钮         | TopBar.vue            |
| `disband-btn`      | 解散按钮         | TopBar.vue            |
| `seats-grid`       | 座位网格         | SeatGrid.vue          |
| `seat-{userId}`    | 座位单元         | SeatGrid.vue          |
| `host-mark`        | 房主标识         | SeatGrid.vue          |
| `status-line`      | 状态栏           | StatusLine.vue        |
| `waiting-text`     | 等待状态文本     | StatusLine.vue        |
| `playing-text`     | 游戏中状态文本   | StatusLine.vue        |
| `over-text`        | 结束状态文本     | StatusLine.vue        |
| `game-actions`     | 操作区           | room.vue              |
| `ready-btn`        | 准备按钮         | room.vue              |
| `cancel-ready-btn` | 取消准备按钮     | room.vue              |
| `resign-btn`       | 认输按钮         | room.vue              |
| `rematch-btn`      | 再来一局按钮     | room.vue              |
| `create-room-btn`  | 创建房间按钮     | battle/index.vue      |
| `join-input`       | 加入房间输入框   | battle/index.vue      |
| `join-btn`         | 加入房间按钮     | battle/index.vue      |
| `game-card-{type}` | 游戏卡片         | battle/index.vue      |
| `result-panel`     | 结果面板         | BattleResultPanel.vue |
| `champ-name`       | 冠军名称         | BattleResultPanel.vue |
| `ranking-rows`     | 排名行           | BattleResultPanel.vue |
| `chips-delta-{i}`  | 积分变化         | BattleResultPanel.vue |
| `bet-ledger`       | 投注明细         | BetLedger.vue         |

## 截图

测试失败时会自动截图，保存在 `tests/screenshots/` 目录。

## 测试报告

HTML 测试报告生成在 `playwright-report/` 目录，可通过以下命令查看：

```bash
npm run test:e2e:report
```

## 注意事项

1. **双用户测试**：完整的对战流程测试需要两个浏览器上下文同时运行，这在某些 CI 环境可能受限。

2. **测试隔离**：每个测试用例使用独立的 localStorage，测试账号会自动创建。

3. **后端依赖**：积分变化测试需要后端 API 支持。如果 `/api/test/simulate-battle` 不存在，测试会降级为 UI 验证模式。

4. **WebSocket**：对战测试依赖 WebSocket 连接，确保后端 WebSocket 服务正常。

## 调试

```bash
# 调试特定测试
npx playwright test tests/battle.spec.ts --debug

# 追踪模式（详细日志）
npx playwright test tests/battle.spec.ts --trace on

# 只运行匹配的测试
npx playwright test -g "房间创建"
```

## CI 集成

GitHub Actions 配置示例：

```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run build &
      - run: npm run test:e2e
```
