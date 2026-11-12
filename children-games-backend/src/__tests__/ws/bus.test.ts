import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RoomBus } from '../../ws/bus';

describe('room bus', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should throw if bus not initialized', async () => {
    const { getRoomBus } = await import('../../ws/bus');
    expect(() => getRoomBus()).toThrow('room bus 尚未初始化');
  });

  it('should return the bus after setting it', async () => {
    const { setRoomBus, getRoomBus } = await import('../../ws/bus');
    const mockBus: RoomBus = {
      broadcast: vi.fn(),
      sendToUser: vi.fn(),
    };
    setRoomBus(mockBus);
    expect(getRoomBus()).toBe(mockBus);
  });
});
