// 对战房间 WebSocket 客户端：自动重连（断线后回到原房间，座位保留）
import { ref } from 'vue';
import type { S2CEvent } from './wsTypes';

export type WsHandler = (msg: S2CEvent) => void;
/** 'disconnected' 事件实际转发的是浏览器 CloseEvent */
export type DisconnectHandler = (e: CloseEvent) => void;

export const useRoomWs = () => {
  const status = ref<'connecting' | 'open' | 'closed'>('closed');
  const handlers = new Map<string, Set<WsHandler>>();
  const disconnectHandlers = new Set<DisconnectHandler>();
  let ws: WebSocket | null = null;
  let url = '';
  let retry = 0;
  let closedByUser = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;

  function on(t: 'disconnected', fn: DisconnectHandler): void;
  function on(t: string, fn: WsHandler): void;
  function on(t: string, fn: WsHandler | DisconnectHandler): void {
    if (t === 'disconnected') {
      disconnectHandlers.add(fn as DisconnectHandler);
      return;
    }
    if (!handlers.has(t)) handlers.set(t, new Set());
    handlers.get(t)!.add(fn as WsHandler);
  }
  function off(t: 'disconnected', fn: DisconnectHandler): void;
  function off(t: string, fn: WsHandler): void;
  function off(t: string, fn: WsHandler | DisconnectHandler): void {
    if (t === 'disconnected') {
      disconnectHandlers.delete(fn as DisconnectHandler);
      return;
    }
    handlers.get(t)?.delete(fn as WsHandler);
  }

  const dispatch = (msg: S2CEvent) => {
    handlers.get(msg.t)?.forEach((fn) => fn(msg));
    handlers.get('*')?.forEach((fn) => fn(msg));
  };

  const connect = (roomId: string) => {
    const token = localStorage.getItem('token') || '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // 鉴权走握手 URL 的 token 参数：后端在连接时校验（必须为 access token 且未进黑名单），
    // 失效会以 4001 关闭。连接建立后的长连接不再重复鉴权。
    url = `${proto}://${location.host}/ws?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`;
    closedByUser = false;
    status.value = 'connecting';
    const sock = new WebSocket(url);
    ws = sock;

    sock.onopen = () => {
      status.value = 'open';
      retry = 0;
    };
    sock.onmessage = (e) => {
      try {
        dispatch(JSON.parse(e.data));
      } catch {
        // 忽略非 JSON 帧
      }
    };
    sock.onclose = (e) => {
      status.value = 'closed';
      disconnectHandlers.forEach((fn) => fn(e));
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
    if (pingTimer) clearInterval(pingTimer);
    ws?.close();
    ws = null;
    status.value = 'closed';
  };

  // 保活：每 25 秒 ping，防代理空闲断链
  pingTimer = setInterval(() => send({ t: 'ping' }), 25000);

  return { status, connect, send, close, on, off };
};
