import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddWithdrawalNotificationTypes1800000001012 implements MigrationInterface {
  name = 'AddWithdrawalNotificationTypes1800000001012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const value of ['withdrawal_request', 'withdrawal_approved', 'withdrawal_rejected'] as const) {
      await queryRunner.query(`
        ALTER TYPE "public"."notifications_type_enum"
        ADD VALUE IF NOT EXISTS '${value}'
      `);
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values directly.
    // This is a one-way migration for enum value addition.
  }
}
