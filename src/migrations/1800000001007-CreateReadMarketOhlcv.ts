import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateReadMarketOhlcv1800000001007 implements MigrationInterface {
  name = 'CreateReadMarketOhlcv1800000001007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "read_market_ohlcv" (
        "pair_id"          char(36)       NOT NULL,
        "interval_sec"     int            NOT NULL,
        "open_time"        TIMESTAMP(6)    NOT NULL,
        "open"             numeric(36,18)  NOT NULL,
        "high"             numeric(36,18)  NOT NULL,
        "low"              numeric(36,18)  NOT NULL,
        "close"            numeric(36,18)  NOT NULL,
        "volume"           numeric(36,18)  NOT NULL DEFAULT 0,
        "quote_volume"     numeric(36,18)  NOT NULL DEFAULT 0,
        "trades_count"     int            NOT NULL DEFAULT 0,
        "last_trade_id"    char(36),
        "last_outbox_id"   char(36),
        CONSTRAINT "PK_read_market_ohlcv_primary" PRIMARY KEY ("pair_id", "interval_sec", "open_time")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_read_market_ohlcv_pair_interval_time"
      ON "read_market_ohlcv" ("pair_id", "interval_sec", "open_time")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_read_market_ohlcv_pair_interval_time"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "read_market_ohlcv"`);
  }
}
