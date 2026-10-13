import { Request, Response, NextFunction } from 'express';

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

export const success = <T>(res: Response, data: T, message = 'success'): void => {
  res.json({
    code: 200,
    message,
    data,
  });
};

export const fail = (res: Response, message: string, code = 400): void => {
  res.status(code).json({
    code,
    message,
  });
};

export const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
