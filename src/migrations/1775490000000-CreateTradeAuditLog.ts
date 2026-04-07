import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Creates trade_audit_log table for persistent, immutable audit records.
 * Append-only: no UPDATE or DELETE allowed on this table.
 * Addresses Phase 2 - Task 8 from matching-engine-analysis-plan.md.
 */
export class CreateTradeAuditLog1775490000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS trade_audit_log (
        trade_id      CHAR(36)        NOT NULL,
        pair_id       CHAR(36)        NOT NULL,
        maker_order_id CHAR(36)       NOT NULL,
        taker_order_id CHAR(36)       NOT NULL,
        price         DECIMAL(36,18)  NOT NULL,
        amount        DECIMAL(36,18)  NOT NULL,
        taker_fee     DECIMAL(36,18)  NOT NULL DEFAULT 0,
        maker_fee     DECIMAL(36,18)  NOT NULL DEFAULT 0,
        fee_currency_id CHAR(36)      NOT NULL,
        logged_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (trade_id),
        INDEX idx_audit_pair_time (pair_id, logged_at),
        INDEX idx_audit_trade (trade_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Immutable audit log of all matched trades. Append-only.';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS trade_audit_log`);
  }
}
