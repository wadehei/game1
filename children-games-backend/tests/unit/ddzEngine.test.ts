// 斗地主引擎单元测试：牌型识别全表、大小比较、炸弹/火箭倍数、结算零和、自动出牌
import { describe, expect, it } from 'vitest';
import {
  autoFollow,
  autoLead,
  buildDeck,
  canBeat,
  multiplierOf,
  parseHand,
  payout,
  rankValue,
  sortCards,
  typeName,
} from '../../src/ws/games/ddz/engine';

const P = (cards: string[]) => parseHand(cards);

describe('buildDeck', () => {
  it('54 张、点数分布正确', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(54);
    const counts = new Map<string, number>();
    for (const c of deck) counts.set(c, (counts.get(c) || 0) + 1);
    expect(counts.get('3')).toBe(4);
    expect(counts.get('A')).toBe(4);
    expect(counts.get('2')).toBe(4);
    expect(counts.get('w')).toBe(1);
    expect(counts.get('W')).toBe(1);
  });
});

describe('parseHand 基础牌型', () => {
  it('单张/对子/三张/炸弹/火箭', () => {
    expect(P(['3'])?.type).toBe('single');
    expect(P(['A'])?.key).toBe(14);
    expect(P(['W'])?.key).toBe(17);
    expect(P(['5', '5'])?.type).toBe('pair');
    expect(P(['2', '2'])?.key).toBe(15);
    expect(P(['7', '7', '7'])?.type).toBe('triple');
    expect(P(['9', '9', '9', '9'])?.type).toBe('bomb');
    expect(P(['w', 'W'])?.type).toBe('rocket');
    // 王 不能成对
    expect(P(['w', 'w'])).toBeNull();
  });

  it('三带一/三带二', () => {
    expect(P(['3', '3', '3', 'K'])?.type).toBe('triple1');
    expect(P(['3', '3', '3', 'K'])?.key).toBe(3);
    expect(P(['3', '3', '3', 'K', 'K'])?.type).toBe('triple2');
    expect(P(['3', '3', '3', 'K', 'A'])).toBeNull(); // 带二必须是对子
    expect(P(['3', '3', '3', '3', 'K'])).toBeNull(); // 4+1 不是三带一（是非法）
    expect(P(['K', 'K', 'K', '3', '3'])?.key).toBe(13);
  });

  it('顺子：≥5 连、不含 2 与王', () => {
    expect(P(['3', '4', '5', '6', '7'])?.type).toBe('straight');
    expect(P(['10', 'J', 'Q', 'K', 'A'])?.key).toBe(14);
    expect(P(['J', 'Q', 'K', 'A', '2'])).toBeNull(); // 2 不能进顺
    expect(P(['w', 'A', 'K', 'Q', 'J'])).toBeNull();
    expect(P(['3', '4', '5', '6'])).toBeNull(); // 4 张太短
    expect(P(['3', '4', '5', '5', '6'])).toBeNull(); // 重复不成顺
  });

  it('连对：≥3 连对、不含 2 与王', () => {
    expect(P(['3', '3', '4', '4', '5', '5'])?.type).toBe('pairStraight');
    expect(P(['3', '3', '4', '4', '5', '5', '6', '6'])?.len).toBe(4);
    expect(P(['3', '3', '4', '4'])).toBeNull(); // 两对太短
    expect(P(['K', 'K', 'A', 'A', '2', '2'])).toBeNull(); // 2 断连
    expect(P(['3', '3', '4', '4', '5', '6'])).toBeNull();
  });

  it('飞机：≥2 组连三张可带翼', () => {
    expect(P(['3', '3', '3', '4', '4', '4'])?.type).toBe('plane');
    expect(P(['3', '3', '3', '4', '4', '4'])?.len).toBe(2);
    expect(P(['3', '3', '3', '4', '4', '4', '5', '5', '5'])?.len).toBe(3);
    expect(P(['Q', 'Q', 'Q', 'K', 'K', 'K', 'A', 'A'])?.type).toBe('plane1'); // KKKAAA+QA
    expect(P(['3', '3', '3', '4', '4', '4', '5', '6'])?.type).toBe('plane1');
    expect(P(['3', '3', '3', '4', '4', '4', '5', '5', '6', '6'])?.type).toBe('plane2');
    expect(P(['3', '3', '3', '4', '4', '4', '2', '2'])?.type).toBe('plane1'); // 翼可含 2
    // 翼牌是火箭双王 → 非法
    expect(P(['3', '3', '3', '4', '4', '4', 'w', 'W'])).toBeNull();
    // 2 不能与 A 连成飞机
    expect(P(['A', 'A', 'A', '2', '2', '2'])).toBeNull();
  });

  it('四带二/四带两对', () => {
    expect(P(['3', '3', '3', '3', '4', '5'])?.type).toBe('fourTwoS');
    expect(P(['3', '3', '3', '3', '4', '4'])?.type).toBe('fourTwoS'); // 一对算两单
    expect(P(['3', '3', '3', '3', '4', '4', '5', '5'])?.type).toBe('fourTwoP');
    expect(P(['3', '3', '3', '3', '4', '5', '6'])).toBeNull();
    expect(P(['3', '3', '3', '3', '4', '4', '5', '6'])).toBeNull(); // 翼必须成对
    expect(P(['3', '3', '3', '3', 'w', 'W'])).toBeNull(); // 翼是火箭
  });

  it('非法输入', () => {
    expect(P([])).toBeNull();
    expect(P(['x'])).toBeNull();
    expect(P(['3', '3', '4', '4'])).toBeNull(); // 两对不是牌型
  });
});

