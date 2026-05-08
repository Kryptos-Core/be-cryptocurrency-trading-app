import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreatePostgresMissingTables1800000001005 implements MigrationInterface {
  name = 'CreatePostgresMissingTables1800000001005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. processed_integration_events ──────────────────────────────────────────
    // NOTE: if the table already exists (e.g. migration was applied before this fix),
    // the `up` block will fail on the CREATE TABLE — run the ALTER below manually or
    // re-create the table. On a fresh `migration:run` this CREATE TABLE succeeds.
    await queryRunner.query(`
      CREATE TABLE "processed_integration_events" (
        "id"             uuid         NOT NULL DEFAULT gen_random_uuid(),
        "consumer_name"  varchar(128)  NOT NULL,
        "event_id"       char(36)      NOT NULL,
        "event_type"     varchar(128)  NOT NULL,
        "processed_at"   TIMESTAMP(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        CONSTRAINT "PK_processed_integration_events_id" PRIMARY KEY ("id"),
        CONSTRAINT "UK_processed_integration_events_consumer_event" UNIQUE ("consumer_name", "event_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_processed_integration_events_consumer_event"
      ON "processed_integration_events" ("consumer_name", "event_id")
    `);

    // ── 2. read_market_tickers ───────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "read_market_tickers" (
        "pair_id"            char(36)       NOT NULL,
        "symbol"             varchar(32)    NOT NULL,
        "last_price"         numeric(36,18)  NOT NULL,
        "best_bid"           numeric(36,18)  NOT NULL,
        "best_ask"           numeric(36,18)  NOT NULL,
        "volume_24h"         numeric(36,18)  NOT NULL DEFAULT 0,
        "volume_24h_usd"     numeric(36,18)  NOT NULL DEFAULT 0,
        "change_24h"         numeric(36,18)  NOT NULL DEFAULT 0,
        "change_percent_24h" numeric(36,18)  NOT NULL DEFAULT 0,
        "high_24h"           numeric(36,18)  NOT NULL,
        "low_24h"            numeric(36,18)  NOT NULL,
        "open_24h"           numeric(36,18)  NOT NULL,
        "ticker_timestamp"   TIMESTAMP(6)    NOT NULL,
        "last_outbox_id"     char(36),
        CONSTRAINT "PK_read_market_tickers_pair_id" PRIMARY KEY ("pair_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_read_market_tickers_symbol"
      ON "read_market_tickers" ("symbol")
    `);

    // ── 3. payment_method_configs ────────────────────────────────────────────────
    // PostgreSQL ENUM types for the columns that were MySQL ENUM
    await queryRunner.query(`
      CREATE TYPE "public"."payment_method_configs_type_enum"
      AS ENUM ('PAYOS', 'ETH', 'TRON', 'SOL', 'BSC')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."payment_method_configs_status_enum"
      AS ENUM ('ACTIVE', 'TRANSITIONING', 'INACTIVE')
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_method_configs" (
        "config_id"             char(36)                                            NOT NULL,
        "type"                  "public"."payment_method_configs_type_enum"          NOT NULL,
        "network"               varchar(64)                                         NOT NULL,
        "display_name"          varchar(128)                                        NOT NULL,
        "encrypted_config"      text                                                NOT NULL,
        "config_version"        integer                                             NOT NULL DEFAULT 1,
        "status"                "public"."payment_method_configs_status_enum"        NOT NULL DEFAULT 'INACTIVE',
        "grace_period_minutes"  integer                                             NOT NULL DEFAULT 15,
        "transition_started_at" TIMESTAMP(3),
        "activated_at"          TIMESTAMP(3),
        "sort_order"            integer                                             NOT NULL DEFAULT 0,
        "created_by"            char(36)                                            NOT NULL,
        "updated_by"            char(36)                                            NOT NULL,
        "created_at"           TIMESTAMP(3)                                         NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        "updated_at"           TIMESTAMP(3)                                         NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT "PK_payment_method_configs_config_id" PRIMARY KEY ("config_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_pmc_type_network_status"
      ON "payment_method_configs" ("type", "network", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_pmc_status"
      ON "payment_method_configs" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_method_configs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_method_configs_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."payment_method_configs_type_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "read_market_tickers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "processed_integration_events"`);
  }
}
