// 对战房间 WebSocket 客户端：自动重连（断线后回到原房间，座位保留）
// 增强功能：指数退避 + jitter、消息队列离线缓冲、ACK 可靠性确认、双层心跳保活
import { ref } from 'vue';
import type { S2CEvent } from './wsTypes';

export type WsHandler = (msg: S2CEvent) => void;
/** 'disconnected' 事件实际转发的是浏览器 CloseEvent */
export type DisconnectHandler = (e: CloseEvent) => void;

/** 消息队列上限：防止断线期间积压过多消息 */
const MAX_QUEUE_SIZE = 50;
/** 客户端传输层心跳间隔（25s，防代理空闲断链） */
const CLIENT_HEARTBEAT_INTERVAL = 25_000;
/** 重连基础延迟（ms） */
const RECONNECT_BASE_DELAY = 1000;
/** 重连最大延迟（ms） */
const RECONNECT_MAX_DELAY = 10_000;
/** ACK 超时时间（30s）：超时后清理回调，防止内存泄漏 */
const ACK_TIMEOUT = 30_000;

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

  // ─── 消息队列：断线期间暂存待发送消息，重连后自动 flush ───────────────────
  const pendingMessages: string[] = [];

  // ─── ACK 追踪：记录待确认消息，收到 __ack__ 后回调 ───────────────────
  // 值包含回调和超时定时器，防止服务端未回复时内存泄漏
  const pendingAcks = new Map<
    string,
    { callback: () => void; timer: ReturnType<typeof setTimeout> }
  >();

  /** 生成唯一 ACK ID */
  const generateAckId = (): string => {
    return `ack_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  };

  /**
   * 计算重连延迟：指数退避 + ±25% 随机抖动
   * 避免多个客户端同时重连造成的"惊群效应"
   */
  function calcReconnectDelay(attempt: number): number {
    const exponentialDelay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, attempt),
      RECONNECT_MAX_DELAY
    );
    // ±25% jitter：让重连请求分散开
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    return exponentialDelay + jitter;
  }

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
    // 处理服务端 ACK 确认：从待确认队列中移除并触发回调
    if (msg.t === '__ack__') {
      const ackId = msg.ackId;
      if (ackId && pendingAcks.has(ackId)) {
        const entry = pendingAcks.get(ackId)!;
        pendingAcks.delete(ackId);
        clearTimeout(entry.timer); // 清理超时定时器
        entry.callback();
      }
      return;
    }

    handlers.get(msg.t)?.forEach((fn) => fn(msg));
    handlers.get('*')?.forEach((fn) => fn(msg));
  };

  /** 将队列中的待发送消息全部 flush 到 WebSocket */
  const flushPendingQueue = () => {
    while (pendingMessages.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
      const msg = pendingMessages.shift()!;
      ws.send(msg);
    }
  };

  const connect = (roomId: string) => {
    const token = localStorage.getItem('token') || '';
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    // 鉴权走握手 URL 的 token 参数：后端在连接时校验（必须为 access token 且未进黑名单），
    // 失效会以 4001 关闭。连接建立后的长连接不再重复鉴权。
    url = `${proto}://${location.host}/ws?roomId=${encodeURIComponent(roomId)}&token=${encodeURIComponent(token)}`;
    closedByUser = false;
    status.value = 'connecting';

    // 清理旧的重连定时器（防止重复创建）
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    const sock = new WebSocket(url);
    ws = sock;

    sock.onopen = () => {
      status.value = 'open';
      retry = 0;

      // 保活：连接成功后启动客户端心跳定时器
      // 使用传输层 __ping__（后端回复 __pong__），与游戏层 ping/pong 互补
      if (pingTimer) clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify({ t: '__ping__' }));
        }
      }, CLIENT_HEARTBEAT_INTERVAL);

      // 重连后 flush 断线期间积压的消息
      flushPendingQueue();
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

      // 连接关闭时清理心跳定时器
      if (pingTimer) {
        clearInterval(pingTimer);
        pingTimer = null;
      }

      disconnectHandlers.forEach((fn) => fn(e));
      // 服务端明确关门（房间解散/未登录）不重连
      if (closedByUser || e.code === 4001 || e.code === 4002) return;
      retry += 1;
      const delay = calcReconnectDelay(retry - 1);
      retryTimer = setTimeout(() => connect(roomId), delay);
    };
    ws.onerror = () => ws?.close();
  };

  /**
   * 发送消息。
   * - 连接正常时直接发送
   * - 连接断开时自动入队（上限 50 条），重连后自动 flush
   * - 若提供 ackCallback，会在服务端确认收到后触发回调（ACK 机制）
   *
   * @returns true 表示消息已发送或已入队；false 表示队列已满且连接不可用
   */
  const send = (obj: Record<string, unknown>, ackCallback?: () => void): boolean => {
    // 注入 ACK 字段：若调用方关心消息确认，自动生成 ackId 并注册回调
    if (ackCallback) {
      const ackId = generateAckId();
      obj.ack = ackId;
      // 超时清理：防止服务端未回复时回调永久残留导致内存泄漏
      const timer = setTimeout(() => {
        pendingAcks.delete(ackId);
      }, ACK_TIMEOUT);
      pendingAcks.set(ackId, { callback: ackCallback, timer });
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }

    // 连接不可用：入队等待重连后发送
    if (pendingMessages.length < MAX_QUEUE_SIZE) {
      pendingMessages.push(JSON.stringify(obj));
      return true;
    }

    // 队列已满，丢弃
    return false;
  };

  const close = () => {
    closedByUser = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (pingTimer) clearInterval(pingTimer);
    ws?.close();
    ws = null;
    status.value = 'closed';
    // 清理待确认的 ACK 回调和超时定时器（连接已关闭，不会再收到确认）
    for (const entry of pendingAcks.values()) {
      clearTimeout(entry.timer);
    }
    pendingAcks.clear();
  };

  return { status, connect, send, close, on, off };
};
