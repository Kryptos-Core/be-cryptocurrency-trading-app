import { AiQuotaService } from './ai-quota.service';
import { RedisService } from '@/common/services/redis.service';
import { ConfigService } from '@nestjs/config';

describe('AiQuotaService', () => {
  let redis: jest.Mocked<Pick<RedisService, 'incr' | 'expire' | 'get' | 'incrby' | 'setIfNotExists' | 'del'>>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(() => {
    redis = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue('0'),
      incrby: jest.fn().mockResolvedValue(1),
      setIfNotExists: jest.fn().mockResolvedValue(true),
      del: jest.fn().mockResolvedValue(1),
    };
    config = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'VILAO_RATE_LIMIT_PER_USER_PER_MIN') return 20;
        if (key === 'VILAO_DAILY_TOKEN_BUDGET_PER_USER') return 1000;
        return undefined;
      }),
    } as unknown as jest.Mocked<Pick<ConfigService, 'get'>>;
  });

  const buildService = () =>
    new AiQuotaService(redis as unknown as RedisService, config as unknown as ConfigService);

  it('allows request under rate limit', async () => {
    const svc = buildService();
    await expect(svc.checkRateLimit('user-1')).resolves.toEqual({ allowed: true });
    expect(redis.incr).toHaveBeenCalled();
    expect(redis.expire).toHaveBeenCalled();
  });

  it('denies request over rate limit and reports retryAfter', async () => {
    redis.incr.mockResolvedValue(21);
    const svc = buildService();
    const result = await svc.checkRateLimit('user-1');
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('20 yêu cầu');
    expect(result.retryAfterSeconds).toBe(60);
  });

  it('returns daily usage', async () => {
    redis.get.mockResolvedValue('250');
    const svc = buildService();
    await expect(svc.getDailyUsage('user-1')).resolves.toBe(250);
  });

  it('reserves tokens within budget', async () => {
    redis.get.mockResolvedValue('100');
    const svc = buildService();
    const r = await svc.reserveTokens('user-1', 500);
    expect(r.allowed).toBe(true);
    expect(r.remainingTokens).toBe(900);
  });

  it('denies reservation when over budget', async () => {
    redis.get.mockResolvedValue('950');
    const svc = buildService();
    const r = await svc.reserveTokens('user-1', 100);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('hết quota');
  });

  it('records usage and sets ttl', async () => {
    const svc = buildService();
    await svc.recordUsage('user-1', 100, 200);
    expect(redis.incrby).toHaveBeenCalledWith(expect.stringContaining('ai:budget:user-1:'), 300);
    expect(redis.expire).toHaveBeenCalled();
  });

  it('does not record usage when zero tokens', async () => {
    const svc = buildService();
    await svc.recordUsage('user-1', 0, 0);
    expect(redis.incrby).not.toHaveBeenCalled();
  });

  it('acquires and releases active stream', async () => {
    const svc = buildService();
    redis.setIfNotExists.mockResolvedValueOnce(true);
    await expect(svc.acquireActiveStream('user-1')).resolves.toBe(true);
    await svc.releaseActiveStream('user-1');
    expect(redis.del).toHaveBeenCalledWith('ai:active:user-1');
  });
});
