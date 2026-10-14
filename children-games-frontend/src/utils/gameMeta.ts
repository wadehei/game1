/**
 * 游戏元数据：名称、关卡总数、成绩文案、计分方向
 * 大厅卡片、排行榜、用户页统一引用，新增游戏在这里登记
 */
export interface GameMeta {
  id: string;
  name: string;
  totalLevels: number;
  /** 成绩文案模板，{v} 为数值；为空表示该游戏不展示成绩 */
  scoreLabel?: string;
  /** 成绩越小越好（排行榜升序） */
  lowerBetter?: boolean;
}

export const GAMES: GameMeta[] = [
  { id: 'memory', name: '记忆翻牌', totalLevels: 20, scoreLabel: '最快 {v} 步', lowerBetter: true },
  { id: 'fruit', name: '接水果', totalLevels: 30, scoreLabel: '最高 {v} 分' },
  { id: 'puzzle', name: '拼图游戏', totalLevels: 25, scoreLabel: '最少 {v} 步', lowerBetter: true },
  { id: 'balloon', name: '打气球', totalLevels: 30, scoreLabel: '最高 {v} 分' },
  { id: 'tank', name: '坦克大战', totalLevels: 25, scoreLabel: '最高 {v} 分' },
  { id: 'mole', name: '打地鼠', totalLevels: 20, scoreLabel: '最多 {v} 只' },
  { id: 'simon', name: '音乐记忆', totalLevels: 15, scoreLabel: '最长 {v} 步' },
  { id: 'math', name: '数学小怪兽', totalLevels: 20, scoreLabel: '最快 {v} 秒', lowerBetter: true },
  { id: 'match', name: '快乐连线', totalLevels: 20, scoreLabel: '剩余 {v} 秒' },
];

export const getGameMeta = (gameId: string): GameMeta | undefined =>
  GAMES.find((g) => g.id === gameId);

export const formatScore = (gameId: string, value: number): string => {
  const meta = getGameMeta(gameId);
  if (!meta?.scoreLabel) {
    return String(value);
  }
  return meta.scoreLabel.replace('{v}', String(value));
};
