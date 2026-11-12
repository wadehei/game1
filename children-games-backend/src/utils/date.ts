// 本地日期格式化工具：消除散布在各模块的重复实现

/** 格式化为 YYYY-MM-DD（或自定义分隔符） */
export function formatDate(d: Date = new Date(), sep = '-'): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${sep}${pad(d.getMonth() + 1)}${sep}${pad(d.getDate())}`;
}

/** 格式化为 YYYYMMDD（紧凑，用于文件名等） */
export function formatDateCompact(d: Date = new Date()): string {
  return formatDate(d, '');
}
