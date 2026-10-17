/**
 * 关卡默认难度公式 — 唯一数据源
 * - 游戏页：applyLevelConfig 用它生成基础配置（再叠加后台覆盖 + 自适应辅助）
 * - 后台难度配置面板：用它展示每关"生效值"
 *
 * 注意：字段白名单需与后端 levelController.LEVEL_FIELDS 保持同步
 */

export type LevelConfigValue = number | boolean;
export type LevelConfigMap = Record<string, LevelConfigValue>;

type Formula = (level: number) => LevelConfigMap;

// 难度设计原则：每一关都要有孩子能感知的变化（步长足够大），避免"连着几关一模一样"
const FORMULAS: Record<string, Formula> = {
  // 记忆翻牌：对数每关 +1（2→8 对封顶），限时每关 -4s
  memory: (level) => ({
    pairs: Math.min(1 + level, 8),
    timeLimit: Math.max(96 - (level - 1) * 4, 40),
  }),
  // 接水果：生成间隔每关 -70ms，下落速度每关 +0.5，炸弹概率每关 +3%
  fruit: (level) => ({
    spawnRate: Math.max(1000 - (level - 1) * 70, 380),
    fallSpeed: Math.min(2 + (level - 1) * 0.5, 9),
    bombChance: Math.min(0.12 + (level - 1) * 0.03, 0.4),
    targetScore: 100 + (level - 1) * 50,
    lives: 3,
  }),
  // 拼图：格子每 4 关升一档，限时每关 -12s（同格子内也有紧迫感差异）
  puzzle: (level) => ({
    gridSize: Math.min(3 + Math.floor((level - 1) / 4), 5),
    timeLimit: Math.max(180 - (level - 1) * 12, 50),
  }),
  // 打气球：生成间隔每关 -70ms，飘速每关 +0.25，限时分数每关 +40
  balloon: (level) => ({
    spawnRate: Math.max(1200 - (level - 1) * 70, 420),
    moveSpeed: Math.min(1 + (level - 1) * 0.25, 6),
    targetScore: 100 + (level - 1) * 40,
    bullets: 30 + (level - 1) * 4,
    rainbowChance: 0.05,
    goldenChance: 0.1,
  }),
  // 坦克：敌人数量每关 +1（封顶 9），速度每关 +0.3，射速每关 +5%
  tank: (level) => ({
    enemyCount: Math.min(2 + (level - 1), 9),
    enemySpeed: Math.min(1 + (level - 1) * 0.3, 6),
    enemyFireRate: Math.min(0.25 + (level - 1) * 0.05, 0.9),
    bossLevel: level % 5 === 0,
    bossHP: 10 + level * 2,
    playerSpeed: 3,
    autoFireInterval: 500,
    enemyBulletSpeed: 5,
    playerBulletSpeed: 8,
  }),
  // 打地鼠：生成间隔每关 -50ms，停留时间每关 -70ms，目标命中每关 +4
  mole: (level) => ({
    spawnInterval: Math.max(900 - (level - 1) * 50, 300),
    upDuration: Math.max(1300 - (level - 1) * 70, 500),
    bunnyChance: level >= 4 ? Math.min(0.12 + (level - 4) * 0.03, 0.35) : 0,
    timeLimit: 60,
    targetHits: 12 + (level - 1) * 4,
  }),
  simon: (level) => ({
    seqLength: Math.min(2 + level, 12),
    playbackMs: Math.max(620 - level * 25, 380),
  }),
  // 连线：对数每 2 关 +1（3→6），限时每关 -10s；配对类型按关卡轮换（数字/动物/颜色）
  match: (level) => ({
    pairs: Math.min(3 + Math.floor((level - 1) / 2), 6),
    timeLimit: Math.max(120 - (level - 1) * 10, 30),
  }),
  math: (level) => ({
    targetCorrect: 8,
    forceMode: 0,
    countMax: 0,
    addMax: 0,
    level, // 占位：math 的题目模式由关卡推导，level 参与推导（不单独可配）
  }),
  // 消消乐：目标分每关 +60，步数每 3 关 -1（下限 14）；emoji 种类前期少更易上手
  match3: (level) => ({
    targetScore: 200 + (level - 1) * 60,
    moves: Math.max(22 - Math.floor((level - 1) / 3), 14),
    kinds: level <= 3 ? 4 : level <= 8 ? 5 : 6,
  }),
  // 打砖块：砖排数每 2 关 +1（3→8 封顶），球速每关 +12，拍宽每关 -4（下限 70）
  brick: (level) => ({
    rows: Math.min(3 + Math.floor((level - 1) / 2), 8),
    ballSpeed: 170 + (level - 1) * 12,
    paddleWidth: Math.max(110 - (level - 1) * 4, 70),
    lives: 3,
  }),
};

