import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Allow main-wallet deletion workflow: Finance requests → Risk approves/rejects before row is removed.
 */
export class AddTreasuryMainWalletPendingDeletion1775480000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`treasury_main_wallets\`
        MODIFY COLUMN \`status\` enum (
          'PENDING_APPROVAL',
          'ACTIVE',
          'REJECTED',
          'PENDING_DELETION'
        ) NOT NULL DEFAULT 'ACTIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`treasury_main_wallets\` SET \`status\` = 'ACTIVE' WHERE \`status\` = 'PENDING_DELETION'
    `);
    await queryRunner.query(`
      ALTER TABLE \`treasury_main_wallets\`
        MODIFY COLUMN \`status\` enum (
          'PENDING_APPROVAL',
          'ACTIVE',
          'REJECTED'
        ) NOT NULL DEFAULT 'ACTIVE'
    `);
  }
}
