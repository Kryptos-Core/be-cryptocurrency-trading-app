import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReadMarketTrades1776600000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'CreateReadMarketTrades1776600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS read_market_trades (
        trade_id char(36) NOT NULL,
        pair_id char(36) NOT NULL,
        maker_order_id char(36) NOT NULL,
        taker_order_id char(36) NOT NULL,
        price numeric(36,18) NOT NULL,
        amount numeric(36,18) NOT NULL,
        maker_fee numeric(36,18) NOT NULL DEFAULT 0,
        taker_fee numeric(36,18) NOT NULL DEFAULT 0,
        fee_currency_id char(36) NOT NULL,
        executed_at timestamp(6) NOT NULL,
        last_outbox_id char(36) NULL,
        PRIMARY KEY (trade_id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_read_market_trades_pair_executed
      ON read_market_trades (pair_id, executed_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP TABLE IF EXISTS read_market_trades');
  }
}
