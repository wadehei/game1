// 21点纯逻辑：一副 52 张、A 软硬点自动取优；handler 只编排状态机，判定全在这里（可独立测试）
export interface Card {
  suit: '♠' | '♥' | '♦' | '♣';
  rank: number; // 1..13，1=A，11=J，12=Q，13=K
}

export const SUITS: Card['suit'][] = ['♠', '♥', '♦', '♣'];

export const cardLabel = (c: Card): string => {
  const r = c.rank === 1 ? 'A' : c.rank === 11 ? 'J' : c.rank === 12 ? 'Q' : c.rank === 13 ? 'K' : String(c.rank);
  return `${c.suit}${r}`;
};

export const buildDeck = (): Card[] => {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank += 1) deck.push({ suit, rank });
  }
  return shuffle(deck);
};

export const shuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 手牌点数：A 按 1/11 取最优；soft=存在按 11 计的 A */
export const handValue = (cards: Card[]): { total: number; soft: boolean } => {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 1) {
      aces += 1;
      total += 1;
    } else {
      total += Math.min(c.rank, 10);
    }
  }
  let soft = false;
  for (let i = 0; i < aces; i += 1) {
    if (total + 10 <= 21) {
      total += 10;
      soft = true;
    }
  }
  return { total, soft };
};

export const isBlackjack = (cards: Card[]): boolean => cards.length === 2 && handValue(cards).total === 21;

export const isBusted = (cards: Card[]): boolean => handValue(cards).total > 21;

/** 下注档位 */
export const BET_OPTIONS = [10, 20, 50, 100];

/** 结算单个闲家与庄家的输赢，返回派彩倍数（相对注金）：0=输，1=平退注，2=普通赢，2.5=Blackjack */
export const payoutMultiplier = (playerCards: Card[], bankerCards: Card[], natural: boolean): number => {
  if (isBusted(playerCards)) return 0;
  const p = handValue(playerCards).total;
  const b = handValue(bankerCards).total;
  // 庄家 Blackjack（两张 21）：市面规则——玩家 Blackjack 平局退注，其余输原注（handler 会在发牌后立即开牌）
  if (bankerCards.length === 2 && b === 21 && !isBusted(playerCards)) {
    return natural ? 1 : 0;
  }
  if (isBusted(bankerCards)) return natural ? 2.5 : 2; // 庄家爆牌：未爆闲家全赢（natural 仍按赔率）
  if (natural && p === 21) return 2.5;
  if (p > b) return 2;
  if (p === b) return 1;
  return 0;
};
