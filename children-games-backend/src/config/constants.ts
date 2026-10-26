// 业务常量集中管理：消除散布在各模块的魔术数字

// ─── 反馈 ────────────────────────────────
export const DAILY_FEEDBACK_LIMIT = 5; // 每日反馈上限
export const DAILY_REPLY_LIMIT = 20; // 每日回复上限
export const FEEDBACK_CONTENT_MAX = 1000; // 反馈内容字数上限
export const FEEDBACK_LIST_LIMIT = 50; // 反馈列表分页上限
export const REPLY_CONTENT_MAX = 500; // 回复内容字数上限
export const ADMIN_NOTE_MAX = 2000; // 管理员备注字数上限
export const FEEDBACK_PAGE_MAX = 100; // 反馈页面信息字数上限

// ─── 游戏设置 ────────────────────────────────
export const DEFAULT_REST_INTERVAL_MINUTES = 20; // 默认休息间隔（分钟）
export const MAX_REST_INTERVAL_MINUTES = 120; // 最大休息间隔（分钟）
export const MAX_LEVEL_NUMBER = 999; // 最大关卡号

// ─── 题库 ────────────────────────────────
export const QUIZ_PAGE_LIMIT = 20; // 题库分页每页条数

// ─── 用户 ────────────────────────────────
export const MAX_PLAYTIME_SECONDS = 180; // 单次上报秒数上限
export const AVATAR_HISTORY_LIMIT = 12; // 头像历史上限
export const RECENT_DAYS = 7; // 最近 N 天统计
export const NICKNAME_MAX_LENGTH = 12; // 昵称最大长度
export const AVATAR_MAX_LENGTH = 500; // 头像 URL 最大长度

// ─── 对战积分 ────────────────────────────────
export const CHIPS_RELIEF_THRESHOLD = 100; // 救济线：低于此触发救济
export const CHIPS_RELIEF_AMOUNT = 1000; // 救济补额

// ─── PIN ────────────────────────────────
export const PIN_FAIL_THRESHOLD = 5; // 失败次数阈值，达到后触发锁定
export const PIN_LOCK_1 = 60_000; // 5~9 次：锁定 60 秒
export const PIN_LOCK_2 = 5 * 60_000; // 10~14 次：锁定 5 分钟
export const PIN_LOCK_3 = 30 * 60_000; // 15+ 次：锁定 30 分钟
export const PIN_CLEANUP_INTERVAL = 120_000; // PIN 清理扫描间隔

// ─── 排行榜 ────────────────────────────────
export const LEADERBOARD_DEFAULT_LIMIT = 50; // 排行榜默认条数
export const LEADERBOARD_MAX_LIMIT = 100; // 排行榜最大条数
export const LEADERBOARD_CACHE_LIMIT = 100; // 排行榜缓存全量条数
