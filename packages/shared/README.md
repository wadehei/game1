# @children-games/shared

儿童游戏乐园共享类型定义包。

## 安装

```bash
# 前端
cd children-games-frontend
pnpm add @children-games/shared@file:../packages/shared

# 后端
cd children-games-backend
pnpm add @children-games/shared@file:../packages/shared
```

## 使用

```typescript
// 导入类型
import type {
  UserInfo,
  GameProgress,
  MemberInfo,
  C2SMessage,
  S2CEvent,
} from '@children-games/shared';

// 使用类型
const user: UserInfo = {
  id: 1,
  nickname: '玩家1',
  avatar: 'avatar1.png',
  level: 5,
  totalStars: 100,
  battleChips: 500,
};

// WebSocket 消息类型
const message: C2SMessage = {
  t: 'move',
  x: 3,
  y: 4,
};
```

## 类型分类

### common.ts - 通用类型
- `GameType` - 游戏类型枚举
- `ApiResponse<T>` - API 响应信封
- `PaginatedResponse<T>` - 分页响应
- `Seat` - 座位号类型
- `RoomPhase` - 房间阶段

### user.ts - 用户类型
- `UserInfo` - 用户基础信息
- `LoginResult` - 登录结果
- `FamilyProfile` - 家庭成员档案
- `CareerGame` - 生涯游戏统计
- `MyCareer` - 我的生涯数据

### game.ts - 游戏类型
- `GameProgress` - 游戏进度
- `DailyTaskInfo` - 每日任务信息
- `AchievementMeta` - 成就元数据
- `AchievementInfo` - 成就信息
- `LeaderboardEntry` - 排行榜条目

### room.ts - 房间类型
- `MemberInfo` - 房间成员信息
- `ChatItem` - 聊天消息
- `VoiceItem` - 语音消息（前端视图）
- `RoomVoice` - 语音消息（后端存储）
- `RoomSnapshot` - 房间信息快照

### ws.ts - WebSocket 类型
- `C2SMessage` - 客户端 → 服务端消息
- `S2CEvent` - 服务端 → 客户端事件
- 各游戏特定消息类型

## 构建

```bash
cd packages/shared
pnpm build
```

## 目录结构

```
packages/shared/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          # 主入口
│   └── types/
│       ├── common.ts     # 通用类型
│       ├── user.ts       # 用户类型
│       ├── game.ts       # 游戏类型
│       ├── room.ts       # 房间类型
│       └── ws.ts         # WebSocket 类型
└── dist/                 # 编译输出
```

## 维护说明

- 所有前后端共享的类型应放在此包中
- 修改类型后需要重新构建：`pnpm build`
- 前后端项目会自动获取最新类型定义
- 避免在此包中引入业务逻辑，仅定义类型

## 注意事项

1. **JSON 字段序列化**：后端返回的 `levelStars` 和 `achievements` 是 JSON 字符串，前端需要解析为对象/数组
2. **可选字段**：注意区分必填和可选字段，避免运行时 undefined 错误
3. **版本更新**：类型变更后建议更新 package.json 版本号