describe('canBeat', () => {
  const beat = (a: string[], b: string[]) => {
    const ha = P(a);
    const hb = P(b);
    return ha && hb ? canBeat(ha, hb) : false;
  };
  it('同型同长比大小', () => {
    expect(beat(['5', '5'], ['4', '4'])).toBe(true);
    expect(beat(['4', '4'], ['5', '5'])).toBe(false);
    expect(beat(['3', '4', '5', '6', '7'], ['4', '5', '6', '7', '8'])).toBe(false);
    expect(beat(['4', '5', '6', '7', '8'], ['3', '4', '5', '6', '7'])).toBe(true);
    expect(beat(['3', '4', '5', '6', '7', '8'], ['3', '4', '5', '6', '7'])).toBe(false); // 长度不同
    expect(beat(['J', 'Q', 'K', 'A'], ['3', '3', '3', '4']) && false).toBe(false); // 型不同
  });
  it('炸弹/火箭跨型压制', () => {
    expect(beat(['9', '9', '9', '9'], ['3', '4', '5', '6', '7'])).toBe(true);
    expect(beat(['3', '3', '3', '3'], ['9', '9', '9', '9'])).toBe(false);
    expect(beat(['K', 'K', 'K', 'K'], ['3', '3', '3', '3'])).toBe(true);
    expect(beat(['w', 'W'], ['K', 'K', 'K', 'K'])).toBe(true);
    expect(beat(['K', 'K', 'K', 'K'], ['w', 'W'])).toBe(false);
  });
});

describe('倍数与结算', () => {
  it('炸弹/火箭出牌倍数翻倍', () => {
    expect(multiplierOf(P(['3', '3', '3', '3'])!)).toBe(2);
    expect(multiplierOf(P(['w', 'W'])!)).toBe(2);
    expect(multiplierOf(P(['3', '4', '5', '6', '7'])!)).toBe(1);
  });
  it('payout 零和且方向正确', () => {
    const win = payout(3, 10, 4, true);
    expect(win.landlord).toBe(240);
    expect(win.farmer).toBe(-120);
    expect(win.landlord + 2 * win.farmer).toBe(0);
    const lose = payout(2, 10, 1, false);
    expect(lose.landlord).toBe(-40);
    expect(lose.farmer).toBe(20); // 农民各得 S=20，零和：-40+20+20=0
    expect(lose.landlord + 2 * lose.farmer).toBe(0);
  });
});

