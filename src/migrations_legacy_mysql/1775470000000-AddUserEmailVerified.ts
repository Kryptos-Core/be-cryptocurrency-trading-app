import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * email_verified: đã chứng minh quyền sở hữu inbox (OTP) — bật 2FA hoặc xác minh email liên hệ (ví).
 * Khác identity_verified (KYC). Không dùng role GUEST/VERIFIED_USER.
 */
export class AddUserEmailVerified1775470000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    const table = await queryRunner.getTable('users');
    if (!table?.findColumnByName('email_verified')) {
      await queryRunner.query(`
        ALTER TABLE users
        ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0
        AFTER identity_verified
      `);
    }

    await queryRunner.query(`
      UPDATE users SET email_verified = 1 WHERE two_fa_enabled = 1
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_set_two_fa');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_set_two_fa(
        IN p_user_id CHAR(36),
        IN p_enabled TINYINT(1)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET
          two_fa_enabled = IF(p_enabled = 1, 1, 0),
          email_verified = IF(p_enabled = 1, 1, email_verified)
        WHERE user_id = p_user_id;
        SELECT ROW_COUNT() AS affected;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(IN p_user_id CHAR(36))
      READS SQL DATA
      BEGIN
        SELECT
          user_id,
          email,
          password_hash,
          first_name,
          last_name,
          status,
          role,
          avatar_url,
          avatar_public_id,
          two_fa_enabled,
          identity_verified,
          email_verified,
          fcm_token,
          created_at
        FROM users
        WHERE user_id = p_user_id;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_email');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_email(IN p_email VARCHAR(255))
      READS SQL DATA
      BEGIN
        SELECT
          user_id,
          email,
          password_hash,
          first_name,
          last_name,
          status,
          role,
          avatar_url,
          avatar_public_id,
          two_fa_enabled,
          identity_verified,
          email_verified,
          fcm_token,
          created_at
        FROM users
        WHERE email = p_email;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(IN p_user_id CHAR(36))
      READS SQL DATA
      BEGIN
        SELECT
          user_id,
          email,
          password_hash,
          first_name,
          last_name,
          status,
          role,
          avatar_url,
          avatar_public_id,
          two_fa_enabled,
          identity_verified,
          fcm_token,
          created_at
        FROM users
        WHERE user_id = p_user_id;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_email');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_email(IN p_email VARCHAR(255))
      READS SQL DATA
      BEGIN
        SELECT
          user_id,
          email,
          password_hash,
          first_name,
          last_name,
          status,
          role,
          avatar_url,
          avatar_public_id,
          two_fa_enabled,
          identity_verified,
          fcm_token,
          created_at
        FROM users
        WHERE email = p_email;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_set_two_fa');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_set_two_fa(
        IN p_user_id CHAR(36),
        IN p_enabled TINYINT(1)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET two_fa_enabled = IF(p_enabled = 1, 1, 0)
        WHERE user_id = p_user_id;
        SELECT ROW_COUNT() AS affected;
      END
    `);

    const table = await queryRunner.getTable('users');
    if (table?.findColumnByName('email_verified')) {
      await queryRunner.query(`ALTER TABLE users DROP COLUMN email_verified`);
    }
  }
}
