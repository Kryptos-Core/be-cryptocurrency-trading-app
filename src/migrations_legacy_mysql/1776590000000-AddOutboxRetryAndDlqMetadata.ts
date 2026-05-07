import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxRetryAndDlqMetadata1776590000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'AddOutboxRetryAndDlqMetadata1776590000000';

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

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'next_retry_at',
      '`next_retry_at` datetime(6) NULL AFTER `last_publish_error`',
    );
    await this.addColumnIfNotExists(
      queryRunner,
      'integration_outbox',
      'dead_lettered_at',
      '`dead_lettered_at` datetime(6) NULL AFTER `next_retry_at`',
    );
    await this.addIndexIfNotExists(
      queryRunner,
      'integration_outbox',
      'idx_integration_outbox_retry',
      'CREATE INDEX idx_integration_outbox_retry ON integration_outbox (published_at, dead_lettered_at, next_retry_at)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN dead_lettered_at');
    await queryRunner.query('ALTER TABLE integration_outbox DROP COLUMN next_retry_at');
  }
}
