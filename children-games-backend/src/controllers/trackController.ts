import { Op } from 'sequelize';
import { Response } from 'express';
import { GameEvent, type GameEventType } from '../models/GameEvent';
import { logError } from '../utils/logger';
import { AuthRequest } from '../middleware/auth';

const ALLOWED_TYPES: GameEventType[] = [
  'game_start',
  'game_end',
  'mode_switch',
  'parent_set_default',
  'fps_fallback',
  'battle_room_open',
];

interface TrackEventInput {
  type: string;
  gameId?: string;
  mode?: string;
  level?: number;
  meta?: Record<string, unknown>;
}

/**
 * 批量上报行为事件（火后不管型：写失败只落日志不阻塞前端）
 */
export const trackEvents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.userId!;
    const events = (req.body?.events ?? []) as TrackEventInput[];
    const rows = events
      .filter((e) => ALLOWED_TYPES.includes(e.type as GameEventType))
      .slice(0, 50)
      .map((e) => ({
        userId,
        type: e.type as GameEventType,
        gameId: e.gameId ? String(e.gameId).slice(0, 50) : null,
        mode: e.mode === '2d' || e.mode === '3d' ? e.mode : null,
        level: typeof e.level === 'number' && Number.isFinite(e.level) ? Math.trunc(e.level) : null,
        meta: e.meta && typeof e.meta === 'object' ? JSON.stringify(e.meta).slice(0, 500) : null,
      }));
    if (rows.length > 0) {
      await GameEvent.bulkCreate(rows);
    }
    res.json({ code: 200, message: 'success', data: { accepted: rows.length } });
  } catch (error) {
    // 埋点失败不影响主流程，只落日志
    logError('track', '行为埋点上报失败', error instanceof Error ? error.stack : String(error));
    res.json({ code: 200, message: 'success', data: { accepted: 0 } });
  }
};

/**
 * 后台看板：近 N 天行为聚合（默认 7 天）
 */
export const eventsSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await GameEvent.findAll({
      where: { createdAt: { [Op.gte]: since } },
      attributes: ['type', 'gameId', 'mode'],
    });

    const byType: Record<string, number> = {};
    const byGame: Record<string, number> = {};
    const modeByGame: Record<string, { '2d': number; '3d': number }> = {};
    for (const row of rows) {
      const type = row.get('type') as string;
      const gameId = (row.get('gameId') as string | null) || '';
      const mode = row.get('mode') as string | null;
      byType[type] = (byType[type] || 0) + 1;
      if (gameId) {
        byGame[gameId] = (byGame[gameId] || 0) + 1;
        if (type === 'game_start') {
          const m = mode === '3d' ? '3d' : '2d';
          modeByGame[gameId] = modeByGame[gameId] || { '2d': 0, '3d': 0 };
          modeByGame[gameId][m] += 1;
        }
      }
    }

    res.json({
      code: 200,
      message: 'success',
      data: {
        days,
        total: rows.length,
        byType,
        byGame,
        modeByGame,
      },
    });
  } catch (error) {
    logError('track', '行为聚合查询失败', error instanceof Error ? error.stack : String(error));
    res.status(500).json({ code: 500, message: '服务器内部错误' });
  }
};
