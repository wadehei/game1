/**
 * 聊天内容安全过滤
 *
 * 儿童平台必须有内容过滤机制。使用简单的关键词匹配 + 正则表达式，
 * 后续可接入第三方内容安全 API（如阿里云内容安全）。
 */

// 敏感词库（可按需扩展）
// 分为多个级别：blocked（拦截）、masked（替换为***）
const BLOCKED_WORDS: string[] = [
  // 暴力相关
  '杀人',
  '自杀',
  '去死',
  // 色情相关
  '色情',
  '裸体',
  // 赌博相关
  '赌博',
  '赌钱',
  // 毒品相关
  '毒品',
  '吸毒',
  // 歧视性语言
  '傻逼',
  '妈的',
  '操你',
  'fuck',
  'shit',
  'damn',
];

const MASKED_WORDS: string[] = [
  // 脏话（替换为***）
  '笨蛋',
  '白痴',
  'SB',
  'SB',
];

// 预编译正则表达式（提高性能）
const blockedRegex = new RegExp(
  BLOCKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi'
);

const maskedRegex = new RegExp(
  MASKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi'
);

export interface FilterResult {
  /** 是否通过过滤 */
  passed: boolean;
  /** 过滤后的内容（可能被替换） */
  filtered: string;
  /** 被拦截的原因 */
  reason?: string;
}

/**
 * 过滤聊天消息
 *
 * - blocked 词：整条消息拒绝，返回 passed=false
 * - masked 词：替换为 ***，消息仍然发送
 */
export const filterChatMessage = (content: string): FilterResult => {
  if (!content || content.trim().length === 0) {
    return { passed: false, filtered: '', reason: 'empty message' };
  }

  // 检查 blocked 词
  if (blockedRegex.test(content)) {
    return {
      passed: false,
      filtered: content,
      reason: 'contains blocked content',
    };
  }

  // 替换 masked 词
  const filtered = content.replace(maskedRegex, '***');

  return { passed: true, filtered };
};

/**
 * 添加自定义敏感词（运行时扩展）
 */
export const addBlockedWord = (word: string): void => {
  if (!BLOCKED_WORDS.includes(word)) {
    BLOCKED_WORDS.push(word);
    // 重新编译正则
    blockedRegex.compile(
      BLOCKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'gi'
    );
  }
};

export const addMaskedWord = (word: string): void => {
  if (!MASKED_WORDS.includes(word)) {
    MASKED_WORDS.push(word);
    maskedRegex.compile(
      MASKED_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
      'gi'
    );
  }
};

/**
 * 获取当前敏感词库（用于管理后台）
 */
export const getWordLists = () => ({
  blocked: [...BLOCKED_WORDS],
  masked: [...MASKED_WORDS],
});
