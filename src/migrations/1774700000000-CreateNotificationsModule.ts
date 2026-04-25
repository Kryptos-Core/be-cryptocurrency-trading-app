import type { MigrationInterface, QueryRunner } from 'typeorm';
import { runProcedureSql } from './helpers/raw-procedure-connection.util';

/**
 * Migration: Create Notifications Module
 *
 * Creates:
 * - notifications table
 * - user_notifications table
 * - fcm_token column on users table
 * - 5 legacy MySQL legacy MySQL stored procedures for notification CRUD
 */
export class CreateNotificationsModule1774700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── fcm_token on users ──────────────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN fcm_token VARCHAR(512) NULL DEFAULT NULL
    `);

    // ── notifications ───────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        notification_id CHAR(36)     NOT NULL,
        title           VARCHAR(255) NOT NULL,
        body            TEXT         NOT NULL,
        type            ENUM('system','alert','promo') NOT NULL DEFAULT 'system',
        created_by      CHAR(36)     NOT NULL,
        data            JSON         NULL,
        created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (notification_id),
        INDEX idx_notifications_created_at (created_at),
        CONSTRAINT fk_notif_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── user_notifications ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_notifications (
        id              CHAR(36)     NOT NULL,
        user_id         CHAR(36)     NOT NULL,
        notification_id CHAR(36)     NOT NULL,
        is_read         TINYINT(1)   NOT NULL DEFAULT 0,
        read_at         DATETIME(3)  NULL,
        created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uk_user_notif (user_id, notification_id),
        INDEX idx_un_user_unread (user_id, is_read),
        CONSTRAINT fk_un_user         FOREIGN KEY (user_id)         REFERENCES users(user_id)         ON DELETE CASCADE,
        CONSTRAINT fk_un_notification FOREIGN KEY (notification_id) REFERENCES notifications(notification_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── sp_notification_create ──────────────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_create');
    await runProcedureSql(
      queryRunner,
      `
      CREATE PROCEDURE sp_notification_create(
        IN p_notification_id CHAR(36),
        IN p_title           VARCHAR(255),
        IN p_body            TEXT,
        IN p_type            VARCHAR(20),
        IN p_created_by      CHAR(36),
        IN p_data            JSON
      )
      MODIFIES SQL DATA
      BEGIN
        INSERT INTO notifications (notification_id, title, body, type, created_by, data)
        VALUES (p_notification_id, p_title, p_body, p_type, p_created_by, p_data);

        INSERT INTO user_notifications (id, user_id, notification_id)
        SELECT UUID(), user_id, p_notification_id
        FROM users
        WHERE status = 'ACTIVE';

        SELECT notification_id, title, body, type, created_by, data, created_at
        FROM notifications
        WHERE notification_id = p_notification_id LIMIT 1;
      END
    `,
    );

    // ── sp_notification_find_by_user ────────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_find_by_user');
    await runProcedureSql(
      queryRunner,
      `
      CREATE PROCEDURE sp_notification_find_by_user(
        IN p_user_id CHAR(36),
        IN p_limit   INT,
        IN p_offset  INT
      )
      READS SQL DATA
      BEGIN
        SELECT
          un.id,
          un.user_id,
          un.notification_id,
          un.is_read,
          un.read_at,
          un.created_at,
          n.title,
          n.body,
          n.type,
          n.created_by,
          n.data,
          n.created_at AS notification_created_at
        FROM user_notifications un
        INNER JOIN notifications n ON n.notification_id = un.notification_id
        WHERE un.user_id = p_user_id
        ORDER BY un.created_at DESC
        LIMIT p_limit OFFSET p_offset;
      END
    `,
    );

    // ── sp_notification_count_unread ────────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_count_unread');
    await runProcedureSql(
      queryRunner,
      `
      CREATE PROCEDURE sp_notification_count_unread(
        IN p_user_id CHAR(36)
      )
      READS SQL DATA
      BEGIN
        SELECT COUNT(*) AS unread_count
        FROM user_notifications
        WHERE user_id = p_user_id AND is_read = 0;
      END
    `,
    );

    // ── sp_notification_mark_read ───────────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_mark_read');
    await runProcedureSql(
      queryRunner,
      `
      CREATE PROCEDURE sp_notification_mark_read(
        IN p_notification_id CHAR(36),
        IN p_user_id         CHAR(36)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE user_notifications
        SET is_read = 1, read_at = NOW(3)
        WHERE notification_id = p_notification_id
          AND user_id         = p_user_id
          AND is_read         = 0;
      END
    `,
    );

    // ── sp_notification_mark_all_read ───────────────────────────────────────
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_mark_all_read');
    await runProcedureSql(
      queryRunner,
      `
      CREATE PROCEDURE sp_notification_mark_all_read(
        IN p_user_id CHAR(36)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE user_notifications
        SET is_read = 1, read_at = NOW(3)
        WHERE user_id = p_user_id AND is_read = 0;
      END
    `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_mark_all_read');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_mark_read');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_count_unread');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_find_by_user');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_notification_create');
    await queryRunner.query('DROP TABLE IF EXISTS user_notifications');
    await queryRunner.query('DROP TABLE IF EXISTS notifications');
    await queryRunner.query('ALTER TABLE users DROP COLUMN IF EXISTS fcm_token');
  }
}
