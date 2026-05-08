import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CreateIntegrationOutboxAndReadMarketPairs1800000001004 implements MigrationInterface {
  name = 'CreateIntegrationOutboxAndReadMarketPairs1800000001004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "integration_outbox" (
        "id" char(36) NOT NULL,
        "aggregate_type" varchar(64) NOT NULL,
        "aggregate_id" varchar(64) NOT NULL,
        "event_type" varchar(128) NOT NULL,
        "payload" json NOT NULL,
        "occurred_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        "published_at" TIMESTAMP(6),
        "dedupe_key" varchar(191),
        "schema_version" integer NOT NULL DEFAULT 1,
        "correlation_id" varchar(191),
        "causation_id" varchar(191),
        "partition_key" varchar(191),
        "kafka_topic" varchar(191),
        "kafka_partition" integer,
        "kafka_offset" bigint,
        "kafka_published_at" TIMESTAMP(6),
        "publish_attempts" integer NOT NULL DEFAULT 0,
        "last_publish_error" text,
        "next_retry_at" TIMESTAMP(6),
        "dead_lettered_at" TIMESTAMP(6),
        CONSTRAINT "PK_integration_outbox_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_integration_outbox_dedupe_key" UNIQUE ("dedupe_key")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_integration_outbox_unpublished" ON "integration_outbox" ("published_at", "occurred_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_integration_outbox_topic_unpublished" ON "integration_outbox" ("kafka_topic", "published_at", "occurred_at")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_integration_outbox_retry" ON "integration_outbox" ("published_at", "dead_lettered_at", "next_retry_at")
    `);

    await queryRunner.query(`
      CREATE TABLE "read_market_pairs" (
        "pair_id" char(36) NOT NULL,
        "symbol" varchar(32) NOT NULL,
        "base_currency_id" char(36) NOT NULL,
        "quote_currency_id" char(36) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        CONSTRAINT "PK_read_market_pairs_pair_id" PRIMARY KEY ("pair_id"),
        CONSTRAINT "UQ_read_market_pairs_symbol" UNIQUE ("symbol")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_read_market_pairs_base_quote" ON "read_market_pairs" ("base_currency_id", "quote_currency_id")
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally left blank — no down migration for this schema creation.
  }
}
