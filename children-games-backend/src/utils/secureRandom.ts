/**
 * 加密安全随机数工具
 *
 * 游戏洗牌、随机选择等场景必须使用此模块，
 * 禁止使用 Math.random()（可预测，存在安全隐患）。
 *
 * 使用 crypto.randomBytes() 生成不可预测的随机数。
 */
import { randomBytes } from 'node:crypto';

/**
 * 生成 [0, 1) 范围内的加密安全随机浮点数
 * 精度约 53 位（与 Math.random 相同）
 */
export const secureRandom = (): number => {
  const bytes = randomBytes(7); // 56 bits → 取 53 bits
  const value =
    bytes[0] +
    bytes[1] * 0x100 +
    bytes[2] * 0x10000 +
    bytes[3] * 0x1000000 +
    bytes[4] * 0x100000000 +
    bytes[5] * 0x10000000000 +
    (bytes[6] & 0x1f) * 0x1000000000000; // 5 bits of byte[6]
  return value / 0x20000000000000; // 2^53
};

/**
 * 生成 [0, max) 范围内的加密安全随机整数
 */
export const secureRandomInt = (max: number): number => {
  if (max <= 0) return 0;
  return Math.floor(secureRandom() * max);
};

/**
 * Fisher-Yates 加密安全洗牌
 * 返回新数组，不修改原数组
 */
export const secureShuffle = <T>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = secureRandomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/**
 * 从数组中随机选择一个元素
 */
export const securePickOne = <T>(arr: T[]): T => {
  if (arr.length === 0) {
    throw new Error('Cannot pick from empty array');
  }
  return arr[secureRandomInt(arr.length)];
};

/**
 * 从数组中随机选择 n 个不重复元素
 */
export const securePickN = <T>(arr: T[], n: number): T[] => {
  if (n > arr.length) {
    throw new Error(`Cannot pick ${n} items from array of length ${arr.length}`);
  }
  return secureShuffle(arr).slice(0, n);
};
