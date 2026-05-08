import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeOnchainTransactionFromAddressNullable1800000001002 implements MigrationInterface {
  name = 'MakeOnchainTransactionFromAddressNullable1800000001002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'onchain_transactions'
        ) THEN
          ALTER TABLE "onchain_transactions" ALTER COLUMN "from_address" DROP NOT NULL;
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'onchain_transactions'
        ) THEN
          UPDATE "onchain_transactions" SET "from_address" = '' WHERE "from_address" IS NULL;
          ALTER TABLE "onchain_transactions" ALTER COLUMN "from_address" SET NOT NULL;
        END IF;
      END$$;
    `);
  }
}
