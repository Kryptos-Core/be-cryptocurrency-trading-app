import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeOnchainTransactionFromAddressNullable1800000001002 implements MigrationInterface {
  name = 'MakeOnchainTransactionFromAddressNullable1800000001002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "onchain_transactions" ALTER COLUMN "from_address" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "onchain_transactions" SET "from_address" = '' WHERE "from_address" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "onchain_transactions" ALTER COLUMN "from_address" SET NOT NULL`,
    );
  }
}
