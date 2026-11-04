import { Router } from 'express';

// 子路由模块
import authRoutes from './admin/auth';
import usersRoutes from './admin/users';
import settingsRoutes from './admin/settings';
import contentRoutes from './admin/content';
import systemRoutes from './admin/system';

const router = Router();

// ─── 认证相关路由（公开 + 2FA） ────────────────────────────────
router.use('/', authRoutes);

// ─── 用户管理路由 ────────────────────────────────
router.use('/', usersRoutes);

// ─── 设置和关卡路由 ────────────────────────────────
router.use('/', settingsRoutes);

// ─── 内容管理路由（题库 + 反馈） ────────────────────────────────
router.use('/', contentRoutes);

// ─── 系统管理路由（日志、备份、监控） ────────────────────────────────
router.use('/', systemRoutes);

export default router;
