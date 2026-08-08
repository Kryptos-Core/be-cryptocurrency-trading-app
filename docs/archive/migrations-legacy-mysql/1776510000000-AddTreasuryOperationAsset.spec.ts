import type { QueryRunner } from 'typeorm';
import { AddTreasuryOperationAsset1776510000000 } from './1776510000000-AddTreasuryOperationAsset';

function createQueryRunnerMock(hasAssetColumn = false): QueryRunner {
  return {
    query: jest.fn().mockResolvedValue(undefined),
    hasColumn: jest.fn().mockResolvedValue(hasAssetColumn),
  } as unknown as QueryRunner;
}

describe('AddTreasuryOperationAsset1776510000000', () => {
  it('adds the asset column when it does not exist', async () => {
    const queryRunner = createQueryRunnerMock(false);
    const migration = new AddTreasuryOperationAsset1776510000000();

    await migration.up(queryRunner);

    expect(queryRunner.hasColumn).toHaveBeenCalledWith('treasury_operations', 'asset');
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
  });

  it('skips the alter when the asset column already exists', async () => {
    const queryRunner = createQueryRunnerMock(true);
    const migration = new AddTreasuryOperationAsset1776510000000();

    await migration.up(queryRunner);

    expect(queryRunner.hasColumn).toHaveBeenCalledWith('treasury_operations', 'asset');
    expect(queryRunner.query).not.toHaveBeenCalled();
  });
});
