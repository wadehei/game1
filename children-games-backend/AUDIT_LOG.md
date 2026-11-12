# 管理员操作审计日志系统

## 概述

审计日志系统自动记录所有管理员操作到 `audit_logs` 表，用于安全审计和问题追踪。

## 功能特性

- ✅ **自动记录**：所有管理员操作自动记录，无需手动调用
- ✅ **详细信息**：记录操作人、时间、IP 地址、User-Agent、操作详情
- ✅ **分页查询**：提供 API 查询接口，支持按动作类型、时间范围过滤
- ✅ **自动清理**：每日凌晨 4:00 自动清理 90 天前的日志
- ✅ **异步写入**：日志写入不阻塞主业务流程
- ✅ **错误容错**：日志写入失败不影响业务执行

## 审计动作列表

| 动作标识 | 说明 | 目标类型 |
|---------|------|---------|
| `admin.login` | 管理员登录 | - |
| `user.update` | 修改用户信息 | user |
| `user.delete` | 删除用户 | user |
| `user.chips.adjust` | 调整积分 | user |
| `user.reset` | 重置用户进度 | user |
| `user.pin.clear` | 清除用户口令 | user |
| `level.config.update` | 修改关卡配置 | level |
| `level.config.delete` | 删除关卡配置 | level |
| `question.create` | 创建题目 | question |
| `question.update` | 更新题目 | question |
| `question.delete` | 删除题目 | question |
| `question.import` | 批量导入题目 | - |
| `feedback.update` | 更新反馈 | feedback |
| `feedback.reply` | 回复反馈 | feedback |
| `settings.update` | 修改系统配置 | - |
| `logs.view` | 查看错误日志 | - |
| `logs.clear` | 清空错误日志 | - |
| `backup.download` | 下载数据库备份 | - |

## 数据表结构

```sql
CREATE TABLE audit_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  admin_id INT NOT NULL DEFAULT 0 COMMENT '管理员ID',
  action VARCHAR(50) NOT NULL COMMENT '审计动作',
  target_type VARCHAR(50) COMMENT '目标类型: user, level, question, feedback, settings',
  target_id INT COMMENT '目标ID',
  details JSON COMMENT '操作详情（请求参数、变更内容等）',
  ip_address VARCHAR(45) COMMENT '客户端IP地址',
  user_agent TEXT COMMENT '客户端User-Agent',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  INDEX idx_admin_id (admin_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);
```

## API 接口

### 查询审计日志

**请求**：
```http
GET /api/admin/audit-logs?page=1&limit=20&action=user.delete&startDate=2026-10-01&endDate=2026-11-03
Authorization: Bearer <admin_token>
```

**参数**：
- `page` (可选): 页码，默认 1
- `limit` (可选): 每页数量，默认 20，最大 100
- `action` (可选): 按动作类型过滤
- `startDate` (可选): 开始日期 YYYY-MM-DD
- `endDate` (可选): 结束日期 YYYY-MM-DD

**响应**：
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "id": 123,
        "adminId": 1,
        "action": "user.delete",
        "targetType": "user",
        "targetId": 456,
        "details": {
          "body": {},
          "params": { "id": "456" },
          "query": {}
        },
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0 ...",
        "createdAt": "2026-11-03T10:30:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

## 中间件使用

### 基本用法

```typescript
import { auditLog } from '../middleware/auditLog';

// 简单用法：只记录动作
router.post('/login', auditLogin(), adminLogin);

// 完整用法：记录动作 + 目标信息 + 详细信息
router.put('/users/:id',
  adminMiddleware,
  auditLog('user.update', {
    extractTarget: (req) => ({
      targetType: 'user',
      targetId: Number(req.params.id)
    }),
    extractDetails: (req) => ({
      changes: req.body,
      reason: req.body.reason || '无'
    })
  }),
  updateUser
);
```

### 中间件参数

- `action`: 审计动作标识（必填）
- `options.extractTarget`: 从请求中提取目标类型和ID（可选）
- `options.extractDetails`: 从请求中提取详细信息（可选，默认记录 body、params、query）

## 日志清理策略

- **保留期限**：90 天
- **清理频率**：每日凌晨 4:00
- **清理方式**：自动删除 90 天前的记录
- **调度器**：`src/services/auditLogCleanup.ts`

## 文件清单

```
src/
├── models/
│   └── AuditLog.ts                 # 审计日志模型
├── services/
│   ├── auditLogService.ts          # 审计日志服务
│   └── auditLogCleanup.ts          # 日志清理调度器
├── middleware/
│   └── auditLog.ts                 # 审计中间件
├── controllers/
│   └── auditLogController.ts       # 审计日志控制器
└── routes/
    └── admin.ts                    # 管理员路由（已应用审计中间件）

database/
└── migrations/
    └── 20261103_create_audit_logs.sql  # 数据库迁移脚本
```

## 部署说明

### 1. 执行数据库迁移

```bash
mysql -u root -p children_games < database/migrations/20261103_create_audit_logs.sql
```

### 2. 启动应用

```bash
npm run build
npm start
```

应用启动时会自动：
- 创建 `audit_logs` 表（如果不存在）
- 启动日志清理调度器（每日 4:00 清理）

### 3. 验证审计日志

登录管理后台，执行一些操作（如修改用户信息），然后查询审计日志：

```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/admin/audit-logs?limit=10"
```

## 注意事项

1. **性能优化**：
   - 日志写入采用异步方式，不阻塞主业务
   - 表上已创建索引（admin_id, action, created_at）优化查询

2. **安全考虑**：
   - 审计日志查询接口需要管理员权限
   - 日志中包含请求参数，可能包含敏感信息，注意访问控制

3. **存储管理**：
   - 默认保留 90 天，可根据需要调整 `cleanupExpiredAuditLogs` 函数
   - 建议定期备份重要审计日志

## 后续扩展

- [ ] 实现管理员表后，将 `adminId` 关联到真实管理员
- [ ] 添加审计日志导出功能（CSV/Excel）
- [ ] 添加审计日志统计报表（按动作类型、时间维度）
- [ ] 添加异常操作告警（如批量删除、频繁登录失败）
