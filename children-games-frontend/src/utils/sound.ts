/**
 * SoundManager — Web Audio API 合成音效系统
 * 为儿童游戏生成合成音效，无需外部音频文件
 */
class SoundManager {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private masterGain: GainNode | null = null;

  /** 初始化 AudioContext（必须在用户交互后调用） */
  init(): void {
    if (this.ctx) {
      this.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volumeFromStorage();
      this.masterGain.connect(this.ctx.destination);
      // 移动端浏览器要求首次用户手势后才能出声
      const unlock = () => this.resume();
      document.addEventListener('pointerdown', unlock, { once: true });
      document.addEventListener('touchstart', unlock, { once: true });
      document.addEventListener('keydown', unlock, { once: true });
    } catch {
      console.warn('Web Audio API 不可用');
    }
  }

  /** 恢复被浏览器暂停的音频上下文 */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /** 所有音效统一经过主音量节点 */
  private out(): AudioNode {
    return this.masterGain ?? (this.ctx?.destination as AudioNode);
  }

  /** 音量（0~1），家长中心可调，localStorage 持久化 */
  setVolume(volume: number): void {
    const v = Math.max(0, Math.min(1, volume));
    try {
      localStorage.setItem('games_volume', String(v));
    } catch {
      // ignore
    }
    if (this.masterGain) {
      this.masterGain.gain.value = v;
    }
  }

  getVolume(): number {
    try {
      const v = parseFloat(localStorage.getItem('games_volume') || '');
      if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
    } catch {
      // ignore
    }
    return 0.8;
  }

  private volumeFromStorage(): number {
    return this.getVolume();
  }

  // ─── 预定义游戏音效 ────────────────────────────────

  /** 短促 UI 点击音 — 440Hz sine, 50ms, 快速衰减 */
  playClick(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    osc.connect(gain).connect(this.out());
    osc.start(t);
    osc.stop(t + 0.05);
  }

  /** 胜利音效 — C5-E5-G5 三个上升音，每个 100ms */
  playSuccess(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const start = t + i * 0.1;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    });
  }

  /** 失败音效 — E4-C4 两个下降音，每个 150ms，triangle wave */
  playFail(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [329.63, 261.63]; // E4, C4

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const start = t + i * 0.15;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  /** 配对成功音 — C5+G5 和弦，200ms，sine */
  playMatch(pitch = 1): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const freqs = [523.25 * pitch, 783.99 * pitch]; // C5, G5（pitch 随连锁倍增，音调递进）

    freqs.forEach((freq) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.2, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  /** 爆破音 — 白噪声 burst, 30ms, 快速衰减 */
  playPop(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bufferSize = this.ctx.sampleRate * 0.03;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();

    source.buffer = buffer;
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    source.connect(gain).connect(this.out());
    source.start(t);
  }

  /** 射击音 — 频率扫描 800Hz→200Hz, 100ms, sawtooth */
  playShoot(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);

    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain).connect(this.out());
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** 爆炸音 — 低频噪声 100-200Hz, 300ms */
  playExplosion(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;

    // 低频振荡器
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.3);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    osc.connect(gain).connect(this.out());
    osc.start(t);
    osc.stop(t + 0.3);

    // 叠加噪声层
    const bufferSize = this.ctx.sampleRate * 0.3;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const noiseSource = this.ctx.createBufferSource();
    const noiseGain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, t);

    noiseSource.buffer = buffer;
    noiseGain.gain.setValueAtTime(0.2, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

    noiseSource.connect(filter).connect(noiseGain).connect(this.out());
    noiseSource.start(t);
  }

  /** 升级音效 — C5-D5-E5-G5 四个上升音，每个 120ms */
  playLevelUp(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523.25, 587.33, 659.25, 783.99]; // C5, D5, E5, G5

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      const start = t + i * 0.12;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  }

  /** 弹跳音 — sine 扫频 300Hz→600Hz→300Hz, 100ms */
  playBounce(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.linearRampToValueAtTime(600, t + 0.05);
    osc.frequency.linearRampToValueAtTime(300, t + 0.1);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain).connect(this.out());
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** 指定频率纯音 — 用于音乐记忆游戏的音符（C5/E5/G5/C6 等） */
  playTone(freq: number, duration = 0.35): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(gain).connect(this.out());
    osc.start(t);
    osc.stop(t + duration);
  }

  /** 轮到你行动提醒 — G5→C6 双短音，清脆不打扰 */
  playTurn(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [783.99, 1046.5]; // G5, C6

    notes.forEach((freq, i) => {
      const start = t + i * 0.09;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

      osc.connect(gain).connect(this.out());
      osc.start(start);
      osc.stop(start + 0.12);
    });
  }

  /** 法语口音播报 — 用 fr-FR 语音念中文（「法国人说中文」热梗效果）；无法语语音时退回默认音色 */
  speakFrench(text: string): void {
    if (this.muted) return;
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const u = new SpeechSynthesisUtterance(text);
      const fr = synth.getVoices().find((v) => v.lang?.toLowerCase().startsWith('fr'));
      if (fr) u.voice = fr;
      u.lang = 'fr-FR';
      u.rate = 0.85;
      u.pitch = 1.05;
      u.volume = this.getVolume();
      synth.speak(u);
    } catch {
      // 语音不可用不影响对局
    }
  }

  /** 收集音 — 铃铛效果 A5 + 泛音, 150ms */
  playCollect(): void {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const baseFreq = 880; // A5
    const harmonics = [1, 2, 3]; // 基频 + 2倍频 + 3倍频
    const volumes = [0.2, 0.1, 0.05];

    harmonics.forEach((h, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * h, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volumes[i], t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

      osc.connect(gain).connect(this.ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }
}

export const soundManager = new SoundManager();
