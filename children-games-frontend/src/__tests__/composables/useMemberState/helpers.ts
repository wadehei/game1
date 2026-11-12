import { ref, computed, type Ref, type ComputedRef } from 'vue';
import type { GameState, FinalData } from '@/composables/wsTypes';

export interface MockMember {
  userId: number;
  seat: number;
  ready: boolean;
  online: boolean;
}

export interface MockParams {
  myId: ComputedRef<number>;
  gameType: Ref<string>;
  phase: Ref<'waiting' | 'playing' | 'ended'>;
  game: Ref<GameState>;
  gameEvents: Record<string, unknown>;
  finalData: ComputedRef<FinalData | null>;
  chipTableGames: string[];
}

export function createMockMember(overrides: Partial<MockMember> = {}): MockMember {
  return {
    userId: 1,
    seat: 0,
    ready: false,
    online: true,
    ...overrides,
  };
}

export function createMockParams(overrides: Partial<MockParams> = {}): MockParams {
  return {
    myId: computed(() => 1),
    gameType: ref('memory'),
    phase: ref('waiting'),
    game: ref({}) as Ref<GameState>,
    gameEvents: {},
    finalData: computed(() => null),
    chipTableGames: ['blackjack', 'zjh'],
    ...overrides,
  };
}
