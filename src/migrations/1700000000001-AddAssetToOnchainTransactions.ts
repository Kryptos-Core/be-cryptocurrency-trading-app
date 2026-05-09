import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssetToOnchainTransactions1700000000001 implements MigrationInterface {
  name = 'AddAssetToOnchainTransactions1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type if it doesn't exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onchain_transactions_asset_enum') THEN
          CREATE TYPE "public"."onchain_transactions_asset_enum" AS ENUM ('NATIVE', 'USDT_TRC20');
        END IF;
      END
      $$;
    `);

    // Add column if it doesn't exist
    await queryRunner.query(`
      ALTER TABLE "onchain_transactions"
      ADD COLUMN IF NOT EXISTS "asset" "public"."onchain_transactions_asset_enum" NOT NULL DEFAULT 'NATIVE'
    `);

    // Create index for asset column
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_onchain_tx_asset"
      ON "onchain_transactions" ("asset")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_onchain_tx_asset"`);
    await queryRunner.query(`ALTER TABLE "onchain_transactions" DROP COLUMN IF EXISTS "asset"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."onchain_transactions_asset_enum"`);
  }
}
