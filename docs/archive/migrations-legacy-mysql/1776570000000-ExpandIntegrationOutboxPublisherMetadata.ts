import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandIntegrationOutboxPublisherMetadata1776570000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'ExpandIntegrationOutboxPublisherMetadata1776570000000';

  private async addColumnIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
    columnDefinitionSql: string,
  ): Promise<void> {
    if (await queryRunner.hasColumn(tableName, columnName)) {
      return;
    }

    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinitionSql}`);
  }

  private async addIndexIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    createIndexSql: string,
  ): Promise<void> {
    const hasIndex = (
      queryRunner as QueryRunner & {
        hasIndex?: (table: string, index: string) => Promise<boolean>;
      }
    ).hasIndex;
    if (typeof hasIndex === 'function') {
      if (await hasIndex.call(queryRunner, tableName, indexName)) {
        return;
      }
    }

    await queryRunner.query(createIndexSql);
  }

  private async dropIndexIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
  ): Promise<void> {
    const hasIndex = (
      queryRunner as QueryRunner & {
        hasIndex?: (table: string, index: string) => Promise<boolean>;
      }
    ).hasIndex;
    if (typeof hasIndex === 'function') {
      if (!(await hasIndex.call(queryRunner, tableName, indexName))) {
        return;
      }
    }

    await queryRunner.query(`ALTER TABLE ${tableName} DROP INDEX ${indexName}`);
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'schema_version',
      '`schema_version` INT NOT NULL DEFAULT 1 AFTER `dedupe_key`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'correlation_id',
      '`correlation_id` varchar(191) NULL AFTER `schema_version`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'causation_id',
      '`causation_id` varchar(191) NULL AFTER `correlation_id`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'partition_key',
      '`partition_key` varchar(191) NULL AFTER `causation_id`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'kafka_topic',
      '`kafka_topic` varchar(191) NULL AFTER `partition_key`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'kafka_partition',
      '`kafka_partition` INT NULL AFTER `kafka_topic`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'kafka_offset',
      '`kafka_offset` BIGINT NULL AFTER `kafka_partition`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'kafka_published_at',
      '`kafka_published_at` datetime(6) NULL AFTER `kafka_offset`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'publish_attempts',
      '`publish_attempts` INT NOT NULL DEFAULT 0 AFTER `kafka_published_at`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'last_publish_error',
      '`last_publish_error` TEXT NULL AFTER `publish_attempts`',
    );

    await queryRunner.query(`
      UPDATE integration_outbox
      SET
        schema_version = COALESCE(schema_version, 1),
        correlation_id = COALESCE(correlation_id, JSON_UNQUOTE(JSON_EXTRACT(payload, '$.correlationId'))),
        causation_id = COALESCE(causation_id, JSON_UNQUOTE(JSON_EXTRACT(payload, '$.causationId'))),
        partition_key = COALESCE(partition_key, JSON_UNQUOTE(JSON_EXTRACT(payload, '$.partitionKey')))
    `);

    await this.dropIndexIfExists(
      queryRunner,
      'integration_outbox',
      'idx_integration_outbox_unpublished',
    );
    await this.addIndexIfNotExists(
      queryRunner,
      'integration_outbox',
      'idx_integration_outbox_unpublished',
      'CREATE INDEX idx_integration_outbox_unpublished ON integration_outbox (published_at, occurred_at)',
    );
    await this.addIndexIfNotExists(
      queryRunner,
      'integration_outbox',
      'idx_integration_outbox_topic_unpublished',
      'CREATE INDEX idx_integration_outbox_topic_unpublished ON integration_outbox (kafka_topic, published_at, occurred_at)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await this.dropIndexIfExists(
      queryRunner,
      'integration_outbox',
      'idx_integration_outbox_topic_unpublished',
    );

    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN last_publish_error');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN publish_attempts');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN kafka_published_at');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN kafka_offset');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN kafka_partition');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN kafka_topic');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN partition_key');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN causation_id');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN correlation_id');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN schema_version');
  }
}
