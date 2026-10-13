/**
 * 语音引导 — 基于浏览器内置 speechSynthesis（zh-CN），零音频资源
 * 跟随游戏的静音开关（games_sound_muted）
 *
 * 音质优化：
 * - 智能挑选最优中文音色（优先 Edge Natural 自然语音 / Google 在线语音，
 *   其次本地女声 Yaoyao/Huihui，避免默认一号位机械音色）
 * - 按标点分句入队：停顿自然、长句不易截断
 * - 语速 0.9 / 音调 1.0（儿童友好，不尖不赶）
 */

/** 音色优先级：从上到下第一个命中的即使用 */
const VOICE_PREFERENCES: RegExp[] = [
  /xiaoxiao.*natural|xiaoxiao online/i,   // Edge 晓晓（自然语音，女）
  /yunxi.*natural|yunxi online/i,         // Edge 云希（自然语音，男）
  /xiaoyi.*natural|xiaoyi online/i,       // Edge 晓伊（自然语音，女童声）
  /google.*中文|google\s*普通话/i,        // Chrome 在线语音
  /yaoyao/i,                              // 本地 娅娅（女，较柔和）
  /huihui/i,                              // 本地 慧慧（女）
  /tingting|meijia/i,                     // 本地 Tingting/美佳
];

let cachedVoice: SpeechSynthesisVoice | null = null;
let voiceReady = false;

const pickBestVoice = (): SpeechSynthesisVoice | null => {
  try {
    const all = window.speechSynthesis.getVoices();
    const zh = all.filter((v) => v.lang && v.lang.toLowerCase().replace('_', '-').startsWith('zh'));
    if (zh.length === 0) return null;
    for (const rx of VOICE_PREFERENCES) {
      const hit = zh.find((v) => rx.test(v.name) || rx.test(v.voiceURI));
      if (hit) return hit;
    }
    // 兜底：优先大陆普通话音色
    return zh.find((v) => /zh-(cn|hans)/i.test(v.lang.replace('_', '-'))) || zh[0];
  } catch {
    return null;
  }
};

const ensureVoice = (): SpeechSynthesisVoice | null => {
  if (!voiceReady) {
    cachedVoice = pickBestVoice();
    if (cachedVoice) voiceReady = true;
  }
  return cachedVoice;
};

/** 首次用户手势后预热语音引擎（部分浏览器要求手势后才能发声，且音色列表异步加载） */
export const initVoice = (): void => {
  if (!('speechSynthesis' in window)) return;
  ensureVoice();
  // 音色列表是异步填充的，变更时重选
  window.speechSynthesis.onvoiceschanged = () => {
    voiceReady = false;
    ensureVoice();
  };
  const warm = () => ensureVoice();
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

/** 长句按标点切分为小段（保留语气，停顿由引擎按句处理更自然） */
const splitToChunks = (text: string): string[] => {
  const parts = text
    .split(/(?<=[，。！？；,!?;])/)
    .map((s) => s.trim())
    .filter(Boolean);
  // 过短的片段（如"好"）与下一段合并，避免一个字一顿
  const merged: string[] = [];
  for (const p of parts) {
    if (merged.length > 0 && merged[merged.length - 1].length < 3) {
      merged[merged.length - 1] += p;
    } else {
      merged.push(p);
    }
  }
  return merged.length > 0 ? merged : [text];
};

/** 朗读一句话：自动打断上一句，静音时不读 */
export const speak = (text: string): void => {
  if (!text || isMuted() || !('speechSynthesis' in window)) return;
  try {
    const synth = window.speechSynthesis;
    const voice = ensureVoice();

    const start = () => {
      synth.cancel();
      for (const chunk of splitToChunks(text)) {
        const utter = new SpeechSynthesisUtterance(chunk);
        if (voice) {
          utter.voice = voice;
          utter.lang = voice.lang;
        } else {
          utter.lang = 'zh-CN';
        }
        utter.rate = 0.9;
        utter.pitch = 1.0;
        synth.speak(utter);
      }
    };

    // 正在朗读时先取消并稍等，避免新句首字被吞
    if (synth.speaking || synth.pending) {
      synth.cancel();
      setTimeout(start, 60);
    } else {
      start();
    }
  } catch {
    // 语音不可用时静默降级
  }
};

/** 当前选中的音色名（后台试听/诊断用） */
export const currentVoiceName = (): string => {
  const v = ensureVoice();
  return v ? `${v.name} (${v.lang})` : '未找到中文音色';
};

/** 停止朗读（游戏退出/暂停时调用） */
export const stopSpeaking = (): void => {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    // ignore
  }
};
