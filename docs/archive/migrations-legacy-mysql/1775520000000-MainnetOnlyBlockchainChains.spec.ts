import type { QueryRunner } from 'typeorm';

/**
 * Legacy-compat migration spec: verifies historical cleanup SQL emitted by the old migration.
 * This spec documents backward-compat expectations only; it does not represent current runtime persistence strategy.
 */
import { MainnetOnlyBlockchainChains1775520000000 } from './1775520000000-MainnetOnlyBlockchainChains';

function createQueryRunnerMock(hasSystemConfigs = false, hasLogIndex = false): QueryRunner {
  return {
    query: jest.fn().mockResolvedValue(undefined),
    hasTable: jest.fn().mockResolvedValue(hasSystemConfigs),
    hasColumn: jest.fn().mockResolvedValue(hasLogIndex),
  } as unknown as QueryRunner;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

describe('MainnetOnlyBlockchainChains1775520000000', () => {
  it('repairs dangling references before rewriting chain enums', async () => {
    const queryRunner = createQueryRunnerMock();
    const migration = new MainnetOnlyBlockchainChains1775520000000();

    await migration.up(queryRunner);

    const queries = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) =>
      normalizeSql(String(sql)),
    );

    const linkedWalletCleanupIndex = queries.findIndex((sql) =>
      sql.includes(
        'DELETE lw FROM `linked_wallets` lw LEFT JOIN `users` u ON u.`user_id` = lw.`user_id` WHERE u.`user_id` IS NULL',
      ),
    );
    const linkedWalletUpdateIndex = queries.findIndex((sql) =>
      sql.includes(
        "UPDATE linked_wallets SET chain = 'TRON_MAINNET' WHERE chain IN ('TRON_NILE', 'TRON_SHASTA')",
      ),
    );

    expect(linkedWalletCleanupIndex).toBeGreaterThanOrEqual(0);
    expect(linkedWalletUpdateIndex).toBeGreaterThan(linkedWalletCleanupIndex);
    const linkedWalletRemapIndex = queries.findIndex((sql) =>
      sql.includes(
        'UPDATE onchain_transactions ot INNER JOIN linked_wallets source ON source.link_id = ot.linked_wallet_id',
      ),
    );
    const linkedWalletDeleteIndex = queries.findIndex((sql) =>
      sql.includes('DELETE source FROM linked_wallets source INNER JOIN linked_wallets target ON'),
    );
    expect(linkedWalletRemapIndex).toBeGreaterThanOrEqual(0);
    expect(linkedWalletDeleteIndex).toBeGreaterThan(linkedWalletRemapIndex);

    const txWalletRemapIndex = queries.findIndex((sql) =>
      sql.includes(
        'UPDATE treasury_operations op INNER JOIN transaction_wallets source ON source.wallet_id = op.from_wallet_id',
      ),
    );
    const txWalletDeleteIndex = queries.findIndex((sql) =>
      sql.includes(
        'DELETE source FROM transaction_wallets source INNER JOIN transaction_wallets target ON',
      ),
    );
    expect(txWalletRemapIndex).toBeGreaterThanOrEqual(0);
    expect(txWalletDeleteIndex).toBeGreaterThan(txWalletRemapIndex);

    expect(
      queries.some(
        (sql) =>
          sql.includes('DELETE source FROM') &&
          sql.includes('onchain_transactions') &&
          sql.includes('source.`tx_hash` = target.`tx_hash`') &&
          !sql.includes('log_index'),
      ),
    ).toBe(true);

    const onchainTxRemapIndex = queries.findIndex((sql) =>
      sql.includes(
        'UPDATE treasury_operations op INNER JOIN onchain_transactions source ON source.tx_id = op.onchain_tx_id',
      ),
    );
    const onchainTxDeleteIndex = queries.findIndex(
      (sql) =>
        sql.includes('DELETE source FROM') &&
        sql.includes('onchain_transactions') &&
        sql.includes('source.`tx_hash` = target.`tx_hash`') &&
        !sql.includes('log_index'),
    );
    expect(onchainTxRemapIndex).toBeGreaterThanOrEqual(0);
    expect(onchainTxDeleteIndex).toBeGreaterThan(onchainTxRemapIndex);
    expect(queries.some((sql) => sql.includes('SET op.onchain_tx_id = target.tx_id'))).toBe(true);

    expect(
      queries.some((sql) =>
        sql.includes(
          "UPDATE `linked_wallets` SET `chain` = 'ETH_MAINNET' WHERE `chain` = 'ETH_SEPOLIA'",
        ),
      ),
    ).toBe(false);
    expect(queries.some((sql) => sql.includes('SET ot.linked_wallet_id = target.link_id'))).toBe(
      true,
    );
    expect(queries.some((sql) => sql.includes('SET op.from_wallet_id = target.wallet_id'))).toBe(
      true,
    );
    expect(queries.some((sql) => sql.includes('SET op.to_wallet_id = target.wallet_id'))).toBe(
      true,
    );
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'DELETE mw FROM `managed_wallets` mw LEFT JOIN `users` u ON u.`user_id` = mw.`user_id` WHERE u.`user_id` IS NULL',
        ),
        expect.stringContaining(
          'DELETE op FROM `treasury_operations` op LEFT JOIN `users` u ON u.`user_id` = op.`actor_user_id` WHERE u.`user_id` IS NULL',
        ),
        expect.stringContaining(
          'DELETE ot FROM `onchain_transactions` ot LEFT JOIN `users` u ON u.`user_id` = ot.`user_id` WHERE u.`user_id` IS NULL',
        ),
        expect.stringContaining(
          'UPDATE `onchain_transactions` ot LEFT JOIN `linked_wallets` lw ON lw.`link_id` = ot.`linked_wallet_id` SET ot.`linked_wallet_id` = NULL WHERE ot.`linked_wallet_id` IS NOT NULL AND lw.`link_id` IS NULL',
        ),
        expect.stringContaining(
          'UPDATE `onchain_transactions` ot LEFT JOIN `treasury_operations` op ON op.`operation_id` = ot.`treasury_operation_id` SET ot.`treasury_operation_id` = NULL WHERE ot.`treasury_operation_id` IS NOT NULL AND op.`operation_id` IS NULL',
        ),
        expect.stringContaining(
          'UPDATE `treasury_operations` op LEFT JOIN `transaction_wallets` tw_from ON tw_from.`wallet_id` = op.`from_wallet_id` SET op.`from_wallet_id` = NULL WHERE op.`from_wallet_id` IS NOT NULL AND tw_from.`wallet_id` IS NULL',
        ),
        expect.stringContaining(
          'UPDATE `treasury_operations` op LEFT JOIN `transaction_wallets` tw_to ON tw_to.`wallet_id` = op.`to_wallet_id` SET op.`to_wallet_id` = NULL WHERE op.`to_wallet_id` IS NOT NULL AND tw_to.`wallet_id` IS NULL',
        ),
      ]),
    );
  });

  it('updates shared system config keys when the table exists', async () => {
    const queryRunner = createQueryRunnerMock(true);
    const migration = new MainnetOnlyBlockchainChains1775520000000();

    await migration.up(queryRunner);

    const systemConfigCalls = (queryRunner.query as jest.Mock).mock.calls
      .map(([sql, params]) => ({
        sql: normalizeSql(String(sql)),
        params: params as string[] | undefined,
      }))
      .filter((call) => call.sql.includes('system_configs'));

    expect(systemConfigCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sql: expect.stringContaining(
            'DELETE s1 FROM system_configs s1 INNER JOIN system_configs s2 ON s2.`key` = ? WHERE s1.`key` = ?',
          ),
          params: ['TRON_MAINNET_FULL_HOST', 'TRON_NILE_FULL_HOST'],
        }),
        expect.objectContaining({
          sql: expect.stringContaining('UPDATE system_configs SET `key` = ? WHERE `key` = ?'),
          params: ['TRON_MAINNET_FULL_HOST', 'TRON_NILE_FULL_HOST'],
        }),
        expect.objectContaining({
          sql: expect.stringContaining(
            'DELETE s1 FROM system_configs s1 INNER JOIN system_configs s2 ON s2.`key` = ? WHERE s1.`key` = ?',
          ),
          params: ['SOLANA_MAINNET_URL', 'SOLANA_DEVNET_URL'],
        }),
        expect.objectContaining({
          sql: expect.stringContaining('UPDATE system_configs SET `key` = ? WHERE `key` = ?'),
          params: ['SOLANA_MAINNET_URL', 'SOLANA_DEVNET_URL'],
        }),
        expect.objectContaining({
          sql: expect.stringContaining(
            "DELETE FROM system_configs WHERE `key` IN ('TRON_SHASTA_FULL_HOST', 'TRON_DEFAULT_NETWORK')",
          ),
        }),
        expect.objectContaining({
          sql: expect.stringContaining(
            "DELETE FROM system_configs WHERE `key` = 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_SHASTA'",
          ),
        }),
      ]),
    );
  });

  it('uses log_index when collapsing onchain transactions on schemas that already have it', async () => {
    const queryRunner = createQueryRunnerMock(false, true);
    const migration = new MainnetOnlyBlockchainChains1775520000000();

    await migration.up(queryRunner);

    const queries = (queryRunner.query as jest.Mock).mock.calls.map(([sql]) =>
      normalizeSql(String(sql)),
    );

    expect(queryRunner.hasColumn).toHaveBeenCalledWith('onchain_transactions', 'log_index');
    expect(queries).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'source.`tx_hash` = target.`tx_hash` AND source.`log_index` = target.`log_index`',
        ),
      ]),
    );
  });
});
