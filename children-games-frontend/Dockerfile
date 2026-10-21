# ---- 构建阶段 ----
FROM node:20-alpine AS build

WORKDIR /app

# 先复制依赖文件，利用 Docker 层缓存
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/

# 安装依赖（使用淘宝镜像加速）
RUN npm ci --registry=https://registry.npmmirror.com

# 复制源码
COPY . .

# 构建
RUN npm run build

# ---- 生产阶段 ----
FROM nginx:alpine

# 复制构建产物
COPY --from=build /app/dist /usr/share/nginx/html

# 复制 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
