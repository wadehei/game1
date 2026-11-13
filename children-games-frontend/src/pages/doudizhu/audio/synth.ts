/**
 * Web Audio API 音效合成系统
 * 零外部音频文件依赖，实时合成所有音效
 * 借鉴 claude-opus-5-5-demo 的实现方式
 */

import { CardPattern } from '../utils/types';

export type SoundType =
  | 'click' // 点击
  | 'select' // 选中牌
  | 'deselect' // 取消选中
  | 'play' // 出牌
  | 'pass' // 不要
  | 'bomb' // 炸弹
  | 'rocket' // 火箭
  | 'deal' // 发牌
  | 'win' // 胜利
  | 'lose' // 失败
  | 'bid' // 叫地主
  | 'landlord' // 成为地主
  | 'straight' // 顺子
  | 'triple' // 三带
  | 'hint' // 提示
  | 'grab' // 抢地主
  | 'no_bid' // 不叫/不抢
  | 'last_card' // 最后一张牌
  | 'airplane' // 飞机
  | 'four_with_two'; // 四带二

interface SoundConfig {
  duration: number;
  type: OscillatorType;
  frequencies: number[]; // 频率变化序列
  gains: number[]; // 音量变化序列
  detune?: number;
}

const SOUND_CONFIGS: Record<SoundType, SoundConfig> = {
  click: {
    duration: 0.05,
    type: 'sine',
    frequencies: [800, 400],
    gains: [0.3, 0],
  },
  select: {
    duration: 0.1,
    type: 'sine',
    frequencies: [600, 900],
    gains: [0.2, 0.3],
  },
  deselect: {
    duration: 0.08,
    type: 'sine',
    frequencies: [900, 600],
    gains: [0.2, 0],
  },
  play: {
    duration: 0.15,
    type: 'triangle',
    frequencies: [300, 500, 400],
    gains: [0.3, 0.4, 0],
  },
  pass: {
    duration: 0.2,
    type: 'sine',
    frequencies: [400, 300, 200],
    gains: [0.2, 0.15, 0],
  },
  bomb: {
    duration: 0.5,
    type: 'sawtooth',
    frequencies: [100, 200, 80, 40],
    gains: [0.5, 0.6, 0.4, 0],
  },
  rocket: {
    duration: 0.6,
    type: 'sawtooth',
    frequencies: [200, 400, 800, 1200, 600, 200],
    gains: [0.3, 0.4, 0.5, 0.6, 0.3, 0],
  },
  deal: {
    duration: 0.08,
    type: 'sine',
    frequencies: [1000, 800],
    gains: [0.15, 0],
  },
  win: {
    duration: 0.8,
    type: 'sine',
    frequencies: [523, 659, 784, 1047, 784, 1047],
    gains: [0.3, 0.35, 0.4, 0.45, 0.35, 0],
  },
  lose: {
    duration: 0.6,
    type: 'sine',
    frequencies: [400, 350, 300, 200],
    gains: [0.3, 0.25, 0.2, 0],
  },
  bid: {
    duration: 0.15,
    type: 'square',
    frequencies: [500, 700],
    gains: [0.15, 0.2],
  },
  landlord: {
    duration: 0.4,
    type: 'triangle',
    frequencies: [400, 500, 600, 800],
    gains: [0.25, 0.3, 0.35, 0],
  },
  straight: {
    duration: 0.3,
    type: 'sine',
    frequencies: [400, 500, 600, 700, 800],
    gains: [0.2, 0.25, 0.3, 0.35, 0],
  },
  triple: {
    duration: 0.25,
    type: 'triangle',
    frequencies: [500, 600, 700],
    gains: [0.25, 0.3, 0],
  },
  hint: {
    duration: 0.12,
    type: 'sine',
    frequencies: [700, 900, 700],
    gains: [0.2, 0.25, 0],
  },
  grab: {
    duration: 0.2,
    type: 'square',
    frequencies: [600, 800, 1000],
    gains: [0.2, 0.25, 0],
  },
  no_bid: {
    duration: 0.15,
    type: 'sine',
    frequencies: [300, 200],
    gains: [0.15, 0],
  },
  last_card: {
    duration: 0.3,
    type: 'triangle',
    frequencies: [800, 1000, 1200, 1000],
    gains: [0.3, 0.4, 0.35, 0],
  },
  airplane: {
    duration: 0.5,
    type: 'sawtooth',
    frequencies: [300, 400, 500, 600, 700, 800, 900],
    gains: [0.2, 0.25, 0.3, 0.35, 0.3, 0.25, 0],
  },
  four_with_two: {
    duration: 0.35,
    type: 'triangle',
    frequencies: [400, 500, 600, 700, 600],
    gains: [0.25, 0.3, 0.35, 0.3, 0],
  },
};

