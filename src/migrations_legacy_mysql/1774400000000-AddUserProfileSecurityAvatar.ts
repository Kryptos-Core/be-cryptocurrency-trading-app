import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: User profile basic update, security change requests (approval flow), avatar columns.
 * - users: add avatar_url, avatar_public_id
 * - user_security_change_requests: new table for PENDING/APPROVED/REJECTED
 * - SPs: sp_user_update_profile_basic, sp_user_update_avatar, sp_user_security_change_request_*
 */
export class AddUserProfileSecurityAvatar1774400000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    // 1. Add avatar columns to users
    const table = await queryRunner.getTable('users');
    const hasAvatarUrl = table?.findColumnByName('avatar_url');
    if (!hasAvatarUrl) {
      await queryRunner.query(`
        ALTER TABLE users
        ADD COLUMN avatar_url VARCHAR(512) NULL AFTER role,
        ADD COLUMN avatar_public_id VARCHAR(255) NULL AFTER avatar_url
      `);
    }

    // 2. Create user_security_change_requests table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_security_change_requests (
        request_id CHAR(36) NOT NULL PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        change_type VARCHAR(50) NOT NULL,
        payload_json JSON NOT NULL,
        status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
        requested_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        reviewed_at DATETIME(6) NULL,
        reviewed_by CHAR(36) NULL,
        review_note VARCHAR(500) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_user_security_requests_user (user_id),
        INDEX idx_user_security_requests_status (status),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      )
    `);

    // 3. sp_user_update_profile_basic — only first_name, last_name
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update_profile_basic');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_update_profile_basic(
        IN p_user_id CHAR(36),
        IN p_first_name VARCHAR(100),
        IN p_last_name VARCHAR(100)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET
          first_name = COALESCE(NULLIF(TRIM(p_first_name), ''), first_name),
          last_name = COALESCE(NULLIF(TRIM(p_last_name), ''), last_name)
        WHERE user_id = p_user_id;
        SELECT ROW_COUNT() AS affected;
      END
    `);

    // 4. sp_user_update_avatar
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update_avatar');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_update_avatar(
        IN p_user_id CHAR(36),
        IN p_avatar_url VARCHAR(512),
        IN p_avatar_public_id VARCHAR(255)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET
          avatar_url = p_avatar_url,
          avatar_public_id = p_avatar_public_id
        WHERE user_id = p_user_id;
        SELECT ROW_COUNT() AS affected;
      END
    `);

    // 5. sp_user_security_change_request_create
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_security_change_request_create');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_security_change_request_create(
        IN p_request_id CHAR(36),
        IN p_user_id CHAR(36),
        IN p_change_type VARCHAR(50),
        IN p_payload_json JSON
      )
      MODIFIES SQL DATA
      BEGIN
        INSERT INTO user_security_change_requests (request_id, user_id, change_type, payload_json, status)
        VALUES (p_request_id, p_user_id, p_change_type, p_payload_json, 'PENDING');
        SELECT p_request_id AS request_id;
      END
    `);

    // 6. sp_user_security_change_request_find_pending
    await queryRunner.query(
      'DROP PROCEDURE IF EXISTS sp_user_security_change_request_find_pending',
    );
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_security_change_request_find_pending()
      READS SQL DATA
      BEGIN
        SELECT r.request_id, r.user_id, r.change_type, r.payload_json, r.requested_at,
               u.email AS user_email, u.first_name, u.last_name
        FROM user_security_change_requests r
        INNER JOIN users u ON u.user_id = r.user_id
        WHERE r.status = 'PENDING'
        ORDER BY r.requested_at ASC;
      END
    `);

    // 7. sp_user_security_change_request_review — approve: apply payload to users; reject: just set status
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_security_change_request_review');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_security_change_request_review(
        IN p_request_id CHAR(36),
        IN p_reviewed_by CHAR(36),
        IN p_approve TINYINT,
        IN p_review_note VARCHAR(500)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE v_user_id CHAR(36);
        DECLARE v_change_type VARCHAR(50);
        DECLARE v_payload JSON;
        DECLARE v_new_email VARCHAR(255);
        DECLARE v_new_password_hash VARCHAR(255);

        SELECT user_id, change_type, payload_json
        INTO v_user_id, v_change_type, v_payload
        FROM user_security_change_requests
        WHERE request_id = p_request_id AND status = 'PENDING'
        LIMIT 1;

        IF v_user_id IS NULL THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Request not found or already reviewed';
        END IF;

        IF p_approve = 1 THEN
          IF v_change_type = 'EMAIL_CHANGE' THEN
            SET v_new_email = JSON_UNQUOTE(JSON_EXTRACT(v_payload, '$.email'));
            IF v_new_email IS NOT NULL AND v_new_email != '' THEN
              UPDATE users SET email = v_new_email WHERE user_id = v_user_id;
            END IF;
          ELSEIF v_change_type = 'PASSWORD_CHANGE' THEN
            SET v_new_password_hash = JSON_UNQUOTE(JSON_EXTRACT(v_payload, '$.password_hash'));
            IF v_new_password_hash IS NOT NULL AND v_new_password_hash != '' THEN
              UPDATE users SET password_hash = v_new_password_hash WHERE user_id = v_user_id;
            END IF;
          END IF;
        END IF;

        UPDATE user_security_change_requests
        SET status = IF(p_approve = 1, 'APPROVED', 'REJECTED'),
            reviewed_at = NOW(6),
            reviewed_by = p_reviewed_by,
            review_note = NULLIF(TRIM(p_review_note), '')
        WHERE request_id = p_request_id;

        SELECT request_id, user_id, status FROM user_security_change_requests WHERE request_id = p_request_id;
      END
    `);

    // 8. Update sp_user_find_by_id to return avatar_url
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(IN p_user_id CHAR(36))
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, role, avatar_url, avatar_public_id, created_at
        FROM users WHERE user_id = p_user_id;
      END
    `);

    // 9. Update sp_user_find_by_email to return avatar_url
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_email');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_email(IN p_email VARCHAR(255))
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, role, avatar_url, avatar_public_id, created_at
        FROM users WHERE email = p_email;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_security_change_request_review');
    await queryRunner.query(
      'DROP PROCEDURE IF EXISTS sp_user_security_change_request_find_pending',
    );
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_security_change_request_create');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update_avatar');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update_profile_basic');

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(IN p_user_id CHAR(36))
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, role, created_at
        FROM users WHERE user_id = p_user_id;
      END
    `);
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_email');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_email(IN p_email VARCHAR(255))
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, role, created_at
        FROM users WHERE email = p_email;
      END
    `);

    await queryRunner.query('DROP TABLE IF EXISTS user_security_change_requests');
    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN avatar_url,
      DROP COLUMN avatar_public_id
    `);
  }
}
