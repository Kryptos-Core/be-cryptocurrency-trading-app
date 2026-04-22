import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3: Support UNMATCHED deposits — tx detected on-chain to our deposit address
 * but the sender wallet is not linked to any user account.
 *
 * - Make onchain_transactions.user_id nullable (unmatched rows have no user yet).
 * - Add UNMATCHED status enum value.
 * - Add index for admin queries on UNMATCHED rows.
 */
export class AddUnmatchedDepositSupport1776550000000 implements MigrationInterface {
  name = 'AddUnmatchedDepositSupport1776550000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make user_id nullable for unmatched deposits.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY COLUMN \`user_id\` char(36) NULL DEFAULT NULL
    `);

    // Add UNMATCHED to status enum.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY COLUMN \`status\` enum('UNMATCHED','PENDING','CONFIRMING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING'
    `);

    // Index for admin: find all UNMATCHED rows quickly.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        ADD INDEX \`idx_onchain_tx_unmatched\` (\`status\`, \`created_at\`)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        DROP INDEX \`idx_onchain_tx_unmatched\`
    `);

    // Revert status enum — rows with UNMATCHED would need manual cleanup first in prod.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY COLUMN \`status\` enum('PENDING','CONFIRMING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING'
    `);

    // Revert user_id to NOT NULL — only safe if no NULL rows exist.
    await queryRunner.query(`
      ALTER TABLE \`onchain_transactions\`
        MODIFY COLUMN \`user_id\` char(36) NOT NULL
    `);
  }
}
