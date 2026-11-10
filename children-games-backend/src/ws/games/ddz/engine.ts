// 斗地主纯逻辑：牌型识别、大小比较、倍数与结算。规则写死处：
// 点数序 3<4<…<A<2<小王<大王；顺子/连对/飞机不含 2 与王；顺子 ≥5 连、连对 ≥3 连对、飞机 ≥2 组连三张；
// 翼牌不得是火箭双王；炸弹/火箭每出一次倍数 ×2；春天/反春 ×2；
// 结算 S=叫分×底分单位×倍数，地主 ±2S、农民各 ∓S（零和）
import { secureShuffle } from '../../../utils/secureRandom';

/** 牌面编码（无花色）：3 4 5 6 7 8 9 10 J Q K A 2 w(小王) W(大王) */
export const RANKS = [
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
  'A',
  '2',
  'w',
  'W',
] as const;
export type DdzCard = (typeof RANKS)[number];

const RANK_VALUE: Record<string, number> = {
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  '2': 15,
  w: 16,
  W: 17,
};

const valueToRank = new Map<number, string>(RANKS.map((r) => [RANK_VALUE[r], r]));
const rankToValue = new Map<string, number>(RANKS.map((r) => [r, RANK_VALUE[r]]));

export const rankValue = (c: string): number => RANK_VALUE[c] ?? 0;
/** 手牌按大到小排序（展示用） */
export const sortCards = (cards: string[]): string[] =>
  [...cards].sort((a, b) => rankValue(b) - rankValue(a));

/** 54 张：13 点数 ×4 + 双王，安全洗牌 */
export const buildDeck = (): string[] => {
  const deck: string[] = [];
  for (const r of RANKS) {
    if (r === 'w' || r === 'W') deck.push(r);
    else for (let i = 0; i < 4; i += 1) deck.push(r);
  }
  return secureShuffle(deck);
};

export type HandType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'triple1'
  | 'triple2'
  | 'straight'
  | 'pairStraight'
  | 'plane'
  | 'plane1'
  | 'plane2'
  | 'fourTwoS'
  | 'fourTwoP'
  | 'bomb'
  | 'rocket';

export interface DdzHand {
  type: HandType;
  /** 同型比较主键（单张/对子/三张/炸弹=点数值；顺子/连对/飞机=最大点数值） */
  key: number;
  /** 连张长度单位数（顺子张数 / 连对对数 / 飞机三张组数），非连张型=0 */
  len: number;
}

const STRAIGHT_MIN = 5; // 顺子最少张数
const PAIRSTRAIGHT_MIN = 3; // 连对最少对数
const PLANE_MIN = 2; // 飞机最少组数
const STRAIGHT_MAX_VALUE = 14; // A——2 与王不得进顺子/连对/飞机

const typeNameMap: Record<HandType, string> = {
  single: '单张',
  pair: '对子',
  triple: '三张',
  triple1: '三带一',
  triple2: '三带二',
  straight: '顺子',
  pairStraight: '连对',
  plane: '飞机',
  plane1: '飞机带单',
  plane2: '飞机带对',
  fourTwoS: '四带二',
  fourTwoP: '四带两对',
  bomb: '炸弹',
  rocket: '火箭',
};
export const typeName = (h: DdzHand): string => typeNameMap[h.type];

/** 出炸弹/火箭时倍数翻倍 */
export const multiplierOf = (h: DdzHand): number =>
  h.type === 'bomb' || h.type === 'rocket' ? 2 : 1;

const isRocketCounts = (counts: Map<number, number>): boolean =>
  (counts.get(16) || 0) === 1 && (counts.get(17) || 0) === 1;

const countMap = (cards: string[]): Map<number, number> => {
  const m = new Map<number, number>();
  for (const c of cards) m.set(rankValue(c), (m.get(rankValue(c)) || 0) + 1);
  return m;
};

/**
 * 翼牌精确检查：rest 恰好组成 singles 个单张 或 pairs 个对子。
 * 单张翼：任意牌皆可，但不得恰好是火箭双王；对子翼：每个点数剩余必须为偶数张。
 */
