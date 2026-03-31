import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Upgrade treasury_main_wallets:
 * 1. Extend chain enum: add SOL_DEVNET, SOL_MAINNET
 * 2. Add status column: PENDING_APPROVAL | ACTIVE | REJECTED (approval workflow)
 * 3. Add audit columns: created_by, approved_by, approved_at, rejected_by, rejected_at
 * 4. Add rotation tracking: last_rotated_at, rotation_interval_days
 * 5. Add unique index per (chain, address) to prevent duplicates
 */
export class UpgradeTreasuryMainWallets1775460000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Extend chain enum to include Solana (mỗi bảng một query — MySQL driver không chạy multi-statement)
    const chainEnumValues =
      `'ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET', 'SOLANA_DEVNET', 'SOLANA_MAINNET'`;
    for (const table of [
      'treasury_main_wallets',
      'transaction_wallets',
      'treasury_operations',
      'onchain_transactions',
    ] as const) {
      await queryRunner.query(
        `ALTER TABLE \`${table}\` MODIFY \`chain\` enum (${chainEnumValues}) NOT NULL`,
      );
    }

    // 2. Add status column for approval workflow
    await queryRunner.query(`
      ALTER TABLE \`treasury_main_wallets\`
        ADD COLUMN \`status\` enum ('PENDING_APPROVAL', 'ACTIVE', 'REJECTED')
          NOT NULL DEFAULT 'ACTIVE' AFTER \`is_default\`
    `);

    // 3. Add audit columns
    await queryRunner.query(`
      ALTER TABLE \`treasury_main_wallets\`
        ADD COLUMN \`created_by\`    char(36) NULL AFTER \`status\`,
        ADD COLUMN \`approved_by\`   char(36) NULL AFTER \`created_by\`,
        ADD COLUMN \`approved_at\`   datetime(6) NULL AFTER \`approved_by\`,
        ADD COLUMN \`rejected_by\`   char(36) NULL AFTER \`approved_at\`,
        ADD COLUMN \`rejected_at\`   datetime(6) NULL AFTER \`rejected_by\`
    `);

    // 4. Add rotation tracking columns
    await queryRunner.query(`
      ALTER TABLE \`treasury_main_wallets\`
        ADD COLUMN \`last_rotated_at\`         datetime(6) NULL,
        ADD COLUMN \`rotation_interval_days\`   int UNSIGNED NULL DEFAULT NULL
    `);

    // 5. Add unique constraint per chain+address
    await queryRunner.query(`
      ALTER TABLE \`treasury_main_wallets\`
        ADD UNIQUE INDEX \`uk_tmw_chain_address\` (\`chain\`, \`address\`)
    `);

    // 6. Add index on status for fast queries
    await queryRunner.query(`
      CREATE INDEX \`idx_tmw_status\` ON \`treasury_main_wallets\` (\`status\`)
    `);

    // 7. Existing seeded records from PaymentConfig: promote to ACTIVE
    await queryRunner.query(`
      UPDATE \`treasury_main_wallets\` SET \`status\` = 'ACTIVE' WHERE \`status\` = 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX \`idx_tmw_status\` ON \`treasury_main_wallets\``);
    await queryRunner.query(`DROP INDEX \`uk_tmw_chain_address\` ON \`treasury_main_wallets\``);
    await queryRunner.query(`
      ALTER TABLE \`treasury_main_wallets\`
        DROP COLUMN \`rotation_interval_days\`,
        DROP COLUMN \`last_rotated_at\`,
        DROP COLUMN \`rejected_at\`,
        DROP COLUMN \`rejected_by\`,
        DROP COLUMN \`approved_at\`,
        DROP COLUMN \`approved_by\`,
        DROP COLUMN \`created_by\`,
        DROP COLUMN \`status\`
    `);
    const chainRevertTmwTwTo = `enum ('ETH_SEPOLIA', 'ETH_MAINNET', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET') NOT NULL`;
    await queryRunner.query(
      `ALTER TABLE \`treasury_main_wallets\` MODIFY \`chain\` ${chainRevertTmwTwTo}`,
    );
    await queryRunner.query(
      `ALTER TABLE \`transaction_wallets\` MODIFY \`chain\` ${chainRevertTmwTwTo}`,
    );
    await queryRunner.query(
      `ALTER TABLE \`treasury_operations\` MODIFY \`chain\` ${chainRevertTmwTwTo}`,
    );
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY \`chain\` enum ('TRON_NILE', 'TRON_SHASTA', 'SOLANA_DEVNET', 'ETH_SEPOLIA') NOT NULL
    `);
  }
}
