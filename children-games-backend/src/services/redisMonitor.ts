/**
 * Redis 监控器
 * - 单例模式
 * - 记录 hits/misses/latency
 * - 每分钟聚合统计
 * - 保留 1 小时数据
 * - 提供 hitRate, avgLatency, totalOps 查询
 */

interface MinuteStats {
  timestamp: number;
  hits: number;
  misses: number;
  totalLatency: number;
  operationCount: number;
}

interface RedisStats {
  hitRate: number;
  avgLatency: number;
  totalOps: number;
  hits: number;
  misses: number;
  minuteStats: MinuteStats[];
}

interface AlertStatus {
  lowHitRate: boolean;
  highLatency: boolean;
  currentHitRate: number;
  currentAvgLatency: number;
}

const HIT_RATE_THRESHOLD = 0.8; // 80%
const LATENCY_THRESHOLD_MS = 100; // 100ms
const RETENTION_MS = 60 * 60 * 1000; // 1 hour
const AGGREGATION_INTERVAL_MS = 60 * 1000; // 1 minute

class RedisMonitor {
  private static instance: RedisMonitor | null = null;

  private currentWindow: MinuteStats;
  private history: MinuteStats[] = [];
  private aggregationTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.currentWindow = this.createEmptyWindow(Date.now());
    this.startAggregation();
  }

  static getInstance(): RedisMonitor {
    if (!RedisMonitor.instance) {
      RedisMonitor.instance = new RedisMonitor();
    }
    return RedisMonitor.instance;
  }

  private createEmptyWindow(timestamp: number): MinuteStats {
    return {
      timestamp: Math.floor(timestamp / AGGREGATION_INTERVAL_MS) * AGGREGATION_INTERVAL_MS,
      hits: 0,
      misses: 0,
      totalLatency: 0,
      operationCount: 0,
    };
  }

  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.rotateWindow();
    }, AGGREGATION_INTERVAL_MS);
    this.aggregationTimer.unref();
  }

  private rotateWindow(): void {
    // 将当前窗口移入历史
    if (this.currentWindow.operationCount > 0) {
      this.history.push({ ...this.currentWindow });
    }

    // 清理超过 1 小时的历史数据
    const cutoff = Date.now() - RETENTION_MS;
    this.history = this.history.filter((w) => w.timestamp >= cutoff);

    // 创建新的当前窗口
    this.currentWindow = this.createEmptyWindow(Date.now());
  }

  /**
   * 记录缓存命中
   * @param latency 操作延迟（ms）
   */
  recordHit(latency: number): void {
    this.currentWindow.hits++;
    this.currentWindow.totalLatency += latency;
    this.currentWindow.operationCount++;
  }

  /**
   * 记录缓存未命中
   * @param latency 操作延迟（ms）
   */
  recordMiss(latency: number): void {
    this.currentWindow.misses++;
    this.currentWindow.totalLatency += latency;
    this.currentWindow.operationCount++;
  }

  /**
   * 获取统计信息
   */
  getStats(): RedisStats {
    const allWindows = [...this.history, this.currentWindow];
    const cutoff = Date.now() - RETENTION_MS;
    const recentWindows = allWindows.filter((w) => w.timestamp >= cutoff);

    let totalHits = 0;
    let totalMisses = 0;
    let totalLatency = 0;
    let totalOps = 0;

    for (const w of recentWindows) {
      totalHits += w.hits;
      totalMisses += w.misses;
      totalLatency += w.totalLatency;
      totalOps += w.operationCount;
    }

    const hitRate = totalOps > 0 ? totalHits / totalOps : 0;
    const avgLatency = totalOps > 0 ? totalLatency / totalOps : 0;

    return {
      hitRate,
      avgLatency,
      totalOps,
      hits: totalHits,
      misses: totalMisses,
      minuteStats: recentWindows,
    };
  }

  /**
   * 获取告警状态
   */
  getAlertStatus(): AlertStatus {
    const stats = this.getStats();
    return {
      lowHitRate: stats.totalOps > 10 && stats.hitRate < HIT_RATE_THRESHOLD,
      highLatency: stats.totalOps > 10 && stats.avgLatency > LATENCY_THRESHOLD_MS,
      currentHitRate: stats.hitRate,
      currentAvgLatency: stats.avgLatency,
    };
  }

  /**
   * 重置所有统计数据
   */
  reset(): void {
    this.currentWindow = this.createEmptyWindow(Date.now());
    this.history = [];
  }

  /**
   * 关闭监控器
   */
  shutdown(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
  }
}

export const redisMonitor = RedisMonitor.getInstance();
export { RedisMonitor };