const parseWings = (rest: Map<number, number>, singles: number, pairs: number): boolean => {
  const total = [...rest.values()].reduce((a, c) => a + Math.max(0, c), 0);
  if (singles > 0) {
    if (total !== singles) return false;
    return !(total === 2 && (rest.get(16) || 0) === 1 && (rest.get(17) || 0) === 1);
  }
  if (pairs > 0) {
    if (total !== pairs * 2) return false;
    return [...rest.values()].every((c) => c <= 0 || c % 2 === 0);
  }
  return true;
};

/** 飞机本体候选：counts 中「n 组连续三张」（n≥2，不含 2 与王）的所有 (起点， 组数) */
const planeCandidates = (counts: Map<number, number>): Array<{ start: number; n: number }> => {
  const out: Array<{ start: number; n: number }> = [];
  for (let v = 3; v <= STRAIGHT_MAX_VALUE; v += 1) {
    if ((counts.get(v) || 0) < 3) continue;
    for (let end = v; end <= STRAIGHT_MAX_VALUE && (counts.get(end) || 0) >= 3; end += 1) {
      const n = end - v + 1;
      if (n >= PLANE_MIN) out.push({ start: v, n });
    }
  }
  return out;
};

/** 从计数表移除 start..start+n-1 各 3 张（不修改原表） */
const stripPlane = (counts: Map<number, number>, start: number, n: number): Map<number, number> => {
  const rest = new Map(counts);
  for (let v = start; v < start + n; v += 1) rest.set(v, (rest.get(v) || 0) - 3);
  return rest;
};

/** 判定 groups 是否为从 v0 起的严格连续 */
const isConsecutive = (groups: Array<[number, number]>): boolean => {
  for (let i = 1; i < groups.length; i += 1) {
    if (groups[i][0] - groups[i - 1][0] !== 1) return false;
  }
  return true;
};

/** 牌型识别：非法出牌返回 null */
export const parseHand = (cards: string[]): DdzHand | null => {
  const n = cards.length;
  if (n === 0) return null;
  const counts = new Map<number, number>();
  for (const c of cards) {
    if (!rankToValue.has(c)) return null;
    counts.set(rankValue(c), (counts.get(rankValue(c)) || 0) + 1);
  }
  // 单副牌只有一张小王/大王：成对/多张王必是非法输入
  if ((counts.get(16) || 0) > 1 || (counts.get(17) || 0) > 1) return null;

  if (n === 2 && isRocketCounts(counts)) return { type: 'rocket', key: 17, len: 0 };

  const groups = [...counts.entries()].sort((a, b) => a[0] - b[0]) as Array<[number, number]>;

  if (n === 1) return { type: 'single', key: groups[0][0], len: 0 };
  if (n === 2 && groups.length === 1) return { type: 'pair', key: groups[0][0], len: 0 };
  if (n === 3 && groups.length === 1) return { type: 'triple', key: groups[0][0], len: 0 };
  if (n === 4 && groups.length === 1) return { type: 'bomb', key: groups[0][0], len: 0 };

  // 三带一 / 三带二（翼不得与本体同点数——rest 已排除本体）
  if (n === 4 || n === 5) {
    const t = groups.find(([, c]) => c === 3);
    if (t) {
      const rest = groups.filter(([v]) => v !== t[0]);
      if (n === 4 && rest.length >= 1) return { type: 'triple1', key: t[0], len: 0 };
      if (n === 5 && rest.length === 1 && rest[0][1] === 2)
        return { type: 'triple2', key: t[0], len: 0 };
    }
  }

  // 顺子：全单张连续（不含 2 与王）
  if (
    n >= STRAIGHT_MIN &&
    groups.length === n &&
    groups.every(([v]) => v <= STRAIGHT_MAX_VALUE) &&
    isConsecutive(groups)
  ) {
    return { type: 'straight', key: groups[n - 1][0], len: n };
  }

  // 连对：全对子连续（不含 2 与王）
  if (
    n >= PAIRSTRAIGHT_MIN * 2 &&
    n % 2 === 0 &&
    groups.every(([, c]) => c === 2) &&
    groups.every(([v]) => v <= STRAIGHT_MAX_VALUE) &&
    isConsecutive(groups)
  ) {
    const len = n / 2;
    return { type: 'pairStraight', key: groups[groups.length - 1][0], len };
  }

  // 四带二（两单）/ 四带两对
  if (n === 6 || n === 8) {
    const four = groups.find(([, c]) => c === 4);
    if (four) {
      const rest = new Map(counts);
      rest.set(four[0], (rest.get(four[0]) || 0) - 4);
      if (parseWings(rest, n === 6 ? 2 : 0, n === 8 ? 2 : 0)) {
        return { type: n === 6 ? 'fourTwoS' : 'fourTwoP', key: four[0], len: 0 };
      }
    }
  }

  // 飞机 / 飞机带单 / 飞机带对（多组连续三张，含 4 张同点拆 3+翼的宽松情形）
  for (const { start, n: units } of planeCandidates(counts)) {
    const bodyCards = units * 3;
    if (n === bodyCards) return { type: 'plane', key: start + units - 1, len: units };
    if (n === bodyCards + units) {
      const rest = stripPlane(counts, start, units);
      if (parseWings(rest, units, 0)) return { type: 'plane1', key: start + units - 1, len: units };
    }
    if (n === bodyCards + units * 2) {
      const rest = stripPlane(counts, start, units);
      if (parseWings(rest, 0, units)) return { type: 'plane2', key: start + units - 1, len: units };
    }
  }

  return null;
};

