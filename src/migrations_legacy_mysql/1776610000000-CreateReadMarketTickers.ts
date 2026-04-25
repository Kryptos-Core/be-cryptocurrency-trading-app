import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReadMarketTickers1776610000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'CreateReadMarketTickers1776610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS read_market_tickers (
        pair_id char(36) NOT NULL,
        symbol varchar(32) NOT NULL,
        last_price numeric(36,18) NOT NULL,
        best_bid numeric(36,18) NOT NULL,
        best_ask numeric(36,18) NOT NULL,
        volume_24h numeric(36,18) NOT NULL DEFAULT 0,
        volume_24h_usd numeric(36,18) NOT NULL DEFAULT 0,
        change_24h numeric(36,18) NOT NULL DEFAULT 0,
        change_percent_24h numeric(36,18) NOT NULL DEFAULT 0,
        high_24h numeric(36,18) NOT NULL,
        low_24h numeric(36,18) NOT NULL,
        open_24h numeric(36,18) NOT NULL,
        ticker_timestamp timestamp(6) NOT NULL,
        last_outbox_id char(36) NULL,
        PRIMARY KEY (pair_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_read_market_tickers_symbol
      ON read_market_tickers (symbol)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP TABLE IF EXISTS read_market_tickers');
  }
}
