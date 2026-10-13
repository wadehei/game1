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

const FORMULAS: Record<string, Formula> = {
  memory: (level) => ({
    pairs: Math.min(2 + Math.floor((level - 1) / 2), 8),
    timeLimit: Math.max(90 - (level - 1) * 3, 30),
  }),
  fruit: (level) => ({
    spawnRate: Math.max(1000 - level * 30, 400),
    fallSpeed: 2 + level * 0.2,
    bombChance: Math.min(0.15 + level * 0.02, 0.35),
    targetScore: 100 + level * 30,
    lives: 3,
  }),
  puzzle: (level) => ({
    gridSize: Math.min(3 + Math.floor(level / 5), 5),
    timeLimit: Math.max(180 - level * 2, 60),
  }),
  balloon: (level) => ({
    spawnRate: Math.max(1200 - level * 25, 400),
    moveSpeed: 1 + level * 0.08,
    targetScore: 100 + level * 25,
    bullets: 30 + (level - 1) * 5,
    rainbowChance: 0.05,
    goldenChance: 0.1,
  }),
  tank: (level) => ({
    enemyCount: Math.max(2, 3 + Math.floor(level * 0.8)),
    enemySpeed: 1 + level * 0.1,
    enemyFireRate: Math.min(0.3 + level * 0.02, 0.8),
    bossLevel: level % 5 === 0,
    bossHP: 10 + level,
    playerSpeed: 3,
    autoFireInterval: 500,
    enemyBulletSpeed: 5,
    playerBulletSpeed: 8,
  }),
  mole: (level) => ({
    spawnInterval: Math.max(900 - level * 35, 350),
    upDuration: Math.max(1300 - level * 50, 600),
    bunnyChance: level >= 4 ? Math.min(0.12 + (level - 4) * 0.03, 0.35) : 0,
    timeLimit: 60,
    targetHits: 12 + level * 3,
  }),
  simon: (level) => ({
    seqLength: Math.min(2 + level, 12),
    playbackMs: Math.max(620 - level * 25, 380),
  }),
  math: (level) => ({
    targetCorrect: 8,
    forceMode: 0,
    countMax: 0,
    addMax: 0,
    level, // 占位：math 的题目模式由关卡推导，level 参与推导（不单独可配）
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
