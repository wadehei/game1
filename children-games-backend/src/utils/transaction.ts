import { sequelize } from '../config/database';
import { Transaction } from 'sequelize';
import { logError } from './logger';

/**
 * 在托管事务中执行操作。
 * - 自动 commit / rollback
 * - 统一错误日志
 * - 可指定事务名称（方便调试）
 */
export async function withTransaction<T>(
  fn: (t: Transaction) => Promise<T>,
  name?: string
): Promise<T> {
  return sequelize.transaction(async (t) => {
    try {
      return await fn(t);
    } catch (err) {
      logError(
        'transaction',
        `事务失败${name ? ` [${name}]` : ''}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : String(err)
      );
      throw err; // 重新抛出，让 sequelize 自动 rollback
    }
  });
}
