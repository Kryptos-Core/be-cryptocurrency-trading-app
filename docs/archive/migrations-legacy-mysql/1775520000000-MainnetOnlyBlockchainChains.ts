import type { MigrationInterface, QueryRunner } from 'typeorm';

const expandedChainEnum = `'TRON_NILE','TRON_SHASTA','TRON_MAINNET','SOLANA_DEVNET','SOLANA_MAINNET','ETH_SEPOLIA','ETH_MAINNET','BSC_MAINNET'`;
const finalChainEnum = `'TRON_MAINNET','SOLANA_MAINNET','ETH_SEPOLIA','ETH_MAINNET','BSC_MAINNET'`;

/**
 * Collapse TRON and Solana rows to mainnet values.
 * Ethereum Sepolia is handled later by the dedicated BSC Chapel migration.
 */
export class MainnetOnlyBlockchainChains1775520000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    const connectionType =
      (queryRunner as unknown as { connection?: { options?: { type?: string } } }).connection
        ?.options?.type ??
      (queryRunner as unknown as { dataSource?: { options?: { type?: string } } }).dataSource
        ?.options?.type;

    return connectionType === 'postgres';
  }

  private buildKeyJoinCondition(
    sourceAlias: string,
    targetAlias: string,
    keyColumns: readonly string[],
  ): string {
    return keyColumns
      .map((column) => `${sourceAlias}.\`${column}\` = ${targetAlias}.\`${column}\``)
      .join(' AND ');
  }

  private async collapseSourceChains(
    queryRunner: QueryRunner,
    tableName: string,
    keyColumns: readonly string[],
    sourceChains: readonly string[],
    preferredSourceChain: string | null,
    targetChain: string,
  ): Promise<void> {
    const sourceChainList = sourceChains.map((chain) => `'${chain}'`).join(', ');
    const keyJoin = this.buildKeyJoinCondition('source', 'target', keyColumns);

    await queryRunner.query(`
      DELETE source
      FROM \`${tableName}\` source
      INNER JOIN \`${tableName}\` target ON ${keyJoin}
      WHERE source.\`chain\` IN (${sourceChainList})
        AND target.\`chain\` = '${targetChain}'
    `);

    if (preferredSourceChain != null) {
      const nonPreferredChains = sourceChains.filter((chain) => chain !== preferredSourceChain);
      if (nonPreferredChains.length > 0) {
        const nonPreferredList = nonPreferredChains.map((chain) => `'${chain}'`).join(', ');

        await queryRunner.query(`
          DELETE source
          FROM \`${tableName}\` source
          INNER JOIN \`${tableName}\` target ON ${keyJoin}
          WHERE source.\`chain\` IN (${nonPreferredList})
            AND target.\`chain\` = '${preferredSourceChain}'
        `);
      }
    }

    await queryRunner.query(`
      UPDATE \`${tableName}\`
      SET \`chain\` = '${targetChain}'
      WHERE \`chain\` IN (${sourceChainList})
    `);
  }

  private async collapseOnchainTransactions(
    queryRunner: QueryRunner,
    sourceChains: readonly string[],
    preferredSourceChain: string | null,
    targetChain: string,
  ): Promise<void> {
    const sourceChainList = sourceChains.map((chain) => `'${chain}'`).join(', ');
    const hasLogIndex = await queryRunner.hasColumn('onchain_transactions', 'log_index');
    const keyColumns = hasLogIndex ? ['tx_hash', 'log_index'] : ['tx_hash'];
    const keyJoin = this.buildKeyJoinCondition('source', 'target', keyColumns);

    await queryRunner.query(`
      UPDATE treasury_operations op
      INNER JOIN onchain_transactions source ON source.tx_id = op.onchain_tx_id
      INNER JOIN onchain_transactions target ON ${keyJoin}
      SET op.onchain_tx_id = target.tx_id
      WHERE source.chain IN (${sourceChainList})
        AND target.chain = '${targetChain}'
    `);

    await queryRunner.query(`
      DELETE source
      FROM onchain_transactions source
      INNER JOIN onchain_transactions target ON ${keyJoin}
      WHERE source.chain IN (${sourceChainList})
        AND target.chain = '${targetChain}'
    `);

    if (preferredSourceChain != null) {
      const nonPreferredChains = sourceChains.filter((chain) => chain !== preferredSourceChain);
      if (nonPreferredChains.length > 0) {
        const nonPreferredList = nonPreferredChains.map((chain) => `'${chain}'`).join(', ');

        await queryRunner.query(`
          UPDATE treasury_operations op
          INNER JOIN onchain_transactions source ON source.tx_id = op.onchain_tx_id
          INNER JOIN onchain_transactions target ON ${keyJoin}
          SET op.onchain_tx_id = target.tx_id
          WHERE source.chain IN (${nonPreferredList})
            AND target.chain = '${preferredSourceChain}'
        `);

        await queryRunner.query(`
          DELETE source
          FROM onchain_transactions source
          INNER JOIN onchain_transactions target ON ${keyJoin}
          WHERE source.chain IN (${nonPreferredList})
            AND target.chain = '${preferredSourceChain}'
        `);
      }
    }

    await queryRunner.query(`
      UPDATE onchain_transactions
      SET chain = '${targetChain}'
      WHERE chain IN (${sourceChainList})
    `);
  }

  private async collapseLinkedWallets(
    queryRunner: QueryRunner,
    sourceChains: readonly string[],
    preferredSourceChain: string | null,
    targetChain: string,
  ): Promise<void> {
    const sourceChainList = sourceChains.map((chain) => `'${chain}'`).join(', ');
    const keyJoin = this.buildKeyJoinCondition('source', 'target', ['user_id', 'address']);

    await queryRunner.query(`
      UPDATE onchain_transactions ot
      INNER JOIN linked_wallets source ON source.link_id = ot.linked_wallet_id
      INNER JOIN linked_wallets target ON ${keyJoin}
      SET ot.linked_wallet_id = target.link_id
      WHERE source.chain IN (${sourceChainList})
        AND target.chain = '${targetChain}'
    `);

    await queryRunner.query(`
      DELETE source
      FROM linked_wallets source
      INNER JOIN linked_wallets target ON ${keyJoin}
      WHERE source.chain IN (${sourceChainList})
        AND target.chain = '${targetChain}'
    `);

    if (preferredSourceChain != null) {
      const nonPreferredChains = sourceChains.filter((chain) => chain !== preferredSourceChain);
      if (nonPreferredChains.length > 0) {
        const nonPreferredList = nonPreferredChains.map((chain) => `'${chain}'`).join(', ');

        await queryRunner.query(`
          UPDATE onchain_transactions ot
          INNER JOIN linked_wallets source ON source.link_id = ot.linked_wallet_id
          INNER JOIN linked_wallets target ON ${keyJoin}
          SET ot.linked_wallet_id = target.link_id
          WHERE source.chain IN (${nonPreferredList})
            AND target.chain = '${preferredSourceChain}'
        `);

        await queryRunner.query(`
          DELETE source
          FROM linked_wallets source
          INNER JOIN linked_wallets target ON ${keyJoin}
          WHERE source.chain IN (${nonPreferredList})
            AND target.chain = '${preferredSourceChain}'
        `);
      }
    }

    await queryRunner.query(`
      UPDATE linked_wallets
      SET chain = '${targetChain}'
      WHERE chain IN (${sourceChainList})
    `);
  }

  private async collapseTransactionWallets(
    queryRunner: QueryRunner,
    sourceChains: readonly string[],
    preferredSourceChain: string | null,
    targetChain: string,
  ): Promise<void> {
    const sourceChainList = sourceChains.map((chain) => `'${chain}'`).join(', ');
    const keyJoin = this.buildKeyJoinCondition('source', 'target', ['address']);

    for (const childColumn of ['from_wallet_id', 'to_wallet_id'] as const) {
      await queryRunner.query(`
        UPDATE treasury_operations op
        INNER JOIN transaction_wallets source ON source.wallet_id = op.${childColumn}
        INNER JOIN transaction_wallets target ON ${keyJoin}
        SET op.${childColumn} = target.wallet_id
        WHERE source.chain IN (${sourceChainList})
          AND target.chain = '${targetChain}'
      `);
    }

    await queryRunner.query(`
      DELETE source
      FROM transaction_wallets source
      INNER JOIN transaction_wallets target ON ${keyJoin}
      WHERE source.chain IN (${sourceChainList})
        AND target.chain = '${targetChain}'
    `);

    if (preferredSourceChain != null) {
      const nonPreferredChains = sourceChains.filter((chain) => chain !== preferredSourceChain);
      if (nonPreferredChains.length > 0) {
        const nonPreferredList = nonPreferredChains.map((chain) => `'${chain}'`).join(', ');

        for (const childColumn of ['from_wallet_id', 'to_wallet_id'] as const) {
          await queryRunner.query(`
            UPDATE treasury_operations op
            INNER JOIN transaction_wallets source ON source.wallet_id = op.${childColumn}
            INNER JOIN transaction_wallets target ON ${keyJoin}
            SET op.${childColumn} = target.wallet_id
            WHERE source.chain IN (${nonPreferredList})
              AND target.chain = '${preferredSourceChain}'
          `);
        }

        await queryRunner.query(`
          DELETE source
          FROM transaction_wallets source
          INNER JOIN transaction_wallets target ON ${keyJoin}
          WHERE source.chain IN (${nonPreferredList})
            AND target.chain = '${preferredSourceChain}'
        `);
      }
    }

    await queryRunner.query(`
      UPDATE transaction_wallets
      SET chain = '${targetChain}'
      WHERE chain IN (${sourceChainList})
    `);
  }

  private async repairDanglingReferences(queryRunner: QueryRunner): Promise<void> {
    // Historical data can still contain rows whose required parent user has already been removed.
    await queryRunner.query(`
      DELETE lw
      FROM \`linked_wallets\` lw
      LEFT JOIN \`users\` u ON u.\`user_id\` = lw.\`user_id\`
      WHERE u.\`user_id\` IS NULL
    `);

    await queryRunner.query(`
      DELETE mw
      FROM \`managed_wallets\` mw
      LEFT JOIN \`users\` u ON u.\`user_id\` = mw.\`user_id\`
      WHERE u.\`user_id\` IS NULL
    `);

    await queryRunner.query(`
      DELETE op
      FROM \`treasury_operations\` op
      LEFT JOIN \`users\` u ON u.\`user_id\` = op.\`actor_user_id\`
      WHERE u.\`user_id\` IS NULL
    `);

    await queryRunner.query(`
      DELETE ot
      FROM \`onchain_transactions\` ot
      LEFT JOIN \`users\` u ON u.\`user_id\` = ot.\`user_id\`
      WHERE u.\`user_id\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`onchain_transactions\` ot
      LEFT JOIN \`linked_wallets\` lw ON lw.\`link_id\` = ot.\`linked_wallet_id\`
      SET ot.\`linked_wallet_id\` = NULL
      WHERE ot.\`linked_wallet_id\` IS NOT NULL AND lw.\`link_id\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`onchain_transactions\` ot
      LEFT JOIN \`treasury_operations\` op ON op.\`operation_id\` = ot.\`treasury_operation_id\`
      SET ot.\`treasury_operation_id\` = NULL
      WHERE ot.\`treasury_operation_id\` IS NOT NULL AND op.\`operation_id\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`treasury_operations\` op
      LEFT JOIN \`transaction_wallets\` tw_from ON tw_from.\`wallet_id\` = op.\`from_wallet_id\`
      SET op.\`from_wallet_id\` = NULL
      WHERE op.\`from_wallet_id\` IS NOT NULL AND tw_from.\`wallet_id\` IS NULL
    `);

    await queryRunner.query(`
      UPDATE \`treasury_operations\` op
      LEFT JOIN \`transaction_wallets\` tw_to ON tw_to.\`wallet_id\` = op.\`to_wallet_id\`
      SET op.\`to_wallet_id\` = NULL
      WHERE op.\`to_wallet_id\` IS NOT NULL AND tw_to.\`wallet_id\` IS NULL
    `);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      ALTER TABLE payment_method_configs
      MODIFY COLUMN type ENUM('PAYOS','ETH','TRON','SOL','BSC') NOT NULL
    `);

    await this.repairDanglingReferences(queryRunner);

    await this.collapseLinkedWallets(
      queryRunner,
      ['TRON_NILE', 'TRON_SHASTA'],
      'TRON_NILE',
      'TRON_MAINNET',
    );

    await this.collapseSourceChains(
      queryRunner,
      'managed_wallets',
      ['user_id', 'address'],
      ['TRON_NILE', 'TRON_SHASTA'],
      'TRON_NILE',
      'TRON_MAINNET',
    );

    await this.collapseTransactionWallets(
      queryRunner,
      ['TRON_NILE', 'TRON_SHASTA'],
      'TRON_NILE',
      'TRON_MAINNET',
    );

    await this.collapseSourceChains(
      queryRunner,
      'treasury_main_wallets',
      ['address'],
      ['TRON_NILE', 'TRON_SHASTA'],
      'TRON_NILE',
      'TRON_MAINNET',
    );

    await this.collapseOnchainTransactions(
      queryRunner,
      ['TRON_NILE', 'TRON_SHASTA'],
      'TRON_NILE',
      'TRON_MAINNET',
    );

    for (const t of ['treasury_operations'] as const) {
      await queryRunner.query(
        `UPDATE \`${t}\` SET \`chain\` = 'TRON_MAINNET' WHERE \`chain\` IN ('TRON_NILE','TRON_SHASTA')`,
      );
      await queryRunner.query(
        `UPDATE \`${t}\` SET \`chain\` = 'SOLANA_MAINNET' WHERE \`chain\` = 'SOLANA_DEVNET'`,
      );
    }

    await this.collapseLinkedWallets(queryRunner, ['SOLANA_DEVNET'], null, 'SOLANA_MAINNET');

    await this.collapseSourceChains(
      queryRunner,
      'managed_wallets',
      ['user_id', 'address'],
      ['SOLANA_DEVNET'],
      null,
      'SOLANA_MAINNET',
    );

    await this.collapseTransactionWallets(queryRunner, ['SOLANA_DEVNET'], null, 'SOLANA_MAINNET');

    await this.collapseSourceChains(
      queryRunner,
      'treasury_main_wallets',
      ['address'],
      ['SOLANA_DEVNET'],
      null,
      'SOLANA_MAINNET',
    );

    await this.collapseOnchainTransactions(queryRunner, ['SOLANA_DEVNET'], null, 'SOLANA_MAINNET');

    const tables = [
      'linked_wallets',
      'onchain_transactions',
      'managed_wallets',
      'transaction_wallets',
      'treasury_operations',
      'treasury_main_wallets',
    ] as const;

    for (const t of tables) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` MODIFY COLUMN \`chain\` ENUM(${expandedChainEnum}) NOT NULL`,
      );
    }

    for (const t of tables) {
      await queryRunner.query(
        `ALTER TABLE \`${t}\` MODIFY COLUMN \`chain\` ENUM(${finalChainEnum}) NOT NULL`,
      );
    }

    if (await queryRunner.hasTable('system_configs')) {
      /** Đổi PK `key`: nếu đích đã tồn tại thì xóa bản ghi nguồn (giữ mainnet), tránh ER_DUP_ENTRY. */
      const systemConfigKeyRenames: [fromKey: string, toKey: string][] = [
        ['TRON_NILE_FULL_HOST', 'TRON_MAINNET_FULL_HOST'],
        ['SOLANA_DEVNET_URL', 'SOLANA_MAINNET_URL'],
        [
          'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_DEVNET',
          'BLOCKCHAIN_WITHDRAW_AUTO_MAX_SOLANA_MAINNET',
        ],
        ['BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_NILE', 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_MAINNET'],
      ];

      for (const [fromKey, toKey] of systemConfigKeyRenames) {
        await queryRunner.query(
          `DELETE s1 FROM system_configs s1
         INNER JOIN system_configs s2 ON s2.\`key\` = ?
         WHERE s1.\`key\` = ?`,
          [toKey, fromKey],
        );
        await queryRunner.query(`UPDATE system_configs SET \`key\` = ? WHERE \`key\` = ?`, [
          toKey,
          fromKey,
        ]);
      }

      await queryRunner.query(`
        DELETE FROM system_configs WHERE \`key\` IN ('TRON_SHASTA_FULL_HOST', 'TRON_DEFAULT_NETWORK')
      `);
      await queryRunner.query(`
        DELETE FROM system_configs WHERE \`key\` = 'BLOCKCHAIN_WITHDRAW_AUTO_MAX_TRON_SHASTA'
      `);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error('MainnetOnlyBlockchainChains1775520000000 down() is not supported');
  }
}
