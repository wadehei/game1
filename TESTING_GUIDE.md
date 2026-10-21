# 测试编写指南

## 目录
- [概述](#概述)
- [前端测试](#前端测试)
- [后端测试](#后端测试)
- [测试最佳实践](#测试最佳实践)
- [运行测试](#运行测试)

## 概述

本项目使用以下测试框架：
- **前端**: Vitest + Vue Test Utils
- **后端**: Vitest + Supertest
- **CI/CD**: GitHub Actions

测试文件命名规范：
- 单元测试：`*.test.ts` 或 `*.spec.ts`
- 放置在 `src/__tests__/` 目录下
- 按功能模块组织：`composables/`, `components/`, `utils/`, `controllers/`

## 前端测试

### 1. 工具函数测试

```typescript
// src/__tests__/utils/sound.test.ts
import { describe, it, expect, vi } from 'vitest';
import { soundManager } from '../sound';

describe('soundManager', () => {
  it('should play click sound', () => {
    const playSpy = vi.spyOn(soundManager, 'playClick');
    soundManager.playClick();
    expect(playSpy).toHaveBeenCalled();
  });
});
```

### 2. Composable 测试

```typescript
// src/__tests__/composables/useMemberState.test.ts
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useMemberState } from '../../composables/useMemberState';

describe('useMemberState', () => {
  it('should return member state', () => {
    const members = ref([
      { userId: 1, seat: 0, ready: true },
      { userId: 2, seat: 1, ready: false },
    ]);
    const myId = ref(1);
    const gameType = ref('gomoku');
    const phase = ref('waiting');

    const { memberState } = useMemberState({
      myId, gameType, phase, members,
      game: ref(null),
    });

    expect(memberState(0)).toBe('ready');
  });
});
```

### 3. 组件测试

```typescript
// src/__tests__/components/TopBar.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TopBar from '../../pages/battle/components/TopBar.vue';

describe('TopBar', () => {
  it('renders room id correctly', () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: false,
        copied: false,
      },
    });
    expect(wrapper.text()).toContain('1234');
  });

  it('emits exit event when clicked', async () => {
    const wrapper = mount(TopBar, {
      props: {
        roomId: '1234',
        isHost: false,
        copied: false,
      },
    });
    await wrapper.find('.rt-exit').trigger('click');
    expect(wrapper.emitted('exit')).toBeTruthy();
  });
});
```

## 后端测试

### 1. 工具函数测试

```typescript
// src/__tests__/utils/response.test.ts
import { describe, it, expect, vi } from 'vitest';
import { success, fail } from '../response';
import { Response } from 'express';

describe('response utils', () => {
  let mockRes: Response;

  beforeEach(() => {
    mockRes = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    } as unknown as Response;
  });

  it('should send success response', () => {
    success(mockRes, { id: 1 });
    expect(mockRes.json).toHaveBeenCalledWith({
      code: 200,
      message: 'success',
      data: { id: 1 },
    });
  });
});
```

### 2. Controller 测试

```typescript
// src/__tests__/controllers/userController.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../app';

describe('UserController', () => {
  describe('POST /api/user/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({ username: 'test', password: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.code).toBe(200);
      expect(res.body.data).toHaveProperty('token');
    });

    it('should fail with invalid password', async () => {
      const res = await request(app)
        .post('/api/user/login')
        .send({ username: 'test', password: 'wrong' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe(400);
    });
  });
});
```

### 3. WebSocket 测试

```typescript
// src/__tests__/ws/roomManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createRoom, getRoom } from '../roomManager';

describe('roomManager', () => {
  beforeEach(() => {
    // 清理所有房间
  });

  it('should create a new room', () => {
    const user = { userId: 1, nickname: 'Test', avatar: '' };
    const room = createRoom(user, 'gomoku');
    
    expect(room).toBeDefined();
    expect(room.gameType).toBe('gomoku');
    expect(room.members.size).toBe(1);
  });

  it('should retrieve room by id', () => {
    const user = { userId: 1, nickname: 'Test', avatar: '' };
    const room = createRoom(user, 'gomoku');
    const retrieved = getRoom(room.id);
    
    expect(retrieved).toBe(room);
  });
});
```

## 测试最佳实践

### 1. 测试命名
- 使用描述性的测试名称
- 遵循 "should ... when ..." 模式
- 清晰表达测试意图

```typescript
// ✅ 好的命名
it('should return error when password is too short');
it('should emit exit event when button clicked');

// ❌ 差的命名
it('test1');
it('works');
```

### 2. 测试隔离
- 每个测试独立运行
- 使用 `beforeEach` 清理状态
- 避免测试之间相互依赖

```typescript
describe('counter', () => {
  beforeEach(() => {
    // 重置状态
  });

  it('should increment', () => {
    // 测试代码
  });
});
```

### 3. Mock 外部依赖
- 使用 `vi.mock()` Mock 模块
- 使用 `vi.spyOn()` 监控方法调用
- 避免真实的网络请求和数据库操作

```typescript
// Mock API 调用
vi.mock('@/api/room', () => ({
  fetchRoomList: vi.fn().mockResolvedValue({ rooms: [] }),
}));

// 监控方法
const playSpy = vi.spyOn(soundManager, 'playClick');
expect(playSpy).toHaveBeenCalled();
```

### 4. 测试覆盖率
- 目标：核心功能 80%+ 覆盖率
- 重点测试：业务逻辑、边界条件、错误处理
- 不强制：100% 覆盖率（避免无意义测试）

### 5. 异步测试
- 使用 `async/await`
- 正确处理 Promise
- 使用 `vi.waitFor()` 等待异步操作

```typescript
it('should fetch data', async () => {
  const data = await fetchData();
  expect(data).toBeDefined();
});

it('should wait for update', async () => {
  const wrapper = mount(Component);
  await vi.waitFor(() => {
    expect(wrapper.text()).toContain('loaded');
  });
});
```

## 运行测试

### 前端测试

```bash
# 运行所有测试
npm run test

# 运行测试（单次）
npm run test:run

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行特定测试文件
npx vitest src/__tests__/utils/sound.test.ts

# 监听模式（开发时使用）
npx vitest
```

### 后端测试

```bash
# 运行所有测试
npm run test

# 监听模式
npm run test:watch

# 运行测试并生成覆盖率报告
npm run test:coverage

# 运行特定测试文件
npx vitest src/__tests__/utils/response.test.ts
```

### CI/CD

GitHub Actions 会自动运行测试：
- 推送到 `main` 或 `develop` 分支
- 创建 Pull Request 到这些分支

测试流程：
1. 安装依赖
2. 运行 ESLint 检查
3. 运行 TypeScript 类型检查
4. 运行测试
5. 上传覆盖率报告到 Codecov

## 调试测试

### 前端调试
```bash
# 使用调试器
npx vitest --inspect-brk

# 在 Chrome 中调试
# 打开 chrome://inspect
```

### 后端调试
```bash
# 使用调试器
npx vitest --inspect-brk

# 添加 console.log 调试
it('should work', () => {
  console.log('debug:', data);
  // ...
});
```

## 常见问题

### Q: 测试失败怎么办？
A: 
1. 查看错误信息
2. 检查测试数据
3. 使用 debugger 或 console.log
4. 确认 Mock 是否正确

### Q: 如何测试 WebSocket？
A: 
1. 使用 Mock WebSocket 服务器
2. 测试消息发送和接收
3. 测试连接和断开

### Q: 如何处理异步测试？
A: 
1. 使用 `async/await`
2. 使用 `vi.waitFor()`
3. 返回 Promise

### Q: 测试覆盖率低怎么办？
A: 
1. 识别未测试的代码路径
2. 添加边界条件测试
3. 添加错误处理测试
4. 不要为了覆盖率写无意义测试

## 参考资源

- [Vitest 文档](https://vitest.dev/)
- [Vue Test Utils 文档](https://test-utils.vuejs.org/)
- [Supertest 文档](https://github.com/ladjs/supertest)
- [Testing Library](https://testing-library.com/)
