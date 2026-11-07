import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: code || 1000, reason });
    }
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen({});
  }

  simulateMessage(data: any) {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }

  simulateClose(code = 1000) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose({ code });
  }
}

let instances: MockWebSocket[] = [];

// Mock location
vi.stubGlobal('location', {
  protocol: 'https:',
  host: 'example.com',
});

// Mock WebSocket
vi.stubGlobal('WebSocket', MockWebSocket);

import { useRoomWs } from '../../composables/useRoomWs';

describe('composables/useRoomWs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    instances = [];
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should start with closed status', () => {
      const { status } = useRoomWs();
      expect(status.value).toBe('closed');
    });

    it('should expose connect, send, close, on, off methods', () => {
      const ws = useRoomWs();
      expect(ws.connect).toBeTypeOf('function');
      expect(ws.send).toBeTypeOf('function');
      expect(ws.close).toBeTypeOf('function');
      expect(ws.on).toBeTypeOf('function');
      expect(ws.off).toBeTypeOf('function');
    });
  });

  describe('connect', () => {
    it('should create WebSocket with roomId and token in URL', () => {
      localStorage.setItem('token', 'test-token');
      const { connect } = useRoomWs();

      connect('room-123');

      expect(instances).toHaveLength(1);
      // 鉴权走握手 URL 的 token 参数（后端连接时校验 access token）
      expect(instances[0].url).toBe('wss://example.com/ws?roomId=room-123&token=test-token');
    });

    it('should URL-encode the token in the URL', () => {
      localStorage.setItem('token', 'a/b+c d');
      const { connect } = useRoomWs();

      connect('room-enc');

      expect(instances[0].url).toBe('wss://example.com/ws?roomId=room-enc&token=a%2Fb%2Bc%20d');
    });

    it('should use ws protocol for http', () => {
      vi.stubGlobal('location', { protocol: 'http:', host: 'localhost:3000' });
      const { connect } = useRoomWs();

      connect('room-456');

      expect(instances[0].url).toBe('ws://localhost:3000/ws?roomId=room-456&token=');
    });

    it('should set status to connecting', () => {
      const { status, connect } = useRoomWs();
      connect('room-789');
      expect(status.value).toBe('connecting');
    });

    it('should set status to open on WebSocket open', () => {
      const { status, connect } = useRoomWs();
      connect('room-abc');
      instances[0].simulateOpen();
      expect(status.value).toBe('open');
    });

    it('should not send any auth message on open (token is in URL)', () => {
      localStorage.setItem('token', 'my-jwt');
      const { connect } = useRoomWs();
      connect('room-auth');
      instances[0].simulateOpen();

      expect(instances[0].sentMessages).toHaveLength(0);
    });
  });

  describe('send', () => {
    it('should send JSON when WebSocket is open', () => {
      const { connect, send } = useRoomWs();
      connect('room-send');
      instances[0].simulateOpen();

      const result = send({ t: 'move', x: 1, y: 2 });

      expect(result).toBe(true);
      expect(instances[0].sentMessages).toHaveLength(1);
      const last = JSON.parse(instances[0].sentMessages[0]);
      expect(last).toEqual({ t: 'move', x: 1, y: 2 });
    });

    it('should return true and queue message when WebSocket is not open', () => {
      const { send } = useRoomWs();
      const result = send({ t: 'test' });
      // 消息队列功能：连接不可用时入队而非丢弃，返回 true 表示已入队
      expect(result).toBe(true);
    });
  });

  describe('message dispatching', () => {
    it('should call registered handler for message type', () => {
      const { connect, on } = useRoomWs();
      const handler = vi.fn();
      on('chat', handler);
      connect('room-msg');
      instances[0].simulateOpen();

      instances[0].simulateMessage({ t: 'chat', text: 'hello' });

      expect(handler).toHaveBeenCalledWith({ t: 'chat', text: 'hello' });
    });

    it('should support wildcard handler', () => {
      const { connect, on } = useRoomWs();
      const handler = vi.fn();
      on('*', handler);
      connect('room-wild');
      instances[0].simulateOpen();

      instances[0].simulateMessage({ t: 'move', x: 1 });
      instances[0].simulateMessage({ t: 'chat', text: 'hi' });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should not call handler for different message type', () => {
      const { connect, on } = useRoomWs();
      const handler = vi.fn();
      on('chat', handler);
      connect('room-filter');
      instances[0].simulateOpen();

      instances[0].simulateMessage({ t: 'move', x: 1 });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should ignore non-JSON messages', () => {
      const { connect } = useRoomWs();
      connect('room-json');
      instances[0].simulateOpen();

      // Simulate non-JSON message
      if (instances[0].onmessage) {
        instances[0].onmessage({ data: 'not json' });
      }

      // Should not throw
    });
  });

  describe('off', () => {
    it('should remove handler', () => {
      const { connect, on, off } = useRoomWs();
      const handler = vi.fn();
      on('chat', handler);
      connect('room-off');
      instances[0].simulateOpen();

      off('chat', handler);
      instances[0].simulateMessage({ t: 'chat' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should set status to closed', () => {
      const { status, connect, close } = useRoomWs();
      connect('room-close');
      instances[0].simulateOpen();

      close();

      expect(status.value).toBe('closed');
    });

    it('should not reconnect after user close', () => {
      const { connect, close } = useRoomWs();
      connect('room-no-reconnect');
      instances[0].simulateOpen();
      close();

      vi.advanceTimersByTime(20000);

      // Only one WebSocket instance should have been created
      expect(instances).toHaveLength(1);
    });
  });

  describe('auto-reconnect', () => {
    it('should reconnect after unexpected close', () => {
      const { connect } = useRoomWs();
      connect('room-reconnect');
      instances[0].simulateOpen();

      // Simulate unexpected close (code 1006 = abnormal closure)
      instances[0].simulateClose(1006);

      expect(instances).toHaveLength(1);
      vi.advanceTimersByTime(2000);
      expect(instances).toHaveLength(2);
    });

    it('should not reconnect on 4001 (room dissolved)', () => {
      const { connect } = useRoomWs();
      connect('room-dissolved');
      instances[0].simulateOpen();
      instances[0].simulateClose(4001);

      vi.advanceTimersByTime(20000);

      expect(instances).toHaveLength(1);
    });

    it('should not reconnect on 4002 (not logged in)', () => {
      const { connect } = useRoomWs();
      connect('room-noauth');
      instances[0].simulateOpen();
      instances[0].simulateClose(4002);

      vi.advanceTimersByTime(20000);

      expect(instances).toHaveLength(1);
    });

    it('should use exponential backoff with jitter', () => {
      // Mock Math.random to return 0.5 → jitter = delay * 0.25 * (0.5 * 2 - 1) = 0
      // 这样退避延迟与无 jitter 时相同，测试可预测
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const { connect } = useRoomWs();
      connect('room-backoff');

      // First connection closes unexpectedly
      instances[0].simulateOpen();
      instances[0].simulateClose(1006);
      // retry=1, delay = 1000 * 2^0 = 1000ms (jitter=0)

      // Should not reconnect before delay
      vi.advanceTimersByTime(500);
      expect(instances).toHaveLength(1);

      // First reconnect at 1000ms
      vi.advanceTimersByTime(500);
      expect(instances).toHaveLength(2);

      // Second connection also closes without opening (so retry accumulates)
      instances[1].simulateClose(1006);
      // retry=2, delay = 1000 * 2^1 = 2000ms (jitter=0)

      // Should not reconnect before delay
      vi.advanceTimersByTime(1500);
      expect(instances).toHaveLength(2);

      // Second reconnect at 2000ms
      vi.advanceTimersByTime(500);
      expect(instances).toHaveLength(3);

      randomSpy.mockRestore();
    });
  });

  describe('ping', () => {
    it('should send __ping__ (transport-layer heartbeat) every 25 seconds', () => {
      const { connect } = useRoomWs();
      connect('room-ping');
      instances[0].simulateOpen();

      expect(instances[0].sentMessages).toHaveLength(0);

      vi.advanceTimersByTime(25000);
      expect(instances[0].sentMessages).toHaveLength(1);
      const pingMsg = JSON.parse(instances[0].sentMessages[0]);
      expect(pingMsg).toEqual({ t: '__ping__' });
    });
  });

  describe('disconnected event', () => {
    it('should fire disconnected handler on close', () => {
      const { connect, on } = useRoomWs();
      const handler = vi.fn();
      on('disconnected', handler);
      connect('room-disconnect');
      instances[0].simulateOpen();

      instances[0].simulateClose(1006);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ code: 1006 }));
    });
  });

  describe('message queue', () => {
    it('should queue messages during disconnection and flush on reconnect', () => {
      const { connect, send } = useRoomWs();
      connect('room-queue');
      instances[0].simulateOpen();

      // Send a message while connected → should go through immediately
      send({ t: 'chat', content: 'hello' });
      expect(instances[0].sentMessages).toHaveLength(1);

      // Simulate disconnect
      instances[0].simulateClose(1006);

      // Send messages while disconnected → should be queued
      send({ t: 'chat', content: 'msg1' });
      send({ t: 'chat', content: 'msg2' });
      // No new WebSocket instance yet, messages queued
      expect(instances).toHaveLength(1);

      // Reconnect
      vi.advanceTimersByTime(2000);
      expect(instances).toHaveLength(2);
      instances[1].simulateOpen();

      // Queued messages should be flushed (2 queued messages)
      expect(instances[1].sentMessages).toHaveLength(2);
      const flushed1 = JSON.parse(instances[1].sentMessages[0]);
      const flushed2 = JSON.parse(instances[1].sentMessages[1]);
      expect(flushed1).toEqual({ t: 'chat', content: 'msg1' });
      expect(flushed2).toEqual({ t: 'chat', content: 'msg2' });
    });

    it('should drop messages when queue is full (max 50)', () => {
      const { connect, send } = useRoomWs();
      connect('room-queue-full');
      instances[0].simulateOpen();
      instances[0].simulateClose(1006);

      // Fill the queue beyond capacity
      let delivered = 0;
      for (let i = 0; i < 55; i++) {
        if (send({ t: 'test', i })) delivered++;
      }

      // First 50 should be queued (returning true), last 5 dropped (returning false)
      expect(delivered).toBe(50);
    });
  });

  describe('ACK support', () => {
    it('should call ackCallback when server sends __ack__', () => {
      const { connect, send, on } = useRoomWs();
      connect('room-ack');
      instances[0].simulateOpen();

      const ackFn = vi.fn();
      send({ t: 'chat', content: 'important' }, ackFn);

      // The sent message should include an ack field
      const sent = JSON.parse(instances[0].sentMessages[0]);
      expect(sent.ack).toBeDefined();
      expect(typeof sent.ack).toBe('string');

      // Simulate server ACK response
      instances[0].simulateMessage({ t: '__ack__', ackId: sent.ack });

      expect(ackFn).toHaveBeenCalledTimes(1);
    });

    it('should not crash on unexpected __ack__ messages', () => {
      const { connect, on } = useRoomWs();
      connect('room-ack-unknown');
      instances[0].simulateOpen();

      // Server sends ACK for unknown ID → should not throw
      expect(() => {
        instances[0].simulateMessage({ t: '__ack__', ackId: 'unknown_id' });
      }).not.toThrow();
    });
  });
});
