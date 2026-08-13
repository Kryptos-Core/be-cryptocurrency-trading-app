import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/common/services/redis.service';

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  remainingTokens?: number;
}

const RATE_LIMIT_PREFIX = 'ai:rl';
const BUDGET_PREFIX = 'ai:budget';
const ACTIVE_STREAM_PREFIX = 'ai:active';
const RATE_WINDOW_SEC = 60;
const BUDGET_TTL_SEC = 60 * 60 * 26; // 26h — safe to cross midnight

/**
 * Redis-backed rate limiter + token budget + active-stream guard.
 *
 * `ai:rl:{userId}:{minute}` (60s TTL) — sliding minute-window counter.
 * `ai:budget:{userId}:{YYYYMMDD}` — daily token counter.
 * `ai:active:{userId}` — set while a streaming chat is in progress.
 */
@Injectable()
export class AiQuotaService {
  private readonly logger = new Logger(AiQuotaService.name);
  private readonly rateLimit: number;
  private readonly dailyBudget: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.rateLimit = this.configService.get<number>('VILAO_RATE_LIMIT_PER_USER_PER_MIN') ?? 20;
    this.dailyBudget = this.configService.get<number>('VILAO_DAILY_TOKEN_BUDGET_PER_USER') ?? 100000;
  }

  async checkRateLimit(userId: string): Promise<QuotaCheckResult> {
    const minute = Math.floor(Date.now() / 1000 / RATE_WINDOW_SEC);
    const key = `${RATE_LIMIT_PREFIX}:${userId}:${minute}`;
    const current = await this.redisService.incr(key);
    if (current === 1) {
      await this.redisService.expire(key, RATE_WINDOW_SEC);
    }
    if (current > this.rateLimit) {
      return {
        allowed: false,
        reason: `Bạn đã vượt quá ${this.rateLimit} yêu cầu/phút. Vui lòng thử lại sau ít giây.`,
        retryAfterSeconds: RATE_WINDOW_SEC,
      };
    }
    return { allowed: true };
  }

  async getDailyUsage(userId: string): Promise<number> {
    const key = this.budgetKey(userId);
    const v = await this.redisService.get(key);
    return v ? Number(v) : 0;
  }

  async getRemainingDailyBudget(userId: string): Promise<number> {
    const used = await this.getDailyUsage(userId);
    return Math.max(this.dailyBudget - used, 0);
  }

  async reserveTokens(userId: string, estimatedTokens: number): Promise<QuotaCheckResult> {
    const remaining = await this.getRemainingDailyBudget(userId);
    if (estimatedTokens > remaining) {
      return {
        allowed: false,
        reason: `Bạn đã dùng hết quota AI hôm nay (${this.dailyBudget} tokens). Vui lòng quay lại vào ngày mai.`,
        remainingTokens: remaining,
      };
    }
    return { allowed: true, remainingTokens: remaining };
  }

  async recordUsage(userId: string, tokensIn: number, tokensOut: number): Promise<void> {
    const total = (tokensIn ?? 0) + (tokensOut ?? 0);
    if (total <= 0) return;
    const key = this.budgetKey(userId);
    await this.redisService.incrby(key, total);
    await this.redisService.expire(key, BUDGET_TTL_SEC);
  }

  async acquireActiveStream(userId: string): Promise<boolean> {
    const key = `${ACTIVE_STREAM_PREFIX}:${userId}`;
    const ok = await this.redisService.setIfNotExists(key, '1', 120);
    if (!ok) {
      this.logger.warn(`User ${userId} already has an active AI stream`);
    }
    return ok;
  }

  async releaseActiveStream(userId: string): Promise<void> {
    await this.redisService.del(`${ACTIVE_STREAM_PREFIX}:${userId}`);
  }

  private budgetKey(userId: string): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `${BUDGET_PREFIX}:${userId}:${yyyy}${mm}${dd}`;
  }
}
