import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateAppSettingsTable1800000001009 implements MigrationInterface {
  name = 'CreateAppSettingsTable1800000001009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_settings" (
        "k"         varchar(64)  NOT NULL,
        "v"         varchar(2048) NOT NULL,
        "updated_at" TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_app_settings_k" PRIMARY KEY ("k")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "app_settings"`);
  }
}
