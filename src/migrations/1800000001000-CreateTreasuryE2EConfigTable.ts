import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTreasuryE2EConfigTable1800000001000 implements MigrationInterface {
  name = 'CreateTreasuryE2EConfigTable1800000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."treasury_e2e_configs_chain_enum" AS ENUM('ARBITRUM_MAINNET', 'ARBITRUM_SEPOLIA', 'AVALANCHE_FUJI', 'AVALANCHE_MAINNET', 'BASE_MAINNET', 'BASE_SEPOLIA', 'BSC_CHAPEL', 'BSC_MAINNET', 'ETH_MAINNET', 'ETH_SEPOLIA', 'FANTOM_MAINNET', 'FANTOM_TESTNET', 'GNOSIS_CHIADO', 'GNOSIS_MAINNET', 'LINEA_MAINNET', 'LINEA_SEPOLIA', 'OPTIMISM_MAINNET', 'OPTIMISM_SEPOLIA', 'POLYGON_AMOY', 'POLYGON_MAINNET', 'SOLANA_DEVNET', 'SOLANA_MAINNET', 'TON_MAINNET', 'TON_TESTNET', 'TRON_MAINNET', 'TRON_NILE', 'TRON_SHASTA')`,
    );

    await queryRunner.query(
      `CREATE TABLE "treasury_e2e_configs" (
        "treasury_e2e_config_id" character(36) NOT NULL,
        "environment" character varying(32) NOT NULL,
        "display_name" character varying(128) NOT NULL,
        "api_base_url" character varying(512) NOT NULL,
        "chain" "public"."treasury_e2e_configs_chain_enum" NOT NULL,
        "linked_wallet_id" character(36),
        "withdraw_amount_auto" numeric(36, 18) NOT NULL DEFAULT '0',
        "withdraw_amount_manual" numeric(36, 18) NOT NULL DEFAULT '0',
        "deposit_tx_hash" character varying(255),
        "deposit_amount" numeric(36, 18),
        "allow_skip" boolean NOT NULL DEFAULT true,
        "health_fail_on_critical" boolean NOT NULL DEFAULT false,
        "stale_manual_minutes" integer NOT NULL DEFAULT 15,
        "stale_confirming_minutes" integer NOT NULL DEFAULT 30,
        "failed_withdrawals_24h" integer NOT NULL DEFAULT 10,
        "reconcile_pair_limit" integer NOT NULL DEFAULT 100,
        "reconciliation_threshold" numeric(36, 18) NOT NULL DEFAULT '0',
        "encrypted_secrets" text,
        "trader_user_id" character(36),
        "risk_user_id" character(36),
        "config_version" integer NOT NULL DEFAULT 1,
        "status" character varying(16) NOT NULL DEFAULT 'INACTIVE',
        "created_by" character(36) NOT NULL,
        "updated_by" character(36) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "activated_at" TIMESTAMP,
        "last_health_check_at" TIMESTAMP,
        CONSTRAINT "PK_treasury_e2e_config_id" PRIMARY KEY ("treasury_e2e_config_id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "idx_treasury_e2e_env_status" ON "treasury_e2e_configs" ("environment", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_treasury_e2e_chain" ON "treasury_e2e_configs" ("chain")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_treasury_e2e_updated" ON "treasury_e2e_configs" ("updated_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_treasury_e2e_updated"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_treasury_e2e_chain"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_treasury_e2e_env_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "treasury_e2e_configs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."treasury_e2e_configs_chain_enum"`);
  }
}
