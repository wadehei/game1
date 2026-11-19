import { API_ORIGIN } from './apiOrigin';
import { storage } from './storage';

/**
 * 轻量行为埋点（产品决策数据：哪些游戏被玩、3D 使用率、低帧回退率）
 * 设计：队列批量 + 10s 定时/pagehide 冲刷 + fetch keepalive；
 * 火后不管——未登录/离线/失败一律静默丢弃，绝不影响游戏主流程。
 */

export type TrackType =
  | 'game_start'
  | 'game_end'
  | 'mode_switch'
  | 'parent_set_default'
  | 'fps_fallback'
  | 'battle_room_open';

export interface TrackEvent {
  type: TrackType;
  gameId?: string;
  mode?: '2d' | '3d';
  level?: number;
  meta?: Record<string, string | number | boolean>;
}

const QUEUE_CAP = 100;
const FLUSH_AT = 10; // 队列满即冲
const FLUSH_INTERVAL_MS = 10000;

const queue: TrackEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let listenersBound = false;

/** 当前渲染模式：单机 3D 页路由带 -3d；对战同路由由调用方显式传 mode */
export const currentMode = (): '2d' | '3d' => (location.hash.includes('-3d') ? '3d' : '2d');

export function track(event: TrackEvent): void {
  queue.push(event);
  if (queue.length >= FLUSH_AT) {
    flush();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => flush(), FLUSH_INTERVAL_MS);
  }
}

export function flush(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (queue.length === 0) return;
  const token = storage.getItem('token');
  if (!token) {
    // 未登录：埋点无归属，直接丢弃（选角页/登录页不打点）
    queue.length = 0;
    return;
  }
  const events = queue.splice(0, QUEUE_CAP);
  // keepalive: 页面卸载时请求仍能发出（pagehide 冲刷的关键）
  fetch(`${API_ORIGIN}/api/user/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ events }),
    keepalive: true,
  })
    .then((resp) => {
      // 401/403：token 过期或无效——过期窗口的事件无补发价值，直接丢弃
      // （回队会导致 401 期间事件滞留队列反复失败，直到页面关闭全丢）
      if (resp.status === 401 || resp.status === 403) {
        return;
      }
      if (!resp.ok) {
        requeue(events);
      }
    })
    .catch(() => {
      // 网络失败：回队首（截断防无限增长）——丢点可接受，不重试风暴
      requeue(events);
    });
}

function requeue(events: TrackEvent[]): void {
  queue.unshift(...events.slice(-QUEUE_CAP));
  if (queue.length > QUEUE_CAP) queue.length = QUEUE_CAP;
}

function bindPageLifecycle(): void {
  if (listenersBound) return;
  listenersBound = true;
  window.addEventListener('pagehide', () => flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

bindPageLifecycle();
