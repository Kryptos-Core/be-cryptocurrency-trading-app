import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class EnsureAssetColumnOnOnchainTransactions1800000001010
  implements MigrationInterface
{
  name = 'EnsureAssetColumnOnOnchainTransactions1800000001010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onchain_transactions_asset_enum') THEN
          CREATE TYPE "public"."onchain_transactions_asset_enum"
            AS ENUM ('NATIVE', 'USDT_TRC20');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'onchain_transactions'
            AND column_name = 'asset'
        ) THEN
          ALTER TABLE "onchain_transactions"
            ADD COLUMN "asset" "public"."onchain_transactions_asset_enum"
            NOT NULL DEFAULT 'NATIVE';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_onchain_tx_asset"
        ON "onchain_transactions" ("asset");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_onchain_tx_asset";
    `);
    await queryRunner.query(`
      ALTER TABLE "onchain_transactions" DROP COLUMN IF EXISTS "asset";
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."onchain_transactions_asset_enum";
    `);
  }
}
