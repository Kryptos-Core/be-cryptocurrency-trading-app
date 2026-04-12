import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * - identity_verified: đã nộp/xác minh CCCD/Passport (không còn dùng role VERIFIED_USER).
 * - Gỡ GUEST / VERIFIED_USER khỏi enum role; dữ liệu cũ map về TRADER + cờ identity_verified.
 */
export class AddUserIdentityVerifiedAndTrimRoles1775440000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (!table) return;

    if (!table.findColumnByName('identity_verified')) {
      await queryRunner.query(`
        ALTER TABLE users
        ADD COLUMN identity_verified TINYINT(1) NOT NULL DEFAULT 0
        AFTER two_fa_enabled
      `);
    }

    await queryRunner.query(`
      UPDATE users
      SET identity_verified = 1
      WHERE role = 'VERIFIED_USER'
    `);

    await queryRunner.query(`
      UPDATE users
      SET role = 'TRADER'
      WHERE role IN ('GUEST', 'VERIFIED_USER')
    `);

    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM(
        'TRADER',
        'ADMIN',
        'RISK_OFFICER',
        'SUPPORT_AGENT',
        'MARKET_MAKER',
        'FINANCE_MANAGER'
      ) NOT NULL DEFAULT 'TRADER'
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

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_update(
        IN p_user_id CHAR(36),
        IN p_email VARCHAR(255),
        IN p_status VARCHAR(50),
        IN p_role VARCHAR(50),
        IN p_identity_verified TINYINT(1)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET
          email = COALESCE(p_email, email),
          status = COALESCE(p_status, status),
          role = COALESCE(p_role, role),
          identity_verified = IF(
            p_identity_verified IS NULL,
            identity_verified,
            IF(p_identity_verified = 1, 1, 0)
          )
        WHERE user_id = p_user_id;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_update(
        IN p_user_id CHAR(36),
        IN p_email VARCHAR(255),
        IN p_status VARCHAR(50),
        IN p_role VARCHAR(50)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET
          email = COALESCE(p_email, email),
          status = COALESCE(p_status, status),
          role = COALESCE(p_role, role)
        WHERE user_id = p_user_id;
      END
    `);

    await queryRunner.query(`
      ALTER TABLE users
      MODIFY COLUMN role ENUM(
        'GUEST',
        'TRADER',
        'VERIFIED_USER',
        'ADMIN',
        'RISK_OFFICER',
        'SUPPORT_AGENT',
        'MARKET_MAKER',
        'FINANCE_MANAGER'
      ) NOT NULL DEFAULT 'TRADER'
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
          fcm_token,
          created_at
        FROM users
        WHERE email = p_email;
      END
    `);

    await queryRunner.query(`
      ALTER TABLE users DROP COLUMN identity_verified
    `);
  }
}