/** a 能否压过 b（火箭通吃；炸弹压制非炸弹；其余同型同长比主键） */
export const canBeat = (a: DdzHand, b: DdzHand): boolean => {
  if (a.type === 'rocket') return true;
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb') return b.type !== 'bomb' || a.key > b.key;
  if (b.type === 'bomb') return false;
  return a.type === b.type && a.len === b.len && a.key > b.key;
};

/** 每局各身份输赢：S=底分×倍数；地主赢 +2S/农民各 -S，地主输反之（零和） */
export const payout = (
  bid: number,
  baseUnit: number,
  multiplier: number,
  landlordWin: boolean
): { landlord: number; farmer: number } => {
  const s = bid * baseUnit * multiplier;
  return landlordWin ? { landlord: 2 * s, farmer: -s } : { landlord: -2 * s, farmer: s };
};

/** 领先者超时自动出牌：最小单张（保住大牌） */
export const autoLead = (hand: string[]): string[] => {
  if (!hand.length) return [];
  let min = hand[0];
  for (const c of hand) if (rankValue(c) < rankValue(min)) min = c;
  return [min];
};

/** 从计数表取 n 个最小单张作翼：优先小点数非王，凑不齐（含火箭双王禁区）返回 null */
const pickSingles = (
  counts: Map<number, number>,
  n: number,
  exclude: Set<number>
): string[] | null => {
  const pool: number[] = [];
  for (const v of [...counts.keys()].sort((a, b) => a - b)) {
    if (exclude.has(v)) continue;
    const c = Math.max(0, counts.get(v) || 0);
    for (let i = 0; i < c; i += 1) pool.push(v);
  }
  // 优先跳过王（自动出牌绝不拿王当翼）
  const nonJoker = pool.filter((v) => v !== 16 && v !== 17);
  const chosen = nonJoker.slice(0, n);
  if (chosen.length < n) return null;
  return chosen.map((v) => valueToRank.get(v) || '');
};

/** 从计数表取 n 个最小对子作翼 */
const pickPairs = (
  counts: Map<number, number>,
  n: number,
  exclude: Set<number>
): string[] | null => {
  const out: string[] = [];
  for (const v of [...counts.keys()].sort((a, b) => a - b)) {
    if (exclude.has(v)) continue;
    if ((counts.get(v) || 0) >= 2) {
      const r = valueToRank.get(v) || '';
      out.push(r, r);
      if (out.length === n * 2) break;
    }
  }
  return out.length === n * 2 ? out : null;
};

/** 找 count>=need、长度 len 单位、末端可压过 minKey 的连续 run 最小起点 */
const runStart = (
  counts: Map<number, number>,
  need: number,
  len: number,
  minKey: number
): number | null => {
  // 合法 run 只需「末端 > minKey」：起点可低于 minKey（如 3-7 被 5-9 压）
  for (let v = Math.max(3, minKey - len + 2); v + len - 1 <= STRAIGHT_MAX_VALUE; v += 1) {
    let ok = true;
    for (let i = 0; i < len; i += 1) if ((counts.get(v + i) || 0) < need) ok = false;
    if (ok) return v;
  }
  return null;
};

