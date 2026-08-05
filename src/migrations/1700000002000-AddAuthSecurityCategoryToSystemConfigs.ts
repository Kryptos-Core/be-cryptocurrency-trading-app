import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add AUTH_SECURITY category to system_configs enum.
 *
 * Allows the ADMIN-only toggle EMAIL_VERIFICATION_REQUIRED (and any future
 * auth/security-related runtime settings) to live in its own dedicated
 * category so it renders as the dedicated AUTH/SECURITY tab in the admin UI.
 *
 * IMPORTANT: PostgreSQL forbids `ALTER TYPE ... ADD VALUE` from inside a
 * transaction block. With `migrationsTransactionMode: 'each'`, TypeORM
 * wraps each migration in a transaction, which would fail with:
 *   "ALTER TYPE ... ADD cannot run inside a transaction block"
 *
 * To handle both `each` (transactional) and `none` (no transaction) modes
 * safely, we:
 *   1. Commit the current transaction if TypeORM opened one for us.
 *   2. Run `ALTER TYPE` directly on the underlying connection (no tx).
 *   3. Open a fresh transaction so any subsequent migration work stays
 *      transactional.
 */
export class AddAuthSecurityCategoryToSystemConfigs1700000002000
  implements MigrationInterface
{
  name = 'AddAuthSecurityCategoryToSystemConfigs1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (queryRunner.isTransactionActive) {
      await queryRunner.commitTransaction();
    }

    try {
      await queryRunner.query(`
        ALTER TYPE "public"."system_configs_category_enum"
          ADD VALUE IF NOT EXISTS 'auth_security';
      `);
    } finally {
      // Always open a fresh transaction so any later migration work is safe.
      if (!queryRunner.isTransactionActive) {
        await queryRunner.startTransaction();
      }
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values easily.
    // Reverting would require recreating the enum type and rewriting
    // system_configs rows that reference the dropped value.
  }
}
