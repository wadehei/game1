# 构建阶段
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 package 文件
COPY package*.json ./

# 安装所有依赖（包括 devDependencies 用于构建）
RUN npm ci

# 复制源代码
COPY . .

# 构建 TypeScript
RUN npm run build

# 只保留生产依赖
RUN npm prune --production

# 生产阶段
FROM node:20-alpine

WORKDIR /app

# 安装 dumb-init 处理信号
RUN apk add --no-cache dumb-init

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# 从构建阶段复制文件
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./

# 创建日志和上传目录
RUN mkdir -p logs uploads/avatars uploads/voices backups && \
    chown -R nodejs:nodejs logs uploads backups

# 切换到非 root 用户
USER nodejs

# 暴露端口
EXPOSE 3002

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# 使用 dumb-init 作为入口点
ENTRYPOINT ["dumb-init", "--"]

# 启动应用
CMD ["node", "dist/app.js"]
