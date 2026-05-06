import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArchivedAtToTreasuryE2EConfig1800000001001 implements MigrationInterface {
  name = 'AddArchivedAtToTreasuryE2EConfig1800000001001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "treasury_e2e_configs" ADD COLUMN "archived_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "treasury_e2e_configs" DROP COLUMN "archived_at"`);
  }
}
