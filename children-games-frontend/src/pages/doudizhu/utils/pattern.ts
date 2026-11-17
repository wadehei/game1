/**
 * 斗地主牌型判断逻辑
 * 标准规则实现
 */

import { Card, CardPattern, CardValue, PatternResult } from './types';
import { getValueCounts, groupByValue } from './deck';

/**
 * 判断是否为顺子（连续单张，至少5张，3-A，不含2和王）
 */
function isStraight(values: CardValue[]): boolean {
  if (values.length < 5) return false;

  // 排序
  const sorted = [...values].sort((a, b) => a - b);

  // 顺子范围：3-14(A)，不含2(15)和王(16,17)
  for (const v of sorted) {
    if (v >= 15) return false;
  }

  // 检查是否连续
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      return false;
    }
  }

  return true;
}

/**
 * 分析牌型
 * @returns 牌型分析结果，如果无效返回 Invalid
 */
export function analyzePattern(cards: Card[]): PatternResult {
  if (!cards || cards.length === 0) {
    return { pattern: CardPattern.Invalid, mainValue: 3, length: 0, cards: [] };
  }

  const n = cards.length;
  const valueCounts = getValueCounts(cards);
  const values = Array.from(valueCounts.keys());

  // 火箭：双王 (16=小王, 17=大王)
  if (n === 2) {
    const hasSmallJoker = cards.some((c) => c.value === 16);
    const hasBigJoker = cards.some((c) => c.value === 17);
    if (hasSmallJoker && hasBigJoker) {
      return {
        pattern: CardPattern.Rocket,
        mainValue: 17,
        length: 1,
        cards,
      };
    }
  }

  // 单张
  if (n === 1) {
    return {
      pattern: CardPattern.Single,
      mainValue: cards[0].value,
      length: 1,
      cards,
    };
  }

  // 对子
  if (n === 2 && valueCounts.size === 1) {
    const value = values[0];
    if (valueCounts.get(value) === 2) {
      return {
        pattern: CardPattern.Pair,
        mainValue: value,
        length: 1,
        cards,
      };
    }
  }

  // 三张
  if (n === 3 && valueCounts.size === 1) {
    const value = values[0];
    if (valueCounts.get(value) === 3) {
      return {
        pattern: CardPattern.Triple,
        mainValue: value,
        length: 1,
        cards,
      };
    }
  }

  // 炸弹：4张相同
  if (n === 4 && valueCounts.size === 1) {
    const value = values[0];
    if (valueCounts.get(value) === 4) {
      return {
        pattern: CardPattern.Bomb,
        mainValue: value,
        length: 1,
        cards,
      };
    }
  }

  // 三带一：3张相同 + 1张
  if (n === 4 && valueCounts.size === 2) {
    let tripleValue: CardValue | null = null;
    for (const [value, count] of valueCounts) {
      if (count === 3) {
        tripleValue = value;
        break;
      }
    }
    if (tripleValue !== null) {
      return {
        pattern: CardPattern.TripleWithOne,
        mainValue: tripleValue,
        length: 1,
        cards,
      };
    }
  }

  // 三带二：3张相同 + 2张相同
  if (n === 5 && valueCounts.size === 2) {
    let tripleValue: CardValue | null = null;
    let hasPair = false;

    for (const [value, count] of valueCounts) {
      if (count === 3) tripleValue = value;
      if (count === 2) hasPair = true;
    }

    if (tripleValue !== null && hasPair) {
      return {
        pattern: CardPattern.TripleWithPair,
        mainValue: tripleValue,
        length: 1,
        cards,
      };
    }
  }

  // 顺子：至少5张连续单张
  if (n >= 5 && valueCounts.size === n) {
    // 每张牌只出现一次
    const allSingle = Array.from(valueCounts.values()).every((c) => c === 1);
    if (allSingle && isStraight(values)) {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        pattern: CardPattern.Straight,
        mainValue: sorted[0],
        length: n,
        cards,
      };
    }
  }

  // 连对：至少3对连续对子
  if (n >= 6 && n % 2 === 0) {
    const allPairs = Array.from(valueCounts.values()).every((c) => c === 2);
    if (allPairs && isStraight(values)) {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        pattern: CardPattern.StraightPair,
        mainValue: sorted[0],
        length: values.length,
        cards,
      };
    }
  }

  // 飞机及其变种
  // 找出所有三张的组合（4张只能作为一个三张参与飞机，不能重复添加）
  const tripleValues: CardValue[] = [];
  for (const [value, count] of valueCounts) {
    if (count >= 3) {
      tripleValues.push(value);
    }
  }

  if (tripleValues.length >= 2) {
    // 尝试找出连续的三张组合（飞机主体）
    const sortedTriples = [...tripleValues].sort((a, b) => a - b);

    // 找最长连续序列
    for (let len = sortedTriples.length; len >= 2; len--) {
      for (let start = 0; start <= sortedTriples.length - len; start++) {
        const sequence = sortedTriples.slice(start, start + len);

        // 检查是否连续（不含2和王: 15=2, 16=小王, 17=大王）
        if (sequence.some((v) => v >= 15)) continue;

        let isConsecutive = true;
        for (let i = 1; i < sequence.length; i++) {
          if (sequence[i] !== sequence[i - 1] + 1) {
            isConsecutive = false;
            break;
          }
        }

        if (isConsecutive) {
          const tripleCount = sequence.length;
          const remaining = n - tripleCount * 3;

          // 飞机（不带）
          if (remaining === 0) {
            return {
              pattern: CardPattern.Airplane,
              mainValue: sequence[0],
              length: tripleCount,
              cards,
            };
          }

          // 飞机带单
          if (remaining === tripleCount) {
            return {
              pattern: CardPattern.AirplaneWithSingles,
              mainValue: sequence[0],
              length: tripleCount,
              cards,
            };
          }

          // 飞机带对：剩余牌必须都是对子
          if (remaining === tripleCount * 2) {
            // 检查剩余的牌是否都是对子
            const remainingCounts = new Map<CardValue, number>();
            for (const [value, count] of valueCounts) {
              if (!sequence.includes(value)) {
                remainingCounts.set(value, count);
              } else {
                const extra = count - 3;
                if (extra > 0) {
                  remainingCounts.set(value, (remainingCounts.get(value) || 0) + extra);
                }
              }
            }

            const allPairs = Array.from(remainingCounts.values()).every((c) => c === 2);
            if (allPairs && remainingCounts.size === tripleCount) {
              return {
                pattern: CardPattern.AirplaneWithPairs,
                mainValue: sequence[0],
                length: tripleCount,
                cards,
              };
            }
          }
        }
      }
    }
  }

  // 四带二（单）
  if (n === 6) {
    for (const [value, count] of valueCounts) {
      if (count === 4) {
        // 检查剩余2张
        const remaining = n - 4;
        if (remaining === 2) {
          return {
            pattern: CardPattern.FourWithTwo,
            mainValue: value,
            length: 1,
            cards,
          };
        }
      }
    }
  }

  // 四带二对
  if (n === 8) {
    for (const [value, count] of valueCounts) {
      if (count === 4) {
        // 检查剩余4张是否是2对
        const otherCounts = Array.from(valueCounts.entries())
          .filter(([v]) => v !== value)
          .map(([, c]) => c);

        if (otherCounts.length === 2 && otherCounts.every((c) => c === 2)) {
          return {
            pattern: CardPattern.FourWithTwoPairs,
            mainValue: value,
            length: 1,
            cards,
          };
        }
      }
    }
  }

  // 无效牌型
  return { pattern: CardPattern.Invalid, mainValue: 3, length: 0, cards };
}

