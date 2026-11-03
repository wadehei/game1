import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { Request, Response } from 'express';

// ─── Mocks ────────────────────────────────────────────────────────
vi.mock('../../../src/config/database', () => ({
  sequelize: {
    transaction: vi.fn(),
    define: vi.fn(),
    query: vi.fn(),
    fn: vi.fn(),
    col: vi.fn(),
    getQueryInterface: vi.fn(() => ({
      describeTable: vi.fn(),
      showIndex: vi.fn(),
      addColumn: vi.fn(),
    })),
  },
}));

vi.mock('../../../src/models', () => ({
  Feedback: {
    create: vi.fn(),
    findAll: vi.fn(),
    findByPk: vi.fn(),
    count: vi.fn(),
  },
  FeedbackReply: {
    create: vi.fn(),
    count: vi.fn(),
  },
  User: {},
}));

vi.mock('../../../src/utils/safeJson', async () => {
  const actual = await vi.importActual('../../../src/utils/safeJson');
  return actual;
});

import {
  submitFeedback,
  listFeedbacks,
  addFeedbackReply,
  updateFeedback,
} from '../../../src/controllers/feedbackController';
import { Feedback, FeedbackReply } from '../../../src/models';

const mockReq = (overrides: Record<string, any> = {}): Request =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  }) as unknown as Request;

const mockRes = (): Response & { statusCode: number; jsonBody: any } => {
  const res: any = {
    statusCode: 200,
    jsonBody: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: any) {
      res.jsonBody = body;
      return res;
    },
  };
  return res as any;
};

const mockNext = vi.fn();

// asyncHandler wraps controllers in a promise that doesn't return to the caller.
// We need to flush microtasks to let the internal promise chain settle.
const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

