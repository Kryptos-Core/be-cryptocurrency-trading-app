import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateReadMarketTrades1800000001006 implements MigrationInterface {
  name = 'CreateReadMarketTrades1800000001006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "read_market_trades" (
        "trade_id"          char(36)       NOT NULL,
        "pair_id"           char(36)       NOT NULL,
        "maker_order_id"    char(36)       NOT NULL,
        "taker_order_id"    char(36)       NOT NULL,
        "price"             numeric(36,18)  NOT NULL,
        "amount"            numeric(36,18)  NOT NULL,
        "maker_fee"         numeric(36,18)  NOT NULL DEFAULT 0,
        "taker_fee"         numeric(36,18)  NOT NULL DEFAULT 0,
        "fee_currency_id"   char(36)       NOT NULL,
        "executed_at"       TIMESTAMP(6)    NOT NULL,
        "last_outbox_id"    char(36),
        CONSTRAINT "PK_read_market_trades_trade_id" PRIMARY KEY ("trade_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_read_market_trades_pair_executed"
      ON "read_market_trades" ("pair_id", "executed_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_read_market_trades_pair_executed"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "read_market_trades"`);
  }
}
