import { MigrationInterface, QueryRunner } from 'typeorm';

export class HardenTreasuryE2EConfigIdentityAndSeed1776660000000 implements MigrationInterface {
  name = 'HardenTreasuryE2EConfigIdentityAndSeed1776660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE treasury_e2e_configs ADD COLUMN trader_user_id char(36) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE treasury_e2e_configs ADD COLUMN risk_user_id char(36) NULL`,
    );

    const traders = await queryRunner.query(
      `SELECT user_id FROM users WHERE role = 'TRADER' AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1`,
    );
    const risks = await queryRunner.query(
      `SELECT user_id FROM users WHERE role IN ('RISK_OFFICER','ADMIN') AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1`,
    );
    const finance = await queryRunner.query(
      `SELECT user_id FROM users WHERE role IN ('FINANCE_MANAGER','ADMIN') AND status = 'ACTIVE' ORDER BY created_at ASC LIMIT 1`,
    );

    const traderUserId = traders?.[0]?.user_id ?? null;
    const riskUserId = risks?.[0]?.user_id ?? null;
    const actorUserId = finance?.[0]?.user_id ?? riskUserId ?? traderUserId ?? null;

    if (actorUserId) {
      const existing = await queryRunner.query(
        `SELECT treasury_e2e_config_id FROM treasury_e2e_configs WHERE environment = 'development' LIMIT 1`,
      );
      if (!existing?.length) {
        await queryRunner.query(
          `INSERT INTO treasury_e2e_configs (
            treasury_e2e_config_id, environment, display_name, api_base_url, chain, linked_wallet_id,
            withdraw_amount_auto, withdraw_amount_manual, deposit_tx_hash, deposit_amount,
            allow_skip, health_fail_on_critical, stale_manual_minutes, stale_confirming_minutes,
            failed_withdrawals_24h, reconcile_pair_limit, reconciliation_threshold,
            encrypted_secrets, trader_user_id, risk_user_id,
            config_version, status, created_by, updated_by, created_at, updated_at
          ) VALUES (
            '018f0000-0000-7000-8000-000000000001', 'development', 'Default Dev Treasury E2E', 'http://127.0.0.1:3000', 'BSC_CHAPEL', NULL,
            0.01, 1.0, NULL, NULL,
            true, false, 15, 30,
            10, 100, 0.001,
            NULL, $1, $2,
            1, 'INACTIVE', $3, $3, NOW(), NOW()
          )`,
          [traderUserId, riskUserId, actorUserId],
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM treasury_e2e_configs WHERE treasury_e2e_config_id = '018f0000-0000-7000-8000-000000000001'`,
    );
    await queryRunner.query(`ALTER TABLE treasury_e2e_configs DROP COLUMN risk_user_id`);
    await queryRunner.query(`ALTER TABLE treasury_e2e_configs DROP COLUMN trader_user_id`);
  }
}
