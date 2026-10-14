# 儿童游戏乐园 — 常用命令速查

---

## 一、服务器连接

```bash
# SSH 登录
ssh root@49.232.231.35

# 宝塔面板地址
http://49.232.231.35:8888/tencentcloud
```

---

## 一·五、一键部署（本机 → 服务器）

替代「宝塔手动拖文件 + SSH 重启」的旧流程，在项目根目录 Git Bash 中一条命令完成：

```bash
./deploy.sh
```

脚本做的事：本地构建前端+后端 → tar 管道经 SSH 上传（前端 dist 清空后解压、后端 dist 覆盖）→ `pm2 restart children-games-api`。部署完访问 **http://game.985211.icu:90**（或 http://49.232.231.35:90）。

> ⚠️ `deploy.sh` 含服务器账号，**已加 .gitignore 不入库**（公开仓库）；换电脑时按下述配置重建即可，脚本仅 30 行。

> ⚠️ **80/443 端口被腾讯云未备案拦截**（域名访问会跳 DNSPod webblock 页），正式入口只有 **90 端口**。nginx 里 90 的入口和 /api 反代是独立文件：`/www/server/panel/vhost/nginx/game_port90.conf`（90 端口 server 块）和 `/www/server/panel/vhost/nginx/extension/game.985211.icu/api-proxy.conf`（/api → 127.0.0.1:3001，宝塔 extension 机制加载进主站点配置）——删了或宝塔重置配置后网站会 404/接口全挂，按这两个文件内容重建即可。

**首次使用：配置 root 的 SSH 免密登录（一次性）**

```bash
# 1. 本机生成密钥（已有可跳过，一路回车）
ssh-keygen -t ed25519

# 2. 把公钥装到服务器（要输一次 root 密码）
cat ~/.ssh/id_ed25519.pub | ssh root@49.232.231.35 \
  "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"

# 3. 验证：不再要密码即成功
ssh root@49.232.231.35 "echo ok"
```

**说明**

- **后端 PM2 进程是 root 启动的，必须用 root 部署重启**（`pm2 restart` 用别的用户会另起一套进程）；脚本 `SERVER` 已按 `root@` 配置
- 目标目录在前端：`/home/songshaohui/children-games/frontend`、后端：`/home/songshaohui/children-games/backend`（变动时改脚本顶部变量）
- 后端只上传编译产物 `dist/`；若 `package.json` 依赖有变，需手动上服务器 `npm install` 后再重启
- 前端上传前会清空目标目录（避免旧版 hash 文件堆积），Nginx 读静态文件无需重载

---

## 二、服务管理

```bash
# MySQL
systemctl start mysqld
systemctl stop mysqld
systemctl restart mysqld
systemctl status mysqld

# Nginx（宝塔）
/www/server/nginx/sbin/nginx -s reload
/www/server/nginx/sbin/nginx -s stop
/www/server/nginx/sbin/nginx

# PM2 后端
pm2 status
pm2 restart children-games-api
pm2 stop children-games-api
pm2 logs children-games-api --lines 50
pm2 save
pm2 startup
```

---

## 三、后端操作

```bash
cd /home/songshaohui/children-games/backend

# 查看日志
pm2 logs children-games-api

# 测试 API
curl http://127.0.0.1:90/api/health

# 重启后端
pm2 restart children-games-api
```

---

## 四、数据库操作

```bash
# 登录 MySQL
mysql -u root -p

# 导出数据库（线上）
mysqldump -u root -p children_games > /home/songshaohui/children_games_$(date +%Y%m%d).sql

# 本地导入
cmd /c "D:\software\mysql-8.4\bin\mysql -u root -proot123 children_games < 备份文件.sql"

# 本地查看表
D:\software\mysql-8.4\bin\mysql -u root -proot123 -e "USE children_games; SHOW TABLES;"
```

---

## 五、文件管理

```bash
# 查看前端文件
ls /home/songshaohui/children-games/frontend/

# 修复 Nginx 访问权限
chmod o+x /home/songshaohui
chmod -R o+r /home/songshaohui/children-games/frontend

# 从服务器下载文件到本地
scp root@49.232.231.35:/home/songshaohui/文件名 D:\本地路径\
```

---

## 六、问题排查

```bash
# 查看端口占用
ss -tlnp | grep :90
ss -tlnp | grep :3001
ss -tlnp | grep :3306

# 查看 Nginx 错误日志
tail -20 /www/wwwlogs/49.232.231.35.error.log

# 查看 Nginx 配置语法
/www/server/nginx/sbin/nginx -t

# 查看 MySQL 进程
ps aux | grep mysql

# 查看 PM2 进程
ps aux | grep node
```

---

## 七、密码信息

| 项目 | 值 |
|------|-----|
| MySQL root 密码（线上） | `SongYuan1121` |
| MySQL root 密码（本地） | `root123` |
| 宝塔面板用户 | `bff38933` |
| 宝塔面板密码 | `c72f7343f46b` |
| JWT Secret（后端 .env） | `xK9mN2pQ7wR5tY8uI0oP4sD6fGaB3cV` |

---

## 八、目录结构

```
/home/songshaohui/children-games/
├── frontend/          ← 前端静态文件（Nginx 直接读取）
│   ├── index.html
│   ├── assets/
│   └── icons/
└── backend/           ← 后端代码
    ├── dist/          ← 编译后的 JS（PM2 运行这个）
    ├── .env           ← 环境配置（含数据库密码）
    ├── package.json
    └── node_modules/
```

---

## 九、Navicat 连接线上数据库

### SSH 标签页

| 字段 | 填写 |
|------|------|
| 主机 | `49.232.231.35` |
| 端口 | `22` |
| 用户名 | `root` |
| 密码 | 服务器 root 密码 |

### 常规标签页

| 字段 | 填写 |
|------|------|
| 主机 | `127.0.0.1` |
| 端口 | `3306` |
| 用户名 | `root` |
| 密码 | `SongYuan1121` |

---

## 十、线上 → 本地数据库同步流程

```bash
# 1. 在服务器上导出
mysqldump -u root -p children_games > /home/songshaohui/children_games_$(date +%Y%m%d).sql

# 2. 下载到本地（本地电脑执行）
scp root@49.232.231.35:/home/songshaohui/children_games_20261013.sql D:\me\learn\AI\

# 3. 本地重建并导入
D:\software\mysql-8.4\bin\mysql -u root -proot123 -e "DROP DATABASE IF EXISTS children_games; CREATE DATABASE children_games DEFAULT CHARACTER SET utf8mb4;"
cmd /c "D:\software\mysql-8.4\bin\mysql -u root -proot123 children_games < D:\me\learn\AI\children_games_20261013.sql"
```

---

## 十一、注意事项

- **统一端口：90** — 前后端全部通过 Nginx 的 90 端口对外提供服务（不再是 80）
- 服务器系统：**OpenCloudOS**（包管理器用 `dnf`/`yum`，不是 `apt`）
- Nginx 是**宝塔面板**安装的，路径 `/www/server/nginx/`，不是系统 Nginx
- 不要用 `systemctl restart nginx`（会重启系统 Nginx，丢失宝塔站点配置）
- 后端是 **Node.js** 不是 Java
- 前端 `dist/` 文件已直接上传到 `frontend/` 目录，Nginx 直接读取
