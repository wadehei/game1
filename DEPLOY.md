# 儿童游戏乐园 — 线上部署指南

> 本文档面向零基础用户，每一步都附有详细说明。按顺序操作即可完成部署。

---

## 一、项目架构

```
                    用户浏览器
                        │
                        ▼
              ┌─────────────────┐
              │   Nginx : 80    │
              │  (静态文件服务)   │
              └────┬────────┬───┘
                   │        │
              静态文件    /api/* 反向代理
                   │        │
                   ▼        ▼
            dist/ 目录   Node.js : 3001
                        (Express API)
                             │
                             ▼
                        MySQL : 3306
```

**技术栈：**
| 组件 | 技术 | 说明 |
|------|------|------|
| 前端 | Vue 3 + TypeScript + Vite | 构建为静态 HTML/JS/CSS |
| 后端 | **Node.js** + Express + TypeScript | REST API 服务（不是 Java） |
| 数据库 | MySQL 8.4 | 存储用户进度、关卡配置 |
| 进程管理 | PM2 | 保证后端服务持续运行、崩溃自动重启 |
| Web 服务器 | Nginx | 提供静态文件 + 反向代理 |

---

## 二、服务器准备

### 2.1 购买云服务器

推荐以下任意一家（选最便宜的即可）：

| 云服务商 | 推荐配置 | 参考价格 |
|----------|----------|----------|
| 阿里云 | 2核2G，Ubuntu 22.04 | 约 99 元/年 |
| 腾讯云 | 2核2G，Ubuntu 22.04 | 约 99 元/年 |
| 华为云 | 2核2G，Ubuntu 22.04 | 约 100 元/年 |

> **操作系统选择 Ubuntu 22.04 LTS**（比 CentOS 更容易安装软件）

### 2.2 开放安全组端口

购买服务器后，在云控制台找到 **安全组** 或 **防火墙** 设置，开放以下端口：

| 端口 | 用途 | 是否对公网开放 |
|------|------|----------------|
| 22 | SSH 远程连接 | ✅ 必须 |
| 80 | HTTP 网页访问 | ✅ 必须 |
| 443 | HTTPS（后续配置） | ❌ 暂不需要 |
| 3001 | 后端 API | ❌ 不要开放（仅本机访问） |
| 3306 | MySQL | ❌ 不要开放（仅本机访问） |

> ⚠️ **安全提醒**：3001 和 3306 端口不要对外开放，否则容易被黑客攻击。

### 2.3 连接服务器

