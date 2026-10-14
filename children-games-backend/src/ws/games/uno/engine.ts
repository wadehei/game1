// UNO 纯逻辑：108 张标准牌 + 规则判定（无状态，可单测）
export type UnoColor = 'red' | 'yellow' | 'green' | 'blue' | 'wild';
export type UnoKind = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';

export interface UnoCard {
  id: string; // 唯一标识 color-kind-序号
  color: UnoColor;
  kind: UnoKind;
}

export const UNO_COLORS = ['red', 'yellow', 'green', 'blue'] as const;

export const buildDeck = (): UnoCard[] => {
  const deck: UnoCard[] = [];
  let n = 0;
  for (const color of UNO_COLORS) {
    deck.push({ id: `${color}-0-${n++}`, color, kind: '0' });
    for (let k = 1; k <= 9; k += 1) {
      deck.push({ id: `${color}-${k}-a${n}`, color, kind: String(k) as UnoKind });
      deck.push({ id: `${color}-${k}-b${n++}`, color, kind: String(k) as UnoKind });
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      deck.push({ id: `${color}-${kind}-a${n}`, color, kind });
      deck.push({ id: `${color}-${kind}-b${n++}`, color, kind });
    }
  }
  for (let i = 0; i < 4; i += 1) {
    deck.push({ id: `wild-wild-${n++}`, color: 'wild', kind: 'wild' });
    deck.push({ id: `wild-wild4-${n++}`, color: 'wild', kind: 'wild4' });
  }
  return deck;
};

export const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 能否出牌：万能牌恒可；同色或同符号可 */
export const canPlay = (card: UnoCard, top: UnoCard, currentColor: string): boolean => {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  return card.kind === top.kind;
};

/** 终局罚分：数字=面值，功能牌 20，万能牌 50 */
export const cardScore = (card: UnoCard): number => {
  if (card.color === 'wild') return 50;
  const n = Number(card.kind);
  if (!Number.isNaN(n)) return n;
  return 20;
};

export const isNumberCard = (card: UnoCard): boolean => !Number.isNaN(Number(card.kind));
