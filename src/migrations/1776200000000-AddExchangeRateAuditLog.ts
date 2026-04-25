import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExchangeRateAuditLog1776200000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'AddExchangeRateAuditLog1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS exchange_rate_audit_log (
        audit_id char(36) NOT NULL,
        changed_by char(36) NOT NULL,
        action varchar(32) NOT NULL,
        previous_rate decimal(20,8) NOT NULL,
        new_rate decimal(20,8) NOT NULL,
        previous_spread_bps int unsigned NOT NULL,
        new_spread_bps int unsigned NOT NULL,
        market_rate decimal(20,8) NOT NULL,
        source varchar(32) NOT NULL,
        reason varchar(255) NULL,
        created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (audit_id),
        INDEX idx_exchange_rate_audit_changed_by (changed_by),
        INDEX idx_exchange_rate_audit_created_at (created_at)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP TABLE IF EXISTS exchange_rate_audit_log');
  }
}
