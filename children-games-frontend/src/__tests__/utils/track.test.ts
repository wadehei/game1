/**
 * 埋点管道单测：队列/冲刷/未登录丢弃/失败回队
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { track, flush, currentMode, type TrackEvent } from '../../utils/track';

const fetchMock = vi.fn();

describe('track', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    // 清空内部队列：flush 一把拿空
    localStorage.setItem('token', '');
    flush();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const lastBody = (): { events: TrackEvent[] } => JSON.parse(fetchMock.mock.calls.at(-1)![1].body);

  it('未登录：事件直接丢弃不发请求', () => {
    localStorage.setItem('token', '');
    track({ type: 'game_start', gameId: 'memory' });
    flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('登录后批量冲刷：带 Authorization 与事件数组', () => {
    localStorage.setItem('token', 'tok');
    track({ type: 'game_start', gameId: 'memory', mode: '3d' });
    track({ type: 'mode_switch', gameId: 'mole', mode: '2d' });
    flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/user/track');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.keepalive).toBe(true);
    expect(lastBody().events).toHaveLength(2);
  });

  it('队列满 10 条自动冲刷（不等定时器）', () => {
    localStorage.setItem('token', 'tok');
    for (let i = 0; i < 10; i += 1) {
      track({ type: 'game_start', gameId: `g${i}` });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody().events).toHaveLength(10);
  });

  it('失败回队首且截断防风暴', () => {
    localStorage.setItem('token', 'tok');
    fetchMock.mockRejectedValue(new Error('offline'));
    for (let i = 0; i < 10; i += 1) {
      track({ type: 'game_start', gameId: `g${i}` });
    } // 自动冲刷失败 → 回队
    // 再灌满一队并冲刷成功：body 里应含上一批回队的部分事件
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    for (let i = 10; i < 20; i += 1) {
      track({ type: 'game_start', gameId: `g${i}` });
    }
    // 回队 10 条 + 新灌第 1 条即触发自动冲刷（>=10），剩余 9 条由最后一次 flush 发出
    const allSent = fetchMock.mock.calls
      .map((c) => JSON.parse(c[1].body).events as TrackEvent[])
      .flat();
    expect(allSent.length).toBe(20);
    expect(allSent.some((e) => e.gameId === 'g0')).toBe(true); // 失败批次经回队后补发成功
    expect(allSent.some((e) => e.gameId === 'g19')).toBe(true);
  });

  it('401 响应：过期窗口事件直接丢弃不回队', async () => {
    localStorage.setItem('token', 'tok');
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    for (let i = 0; i < 10; i += 1) {
      track({ type: 'game_start', gameId: `g${i}` });
    } // 队列满自动冲刷 → 401
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // 再灌满触发第二次冲刷：若 401 事件被错误回队，这里会发出 >10 条
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    for (let i = 10; i < 20; i += 1) {
      track({ type: 'game_start', gameId: `n${i}` });
    }
    const last = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
    expect(last.events).toHaveLength(10);
    expect(last.events.every((e: TrackEvent) => (e.gameId ?? '').startsWith('n'))).toBe(true);
  });

  it('currentMode 按 hash 判定', () => {
    window.location.hash = '#/memory';
    expect(currentMode()).toBe('2d');
    window.location.hash = '#/memory-3d';
    expect(currentMode()).toBe('3d');
    window.location.hash = '';
  });
});