/** 跟牌自动出牌：最小可压组合；压不过返回 null（=应过）。领先者超时用 autoLead */
export const autoFollow = (hand: string[], prev: DdzHand): string[] | null => {
  if (prev.type === 'rocket') return null;
  const counts = countMap(hand);
  const pickN = (v: number, n: number): string[] => {
    const r = valueToRank.get(v) || '';
    return Array.from({ length: n }, () => r);
  };
  const take = (v: number, k: number): Map<number, number> => {
    const rest = new Map(counts);
    rest.set(v, (rest.get(v) || 0) - k);
    return rest;
  };
  // 火箭兜底（通吃非火箭）
  const tryRocket = (): string[] | null =>
    counts.get(16) === 1 && counts.get(17) === 1 ? ['w', 'W'] : null;
  // 炸弹兜底（压炸弹要更大；压普通牌任意炸弹）
  const tryBombs = (): string[] | null => {
    const minKey = prev.type === 'bomb' ? prev.key : 0;
    for (const [v, c] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
      if (c === 4 && v > minKey) return pickN(v, 4);
    }
    return tryRocket();
  };

  if (prev.type === 'bomb') return tryBombs();

  const sortedValues = [...counts.keys()].sort((a, b) => a - b);

  switch (prev.type) {
    case 'single': {
      for (const v of sortedValues) if (v > prev.key) return pickN(v, 1);
      return tryBombs();
    }
    case 'pair': {
      for (const v of sortedValues)
        if (v > prev.key && (counts.get(v) || 0) >= 2) return pickN(v, 2);
      return tryBombs();
    }
    case 'triple': {
      for (const v of sortedValues)
        if (v > prev.key && (counts.get(v) || 0) >= 3) return pickN(v, 3);
      return tryBombs();
    }
    case 'triple1':
    case 'triple2': {
      for (const v of sortedValues) {
        if (v <= prev.key || (counts.get(v) || 0) < 3) continue;
        const rest = take(v, 3);
        const wings =
          prev.type === 'triple1'
            ? pickSingles(rest, 1, new Set([v]))
            : pickPairs(rest, 1, new Set([v]));
        if (wings) return [...pickN(v, 3), ...wings];
      }
      return tryBombs();
    }
    case 'straight': {
      const s = runStart(counts, 1, prev.len, prev.key);
      if (s !== null) {
        const out: string[] = [];
        for (let i = 0; i < prev.len; i += 1) out.push(valueToRank.get(s + i) || '');
        return out;
      }
      return tryBombs();
    }
    case 'pairStraight': {
      const s = runStart(counts, 2, prev.len, prev.key);
      if (s !== null) {
        const out: string[] = [];
        for (let i = 0; i < prev.len; i += 1) out.push(...pickN(s + i, 2));
        return out;
      }
      return tryBombs();
    }
    case 'plane':
    case 'plane1':
    case 'plane2': {
      const s = runStart(counts, 3, prev.len, prev.key);
      if (s !== null) {
        const rest = take(s, 0); // 拷贝
        const exclude = new Set<number>();
        const body: string[] = [];
        for (let i = 0; i < prev.len; i += 1) {
          rest.set(s + i, (rest.get(s + i) || 0) - 3);
          exclude.add(s + i);
          body.push(...pickN(s + i, 3));
        }
        const wings =
          prev.type === 'plane'
            ? []
            : prev.type === 'plane1'
              ? pickSingles(rest, prev.len, exclude)
              : pickPairs(rest, prev.len, exclude);
        if (wings) return [...body, ...wings];
      }
      return tryBombs();
    }
    case 'fourTwoS':
    case 'fourTwoP': {
      for (const v of sortedValues) {
        if (v <= prev.key || (counts.get(v) || 0) < 4) continue;
        const rest = take(v, 4);
        const wings =
          prev.type === 'fourTwoS'
            ? pickSingles(rest, 2, new Set([v]))
            : pickPairs(rest, 2, new Set([v]));
        if (wings) return [...pickN(v, 4), ...wings];
      }
      return tryBombs();
    }
    default:
      return tryBombs();
  }
};