describe('feedbackController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── submitFeedback ────────────────────────────────────────────────
  describe('submitFeedback', () => {
    it('should reject invalid type', async () => {
      const req = mockReq({ body: { type: 'invalid', content: 'hello' }, userId: 1 });
      const res = mockRes();
      await submitFeedback(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should reject empty content', async () => {
      const req = mockReq({ body: { type: 'suggestion', content: '' }, userId: 1 });
      const res = mockRes();
      await submitFeedback(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should reject content exceeding max length', async () => {
      const req = mockReq({
        body: { type: 'suggestion', content: 'x'.repeat(1001) },
        userId: 1,
      });
      const res = mockRes();
      await submitFeedback(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should reject when daily limit reached', async () => {
      (Feedback.count as Mock).mockResolvedValue(5); // DAILY_FEEDBACK_LIMIT = 5
      const req = mockReq({
        body: { type: 'suggestion', content: 'Good app!' },
        userId: 1,
      });
      const res = mockRes();
      await submitFeedback(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(429);
    });

    it('should create feedback when valid', async () => {
      (Feedback.count as Mock).mockResolvedValue(2);
      (Feedback.create as Mock).mockResolvedValue({ id: 1 });
      const req = mockReq({
        body: { type: 'bug', content: 'Found a bug', page: '/home' },
        userId: 1,
      });
      const res = mockRes();
      await submitFeedback(req as any, res, mockNext);
      await flushPromises();
      expect(Feedback.create).toHaveBeenCalledWith({
        userId: 1,
        type: 'bug',
        content: 'Found a bug',
        page: '/home',
      });
      expect(res.jsonBody.data.id).toBe(1);
    });
  });

  // ─── listFeedbacks ────────────────────────────────────────────────
  describe('listFeedbacks', () => {
    it('should list all feedbacks for admin', async () => {
      (Feedback.findAll as Mock).mockResolvedValue([
        {
          toJSON: () => ({
            id: 1,
            content: 'Feedback 1',
            adminNote: 'Internal note',
            user: { nickname: 'A' },
            replies: [],
          }),
        },
      ]);
      const req = mockReq({ query: {}, admin: true });
      const res = mockRes();
      await listFeedbacks(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data).toHaveLength(1);
      // Admin can see adminNote
      expect(res.jsonBody.data[0].adminNote).toBe('Internal note');
    });

    it('should hide adminNote from regular users', async () => {
      (Feedback.findAll as Mock).mockResolvedValue([
        {
          toJSON: () => ({
            id: 1,
            content: 'Feedback 1',
            adminNote: 'Secret',
            user: { nickname: 'A' },
            replies: [],
          }),
        },
      ]);
      const req = mockReq({ query: {}, userId: 1 });
      const res = mockRes();
      await listFeedbacks(req as any, res, mockNext);
      await flushPromises();
      expect(res.jsonBody.data[0].adminNote).toBeUndefined();
    });

    it('should filter mine only when ?mine=1 for non-admin', async () => {
      (Feedback.findAll as Mock).mockResolvedValue([]);
      const req = mockReq({ query: { mine: '1' }, userId: 1 });
      const res = mockRes();
      await listFeedbacks(req as any, res, mockNext);
      await flushPromises();
      const call = (Feedback.findAll as Mock).mock.calls[0][0];
      expect(call.where).toBeDefined();
      expect(call.where.userId).toBe(1);
    });
  });

  // ─── addFeedbackReply ────────────────────────────────────────────────
  describe('addFeedbackReply', () => {
    it('should reject empty content', async () => {
      const req = mockReq({ params: { id: '1' }, body: { content: '' }, userId: 1 });
      const res = mockRes();
      await addFeedbackReply(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should reject content exceeding max length', async () => {
      const req = mockReq({
        params: { id: '1' },
        body: { content: 'x'.repeat(501) },
        userId: 1,
      });
      const res = mockRes();
      await addFeedbackReply(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should reject when feedback does not exist', async () => {
      (Feedback.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ params: { id: '999' }, body: { content: 'reply' }, userId: 1 });
      const res = mockRes();
      await addFeedbackReply(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });

    it('should reject when user daily reply limit reached', async () => {
      (Feedback.findByPk as Mock).mockResolvedValue({ id: 1 });
      (FeedbackReply.count as Mock).mockResolvedValue(20); // DAILY_REPLY_LIMIT = 20
      const req = mockReq({ params: { id: '1' }, body: { content: 'reply' }, userId: 1 });
      const res = mockRes();
      await addFeedbackReply(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(429);
    });

    it('should create reply for regular user', async () => {
      (Feedback.findByPk as Mock).mockResolvedValue({ id: 1 });
      (FeedbackReply.count as Mock).mockResolvedValue(0);
      (FeedbackReply.create as Mock).mockResolvedValue({ id: 10 });
      const req = mockReq({ params: { id: '1' }, body: { content: 'reply' }, userId: 1 });
      const res = mockRes();
      await addFeedbackReply(req as any, res, mockNext);
      await flushPromises();
      expect(FeedbackReply.create).toHaveBeenCalledWith({
        feedbackId: 1,
        userId: 1,
        isAdmin: false,
        content: 'reply',
      });
    });

    it('should create official reply for admin', async () => {
      (Feedback.findByPk as Mock).mockResolvedValue({ id: 1 });
      (FeedbackReply.create as Mock).mockResolvedValue({ id: 11 });
      const req = mockReq({
        params: { id: '1' },
        body: { content: 'official reply' },
        admin: true,
      });
      const res = mockRes();
      await addFeedbackReply(req as any, res, mockNext);
      await flushPromises();
      expect(FeedbackReply.create).toHaveBeenCalledWith({
        feedbackId: 1,
        userId: null,
        isAdmin: true,
        content: 'official reply',
      });
      expect(res.jsonBody.message).toBe('官方回复已发送');
    });
  });

  // ─── updateFeedback ────────────────────────────────────────────────
  describe('updateFeedback', () => {
    it('should reject invalid status', async () => {
      (Feedback.findByPk as Mock).mockResolvedValue({
        id: 1,
        status: 'pending',
        save: vi.fn().mockResolvedValue(true),
      });
      const req = mockReq({ params: { id: '1' }, body: { status: 'invalid' } });
      const res = mockRes();
      await updateFeedback(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(400);
    });

    it('should update status and adminNote', async () => {
      const fakeFeedback = {
        id: 1,
        status: 'pending',
        adminNote: '',
        save: vi.fn().mockResolvedValue(true),
      };
      (Feedback.findByPk as Mock).mockResolvedValue(fakeFeedback);
      const req = mockReq({
        params: { id: '1' },
        body: { status: 'processing', adminNote: 'Working on it' },
      });
      const res = mockRes();
      await updateFeedback(req as any, res, mockNext);
      await flushPromises();
      expect(fakeFeedback.status).toBe('processing');
      expect(fakeFeedback.adminNote).toBe('Working on it');
      expect(fakeFeedback.save).toHaveBeenCalled();
    });

    it('should throw NotFoundError when feedback missing', async () => {
      (Feedback.findByPk as Mock).mockResolvedValue(null);
      const req = mockReq({ params: { id: '999' }, body: { status: 'done' } });
      const res = mockRes();
      await updateFeedback(req as any, res, mockNext);
      await flushPromises();
      const err = mockNext.mock.calls[0][0];
      expect(err.statusCode).toBe(404);
    });
  });
});
