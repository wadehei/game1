// 对战房间 WebSocket 客户端：自动重连（断线后回到原房间，座位保留）
import { ref } from 'vue';

export type WsHandler = (msg: any) => void;

export const useRoomWs = () => {
  const status = ref<'connecting' | 'open' | 'closed'>('closed');
  const handlers = new Map<string, Set<WsHandler>>();
  let ws: WebSocket | null = null;
  let url = '';
  let retry = 0;
  let closedByUser = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const on = (t: string, fn: WsHandler) => {
    if (!handlers.has(t)) handlers.set(t, new Set());
    handlers.get(t)!.add(fn);
  };
  const off = (t: string, fn: WsHandler) => handlers.get(t)?.delete(fn);

  const dispatch = (msg: any) => {
    handlers.get(msg.t)?.forEach((fn) => fn(msg));
    handlers.get('*')?.forEach((fn) => fn(msg));
  };

  const connect = (roomId: string) => {
    const token = localStorage.getItem('token') || '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    url = `${proto}://${location.host}/ws?token=${encodeURIComponent(token)}&roomId=${encodeURIComponent(roomId)}`;
    closedByUser = false;
    status.value = 'connecting';
    ws = new WebSocket(url);

    ws.onopen = () => {
      status.value = 'open';
      retry = 0;
    };
    ws.onmessage = (e) => {
      try {
        dispatch(JSON.parse(e.data));
      } catch {
        // 忽略非 JSON 帧
      }
    };
    ws.onclose = (e) => {
      status.value = 'closed';
      handlers.get('disconnected')?.forEach((fn) => fn(e));
      // 服务端明确关门（房间解散/未登录）不重连
      if (closedByUser || e.code === 4001 || e.code === 4002) return;
      retry += 1;
      const delay = Math.min(1000 * 2 ** Math.min(retry - 1, 4), 10000);
      retryTimer = setTimeout(() => connect(roomId), delay);
    };
    ws.onerror = () => ws?.close();
  };

  const send = (obj: Record<string, unknown>): boolean => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  };

  const close = () => {
    closedByUser = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
    ws = null;
    status.value = 'closed';
  };

  // 保活：每 25 秒 ping，防代理空闲断链
  setInterval(() => send({ t: 'ping' }), 25000);

  return { status, connect, send, close, on, off };
};
