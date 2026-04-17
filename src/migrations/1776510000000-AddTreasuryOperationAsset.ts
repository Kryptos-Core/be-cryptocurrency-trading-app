import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTreasuryOperationAsset1776510000000 implements MigrationInterface {
  name = 'AddTreasuryOperationAsset1776510000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`treasury_operations\`
      ADD COLUMN \`asset\` varchar(24) NOT NULL DEFAULT 'NATIVE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`treasury_operations\` DROP COLUMN \`asset\``);
  }
}
