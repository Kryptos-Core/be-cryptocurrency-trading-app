import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProcessedIntegrationEvents1776580000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'CreateProcessedIntegrationEvents1776580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS processed_integration_events (
        id CHAR(36) NOT NULL,
        consumer_name VARCHAR(128) NOT NULL,
        event_id CHAR(36) NOT NULL,
        event_type VARCHAR(128) NOT NULL,
        processed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uk_processed_integration_events_consumer_event (consumer_name, event_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP TABLE IF EXISTS processed_integration_events');
  }
}
