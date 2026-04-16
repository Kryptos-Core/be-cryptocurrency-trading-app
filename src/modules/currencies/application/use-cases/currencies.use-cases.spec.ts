import { ConflictException } from '@nestjs/common';
import type { CacheService } from '@/common/services';
import type { Currency } from '@/entities/currency.entity';
import type { CurrencyRepositoryPort } from '../../domain/ports';
import { CreateCurrencyUseCase } from './create-currency.use-case';
import { DeleteCurrencyUseCase } from './delete-currency.use-case';
import { UpdateCurrencyUseCase } from './update-currency.use-case';

const mockCurrency = (override: Partial<Currency> = {}): Currency =>
  ({
    currency_id: 'cid-1',
    symbol: 'BTC',
    name: 'Bitcoin',
    precision_scale: 8,
    min_withdraw: '0.0001',
    is_tradable: true,
    is_active: true,
    ...override,
  }) as unknown as Currency;

function makeRepoMock(
  override: Partial<CurrencyRepositoryPort> = {},
): jest.Mocked<CurrencyRepositoryPort> {
  return {
    findById: jest.fn(),
    findBySymbol: jest.fn(),
    findActive: jest.fn(),
    findTradable: jest.fn(),
    symbolExists: jest.fn().mockResolvedValue(false),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findWithPagination: jest.fn(),
    findWithSearch: jest.fn(),
    ...override,
  } as unknown as jest.Mocked<CurrencyRepositoryPort>;
}

function makeCacheMock(): jest.Mocked<Pick<CacheService, 'invalidatePattern'>> {
  return { invalidatePattern: jest.fn().mockResolvedValue(undefined) };
}

// ── CreateCurrencyUseCase ─────────────────────────────────────────────────────

describe('CreateCurrencyUseCase', () => {
  let useCase: CreateCurrencyUseCase;
  let repo: jest.Mocked<CurrencyRepositoryPort>;
  let cache: ReturnType<typeof makeCacheMock>;

  beforeEach(() => {
    repo = makeRepoMock();
    cache = makeCacheMock();
    useCase = new CreateCurrencyUseCase(repo, cache as any);
  });

  it('should create a currency and return it', async () => {
    const btc = mockCurrency();
    repo.create.mockResolvedValue(btc);

    const result = await useCase.execute({ symbol: 'BTC', name: 'Bitcoin' });

    expect(result.currency).toBe(btc);
    expect(repo.symbolExists).toHaveBeenCalledWith('BTC');
    expect(repo.create).toHaveBeenCalled();
    expect(cache.invalidatePattern).toHaveBeenCalledWith('currencies:*');
  });

  it('should throw ConflictException if symbol already exists', async () => {
    repo.symbolExists.mockResolvedValue(true);

    await expect(useCase.execute({ symbol: 'BTC', name: 'Bitcoin' })).rejects.toThrow(
      ConflictException,
    );
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('should apply defaults (precisionScale=8, isActive=true, isTradable=true)', async () => {
    const btc = mockCurrency();
    repo.create.mockResolvedValue(btc);

    await useCase.execute({ symbol: 'BTC', name: 'Bitcoin' });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        precision_scale: 8,
        is_active: true,
        is_tradable: true,
      }),
    );
  });
});

// ── UpdateCurrencyUseCase ─────────────────────────────────────────────────────

describe('UpdateCurrencyUseCase', () => {
  let useCase: UpdateCurrencyUseCase;
  let repo: jest.Mocked<CurrencyRepositoryPort>;
  let cache: ReturnType<typeof makeCacheMock>;

  beforeEach(() => {
    repo = makeRepoMock();
    cache = makeCacheMock();
    useCase = new UpdateCurrencyUseCase(repo, cache as any);
  });

  it('should update a currency and return it', async () => {
    const original = mockCurrency({ currency_id: 'cid-1' });
    const updated = mockCurrency({ currency_id: 'cid-1', name: 'Bitcoin V2' });
    repo.findById.mockResolvedValue(original);
    repo.update.mockResolvedValue(updated);

    const result = await useCase.execute('cid-1', { name: 'Bitcoin V2' });

    expect(result.currency).toBe(updated);
    expect(cache.invalidatePattern).toHaveBeenCalledWith('currencies:*');
  });

  it('should throw if currency does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute('non-existent', { name: 'test' })).rejects.toThrow(
      ConflictException,
    );
  });

  it('should check for symbol conflict when symbol changes', async () => {
    const original = mockCurrency({ symbol: 'BTC' });
    repo.findById.mockResolvedValue(original);
    repo.symbolExists.mockResolvedValue(true);

    await expect(useCase.execute('cid-1', { symbol: 'ETH' })).rejects.toThrow(ConflictException);
    expect(repo.symbolExists).toHaveBeenCalledWith('ETH', 'cid-1');
  });

  it('should skip symbol conflict check when symbol is not changed', async () => {
    const original = mockCurrency({ symbol: 'BTC' });
    const updated = mockCurrency({ name: 'Changed' });
    repo.findById.mockResolvedValue(original);
    repo.update.mockResolvedValue(updated);

    await useCase.execute('cid-1', { name: 'Changed' });

    expect(repo.symbolExists).not.toHaveBeenCalled();
  });
});

// ── DeleteCurrencyUseCase ─────────────────────────────────────────────────────

describe('DeleteCurrencyUseCase', () => {
  let useCase: DeleteCurrencyUseCase;
  let repo: jest.Mocked<CurrencyRepositoryPort>;
  let cache: ReturnType<typeof makeCacheMock>;

  beforeEach(() => {
    repo = makeRepoMock();
    cache = makeCacheMock();
    useCase = new DeleteCurrencyUseCase(repo, cache as any);
  });

  it('should soft-delete a currency', async () => {
    const btc = mockCurrency();
    repo.findById.mockResolvedValue(btc);
    repo.update.mockResolvedValue({ ...btc, is_active: false } as any);

    await useCase.execute('cid-1');

    expect(repo.update).toHaveBeenCalledWith(
      'cid-1',
      expect.objectContaining({ is_active: false }),
    );
    expect(cache.invalidatePattern).toHaveBeenCalledWith('currencies:*');
  });

  it('should be idempotent — no-op when currency does not exist', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(useCase.execute('non-existent')).resolves.toBeUndefined();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('should hard-delete a currency', async () => {
    const btc = mockCurrency();
    repo.findById.mockResolvedValue(btc);
    repo.delete.mockResolvedValue(undefined);

    await useCase.hardDelete('cid-1');

    expect(repo.delete).toHaveBeenCalledWith('cid-1');
    expect(cache.invalidatePattern).toHaveBeenCalledWith('currencies:*');
  });
});
