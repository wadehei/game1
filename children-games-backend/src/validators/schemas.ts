import { z } from 'zod';
import { AVATAR_MAX_LENGTH, NICKNAME_MAX_LENGTH, QUIZ_IMPORT_MAX_LIMIT } from '../config/constants';

// 头像 URL 协议校验：允许 http/https/相对路径/emoji，禁止 javascript:/data: 等危险协议
const safeAvatarRefine = (val: string) => {
  // 空值/短 emoji 直接通过
  if (!val || val.length <= 10) return true;
  // 如果是 URL（含 ://），必须是 http 或 https
  if (val.includes('://')) {
    return /^https?:\/\//i.test(val);
  }
  // 相对路径 /api/avatars/... 允许
  if (val.startsWith('/')) return true;
  // 其余（emoji、纯文字等）允许
  return true;
};

// 登录相关
export const wxLoginSchema = z.object({
  code: z.string().min(1, 'code 不能为空'),
});

export const testLoginSchema = z.object({
  nickname: z.string().min(1, '昵称不能为空').max(50, '昵称最多50个字符'),
});

// Token 刷新
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken 不能为空'),
});

// 登出
export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken 不能为空'),
});

export const familyLoginSchema = z.object({
  // 兼容数字与字符串 uid（测试/sim 机器人发数字，前端发字符串），统一转 string；
  // 可选——不带 uid + 带 nickname 即"昵称建新角色"（后台测试/选角色页新成员入口）
  uid: z
    .union([z.string().min(1, 'uid 不能为空'), z.number().int()])
    .transform((v) => String(v))
    .optional(),
  pin: z
    .string()
    .regex(/^\d{4}$/, 'PIN 码必须是4位数字')
    .optional(),
  nickname: z.string().min(1).max(50).optional(),
  // 头像既支持站内/外 URL 也支持 emoji（默认 😊），需校验 URL 协议安全
  avatar: z.string().max(500).refine(safeAvatarRefine, '头像 URL 协议不安全').optional(),
});

// 用户信息更新
export const updateUserInfoSchema = z.object({
  nickname: z.string().min(1, '昵称不能为空').max(50, '昵称最多50个字符').optional(),
  avatar: z
    .string()
    .max(500, '头像字符串过长')
    .refine(safeAvatarRefine, '头像 URL 协议不安全')
    .optional(),
});

// 管理员更新用户信息
export const adminUpdateUserSchema = z.object({
  nickname: z
    .string()
    .min(1, '昵称不能为空')
    .max(NICKNAME_MAX_LENGTH, `昵称最多${NICKNAME_MAX_LENGTH}个字符`)
    .optional(),
  avatar: z
    .string()
    .max(AVATAR_MAX_LENGTH, `头像字符串过长`)
    .refine(safeAvatarRefine, '头像 URL 协议不安全')
    .optional(),
  familyGroup: z.string().max(50).optional(),
});

// 批量导入题目
export const quizImportSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().min(1, '题目不能为空').max(500, '题目最多500个字符'),
        options: z.array(z.string().min(1).max(200)).min(2).max(6),
        answer: z.number().int().min(0).max(3),
        difficulty: z.number().int().min(1).max(3).optional(),
        category: z.string().max(50).optional(),
      })
    )
    .min(1, '至少导入1道题目')
    .max(QUIZ_IMPORT_MAX_LIMIT, `单次最多导入${QUIZ_IMPORT_MAX_LIMIT}道题目`),
});

// 角色 PIN 码
export const updatePinSchema = z.object({
  oldPin: z
    .string()
    .regex(/^\d{4}$/, '旧口令必须是4位数字')
    .optional(),
  newPin: z
    .string()
    .regex(/^\d{4}$/, '新口令必须是4位数字')
    .nullable(),
});

// 游玩时长上报（字段为 seconds，与前端 usePlayTimeGuard 心跳上报一致）
export const reportPlaytimeSchema = z.object({
  seconds: z.number().int().positive('时长必须是正整数'),
});

// 游戏进度
export const recordPlaySchema = z.object({
  score: z.number().int().min(0, '分数不能为负'),
  stars: z.number().int().min(0).max(10, '星星数必须在 0-10 之间').optional(),
  completed: z.boolean().optional(),
});

// 管理员相关
export const adminLoginSchema = z.object({
  username: z.string().min(1, '用户名不能为空').max(50, '用户名最多50个字符').optional(),
  password: z.string().min(1, '密码不能为空'),
});

export const twoFactorVerifySchema = z.object({
  token: z.string().min(1, '临时令牌不能为空'),
  code: z.string().regex(/^\d{6}$/, '验证码必须是6位数字'),
});

export const twoFactorSetupSchema = z.object({
  password: z.string().min(1, '请确认管理员密码'),
});

export const twoFactorDisableSchema = z.object({
  password: z.string().min(1, '请确认管理员密码'),
});

export const adjustChipsSchema = z
  .object({
    delta: z.number().int('必须是整数').optional(),
    set: z.number().int('必须是整数').optional(),
  })
  .refine((data) => data.delta !== undefined || data.set !== undefined, {
    message: '请提供 delta（增减）或 set（设定）',
  });

export const updateSettingsSchema = z.object({
  restIntervalMinutes: z.number().int('必须是整数').min(0, '不能小于 0').max(120, '不能大于 120'),
});

// 意见反馈
export const submitFeedbackSchema = z.object({
  type: z.string().min(1, '请选择反馈类型'),
  content: z.string().min(1, '反馈内容不能为空').max(1000, '反馈内容最多1000个字符'),
  page: z.string().max(100, '页面信息最多100个字符').optional(),
});

export const updateFeedbackSchema = z.object({
  status: z.enum(['pending', 'processing', 'resolved', 'closed']).optional(),
  internalNote: z.string().max(500).optional(),
});

export const addReplySchema = z.object({
  content: z.string().min(1, '回复内容不能为空').max(1000, '回复内容最多1000个字符'),
});

// 答题对战
export const quizSchema = z.object({
  text: z.string().min(1, '题目不能为空').max(500, '题目最多500个字符'),
  options: z.array(z.string().min(1).max(200)).min(2, '至少2个选项').max(6, '最多6个选项'),
  answer: z.number().int().min(0, '答案索引不能为负').max(3, '答案索引不能大于3'),
  difficulty: z.number().int().min(1, '难度最小1').max(3, '难度最大3').optional(),
  category: z.string().max(50).optional(),
});

// 导出类型
export type WxLoginInput = z.infer<typeof wxLoginSchema>;
export type TestLoginInput = z.infer<typeof testLoginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type FamilyLoginInput = z.infer<typeof familyLoginSchema>;
export type UpdateUserInfoInput = z.infer<typeof updateUserInfoSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type QuizImportInput = z.infer<typeof quizImportSchema>;
export type UpdatePinInput = z.infer<typeof updatePinSchema>;
export type ReportPlaytimeInput = z.infer<typeof reportPlaytimeSchema>;
export type RecordPlayInput = z.infer<typeof recordPlaySchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type TwoFactorVerifyInput = z.infer<typeof twoFactorVerifySchema>;
export type TwoFactorSetupInput = z.infer<typeof twoFactorSetupSchema>;
export type TwoFactorDisableInput = z.infer<typeof twoFactorDisableSchema>;
export type AdjustChipsInput = z.infer<typeof adjustChipsSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type SubmitFeedbackInput = z.infer<typeof submitFeedbackSchema>;
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>;
export type AddReplyInput = z.infer<typeof addReplySchema>;
export type QuizInput = z.infer<typeof quizSchema>;
