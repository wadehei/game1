import { Request, Response } from 'express';
import { AdminRequest } from '../middleware/adminAuth';
import { success, asyncHandler } from '../utils/response';
import { readRecentErrors, clearErrors } from '../utils/logger';
import { formatDate } from '../utils/date';

// ─── 错误日志 ────────────────────────────────

/** 最近错误日志（新→旧） */
export const getErrorLogs = asyncHandler(async (req: AdminRequest, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100')), 1) || 100, 500);
  success(res, readRecentErrors(limit));
});

/** 清空错误日志 */
export const clearErrorLogs = asyncHandler(async (req: AdminRequest, res: Response) => {
  clearErrors();
  success(res, { ok: true });
});

// ─── 数据备份（SQL 构建在 services/backupService，与管理端下载/每日自动备份共用） ────────────────────────────────

/** 导出全部业务数据为 .sql（数据 INSERT 语句） */
export const downloadBackup = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { buildBackupSql } = await import('../services/backupService');
  const sql = await buildBackupSql();
  res.setHeader('Content-Type', 'application/sql; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="children_games_backup_${formatDate()}.sql"`
  );
  res.send(sql);
});

/** 磁盘自动备份列表（新→旧） */
export const listAutoBackups = asyncHandler(async (req: AdminRequest, res: Response) => {
  const { listAutoBackups: list } = await import('../services/backupService');
  success(res, list());
});
