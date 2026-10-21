# Task 4 实施计划：搭建测试框架和 CI/CD

## 目标
建立完整的测试体系和自动化部署流程，确保代码质量和持续集成。

## 工作内容

### 1. 前端测试框架（Vitest + Vue Test Utils）
- [ ] 安装依赖：vitest, @vue/test-utils, jsdom
- [ ] 配置 vitest.config.ts
- [ ] 创建测试目录结构：src/__tests__/
- [ ] 编写示例测试：
  - composables 单元测试（useRoomEvents, useMemberState）
  - components 组件测试（TopBar, SeatGrid）
  - utils 工具函数测试
- [ ] 配置测试覆盖率报告
- [ ] 添加测试脚本到 package.json

### 2. 后端测试框架（Jest + Supertest）
- [ ] 安装依赖：jest, @types/jest, ts-jest, supertest, @types/supertest
- [ ] 配置 jest.config.js
- [ ] 创建测试目录结构：src/__tests__/
- [ ] 编写示例测试：
  - controllers API 测试（userController, gameController）
  - models 数据模型测试
  - utils 工具函数测试
  - WebSocket 处理器测试
- [ ] 配置测试覆盖率报告
- [ ] 添加测试脚本到 package.json

### 3. CI/CD 配置（GitHub Actions）
- [ ] 创建 .github/workflows/ci.yml
- [ ] 配置工作流：
  - 触发条件：push 到 main/develop，PR 创建
  - 矩阵测试：Node.js 18, 20
  - 步骤：checkout → setup → install → lint → test → build
  - 前端：TypeScript 检查 + Vitest 测试
  - 后端：TypeScript 检查 + Jest 测试
  - 构建验证
- [ ] 配置环境变量和密钥
- [ ] 添加测试覆盖率徽章

### 4. 测试最佳实践
- [ ] 编写测试指南文档
- [ ] 建立测试命名规范
- [ ] 配置测试数据工厂
- [ ] 设置测试数据库（SQLite 内存数据库）
- [ ] Mock 外部依赖（WebSocket, 第三方 API）

## 预期产出
1. 完整的前后端测试框架配置
2. 至少 10 个示例测试用例
3. GitHub Actions CI 工作流
4. 测试覆盖率报告（目标：60%+）
5. 测试编写指南文档

## 时间安排
- Day 1: 前端测试框架搭建 + 3 个示例测试
- Day 2: 后端测试框架搭建 + 3 个示例测试
- Day 3: CI/CD 配置 + 集成验证
- Day 4: 文档编写 + 测试覆盖率优化

## 技术栈
- 前端：Vitest + Vue Test Utils + jsdom
- 后端：Jest + Supertest + SQLite
- CI/CD：GitHub Actions
- 覆盖率：Istanbul/c8

## 风险点
1. WebSocket 测试需要特殊处理（Mock 或测试服务器）
2. 数据库测试需要隔离（每个测试使用独立数据库）
3. 第三方依赖可能需要额外的 Mock 配置

## 成功标准
- [ ] 前端测试可以正常运行
- [ ] 后端测试可以正常运行
- [ ] CI/CD 工作流可以自动执行
- [ ] 测试覆盖率达到 60%+
- [ ] 文档完整，团队成员可以开始编写测试