export class AudioSynth {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private volume = 0.5;

  /**
   * 初始化音频上下文（需要用户交互后调用）
   */
  init(): void {
    if (this.ctx) return;

    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.volume;
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  /**
   * 播放音效
   */
  play(type: SoundType): void {
    if (!this.ctx || !this.masterGain || this.muted) return;

    const config = SOUND_CONFIGS[type];
    if (!config) return;

    const now = this.ctx.currentTime;
    const duration = config.duration;

    // 创建振荡器
    const osc = this.ctx.createOscillator();
    osc.type = config.type;

    // 创建增益节点
    const gain = this.ctx.createGain();

    // 连接
    osc.connect(gain);
    gain.connect(this.masterGain);

    // 设置频率变化
    config.frequencies.forEach((freq, i) => {
      const time = now + (duration * i) / (config.frequencies.length - 1);
      osc.frequency.setValueAtTime(freq, time);
    });

    // 设置音量变化
    config.gains.forEach((vol, i) => {
      const time = now + (duration * i) / (config.gains.length - 1);
      gain.gain.setValueAtTime(vol, time);
    });

    // 开始和结束
    osc.start(now);
    osc.stop(now + duration);
  }

  /**
   * 播放发牌音效（连续多张）
   */
  playDeal(count: number = 17): void {
    if (!this.ctx || this.muted) return;

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        this.play('deal');
      }, i * 50);
    }
  }

  /**
   * 播放出牌音效（根据牌型）
   */
  playPlaySound(pattern?: CardPattern | string): void {
    switch (pattern) {
      case CardPattern.Bomb:
      case 'bomb':
        this.play('bomb');
        break;
      case CardPattern.Rocket:
      case 'rocket':
        this.play('rocket');
        break;
      case CardPattern.Straight:
      case CardPattern.StraightPair:
      case 'straight':
      case 'straight_pair':
        this.play('straight');
        break;
      case CardPattern.Triple:
      case CardPattern.TripleWithOne:
      case CardPattern.TripleWithPair:
      case 'triple':
      case 'triple_one':
      case 'triple_two':
        this.play('triple');
        break;
      case CardPattern.Airplane:
      case CardPattern.AirplaneWithSingles:
      case CardPattern.AirplaneWithPairs:
      case 'airplane':
      case 'airplane_with_singles':
      case 'airplane_with_pairs':
        this.play('airplane');
        break;
      case CardPattern.FourWithTwo:
      case CardPattern.FourWithTwoPairs:
      case 'four_with_two':
      case 'four_with_two_pairs':
        this.play('four_with_two');
        break;
      default:
        this.play('play');
    }
  }

  /**
   * 播放叫分音效
   */
  playBid(bid: number): void {
    if (bid === 0) {
      this.play('no_bid');
    } else {
      this.play('bid');
    }
  }

  /**
   * 播放抢地主音效
   */
  playGrab(grabbed: boolean): void {
    if (grabbed) {
      this.play('grab');
    } else {
      this.play('no_bid');
    }
  }

  /**
   * 播放最后一张牌音效
   */
  playLastCard(): void {
    this.play('last_card');
  }

  /**
   * 设置静音
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /**
   * 获取静音状态
   */
  isMuted(): boolean {
    return this.muted;
  }

  /**
   * 切换静音
   */
  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  /**
   * 设置音量 (0-1)
   */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  /**
   * 恢复音频上下文（在用户交互后调用）
   */
  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * 销毁
   */
  destroy(): void {
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}

// 单例
let audioInstance: AudioSynth | null = null;

export function getAudioSynth(): AudioSynth {
  if (!audioInstance) {
    audioInstance = new AudioSynth();
  }
  return audioInstance;
}
