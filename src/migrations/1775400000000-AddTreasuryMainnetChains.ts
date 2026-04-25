import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTreasuryMainnetChains1775400000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      ALTER TABLE \`transaction_wallets\`
      MODIFY COLUMN \`chain\` enum ('ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET', 'ETH_MAINNET') NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
      MODIFY COLUMN \`chain\` enum ('ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA', 'TRON_MAINNET', 'ETH_MAINNET') NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      ALTER TABLE \`transaction_wallets\`
      MODIFY COLUMN \`chain\` enum ('ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA') NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
      MODIFY COLUMN \`chain\` enum ('ETH_SEPOLIA', 'TRON_NILE', 'TRON_SHASTA') NOT NULL
    `);
  }
}