/**
 * 判断出牌是否能打过上一手
 * @param current 当前出牌
 * @param last 上一手出牌
 * @returns 是否能打过
 */
export function canBeat(current: PatternResult, last: PatternResult): boolean {
  // 火箭最大
  if (current.pattern === CardPattern.Rocket) {
    return true;
  }
  if (last.pattern === CardPattern.Rocket) {
    return false;
  }

  // 炸弹可以打任何非炸弹非火箭
  if (current.pattern === CardPattern.Bomb) {
    if (last.pattern !== CardPattern.Bomb) {
      return true;
    }
    // 两个炸弹比大小
    return current.mainValue > last.mainValue;
  }

  // 相同牌型才能比较
  if (current.pattern !== last.pattern) {
    return false;
  }

  // 长度必须相同（顺子、连对、飞机）
  if (current.length !== last.length) {
    return false;
  }

  // 比主牌大小
  return current.mainValue > last.mainValue;
}

/**
 * 从手牌中找出所有可能的出牌组合
 * 用于 AI 决策
 */
export function findAllPossiblePlays(hand: Card[]): PatternResult[] {
  const results: PatternResult[] = [];
  const valueCounts = getValueCounts(hand);
  const grouped = groupByValue(hand);

  // 单张
  for (const card of hand) {
    results.push({
      pattern: CardPattern.Single,
      mainValue: card.value,
      length: 1,
      cards: [card],
    });
  }

  // 对子
  for (const [value, cards] of grouped) {
    if (cards.length >= 2) {
      results.push({
        pattern: CardPattern.Pair,
        mainValue: value,
        length: 1,
        cards: cards.slice(0, 2),
      });
    }
  }

  // 三张、三带一、三带二
  for (const [value, cards] of grouped) {
    if (cards.length >= 3) {
      // 三张
      results.push({
        pattern: CardPattern.Triple,
        mainValue: value,
        length: 1,
        cards: cards.slice(0, 3),
      });

      // 三带一
      for (const [otherValue, otherCards] of grouped) {
        if (otherValue !== value) {
          results.push({
            pattern: CardPattern.TripleWithOne,
            mainValue: value,
            length: 1,
            cards: [...cards.slice(0, 3), otherCards[0]],
          });
        }
      }

      // 三带二
      for (const [otherValue, otherCards] of grouped) {
        if (otherValue !== value && otherCards.length >= 2) {
          results.push({
            pattern: CardPattern.TripleWithPair,
            mainValue: value,
            length: 1,
            cards: [...cards.slice(0, 3), ...otherCards.slice(0, 2)],
          });
        }
      }
    }
  }

  // 炸弹
  for (const [value, cards] of grouped) {
    if (cards.length === 4) {
      results.push({
        pattern: CardPattern.Bomb,
        mainValue: value,
        length: 1,
        cards,
      });
    }
  }

  // 火箭
  const smallJoker = hand.find((c) => c.value === 16);
  const bigJoker = hand.find((c) => c.value === 17);
  if (smallJoker && bigJoker) {
    results.push({
      pattern: CardPattern.Rocket,
      mainValue: 17,
      length: 1,
      cards: [smallJoker, bigJoker],
    });
  }

  // 顺子：找出所有可能的顺子（不含2和王，即 value < 15）
  const sortedValues = Array.from(valueCounts.keys())
    .filter((v) => v < 15) // 顺子范围: 3-14(A)
    .sort((a, b) => a - b);

  for (let start = 0; start < sortedValues.length; start++) {
    for (let end = start + 4; end < sortedValues.length && end < start + 12; end++) {
      const sequence = sortedValues.slice(start, end + 1);

      // 检查是否连续
      let isConsecutive = true;
      for (let i = 1; i < sequence.length; i++) {
        if (sequence[i] !== sequence[i - 1] + 1) {
          isConsecutive = false;
          break;
        }
      }

      if (isConsecutive) {
        const cards = sequence.map((v) => grouped.get(v)![0]);
        results.push({
          pattern: CardPattern.Straight,
          mainValue: sequence[0],
          length: sequence.length,
          cards,
        });
      }
    }
  }

  // 连对（不含2和王）
  const pairValues = Array.from(grouped.entries())
    .filter(([, cards]) => cards.length >= 2 && cards[0].value < 15)
    .map(([value]) => value)
    .sort((a, b) => a - b);

  for (let start = 0; start < pairValues.length; start++) {
    for (let end = start + 2; end < pairValues.length && end < start + 10; end++) {
      const sequence = pairValues.slice(start, end + 1);

      let isConsecutive = true;
      for (let i = 1; i < sequence.length; i++) {
        if (sequence[i] !== sequence[i - 1] + 1) {
          isConsecutive = false;
          break;
        }
      }

      if (isConsecutive) {
        const cards = sequence.flatMap((v) => grouped.get(v)!.slice(0, 2));
        results.push({
          pattern: CardPattern.StraightPair,
          mainValue: sequence[0],
          length: sequence.length,
          cards,
        });
      }
    }
  }

  // 去重（按牌的ID组合去重）
  const unique = new Map<string, PatternResult>();
  for (const result of results) {
    const key = result.cards
      .map((c) => c.id)
      .sort((a, b) => a - b)
      .join(',');
    if (!unique.has(key)) {
      unique.set(key, result);
    }
  }

  return Array.from(unique.values());
}

/**
 * 找出所有能打过上一手的出牌
 */
export function findBeatingPlays(hand: Card[], lastPlay: PatternResult): PatternResult[] {
  const allPlays = findAllPossiblePlays(hand);
  return allPlays.filter((play) => canBeat(play, lastPlay));
}
