# 儿童游戏乐园 🎮

专为5岁儿童设计的手机小游戏合集，包含5款益智游戏，支持闯关升级模式。

## 🎯 游戏列表

| 游戏 | 类型 | 关卡数 | 描述 |
|------|------|--------|------|
| 🧠 记忆翻牌 | 益智 | 20关 | 锻炼记忆力，配对相同图案 |
| 🍎 接水果 | 反应 | 30关 | 手眼协调，接住掉落的水果 |
| 🧩 拼图游戏 | 益智 | 25关 | 空间认知，完成拼图挑战 |
| 🎈 打气球 | 射击 | 30关 | 漫画风格，点击射击上升的气球 |
| 🚀 坦克大战 | 射击 | 25关 | 漫画风格，击败敌方坦克 |
| 🐹 打地鼠 | 反应 | 20关 | 反应力+自控力，高关卡忍住不打小兔子 |
| 🎵 音乐记忆 | 益智 | 15关 | 听觉+视觉工作记忆，跟着音块重复序列 |
| 👾 数学小怪兽 | 数学启蒙 | 20关 | 数感培养，数数到10以内加法 |

## 🛠️ 技术栈

### 前端
- **框架**: Vue 3 + TypeScript
- **路由**: Vue Router 4（hash 模式）
- **状态管理**: Pinia
- **构建工具**: Vite

### 后端
- **运行时**: Node.js + Express
- **语言**: TypeScript
- **数据库**: MySQL (Sequelize ORM)

## 📁 项目结构

```
children-games-frontend/     # 前端项目
├── src/
│   ├── pages/              # 页面
│   │   ├── index/          # 游戏大厅
│   │   ├── user/           # 个人中心
│   │   ├── memory/         # 记忆翻牌
│   │   ├── fruit/          # 接水果
│   │   ├── puzzle/         # 拼图游戏
│   │   ├── balloon/        # 打气球
│   │   └── tank/           # 坦克大战
│   ├── components/         # 公共组件
│   ├── store/              # Pinia 状态管理
│   ├── api/                # API 接口
│   ├── utils/              # 工具函数
│   └── static/             # 静态资源

children-games-backend/      # 后端项目
├── src/
│   ├── config/             # 配置文件
│   ├── models/             # 数据模型
│   ├── routes/             # 路由
│   ├── controllers/        # 控制器
│   ├── middleware/         # 中间件
│   └── utils/              # 工具函数
```

## 🚀 快速开始

### 环境要求
- Node.js >= 16
- MySQL >= 5.7
- Redis >= 6.0 (可选)

### 后端启动

```bash
cd children-games-backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填写数据库配置

# 创建数据库
mysql -u root -p
CREATE DATABASE children_games CHARACTER SET utf8mb4;

# 同步数据表
npm run dev

# 初始化关卡配置（新窗口）
npx ts-node src/seed.ts
```

### 前端启动

```bash
cd children-games-frontend

# 安装依赖
npm install

# H5 开发模式
npm run dev:h5

# 微信小程序开发模式
npm run dev:mp-weixin
```

### 访问地址
- H5: http://localhost:8080
- 后端 API: http://localhost:3000

## 📱 功能特性

### 用户系统
- 家庭角色系统：妈妈/儿子各建角色（昵称 + Emoji 形象），免密一键切换
- 用户等级系统（每 15 颗星升一级）
- 星星收集系统（按关卡累计星级）

### 家庭对战
- 每个游戏大厅卡片可查看 🏆 家庭排行榜（自动按计分方向排序：分数类高者胜，步数/用时类少者胜）
- 数学小怪兽统计通关用时，全家比快慢
- 选角色页即家庭总榜（按总星星排名）

### 游戏系统
- 关卡进度保存 + 续关
- 选关重玩（关卡数字可点击）
- 最高分记录
- 星级评价（1-3 星，每关独立记录）
- 成就系统（9 枚，自动判定 + 解锁提示）

### 成长系统
- 每日任务（玩 3 个不同游戏，自动发 10 ⭐）
- 经验升级
- 排行榜

### 家长功能
- **家长后台**（`/#/admin`，密码登录，PC/手机自适应）：
  - 数据看板：家庭成员、总星星、今日游玩时长、最近游玩动态
  - 角色管理：改名、换形象、重置进度、删除（含历史游客清理）
  - **关卡难度配置**：按游戏/关卡覆盖难度参数（时限、数量、速度等），孩子端重进关卡即生效；删除配置恢复内置默认
  - 护眼策略：全局默认提醒间隔（服务端下发，全设备生效）
  - 数据备份：一键导出全部业务数据为 .sql
- 家长中心（两位数加法门禁，孩子进不去）
- 护眼提醒：连续游玩后全屏休息 20 秒（间隔可在后台调整）
- 支持添加到手机主屏幕（PWA），游戏中屏幕不自动休眠

## 🎨 游戏设计原则

1. **大按钮设计**: 最小 80x80px，适合儿童触摸
2. **鲜艳色彩**: 高饱和度配色，吸引注意力
3. **即时反馈**: 每次操作都有音效/动画反馈
4. **无失败压力**: 鼓励为主，避免挫败感
5. **简单规则**: 最多2步操作，易于理解
6. **漫画风格**: 可爱卡通形象，适合儿童

## 🔧 开发计划

### 第一阶段（已完成）
- [x] 项目架构搭建
- [x] 用户系统
- [x] 游戏大厅
- [x] 5个游戏核心玩法

### 第二阶段（已完成）
- [x] 音效添加（Web Audio 合成，零音频文件）
- [x] 动画优化
- [x] 选关 / 续关

### 第三阶段（进行中）
- [x] 家长控制功能（护眼提醒 + 家长中心）
- [x] 成就系统
- [ ] 多人对战模式
- [ ] 数据备份恢复

## 📝 API 文档

### 用户相关
- `POST /api/user/login/wx` - 微信登录
- `POST /api/user/login/family` - 家庭角色登录（免密）
- `GET /api/user/profiles` - 家庭成员列表
- `POST /api/user/login/test` - 测试登录（开发环境）
- `GET /api/user/info` - 获取用户信息
- `PUT /api/user/info` - 更新用户信息
- `POST /api/user/playtime` - 游玩时长心跳上报

### 后台管理（需 ADMIN_PASSWORD 登录）
- `POST /api/admin/login` - 管理员登录
- `GET /api/admin/overview` - 数据看板
- `GET /api/admin/users` / `PUT /api/admin/users/:id` / `DELETE /api/admin/users/:id` - 角色管理
- `POST /api/admin/users/:id/reset` - 重置进度
- `GET /api/admin/settings` / `PUT /api/admin/settings` - 护眼策略
- `GET /api/admin/backup` - 导出数据备份

### 游戏相关
- `GET /api/game/progress` - 获取所有游戏进度
- `GET /api/game/progress/:gameId` - 获取单个游戏进度
- `POST /api/game/progress/:gameId` - 更新游戏进度
- `GET /api/game/daily-task` - 获取今日任务进度
- `GET /api/game/leaderboard/:gameId` - 获取排行榜

### 关卡配置
- `GET /api/level/:gameId` - 获取关卡配置

## 📄 许可证

MIT License

---

**注意**: 本项目为儿童设计，请家长在初次使用时协助设置。
