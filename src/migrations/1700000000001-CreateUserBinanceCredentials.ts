import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserBinanceCredentials1700000000001 implements MigrationInterface {
  name = 'CreateUserBinanceCredentials1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_binance_credentials" (
        "id"          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        "user_id"     CHAR(36) NOT NULL REFERENCES "users"("user_id") ON DELETE CASCADE,
        "credentials_encrypted" TEXT NOT NULL,
        "label"       VARCHAR(100),
        "permissions" TEXT DEFAULT 'SPOT',
        "testnet"     BOOLEAN DEFAULT FALSE,
        "is_active"   BOOLEAN DEFAULT TRUE,
        "last_used_at" TIMESTAMP,
        "created_at"  TIMESTAMP DEFAULT NOW(),
        "updated_at"  TIMESTAMP DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uk_ubc_user_label"
      ON "user_binance_credentials" ("user_id", "label")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_ubc_user"
      ON "user_binance_credentials" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_ubc_user"`);
    await queryRunner.query(`DROP INDEX "uk_ubc_user_label"`);
    await queryRunner.query(`DROP TABLE "user_binance_credentials"`);
  }
}
