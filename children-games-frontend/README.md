# 儿童游戏乐园 - 前端启动指南

## 快速开始

### 1. 安装依赖
```bash
cd children-games-frontend
npm install
```

### 2. 启动开发服务器
```bash
npm run dev
```

访问 http://localhost:8080

### 3. 构建生产版本
```bash
npm run build
```

## 迁移到 uniapp（可选）

如果需要支持微信小程序，可以：

1. 安装 uniapp 插件
2. 将 `src/pages` 目录下的文件复制到 uniapp 项目
3. 将 `uni.` API 调用替换为标准浏览器 API

当前版本使用纯 Vue 3 + Vite，后续可以轻松迁移到 uniapp。

## 项目结构

```
src/
├── api/              # API 接口
├── pages/            # 页面组件
├── router/           # 路由配置
├── store/            # Pinia 状态管理
├── utils/            # 工具函数
├── App.vue           # 根组件
└── main.ts           # 入口文件
```
