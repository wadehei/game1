// 数据备份服务：SQL 导出构建、每日定时落盘（保留最近 7 份）、备份文件列表
import fs from 'fs';
import path from 'path';
import { sequelize } from '../config/database';

const BACKUP_DIR = path.resolve(process.cwd(), 'backups');
const KEEP_COUNT = 7; // 磁盘保留的自动备份数量

const BACKUP_TABLES = [
  'users',
  'game_progress',
  'daily_tasks',
  'level_configs',
  'app_settings',
  'user_playtime',
  'battle_records',
  'quiz_questions',
  'feedbacks',
  'feedback_replies',
];

const sqlEscape = (value: unknown): string => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '')}'`;
};

const dateStr = (d = new Date()): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};

/** 构建全量业务数据 SQL（与管理端手动下载同一份逻辑） */
export const buildBackupSql = async (): Promise<string> => {
  const lines: string[] = [
    '-- 儿童游戏乐园 数据备份',
    `-- 生成时间: ${new Date().toISOString()}`,
    'SET NAMES utf8mb4;',
    'SET FOREIGN_KEY_CHECKS = 0;',
    '',
  ];

  for (const table of BACKUP_TABLES) {
    const [rows] = await sequelize.query(`SELECT * FROM \`${table}\``) as [any[], unknown];
    lines.push(`-- ${table}（${rows.length} 行）`);
    lines.push(`DELETE FROM \`${table}\`;`);
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map((c) => sqlEscape(row[c]));
      lines.push(`INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${vals.join(', ')});`);
    }
    lines.push('');
  }

  lines.push('SET FOREIGN_KEY_CHECKS = 1;');
  return lines.join('\n');
};

/** 磁盘自动备份列表（新→旧） */
export const listAutoBackups = (): Array<{ file: string; size: number; createdAt: string }> => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => /^auto-\d{8}\.sql$/.test(f))
      .map((f) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { file: f, size: stat.size, createdAt: stat.mtime.toISOString() };
      })
      .sort((a, b) => (a.file < b.file ? 1 : -1));
  } catch {
    return [];
  }
};

/** 执行一次磁盘自动备份，并只保留最近 KEEP_COUNT 份 */
export const runAutoBackup = async (): Promise<{ ok: boolean; file?: string; error?: string }> => {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const file = path.join(BACKUP_DIR, `auto-${dateStr()}.sql`);
    const sql = await buildBackupSql();
    fs.writeFileSync(file, sql, 'utf8');
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => /^auto-\d{8}\.sql$/.test(f))
      .sort()
      .reverse();
    files.slice(KEEP_COUNT).forEach((f) => {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, f));
      } catch {
        // 单个删除失败不影响整体
      }
    });
    return { ok: true, file: path.basename(file) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};

/** 每日定时自动备份：对齐每天 03:05，之后每 24 小时一次 */
export const initBackupScheduler = (): void => {
  const fire = async () => {
    const r = await runAutoBackup();
    if (r.ok) console.log('[backup] 每日自动备份完成:', r.file);
    else console.error('[backup] 每日自动备份失败:', r.error);
  };
  const schedule = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(3, 5, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    setTimeout(async () => {
      await fire();
      schedule();
    }, next.getTime() - now.getTime());
  };
  schedule();
  // 服务刚启动也补一份当天的（同一天重复写同名文件，天然去重）
  void fire();
};
