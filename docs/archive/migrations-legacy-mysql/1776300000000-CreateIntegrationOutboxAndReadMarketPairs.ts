import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIntegrationOutboxAndReadMarketPairs1776300000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'CreateIntegrationOutboxAndReadMarketPairs1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration_outbox (
        id char(36) NOT NULL,
        aggregate_type varchar(64) NOT NULL,
        aggregate_id varchar(64) NOT NULL,
        event_type varchar(128) NOT NULL,
        payload json NOT NULL,
        occurred_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        published_at datetime(6) NULL,
        dedupe_key varchar(191) NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_integration_outbox_dedupe (dedupe_key),
        KEY idx_integration_outbox_unpublished (published_at, occurred_at)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS read_market_pairs (
        pair_id char(36) NOT NULL,
        symbol varchar(32) NOT NULL,
        base_currency_id char(36) NOT NULL,
        quote_currency_id char(36) NOT NULL,
        is_active tinyint(1) NOT NULL DEFAULT 1,
        updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (pair_id),
        UNIQUE KEY uk_read_market_pairs_symbol (symbol)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP TABLE IF EXISTS read_market_pairs');
    await queryRunner.query('DROP TABLE IF EXISTS integration_outbox');
  }
}
