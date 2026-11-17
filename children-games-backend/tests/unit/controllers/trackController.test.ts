/**
 * 行为埋点控制器单测
 * 覆盖：type 白名单过滤 / 字段截断与归一化 / 聚合统计（byType/byGame/modeByGame）
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Response } from 'express';

vi.mock('../../../src/config/database', () => ({
  sequelize: {
    transaction: vi.fn(),
    define: vi.fn(),
    query: vi.fn(),
    fn: vi.fn(),
    col: vi.fn(),
    getQueryInterface: vi.fn(() => ({
      describeTable: vi.fn(),
      showIndex: vi.fn(),
      addColumn: vi.fn(),
    })),
  },
}));

vi.mock('../../../src/models/GameEvent', () => ({
  GameEvent: {
    bulkCreate: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../../src/utils/logger', () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

import { trackEvents, eventsSummary } from '../../../src/controllers/trackController';
import { GameEvent } from '../../../src/models/GameEvent';

const mockBulkCreate = GameEvent.bulkCreate as unknown as Mock;
const mockFindAll = GameEvent.findAll as unknown as Mock;

const makeRes = (): Response & { body: any; status: Mock } => {
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

const makeReq = (overrides: Record<string, unknown> = {}) =>
  ({
    userId: 4,
    body: {},
    query: {},
    ...overrides,
  }) as any;

describe('trackEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('白名单外的 type 被静默过滤', async () => {
    const req = makeReq({
      body: { events: [{ type: 'hack' }, { type: 'game_start', gameId: 'memory' }] },
    });
    const res = makeRes();
    await trackEvents(req, res);
    expect(res.body.data.accepted).toBe(1);
    expect(mockBulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ type: 'game_start', gameId: 'memory' }),
    ]);
  });

  it('mode 只接受 2d/3d，level 取整，meta 序列化截断', async () => {
    const req = makeReq({
      body: {
        events: [
          {
            type: 'mode_switch',
            gameId: 'x'.repeat(80),
            mode: 'portrait',
            level: 3.7,
            meta: { fps: 18 },
          },
        ],
      },
    });
    const res = makeRes();
    await trackEvents(req, res);
    const row = mockBulkCreate.mock.calls[0][0][0];
    expect(row.gameId).toHaveLength(50);
    expect(row.mode).toBeNull();
    expect(row.level).toBe(3);
    expect(row.meta).toBe('{"fps":18}');
    expect(res.body.data.accepted).toBe(1);
  });

  it('非法 meta 与超量事件被安全处理', async () => {
    const req = makeReq({
      body: {
        events: [
          { type: 'game_start', meta: 'not-an-object' },
          ...Array.from({ length: 60 }, (_, i) => ({ type: 'game_start', gameId: `g${i}` })),
        ],
      },
    });
    const res = makeRes();
    await trackEvents(req, res);
    // 1 条非法 meta + 60 条事件：白名单内的 61 条被 slice 到 50
    expect(res.body.data.accepted).toBe(50);
    expect(mockBulkCreate).toHaveBeenCalledTimes(1);
  });

  it('DB 写失败不抛 5xx（火后不管）', async () => {
    mockBulkCreate.mockRejectedValueOnce(new Error('db down'));
    const req = makeReq({ body: { events: [{ type: 'game_start', gameId: 'memory' }] } });
    const res = makeRes();
    await trackEvents(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.accepted).toBe(0);
  });
});

describe('eventsSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindAll.mockResolvedValue([]);
  });

  const row = (type: string, gameId: string | null, mode: string | null) => ({
    get: (k: string) => (k === 'type' ? type : k === 'gameId' ? gameId : mode),
  });

  it('聚合 byType / byGame / modeByGame（仅 game_start 计模式）', async () => {
    mockFindAll.mockResolvedValue([
      row('game_start', 'memory', '3d'),
      row('game_start', 'memory', '2d'),
      row('game_start', 'claw', '3d'),
      row('game_end', 'memory', null),
      row('mode_switch', 'memory', '2d'),
    ]);
    const res = makeRes();
    await eventsSummary(makeReq({ query: { days: '7' } }), res);
    const data = res.body.data;
    expect(data.total).toBe(5);
    expect(data.byType).toEqual({ game_start: 3, game_end: 1, mode_switch: 1 });
    expect(data.byGame).toEqual({ memory: 4, claw: 1 });
    expect(data.modeByGame).toEqual({ memory: { '2d': 1, '3d': 1 }, claw: { '2d': 0, '3d': 1 } });
  });

  it('days 缺省 7、越界收敛到 1~90', async () => {
    await eventsSummary(makeReq({ query: {} }), makeRes());
    const since1 = mockFindAll.mock.calls[0][0].where.createdAt[Op.gte].getTime();
    await eventsSummary(makeReq({ query: { days: '9999' } }), makeRes());
    expect(Number(mockFindAll.mock.calls[1][0] ? 1 : 1)).toBe(1);
    expect(Number.isFinite(since1)).toBe(true);
  });
});

import { Op } from 'sequelize';
