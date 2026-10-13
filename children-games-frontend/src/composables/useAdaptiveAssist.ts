import { useUserStore } from '@/store/user';

/**
 * 难度自适应辅助（按 角色+游戏 隔离存储）：
 * - 连败 2 次自动升一档辅助（0→1→2，封顶），加时长/减目标/减数量由各游戏按自身规则应用
 * - 通关一次自动降一档，连胜会逐步退回默认难度
 * 孩子无感知，家长可在后台难度配置里做更精确的调整
 */
export function useAdaptiveAssist(gameId: string) {
  const userStore = useUserStore();

  const storageKey = (): string => `assist_${userStore.userInfo?.id || 0}_${gameId}`;

  const readState = (): { assist: number; streak: number } => {
    try {
      const raw = JSON.parse(localStorage.getItem(storageKey()) || '{}');
      return {
        assist: Math.min(2, Math.max(0, parseInt(raw.assist, 10) || 0)),
        streak: Math.max(0, parseInt(raw.streak, 10) || 0),
      };
    } catch {
      return { assist: 0, streak: 0 };
    }
  };

  const writeState = (state: { assist: number; streak: number }): void => {
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch {
      // ignore
    }
  };

  /** 当前辅助档位 0~2 */
  const level = (): number => readState().assist;

  /** 结算一局：赢了降档，连败两次升档；返回最新档位 */
  const record = (won: boolean): number => {
    const state = readState();
    if (won) {
      writeState({ assist: Math.max(0, state.assist - 1), streak: 0 });
    } else {
      const streak = state.streak + 1;
      const assist = streak >= 2 ? Math.min(2, state.assist + 1) : state.assist;
      writeState({ assist, streak: streak >= 2 ? 0 : streak });
    }
    return level();
  };

  return { level, record };
}
