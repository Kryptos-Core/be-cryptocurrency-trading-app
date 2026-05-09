import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateBlockchainTablesAndFixEventType1800000001007 implements MigrationInterface {
  name = 'CreateBlockchainTablesAndFixEventType1800000001007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Fix processed_integration_events: add missing event_type column ───
    // Safe: only runs if column doesn't exist yet
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'processed_integration_events'
            AND column_name = 'event_type'
        ) THEN
          ALTER TABLE "processed_integration_events"
          ADD COLUMN "event_type" varchar(128) NOT NULL DEFAULT '';
        END IF;
      END $$;
    `);

    // ── 2. linked_wallets ───────────────────────────────────────────────────
    // New enum for status column
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'linked_wallets_status_enum') THEN
          CREATE TYPE "public"."linked_wallets_status_enum"
          AS ENUM ('PENDING', 'VERIFIED', 'REVOKED');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "linked_wallets" (
        "link_id"    char(36)        NOT NULL,
        "user_id"    char(36)        NOT NULL,
        "chain"      "public"."transaction_wallets_chain_enum" NOT NULL,
        "address"    varchar(255)   NOT NULL,
        "label"      varchar(100),
        "status"     "public"."linked_wallets_status_enum" NOT NULL DEFAULT 'PENDING',
        "linked_at"  timestamp,
        "created_at" TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_linked_wallets_link_id" PRIMARY KEY ("link_id"),
        CONSTRAINT "FK_linked_wallets_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("user_id") ON DELETE CASCADE,
        CONSTRAINT "uk_linked_wallet_user_chain_addr"
          UNIQUE ("user_id", "chain", "address")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_linked_wallet_user"
      ON "linked_wallets" ("user_id", "status")
    `);

    // ── 3. onchain_transactions ──────────────────────────────────────────────
    // New enum for type column
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onchain_transactions_type_enum') THEN
          CREATE TYPE "public"."onchain_transactions_type_enum"
          AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'SWEEP', 'FUND');
        END IF;
      END $$;
    `);

    // New enum for status column
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'onchain_transactions_status_enum') THEN
          CREATE TYPE "public"."onchain_transactions_status_enum"
          AS ENUM ('UNMATCHED', 'PENDING', 'CONFIRMING', 'COMPLETED', 'FAILED');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "onchain_transactions" (
        "tx_id"                 char(36)        NOT NULL,
        "user_id"               char(36),
        "linked_wallet_id"      char(36),
        "treasury_operation_id" char(36),
        "chain"                 "public"."transaction_wallets_chain_enum" NOT NULL,
        "type"                  "public"."onchain_transactions_type_enum" NOT NULL,
        "tx_hash"               varchar(255),
        "log_index"             integer         NOT NULL DEFAULT 0,
        "from_address"          varchar(255),
        "to_address"            varchar(255)    NOT NULL,
        "amount"                numeric(36,18)  NOT NULL,
        "confirmations"         integer         NOT NULL DEFAULT 0,
        "status"                "public"."onchain_transactions_status_enum" NOT NULL DEFAULT 'PENDING',
        "created_at"            TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "confirmed_at"          timestamp,
        "credited_currency_id"  char(36),
        "credited_amount"       numeric(36,18),
        "conversion_rate"       numeric(36,18),
        CONSTRAINT "PK_onchain_transactions_tx_id" PRIMARY KEY ("tx_id"),
        CONSTRAINT "FK_onchain_transactions_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users" ("user_id") ON DELETE CASCADE,
        CONSTRAINT "FK_onchain_transactions_linked_wallet_id" FOREIGN KEY ("linked_wallet_id")
          REFERENCES "linked_wallets" ("link_id") ON DELETE SET NULL,
        CONSTRAINT "uk_onchain_tx_chain_hash_log"
          UNIQUE ("chain", "tx_hash", "log_index")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_onchain_tx_user"
      ON "onchain_transactions" ("user_id", "type", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_onchain_tx_created"
      ON "onchain_transactions" ("user_id", "created_at")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_onchain_tx_treasury_operation"
      ON "onchain_transactions" ("treasury_operation_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "onchain_transactions"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."onchain_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."onchain_transactions_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "linked_wallets"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."linked_wallets_status_enum"`);
    await queryRunner.query(`
      ALTER TABLE "processed_integration_events" DROP COLUMN IF EXISTS "event_type"
    `);
  }
}
