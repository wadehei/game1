import { describe, it, expect } from 'vitest';
import { ref, computed } from 'vue';
import { useBattleHelpers, type BattleMember } from '../../composables/useBattleHelpers';

describe('useBattleHelpers', () => {
  const createMembers = (): BattleMember[] => [
    { userId: 1, nickname: '玩家A', seat: 0 },
    { userId: 2, nickname: '玩家B', seat: 1 },
    { userId: 3, nickname: '玩家C', seat: 2 },
  ];

  describe('nameOfUser', () => {
    it('should return nickname for existing user', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(99); // 不是任何成员

      const { nameOfUser } = useBattleHelpers({ members, myId });

      expect(nameOfUser(1)).toBe('玩家A');
      expect(nameOfUser(2)).toBe('玩家B');
    });

    it('should append "（我）" for current user', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(2); // 玩家B

      const { nameOfUser } = useBattleHelpers({ members, myId });

      expect(nameOfUser(2)).toBe('玩家B（我）');
      expect(nameOfUser(1)).toBe('玩家A');
    });

    it('should return fallback for non-existing user', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(1);

      const { nameOfUser } = useBattleHelpers({ members, myId });

      expect(nameOfUser(999)).toBe('角色999');
    });

    it('should handle undefined members', () => {
      const members = ref<BattleMember[] | undefined>(undefined);
      const myId = ref(1);

      const { nameOfUser } = useBattleHelpers({ members, myId });

      expect(nameOfUser(1)).toBe('角色1');
    });
  });

  describe('nameOfSeat', () => {
    it('should return nickname for existing seat', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(99);

      const { nameOfSeat } = useBattleHelpers({ members, myId });

      expect(nameOfSeat(0)).toBe('玩家A');
      expect(nameOfSeat(1)).toBe('玩家B');
    });

    it('should append "（我）" for current user seat', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(3); // 玩家C，座位2

      const { nameOfSeat } = useBattleHelpers({ members, myId });

      expect(nameOfSeat(2)).toBe('玩家C（我）');
      expect(nameOfSeat(0)).toBe('玩家A');
    });

    it('should return fallback for non-existing seat', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(1);

      const { nameOfSeat } = useBattleHelpers({ members, myId });

      expect(nameOfSeat(99)).toBe('座位100');
    });
  });

  describe('seatOfUser', () => {
    it('should return seat for existing user', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(1);

      const { seatOfUser } = useBattleHelpers({ members, myId });

      expect(seatOfUser(1)).toBe(0);
      expect(seatOfUser(2)).toBe(1);
      expect(seatOfUser(3)).toBe(2);
    });

    it('should return -1 for non-existing user', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(1);

      const { seatOfUser } = useBattleHelpers({ members, myId });

      expect(seatOfUser(999)).toBe(-1);
    });
  });

  describe('userIdOfSeat', () => {
    it('should return userId for existing seat', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(1);

      const { userIdOfSeat } = useBattleHelpers({ members, myId });

      expect(userIdOfSeat(0)).toBe(1);
      expect(userIdOfSeat(1)).toBe(2);
      expect(userIdOfSeat(2)).toBe(3);
    });

    it('should return undefined for non-existing seat', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(1);

      const { userIdOfSeat } = useBattleHelpers({ members, myId });

      expect(userIdOfSeat(99)).toBeUndefined();
    });
  });

  describe('isMyself', () => {
    it('should return true for current user id', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(2);

      const { isMyself } = useBattleHelpers({ members, myId });

      expect(isMyself(2)).toBe(true);
      expect(isMyself(1)).toBe(false);
    });
  });

  describe('isMySeat', () => {
    it('should return true for current user seat', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(3); // 座位2

      const { isMySeat } = useBattleHelpers({ members, myId });

      expect(isMySeat(2)).toBe(true);
      expect(isMySeat(0)).toBe(false);
    });

    it('should return false for unknown seat', () => {
      const members = ref<BattleMember[]>(createMembers());
      const myId = ref(1);

      const { isMySeat } = useBattleHelpers({ members, myId });

      expect(isMySeat(99)).toBe(false);
    });
  });
});
