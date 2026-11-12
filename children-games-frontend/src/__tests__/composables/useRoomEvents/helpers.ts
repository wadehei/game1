/**
 * Shared test helpers for useRoomEvents tests
 */
import { ref, reactive } from 'vue';
import { vi } from 'vitest';
import type { RoomEventContext } from '@/composables/useRoomEvents';

export function createMockWs() {
  const handlers = new Map<string, Array<(data: unknown) => void>>();
  return {
    on: vi.fn((event: string, handler: (data: unknown) => void) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    }),
    off: vi.fn(),
    close: vi.fn(),
    // Test helper: trigger an event
    emit: (event: string, data: unknown) => {
      handlers.get(event)?.forEach((h) => h(data));
    },
  };
}

export function createMockContext(overrides?: Partial<RoomEventContext>): RoomEventContext {
  return {
    myId: ref(1),
    mySeat: ref(0),
    gameType: ref('gomoku'),
    members: ref([]),
    phase: ref('waiting') as RoomEventContext['phase'],
    hostUserId: ref(0),
    board: ref([]),
    game: ref(null),
    chatList: ref([]),
    voiceList: ref([]),
    overReason: ref(''),
    rematchVotes: ref([]),
    rematchDeadlineAt: ref(0),
    lastWsError: ref(''),
    gameEvents: reactive<Record<string, unknown>>({}),
    applySnapshot: vi.fn(),
    scrollChat: vi.fn(),
    leaveToLobby: vi.fn(),
    ...overrides,
  };
}

export type MockWs = ReturnType<typeof createMockWs>;
export type MockCtx = ReturnType<typeof createMockContext>;