**Windows 用户**：下载 [MobaXterm](https://mobaxterm.mobatek.net/) 或使用 Windows 自带的 PowerShell：

```bash
ssh root@你的服务器IP
```

输入密码后即可登录。登录成功后你会看到类似这样的提示符：

```
root@your-server:~#
```

> 后面所有命令都在这个提示符下执行。

---

## 三、安装运行环境

### 3.1 安装 Node.js 18

```bash
# 安装 nvm（Node 版本管理器）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 让 nvm 命令立即生效
source ~/.bashrc

# 用 nvm 安装 Node.js 18
nvm install 18

# 验证安装成功
node -v    # 应显示 v18.x.x
npm -v     # 应显示 9.x.x 或更高
```

**什么是 Node.js？** Node.js 是让 JavaScript 在服务器上运行的程序。我们的后端代码就是用 JavaScript 写的，需要 Node.js 来运行。

### 3.2 安装 MySQL 8.4

```bash
# Ubuntu 安装 MySQL
sudo apt update
sudo apt install -y mysql-server

# 启动 MySQL 服务
sudo systemctl start mysql

# 设置开机自启
sudo systemctl enable mysql

# 验证 MySQL 运行状态
sudo systemctl status mysql
```

看到 `active (running)` 绿色字样说明安装成功。按 `q` 退出状态查看。

### 3.3 安装 Nginx

```bash
sudo apt install -y nginx

# 启动 Nginx
sudo systemctl start nginx

# 设置开机自启
sudo systemctl enable nginx

# 验证
sudo systemctl status nginx
```

安装完成后，在浏览器访问 `http://你的服务器IP`，应该能看到 "Welcome to nginx!" 的页面。

### 3.4 安装 PM2（Node 进程管理器）

```bash
# 全局安装 PM2
npm install -g pm2

# 验证
pm2 -v
```

**什么是 PM2？** 直接运行 `node app.js` 的话，关掉终端程序就停了。PM2 可以让程序在后台持续运行，崩溃了还会自动重启。

---

## 四、上传项目代码

### 方式一：用 Git（推荐）

如果你的代码已经上传到 GitHub：

```bash
# 在服务器上创建项目目录
mkdir -p /opt/children-games
cd /opt/children-games

# 克隆代码（替换为你的仓库地址）
git clone https://github.com/你的用户名/你的仓库名.git .
```

### 方式二：用 SCP 从本地上传

在你**本地电脑**的 PowerShell/CMD 中执行：

```bash
# 上传前端代码
scp -r D:\project\ai-project\games\game1\children-games-frontend root@你的服务器IP:/opt/children-games/frontend

# 上传后端代码
scp -r D:\project\ai-project\games\game1\children-games-backend root@你的服务器IP:/opt/children-games/backend
```

### 方式三：直接压缩上传

在本地电脑压缩后上传：

```bash
# 本地电脑 CMD 中执行
cd D:\project\ai-project\games\game1
tar -czf games.tar.gz children-games-frontend children-games-backend
scp games.tar.gz root@你的服务器IP:/opt/
```

然后在服务器上解压：

```bash
cd /opt
tar -xzf games.tar.gz
mv children-games-frontend children-games/frontend
mv children-games-backend children-games/backend
```

---

## 五、配置数据库

### 5.1 设置 MySQL root 密码

```bash
# 进入 MySQL（首次安装可能无密码，直接回车）
sudo mysql -u root

# 在 MySQL 提示符下执行（逐行输入）：
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '你的强密码';
FLUSH PRIVILEGES;
EXIT;
```

> 把 `你的强密码` 替换为一个复杂密码，比如 `一个只有你自己知道的强密码`

### 5.2 创建游戏数据库

```bash
mysql -u root -p
```

输入刚才设置的密码，然后在 MySQL 提示符下：

```sql
CREATE DATABASE IF NOT EXISTS children_games DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SHOW DATABASES;
EXIT;
```

看到 `children_games` 出现在列表中说明创建成功。

---

## 六、部署后端

### 6.1 安装依赖

```bash
cd /opt/children-games/backend

# 安装所有依赖包
npm install
```

> 这步会下载 Express、Sequelize 等库，可能需要 1-3 分钟。

### 6.2 配置环境变量

```bash
# 复制环境配置模板
cp .env .env.production
```

编辑 `.env.production` 文件：

```bash
nano .env.production
```

修改以下关键项（`nano` 编辑器：方向键移动，改完后 `Ctrl+O` 保存，`Ctrl+X` 退出）：

```ini
# 服务器配置
PORT=3001
NODE_ENV=production

# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=children_games
DB_USER=root
DB_PASSWORD=你刚才设置的MySQL密码

# JWT 密钥（改成一个随机字符串，越长越安全）
JWT_SECRET=改成一个随机长字符串比如aB3$xK9mN2pQ7wR5tY8uI0oP4sD6fG

# Redis 配置（当前未使用，保持默认即可）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

> ⚠️ **重要**：`JWT_SECRET` 一定要改！用默认值非常不安全。

### 6.3 编译 TypeScript

```bash
npm run build
```

这会把 `src/` 下的 TypeScript 代码编译成 `dist/` 下的 JavaScript 代码。

### 6.4 用 PM2 启动后端

```bash
# 启动服务（指定使用生产环境配置）
NODE_ENV=production pm2 start dist/app.js --name children-games-api

# 查看运行状态
pm2 status
```

应该看到 `children-games-api` 状态为 `online`。

### 6.5 设置开机自启

```bash
# 让 PM2 保存当前进程列表
pm2 save

# 生成开机自启脚本
pm2 startup

# 按提示执行输出的命令（通常是类似这样的）：
# sudo env PATH=$PATH:/root/.nvm/versions/node/v18.x.x/bin pm2 startup systemd -u root
```

---

## 七、部署前端

### 7.1 修改 API 地址

前端需要知道后端在哪里。编辑 vite 配置文件：

```bash
cd /opt/children-games/frontend
nano vite.config.ts
```

把 proxy 的 target 改为空（生产环境不需要 proxy，由 Nginx 处理）：

```typescript
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 8080,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

> 生产环境下前端通过 Nginx 访问 `/api`，Nginx 会转发到后端 3001 端口，所以 vite proxy 配置保持不变即可。

### 7.2 构建生产版本

```bash
# 安装依赖
npm install

# 构建
npm run build
```

构建完成后会在 `dist/` 目录生成静态文件（HTML/JS/CSS/图片）。

### 7.3 把前端文件放到 Nginx 目录

```bash
# 复制构建产物到 Nginx 网站目录
sudo cp -r dist/* /var/www/html/

# 或者创建一个专门的游戏目录
sudo mkdir -p /var/www/children-games
sudo cp -r dist/* /var/www/children-games/
```

---

## 八、配置 Nginx

### 8.1 创建 Nginx 配置文件

```bash
sudo nano /etc/nginx/sites-available/children-games
```

粘贴以下内容（**把 `你的服务器IP` 替换为实际 IP**）：

```nginx
server {
    listen 80;
    server_name 你的服务器IP;

    # 前端静态文件目录
    root /var/www/children-games;
    index index.html;

    # 支持 Vue Router 的 Hash 模式（其实 Hash 模式不需要这个，但加上无妨）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 反向代理：所有 /api 开头的请求转发到后端 Node.js
    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
    }

    # 静态资源缓存（图片、字体等）
    location ~* \.(jpg|jpeg|png|gif|ico|svg|webp|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 8.2 启用配置

```bash
# 创建软链接启用配置
sudo ln -s /etc/nginx/sites-available/children-games /etc/nginx/sites-enabled/

# 删除默认配置（避免冲突）
sudo rm /etc/nginx/sites-enabled/default

# 测试配置是否正确
sudo nginx -t
```

看到 `syntax is ok` 和 `test is successful` 说明配置没问题。

### 8.3 重启 Nginx

```bash
sudo systemctl restart nginx
```

### 8.4 验证部署

在浏览器访问：

```
http://你的服务器IP
```

应该能看到游戏大厅页面！试试点一个游戏进入，看看是否能正常玩。

---

## 九、初始化关卡数据（可选）

后端启动时会自动创建表结构。如需生成完整关卡配置数据：

```bash
cd /opt/children-games/backend
NODE_ENV=production npx ts-node src/seed.ts
```

> 不执行也可以，游戏可以正常玩。seed 只是预置关卡难度配置。

---

## 十、PM2 常用命令

```bash
# 查看所有运行的服务
pm2 status

# 查看实时日志
pm2 logs children-games-api

# 重启服务
pm2 restart children-games-api

# 停止服务
pm2 stop children-games-api

# 删除服务
pm2 delete children-games-api

# 监控（CPU、内存实时图表）
pm2 monit
```

---

## 十一、安全加固

### 11.1 防火墙设置

```bash
# 启用 Ubuntu 防火墙
sudo ufw enable

# 只允许必要端口
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS（后续用）

# 确认状态
sudo ufw status
```

### 11.2 禁止 3001/3306 端口外网访问

Nginx 反向代理已经让后端只需监听 `127.0.0.1:3001`，外网无法直接访问。确认后端绑定的是本地地址：

编辑后端 `src/config/index.ts`（如果 `DB_HOST` 是 `localhost` 就没问题）：

```bash
# 确认 MySQL 只监听本地
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

确保有这行：
```ini
bind-address = 127.0.0.1
```

修改后重启 MySQL：
```bash
sudo systemctl restart mysql
```

---

## 十二、常见问题排查

### 12.1 页面白屏

```bash
# 检查 Nginx 是否正常运行
sudo systemctl status nginx

# 检查前端文件是否在正确目录
ls /var/www/children-games/

# 应该有 index.html、assets/ 等文件
# 检查 Nginx 错误日志
sudo tail -50 /var/log/nginx/error.log
```

### 12.2 游戏能打开但进度保存失败（401/404/502）

```bash
# 检查后端是否运行
pm2 status

# 查看后端日志
pm2 logs children-games-api --lines 50

# 手动测试后端接口
curl http://127.0.0.1:3001/api/health
# 应返回 {"status":"ok","timestamp":"..."}

# 测试 Nginx 反代
curl http://localhost/api/health
# 应返回同样结果
```

### 12.3 数据库连接失败

```bash
# 检查 MySQL 是否运行
sudo systemctl status mysql

# 测试数据库连接
mysql -u root -p -e "USE children_games; SHOW TABLES;"

# 检查 .env.production 中的数据库密码是否正确
cat /opt/children-games/backend/.env.production | grep DB_PASSWORD
```

### 12.4 端口被占用

```bash
# 查看谁占用了 3001 端口
sudo lsof -i :3001

# 查看谁占用了 80 端口
sudo lsof -i :80

# 杀掉占用进程（替换 PID）
sudo kill -9 PID
```

### 12.5 Nginx 502 Bad Gateway

说明 Nginx 无法连接到后端：

```bash
# 确认后端在运行
pm2 status

# 确认后端监听 3001
curl http://127.0.0.1:3001/api/health

# 如果后端没运行，重新启动
pm2 start children-games-api
```

---

## 十三、后续升级：添加 HTTPS（有域名后）

当你购买了域名并解析到服务器 IP 后：

```bash
# 安装 certbot（免费 SSL 证书工具）
sudo apt install -y certbot python3-certbot-nginx

# 自动配置 HTTPS（替换为你的域名）
sudo certbot --nginx -d 你的域名.com

# 自动续期测试
sudo certbot renew --dry-run
```

---

## 十四、完整部署命令速查

```bash
# ===== 1. 安装环境 =====
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 18
sudo apt update && sudo apt install -y mysql-server nginx
npm install -g pm2

# ===== 2. 创建项目目录 =====
mkdir -p /opt/children-games
# （上传代码到此处，见第四节）

# ===== 3. 数据库 =====
sudo mysql -e "CREATE DATABASE IF NOT EXISTS children_games DEFAULT CHARACTER SET utf8mb4;"

# ===== 4. 后端 =====
cd /opt/children-games/backend
npm install
# 编辑 .env.production 修改密码和 JWT_SECRET
npm run build
NODE_ENV=production pm2 start dist/app.js --name children-games-api
pm2 save && pm2 startup

# ===== 5. 前端 =====
cd /opt/children-games/frontend
npm install && npm run build
sudo mkdir -p /var/www/children-games
sudo cp -r dist/* /var/www/children-games/

# ===== 6. Nginx =====
sudo nano /etc/nginx/sites-available/children-games  # 粘贴配置
sudo ln -s /etc/nginx/sites-available/children-games /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx

# ===== 7. 防火墙 =====
sudo ufw enable && sudo ufw allow 22/tcp && sudo ufw allow 80/tcp
```

---

## 十五、项目目录结构参考

```
/opt/children-games/
├── frontend/                # 前端源码
│   ├── src/                 # Vue 源代码
│   ├── dist/                # 构建产物（部署用）
│   ├── package.json
│   └── vite.config.ts
├── backend/                 # 后端源码
│   ├── src/                 # TypeScript 源代码
│   ├── dist/                # 编译后的 JavaScript（部署用）
│   ├── .env.production      # 生产环境配置
│   └── package.json
└── DEPLOY.md                # 本文档
```

---

> 📝 **部署完成后**，在浏览器访问 `http://你的服务器IP` 即可看到游戏大厅。
> 遇到问题随时查看第十二节的排查步骤。
