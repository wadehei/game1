/**
 * 单机游戏注册表 — 全站唯一数据源
 *
 * 契约基准（由两侧契约测试强制对齐，漂移即红）：
 * - 前端：utils/gameMeta.ts GAMES、utils/gameCatalog.ts games、utils/levelDefaults.ts
 *   LEVEL_FIELD_DEFS/defaultLevelConfig、router 路由（/{id}）
 * - 后端：services/achievementService.ts GAME_RULES（含计分方向）、
 *   controllers/levelController.ts LEVEL_FIELDS
 *
 * 新增单机游戏：先在这里登记，再按两侧契约测试的红灯提示逐处补齐。
 */

export interface SinglePlayerGameMeta {
  id: string;
  title: string;
  /** 成绩越小越好（用时/步数类；false=越大越好） */
  lowerScoreIsBetter: boolean;
}

export const SINGLE_PLAYER_GAMES: readonly SinglePlayerGameMeta[] = [
  { id: 'memory', title: '记忆翻牌', lowerScoreIsBetter: true },
  { id: 'fruit', title: '接水果', lowerScoreIsBetter: false },
  { id: 'puzzle', title: '拼图游戏', lowerScoreIsBetter: true },
  { id: 'balloon', title: '打气球', lowerScoreIsBetter: false },
  { id: 'tank', title: '坦克大战', lowerScoreIsBetter: false },
  { id: 'mole', title: '打地鼠', lowerScoreIsBetter: false },
  { id: 'simon', title: '音乐记忆', lowerScoreIsBetter: false },
  { id: 'math', title: '数学小怪兽', lowerScoreIsBetter: true },
  { id: 'match', title: '快乐连线', lowerScoreIsBetter: false },
  { id: 'match3', title: '消消乐', lowerScoreIsBetter: true },
  { id: 'brick', title: '打砖块', lowerScoreIsBetter: false },
  { id: 'sudoku', title: '动物数独', lowerScoreIsBetter: true },
  { id: 'claw', title: '抓娃娃机', lowerScoreIsBetter: false },
];

export const SINGLE_PLAYER_GAME_IDS: readonly string[] = SINGLE_PLAYER_GAMES.map((g) => g.id);

export const isKnownSinglePlayerGame = (id: string): boolean =>
  SINGLE_PLAYER_GAME_IDS.includes(id);