/** 某游戏某关的内置默认配置（数值/布尔混合表，调用方按需取用） */
export const defaultLevelConfig = (gameId: string, level: number): Record<string, any> => {
  const formula = FORMULAS[gameId];
  return formula ? formula(level) : {};
};

/** 各字段中文说明（后台动态表单用）；isBool = 布尔开关 */
export interface FieldDef {
  key: string;
  label: string;
  isBool?: boolean;
  step?: string;
}

export const LEVEL_FIELD_DEFS: Record<string, FieldDef[]> = {
  memory: [
    { key: 'pairs', label: '卡片对数（2~8）' },
    { key: 'timeLimit', label: '时限（秒）' },
  ],
  fruit: [
    { key: 'spawnRate', label: '掉落间隔（毫秒，越小越难）' },
    { key: 'fallSpeed', label: '下落速度' },
    { key: 'bombChance', label: '炸弹概率 0~1', step: '0.01' },
    { key: 'targetScore', label: '目标分数' },
    { key: 'lives', label: '生命值（可承受炸弹数）' },
  ],
  puzzle: [
    { key: 'gridSize', label: '拼图边长（2~6 格）' },
    { key: 'timeLimit', label: '时限（秒）' },
  ],
  balloon: [
    { key: 'spawnRate', label: '上浮间隔（毫秒，越小越难）' },
    { key: 'moveSpeed', label: '上浮速度' },
    { key: 'targetScore', label: '目标分数' },
    { key: 'bullets', label: '子弹数' },
    { key: 'rainbowChance', label: '彩虹气球概率 0~1', step: '0.01' },
    { key: 'goldenChance', label: '金色气球概率 0~1', step: '0.01' },
  ],
  tank: [
    { key: 'enemyCount', label: '敌人数量' },
    { key: 'enemySpeed', label: '敌人速度' },
    { key: 'enemyFireRate', label: '敌人开火率 0~1', step: '0.01' },
    { key: 'bossLevel', label: 'Boss 关', isBool: true },
    { key: 'bossHP', label: 'Boss 血量' },
    { key: 'playerSpeed', label: '玩家坦克速度' },
    { key: 'autoFireInterval', label: '自动开火间隔（毫秒）' },
    { key: 'enemyBulletSpeed', label: '敌方子弹速度' },
    { key: 'playerBulletSpeed', label: '我方子弹速度' },
  ],
  mole: [
    { key: 'spawnInterval', label: '出洞间隔（毫秒，越小越难）' },
    { key: 'upDuration', label: '露头时长（毫秒，越小越难）' },
    { key: 'bunnyChance', label: '兔子概率 0~1', step: '0.01' },
    { key: 'timeLimit', label: '时限（秒）' },
    { key: 'targetHits', label: '目标击中数' },
  ],
  simon: [
    { key: 'seqLength', label: '记忆序列步数' },
    { key: 'playbackMs', label: '播放节奏（毫秒/步，越小越难）' },
  ],
  math: [
    { key: 'targetCorrect', label: '答对题数' },
    { key: 'forceMode', label: '题目模式（0自动 1数数 2加法）' },
    { key: 'countMax', label: '数数上限（0=按关卡自动）' },
    { key: 'addMax', label: '加法上限（0=按关卡自动）' },
  ],
  match3: [
    { key: 'targetScore', label: '目标分数' },
    { key: 'moves', label: '步数' },
    { key: 'kinds', label: 'emoji 种类（4~6）' },
  ],
  brick: [
    { key: 'rows', label: '砖块排数（3~8）' },
    { key: 'ballSpeed', label: '球速' },
    { key: 'paddleWidth', label: '球拍宽度' },
    { key: 'lives', label: '生命值（可掉球次数）' },
  ],
};

/** 后台配置摘要展示（字段取短标签） */
export const formatLevelConfig = (gameId: string, config: LevelConfigMap): string => {
  const defs = LEVEL_FIELD_DEFS[gameId] || [];
  return Object.entries(config)
    .map(([k, v]) => {
      const label = defs.find((d) => d.key === k)?.label || k;
      return `${label.split('（')[0]} ${v}`;
    })
    .join(' · ');
};
