import type { QueryRunner } from 'typeorm';
import { DepositWatcherCursorsAndOnchainLogIndex1776520000000 } from './1776520000000-DepositWatcherCursorsAndOnchainLogIndex';

function createQueryRunnerMock(options?: {
  hasLogIndex?: boolean;
  hasOldIndex?: boolean;
  hasNewIndex?: boolean;
}): QueryRunner {
  const { hasLogIndex = false, hasOldIndex = true, hasNewIndex = false } = options ?? {};

  return {
    query: jest.fn().mockResolvedValue(undefined),
    hasColumn: jest.fn().mockImplementation(async (_tableName: string, columnName: string) => {
      return columnName === 'log_index' ? hasLogIndex : false;
    }),
    hasIndex: jest.fn().mockImplementation(async (_tableName: string, indexName: string) => {
      if (indexName === 'uk_onchain_tx_hash') return hasOldIndex;
      if (indexName === 'uk_onchain_tx_chain_hash_log') return hasNewIndex;
      return false;
    }),
  } as unknown as QueryRunner;
}

describe('DepositWatcherCursorsAndOnchainLogIndex1776520000000', () => {
  it('adds log_index and the composite unique index when they are missing', async () => {
    const queryRunner = createQueryRunnerMock();
    const migration = new DepositWatcherCursorsAndOnchainLogIndex1776520000000();

    await migration.up(queryRunner);

    expect(queryRunner.hasColumn).toHaveBeenCalledWith('onchain_transactions', 'log_index');
    expect(queryRunner.query).toHaveBeenCalledWith(
      'ALTER TABLE onchain_transactions ADD COLUMN `log_index` INT NOT NULL DEFAULT 0 AFTER `tx_hash`',
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      'ALTER TABLE onchain_transactions DROP INDEX uk_onchain_tx_hash',
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX uk_onchain_tx_chain_hash_log ON onchain_transactions (chain, tx_hash(128), log_index)',
    );
  });

  it('skips log_index changes when the schema is already upgraded', async () => {
    const queryRunner = createQueryRunnerMock({ hasLogIndex: true, hasOldIndex: false, hasNewIndex: true });
    const migration = new DepositWatcherCursorsAndOnchainLogIndex1776520000000();

    await migration.up(queryRunner);

    expect(queryRunner.query).not.toHaveBeenCalledWith(
      'ALTER TABLE onchain_transactions ADD COLUMN `log_index` INT NOT NULL DEFAULT 0 AFTER `tx_hash`',
    );
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      'ALTER TABLE onchain_transactions DROP INDEX uk_onchain_tx_hash',
    );
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX uk_onchain_tx_chain_hash_log ON onchain_transactions (chain, tx_hash(128), log_index)',
    );
    expect(queryRunner.hasIndex).toHaveBeenCalledWith('onchain_transactions', 'uk_onchain_tx_chain_hash_log');
  });
});