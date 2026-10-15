import { ref } from 'vue';
import { soundManager } from '@/utils/sound';

const MUTE_STORAGE_KEY = 'games_sound_muted';

function readStoredMute(): boolean {
  try {
    return localStorage.getItem(MUTE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function useGameSounds() {
  // 静音状态全局持久化：换游戏、刷新后保持
  const isMuted = ref(readStoredMute());
  soundManager.setMuted(isMuted.value);

  const init = () => soundManager.init();

  const toggleSound = () => {
    isMuted.value = !isMuted.value;
    soundManager.setMuted(isMuted.value);
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, isMuted.value ? '1' : '0');
    } catch {
      // localStorage 不可用时忽略
    }
  };

  const play = (
    name: 'click' | 'success' | 'fail' | 'match' | 'pop' | 'shoot' | 'explosion' | 'levelUp' | 'bounce' | 'collect',
    options?: { pitch?: number }
  ) => {
    if (isMuted.value) return;
    soundManager.resume();
    if (name === 'match' && options?.pitch && options.pitch !== 1) {
      soundManager.playMatch(options.pitch);
      return;
    }
    const method = `play${name.charAt(0).toUpperCase() + name.slice(1)}` as keyof typeof soundManager;
    (soundManager[method] as () => void)();
  };

  return { isMuted, init, toggleSound, play };
}
