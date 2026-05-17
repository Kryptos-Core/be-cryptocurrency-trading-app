import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Add risk flag columns to onchain_transactions for fraud detection:
 *   - high_risk_flag: e.g. 'RECENTLY_LINKED_WALLET', 'LARGE_AMOUNT', 'SUSPICIOUS_PATTERN'
 *   - risk_flags_set_at: timestamp when flags were set
 *
 * Also adds:
 *   - high_amount_threshold_usd: config threshold for large deposit/withdrawal alerts
 *   - recent_wallet_link_hours: hours threshold for "recently linked wallet" flag
 */
export class AddFraudRiskFlagsAndThresholds1800000001014 implements MigrationInterface {
  name = 'AddFraudRiskFlagsAndThresholds1800000001014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Risk flag column on onchain_transactions
    await queryRunner.query(`
      ALTER TABLE onchain_transactions
      ADD COLUMN IF NOT EXISTS high_risk_flag VARCHAR(100)
    `);

    await queryRunner.query(`
      ALTER TABLE onchain_transactions
      ADD COLUMN IF NOT EXISTS risk_flags_set_at TIMESTAMP
    `);

    // Index for querying flagged transactions
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_onchain_tx_high_risk_flag
      ON onchain_transactions (high_risk_flag)
      WHERE high_risk_flag IS NOT NULL
    `);

    // System config keys for fraud detection thresholds
    await queryRunner.query(`
      INSERT INTO app_settings (k, v, updated_at)
      VALUES ('fraud.high_amount_threshold_usd', '10000', NOW())
      ON CONFLICT (k) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO app_settings (k, v, updated_at)
      VALUES ('fraud.recent_wallet_link_hours', '24', NOW())
      ON CONFLICT (k) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_onchain_tx_high_risk_flag`);
    await queryRunner.query(`
      ALTER TABLE onchain_transactions DROP COLUMN IF EXISTS high_risk_flag
    `);
    await queryRunner.query(`
      ALTER TABLE onchain_transactions DROP COLUMN IF EXISTS risk_flags_set_at
    `);
    await queryRunner.query(`DELETE FROM app_settings WHERE k IN ('fraud.high_amount_threshold_usd', 'fraud.recent_wallet_link_hours')`);
  }
}
