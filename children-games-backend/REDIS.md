# Redis 集成指南

本项目已集成 Redis，用于提升性能和安全性。Redis 为**可选依赖**，未配置时系统会自动降级到内存/数据库方案。

## 🎯 使用场景

### 1. 排行榜缓存

**目的**：减少数据库查询，提升排行榜接口响应速度

**实现**：
- 缓存 TTL：5 分钟
- 缓存键：`leaderboard:{gameId}`
- 自动失效：用户更新游戏进度后清除对应缓存

**代码位置**：
- `src/services/leaderboardCacheService.ts`
- `src/controllers/gameController.ts` (getLeaderboard)

### 2. PIN 防爆破保护

**目的**：防止恶意尝试 PIN 码，保护用户账户安全

**实现**：
- 最大尝试次数：5 次
- 锁定策略：递增锁定（5分钟 → 10分钟 → 20分钟，最长 1 小时）
- 尝试窗口：15 分钟内累计失败次数

**代码位置**：
- `src/services/pinProtectionService.ts`
- `src/controllers/userController.ts` (verifyPin)

---

## ⚙️ 配置

### 环境变量

在 `.env` 文件中配置：

```bash
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=        # 如果有密码，填写密码
```

### 默认行为

| 配置 | 行为 |
|------|------|
| `REDIS_HOST` 为空 | Redis 禁用，使用内存缓存/数据库 |
| Redis 连接失败 | 自动降级，记录错误日志，不影响服务启动 |
| Redis 可用 | 启用缓存和防爆破保护 |

---

## 🔧 本地开发

### 安装 Redis（可选）

**Windows**：
```bash
# 使用 Docker（推荐）
docker run -d -p 6379:6379 --name redis redis:7-alpine

# 或使用 WSL
sudo apt install redis-server
sudo service redis-server start
```

**macOS**：
```bash
brew install redis
brew services start redis
```

**Linux**：
```bash
sudo apt install redis-server
sudo systemctl start redis-server
```

### 验证连接

```bash
redis-cli ping
# 应返回 PONG
```

---

## 📊 监控与调试

### 查看缓存命中率

在开发环境中，缓存命中会记录日志：

```
✅ 排行榜缓存命中: match3
💾 排行榜已缓存: match3
🗑️  排行榜缓存已清除: match3
```

### 手动清除缓存

```typescript
import { invalidateLeaderboardCache } from './services/leaderboardCacheService';

// 清除特定游戏排行榜
await invalidateLeaderboardCache('match3');
```

### 检查 Redis 状态

```typescript
import { isRedisAvailable } from './utils/redis';

if (isRedisAvailable()) {
  console.log('Redis 可用');
} else {
  console.log('Redis 不可用，使用降级方案');
}
```

---

## 🚀 生产环境部署

### Docker Compose 示例

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3001:3000"
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      - redis
      - mysql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

### 腾讯云/阿里云部署

1. 安装 Redis：
```bash
sudo apt update
sudo apt install redis-server
```

2. 配置密码（编辑 `/etc/redis/redis.conf`）：
```bash
requirepass your_strong_password
```

3. 重启 Redis：
```bash
sudo systemctl restart redis
```

4. 更新 `.env`：
```bash
REDIS_HOST=localhost
REDIS_PASSWORD=your_strong_password
```

---

## 🔄 降级策略

当 Redis 不可用时，系统会自动降级：

| 功能 | Redis 可用 | Redis 不可用 |
|------|-----------|-------------|
| 排行榜缓存 | 5 分钟缓存 | 每次查询数据库 |
| PIN 防爆破 | 分布式计数 | 数据库字段（已有） |
| 性能影响 | 响应时间 < 50ms | 响应时间 200-500ms |

**注意**：降级不影响功能完整性，只影响性能。

---

## 🧪 测试

### 单元测试

```bash
npm test -- redis
```

### 集成测试

1. 启动 Redis
2. 运行测试：
```bash
npm test
```

3. 检查覆盖率：
```bash
npm run test:coverage
```

---

## 📚 相关文档

- [Redis 官方文档](https://redis.io/docs/)
- [Node Redis 客户端](https://github.com/redis/node-redis)
- [项目部署指南](../DEPLOY.md)

---

## 🐛 常见问题

### Q: Redis 连接失败怎么办？

A: 系统会自动降级，使用内存/数据库方案。检查日志：
```
⚠️  Redis 未配置，将使用内存缓存
或
Redis 连接失败，将使用内存缓存
```

### Q: 如何禁用 Redis？

A: 在 `.env` 中设置 `REDIS_HOST=`（留空）即可。

### Q: Redis 密码如何设置？

A: 编辑 Redis 配置文件，添加 `requirepass your_password`，然后在 `.env` 中配置 `REDIS_PASSWORD=your_password`。

### Q: 排行榜缓存不更新？

A: 缓存 TTL 为 5 分钟，或手动调用 `invalidateLeaderboardCache(gameId)` 清除。