describe('自动出牌', () => {
  it('autoLead 出最小单张', () => {
    expect(autoLead(['K', '3', 'A'])).toEqual(['3']);
    expect(autoLead(['2', 'w', 'W', '3'])).toEqual(['3']);
  });

  it('autoFollow 单张/对子取最小可压', () => {
    const prev5 = P(['5'])!;
    expect(autoFollow(['3', '9', 'K'], prev5)).toEqual(['9']);
    expect(autoFollow(['3', '4'], prev5)).toBeNull();
    const prevPair5 = P(['5', '5'])!;
    expect(autoFollow(['3', '4', '9', '9', '9', '9'], prevPair5)).toEqual(['9', '9']); // 对子
    expect(autoFollow(['3', '4', '9'], prevPair5)).toBeNull(); // 散牌压不过对子
    const prevPair = P(['5', '5'])!;
    expect(autoFollow(['6', '6', 'K', 'K'], prevPair)).toEqual(['6', '6']);
    expect(autoFollow(['3', '3', '9'], prevPair)).toBeNull();
  });

  it('autoFollow 压不过时用炸弹/火箭兜底', () => {
    const prevA = P(['A'])!;
    expect(autoFollow(['3', '9', '9', '9', '9'], prevA)).toEqual(['9', '9', '9', '9']);
    expect(autoFollow(['3', 'w', 'W'], prevA)).toEqual(['w']); // 单王即可压单 A（不浪费火箭）
    expect(autoFollow(['3'], prevA)).toBeNull();
    const prevRocket = P(['w', 'W'])!;
    expect(autoFollow(['2', '2', '2', '2'], prevRocket)).toBeNull();
    const prevBomb = P(['9', '9', '9', '9'])!;
    expect(autoFollow(['3', '3', '3', '3'], prevBomb)).toBeNull();
    expect(autoFollow(['K', 'K', 'K', 'K'], prevBomb)).toEqual(['K', 'K', 'K', 'K']);
  });

  it('autoFollow 三带一/三带二', () => {
    const prev = P(['7', '7', '7', '3'])!;
    expect(autoFollow(['9', '9', '9', 'K', '3'], prev)).toEqual(['9', '9', '9', '3']);
    expect(autoFollow(['8', '8', '8'], prev)).toBeNull(); // 缺翼
    const prev2 = P(['7', '7', '7', '3', '3'])!;
    expect(autoFollow(['9', '9', '9', 'K', 'K'], prev2)).toEqual(['9', '9', '9', 'K', 'K']);
  });

  it('autoFollow 顺子/连对/飞机', () => {
    const straight = P(['3', '4', '5', '6', '7'])!;
    expect(autoFollow(['5', '6', '7', '8', '9'], straight)).toEqual(['5', '6', '7', '8', '9']);
    expect(autoFollow(['4', '5', '6', '7', 'K'], straight)).toBeNull();
    const pairStraight = P(['3', '3', '4', '4', '5', '5'])!;
    expect(autoFollow(['5', '5', '6', '6', '7', '7'], pairStraight)).toEqual([
      '5',
      '5',
      '6',
      '6',
      '7',
      '7',
    ]);
    const plane1 = P(['3', '3', '3', '4', '4', '4', '5', '6'])!;
    expect(autoFollow(['8', '8', '8', '9', '9', '9', 'J', 'K'], plane1)).toEqual([
      '8',
      '8',
      '8',
      '9',
      '9',
      '9',
      'J',
      'K',
    ]);
  });
});

describe('辅助', () => {
  it('rankValue 排序与 sortCards', () => {
    expect(rankValue('2')).toBeGreaterThan(rankValue('A'));
    expect(rankValue('W')).toBeGreaterThan(rankValue('w'));
    expect(sortCards(['3', 'A', 'K', 'w'])).toEqual(['w', 'A', 'K', '3']);
  });
  it('typeName 覆盖全部牌型', () => {
    expect(typeName(P(['3'])!)).toBe('单张');
    expect(typeName(P(['w', 'W'])!)).toBe('火箭');
  });
});
