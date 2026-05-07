import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTreasuryE2EConfigs1776650000000 implements MigrationInterface {
  name = 'CreateTreasuryE2EConfigs1776650000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE treasury_e2e_configs (
        treasury_e2e_config_id char(36) PRIMARY KEY,
        environment varchar(32) NOT NULL,
        display_name varchar(128) NOT NULL,
        api_base_url varchar(512) NOT NULL,
        chain varchar(32) NOT NULL,
        linked_wallet_id char(36) NULL,
        withdraw_amount_auto numeric(36,18) NOT NULL DEFAULT 0,
        withdraw_amount_manual numeric(36,18) NOT NULL DEFAULT 0,
        deposit_tx_hash varchar(255) NULL,
        deposit_amount numeric(36,18) NULL,
        allow_skip boolean NOT NULL DEFAULT true,
        health_fail_on_critical boolean NOT NULL DEFAULT false,
        stale_manual_minutes integer NOT NULL DEFAULT 15,
        stale_confirming_minutes integer NOT NULL DEFAULT 30,
        failed_withdrawals_24h integer NOT NULL DEFAULT 10,
        reconcile_pair_limit integer NOT NULL DEFAULT 100,
        reconciliation_threshold numeric(36,18) NOT NULL DEFAULT 0.001,
        encrypted_secrets text NULL,
        config_version integer NOT NULL DEFAULT 1,
        status varchar(16) NOT NULL DEFAULT 'INACTIVE',
        created_by char(36) NOT NULL,
        updated_by char(36) NOT NULL,
        created_at timestamp NOT NULL DEFAULT NOW(),
        updated_at timestamp NOT NULL DEFAULT NOW(),
        activated_at timestamp NULL,
        archived_at timestamp NULL,
        CONSTRAINT chk_treasury_e2e_status CHECK (status IN ('ACTIVE','INACTIVE','ARCHIVED')),
        CONSTRAINT chk_treasury_e2e_env CHECK (environment IN ('development','staging','test','production')),
        CONSTRAINT chk_treasury_e2e_deposit_pair CHECK (
          (deposit_tx_hash IS NULL AND deposit_amount IS NULL)
          OR
          (deposit_tx_hash IS NOT NULL AND deposit_amount IS NOT NULL)
        )
      )
    `);

    await queryRunner.query(
      `CREATE INDEX idx_treasury_e2e_env_status ON treasury_e2e_configs(environment, status)`,
    );
    await queryRunner.query(`CREATE INDEX idx_treasury_e2e_chain ON treasury_e2e_configs(chain)`);
    await queryRunner.query(
      `CREATE INDEX idx_treasury_e2e_updated ON treasury_e2e_configs(updated_at)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_treasury_e2e_active_env ON treasury_e2e_configs(environment) WHERE status = 'ACTIVE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS uq_treasury_e2e_active_env`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_treasury_e2e_updated`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_treasury_e2e_chain`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_treasury_e2e_env_status`);
    await queryRunner.query(`DROP TABLE IF EXISTS treasury_e2e_configs`);
  }
}
