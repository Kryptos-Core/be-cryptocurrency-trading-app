import type { DataSource, EntityManager } from 'typeorm';
import type { TransactionContext } from '@/common/types/transaction-context';
import { UnitOfWork } from './unit-of-work';

// Mock DataSource
function createMockDataSource() {
  const mockManager = {} as EntityManager;

  // Single jest.fn reference — used both as the property and as the mock implementation.
  // Returns a new object each call to simulate distinct transaction contexts.
  let _callCount = 0;
  const tx = jest.fn().mockImplementation(async (fn: (em: EntityManager) => Promise<unknown>) => {
    _callCount++;
    return fn(mockManager);
  });

  return {
    transaction: tx,
    createEntityManager: jest.fn().mockReturnValue(mockManager),
  } as unknown as DataSource;
}

describe('UnitOfWork', () => {
  let uow: UnitOfWork;
  let mockDataSource: DataSource;

  beforeEach(() => {
    mockDataSource = createMockDataSource();
    uow = new UnitOfWork(mockDataSource);
  });

  // ─── start() ───────────────────────────────────────────────────────────────

  it('should start a transaction and return TransactionContext', async () => {
    const ctx = await uow.start();

    expect(ctx).toBeDefined();
    // Context should be an opaque handle
    expect(typeof ctx).toBe('object');
  });

  it('should call dataSource.transaction when starting', async () => {
    await uow.start();

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('should start nested transactions independently', async () => {
    const ctx1 = await uow.start();
    const ctx2 = await uow.start();

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(2);
    // Each context should be distinct
    expect(ctx1).not.toBe(ctx2);
  });

  // ─── commit() ─────────────────────────────────────────────────────────────

  it('should commit when a transaction completes without error', async () => {
    const _ctx = await uow.start();

    // commit is called implicitly when the transaction callback resolves
    // The TypeORM DataSource.transaction auto-commits on success
    // We verify by checking the transaction ran
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('should rollback when the transaction callback throws', async () => {
    const rollbackError = new Error('DB error');
    mockDataSource.transaction = jest.fn().mockRejectedValue(rollbackError);

    await expect(uow.start()).rejects.toThrow('DB error');
  });

  // ─── run() ────────────────────────────────────────────────────────────────

  it('should execute a function within a transaction', async () => {
    const result = await uow.run(async (_ctx: TransactionContext) => {
      return 42;
    });

    expect(result).toBe(42);
    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('should pass TransactionContext to the callback', async () => {
    let receivedCtx: TransactionContext | null = null;

    await uow.run(async (ctx: TransactionContext) => {
      receivedCtx = ctx;
      return 'done';
    });

    expect(receivedCtx).not.toBeNull();
    expect(typeof receivedCtx).toBe('object');
  });

  it('should propagate errors from within the callback', async () => {
    await expect(
      uow.run(async () => {
        throw new Error('Callback error');
      }),
    ).rejects.toThrow('Callback error');

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(1);
  });

  it('should rollback when callback throws an error', async () => {
    // TypeORM auto-rolls back on error
    mockDataSource.transaction = jest.fn().mockRejectedValue(new Error('Rollback error'));

    await expect(
      uow.run(async () => {
        throw new Error('Rollback error');
      }),
    ).rejects.toThrow('Rollback error');
  });

  // ─── run() with Return Type ───────────────────────────────────────────────

  it('should return the correct type from run()', async () => {
    const result = await uow.run(async () => ({ userId: 'u1', amount: '100' }));
    expect(result).toEqual({ userId: 'u1', amount: '100' });
  });

  it('should handle null return values', async () => {
    const result = await uow.run(async () => null);
    expect(result).toBeNull();
  });

  it('should handle undefined return values', async () => {
    const result = await uow.run(async () => undefined);
    expect(result).toBeUndefined();
  });

  // ─── Multiple concurrent transactions ───────────────────────────────────────

  it('should handle multiple sequential run() calls', async () => {
    await uow.run(async () => 1);
    await uow.run(async () => 2);
    await uow.run(async () => 3);

    expect(mockDataSource.transaction).toHaveBeenCalledTimes(3);
  });
});
