import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add AUTH_SECURITY category to system_configs enum.
 *
 * Allows the ADMIN-only toggle EMAIL_VERIFICATION_REQUIRED (and any future
 * auth/security-related runtime settings) to live in its own dedicated
 * category so it renders as the dedicated AUTH/SECURITY tab in the admin UI.
 */
export class AddAuthSecurityCategoryToSystemConfigs1700000002000
  implements MigrationInterface
{
  name = 'AddAuthSecurityCategoryToSystemConfigs1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."system_configs_category_enum"
        ADD VALUE IF NOT EXISTS 'auth_security';
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support removing enum values easily.
    // Reverting would require recreating the enum type and rewriting
    // system_configs rows that reference the dropped value.
  }
}
