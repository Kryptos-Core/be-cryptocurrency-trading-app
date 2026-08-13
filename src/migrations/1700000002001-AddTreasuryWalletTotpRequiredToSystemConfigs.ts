import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seed the TREASURY_WALLET_TOTP_REQUIRED runtime setting under the
 * AUTH_SECURITY category. Default value is 'true' (secure by default).
 *
 * Notes:
 * - The `auth_security` category enum value was added by
 *   AddAuthSecurityCategoryToSystemConfigs1700000002000.
 * - This migration only seeds the default DB row; admins can flip the toggle
 *   from the System Config UI at runtime.
 */
export class AddTreasuryWalletTotpRequiredToSystemConfigs1700000002001
  implements MigrationInterface
{
  name = 'AddTreasuryWalletTotpRequiredToSystemConfigs1700000002001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO system_configs (
          key, value, type, category, name, description, "isReadOnly"
        )
        VALUES (
          'TREASURY_WALLET_TOTP_REQUIRED',
          'true',
          'bool',
          'auth_security',
          'Treasury main wallet TOTP required (import / reveal)',
          'When true (default), import and reveal-private-key of treasury main wallets require a TOTP 2FA code. When false, the TOTP check is bypassed for treasury main-wallet operations. This flag has no effect when ONCHAIN_OPERATOR_MODE=production.',
          false
        )
        ON CONFLICT (key) DO NOTHING;
      `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM system_configs WHERE key = 'TREASURY_WALLET_TOTP_REQUIRED';`,
    );
  }
}