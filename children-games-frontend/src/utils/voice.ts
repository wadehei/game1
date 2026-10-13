/**
 * 语音引导 — 基于浏览器内置 speechSynthesis（zh-CN），零音频资源
 * 跟随游戏的静音开关（games_sound_muted）
 */

/** 首次用户手势后预热语音引擎（部分浏览器要求手势后才能发声） */
export const initVoice = (): void => {
  if (!('speechSynthesis' in window)) return;
  const warm = () => {
    try {
      window.speechSynthesis.getVoices();
    } catch {
      // ignore
    }
  };
  document.addEventListener('pointerdown', warm, { once: true });
  document.addEventListener('touchstart', warm, { once: true });
};

const isMuted = (): boolean => {
  try {
    return localStorage.getItem('games_sound_muted') === '1';
  } catch {
    return false;
  }
};

/** 朗读一句话：自动打断上一句，静音时不读 */
export const speak = (text: string): void => {
  if (!text || isMuted() || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 0.95;
    utter.pitch = 1.05;
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('zh'));
    if (voice) {
      utter.voice = voice;
    }
    synth.speak(utter);
  } catch {
    // 语音不可用时静默降级
  }
};

/** 停止朗读（游戏退出/暂停时调用） */
export const stopSpeaking = (): void => {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
};
