import { Request, Response } from 'express';
import { QuizQuestion } from '../models';
import { success, asyncHandler } from '../utils/response';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { withTransaction } from '../utils/transaction';
import { QUIZ_PAGE_LIMIT } from '../config/constants';

// ─── 题库管理（答题对战） ────────────────────────────────

interface QuestionData {
  text: string;
  options: string[];
  answer: number;
  category: string;
  difficulty: number;
}

const validateQuestion = (body: unknown): { error?: string; data?: QuestionData } => {
  const b = body as Record<string, unknown>;
  const text = String(b?.text || '').trim();
  const options = Array.isArray(b?.options) ? b.options.map((o) => String(o).trim()) : [];
  const answer = Number(b?.answer);
  const category = String(b?.category || '综合')
    .trim()
    .slice(0, 20);
  const difficulty = Math.min(3, Math.max(1, Number(b?.difficulty) || 1));
  if (!text) return { error: '题干不能为空' };
  if (options.length !== 4 || options.some((o: string) => !o))
    return { error: '必须提供 4 个非空选项' };
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) return { error: '正确答案下标无效' };
  return { data: { text, options, answer, category, difficulty } };
};

export const quizList = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = QUIZ_PAGE_LIMIT;
  const category = (req.query.category as string) || '';
  const where = category ? { category } : {};
  const { rows, count } = await QuizQuestion.findAndCountAll({
    where,
    order: [['id', 'DESC']],
    offset: (page - 1) * limit,
    limit,
  });
  success(res, { list: rows, total: count, page, limit });
});

export const quizCreate = asyncHandler(async (req: Request, res: Response) => {
  const v = validateQuestion(req.body);
  if (v.error) throw new BadRequestError(v.error);
  const dup = await QuizQuestion.findOne({ where: { text: v.data!.text } });
  if (dup) throw new BadRequestError('已存在相同题干的题目');
  const q = await QuizQuestion.create(v.data!);
  success(res, q, '创建成功');
});

export const quizUpdate = asyncHandler(async (req: Request, res: Response) => {
  const q = await QuizQuestion.findByPk(Number(req.params.id));
  if (!q) throw new NotFoundError('题目不存在');
  const v = validateQuestion(req.body);
  if (v.error) throw new BadRequestError(v.error);
  await q.update(v.data!);
  success(res, q, '更新成功');
});

export const quizDelete = asyncHandler(async (req: Request, res: Response) => {
  const q = await QuizQuestion.findByPk(Number(req.params.id));
  if (!q) throw new NotFoundError('题目不存在');
  await q.destroy();
  success(res, { ok: true }, '删除成功');
});

export const quizImport = asyncHandler(async (req: Request, res: Response) => {
  const list = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (list.length === 0) throw new BadRequestError('导入内容为空');

  // 先在事务外做校验，过滤无效条目
  const validItems: Array<{
    text: string;
    options: string[];
    answer: number;
    category: string;
    difficulty: number;
  }> = [];
  let skipped = 0;
  for (const item of list) {
    const v = validateQuestion(item);
    if (v.error || !v.data) {
      skipped++;
      continue;
    }
    validItems.push(v.data);
  }

  // 事务内一次性完成去重 + 插入，保证原子性
  const { created } = await withTransaction(async (t) => {
    let createdCount = 0;
    for (const data of validItems) {
      const dup = await QuizQuestion.findOne({
        where: { text: data.text },
        transaction: t,
      });
      if (dup) {
        skipped++;
        continue;
      }
      await QuizQuestion.create(data, { transaction: t });
      createdCount++;
    }
    return { created: createdCount };
  }, 'quizImport');

  success(res, { created, skipped }, `导入完成：新增 ${created}，跳过 ${skipped}`);
});
