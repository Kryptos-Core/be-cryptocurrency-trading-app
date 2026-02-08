import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix users schema and procedures when they were skipped due to migration order.
 * CreateUsersProcedures and AddFirstNameLastNameToUsers run before InitialSchema (by timestamp),
 * so they skipped because users table did not exist. This migration runs after all others and
 * applies the missing columns and procedures.
 */
export class FixUsersSchemaAndProcedures1768227000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('users');
    if (!tableExists) return;

    // 1. Add first_name, last_name if missing
    const table = await queryRunner.getTable('users');
    const hasFirstName = table?.findColumnByName('first_name');
    const hasLastName = table?.findColumnByName('last_name');
    if (!hasFirstName) {
      await queryRunner.query(`
        ALTER TABLE users ADD COLUMN first_name VARCHAR(100) NULL AFTER password_hash
      `);
    }
    if (!hasLastName) {
      await queryRunner.query(`
        ALTER TABLE users ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name
      `);
    }

    // 2. Create user procedures (DROP IF EXISTS then CREATE so idempotent)
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(IN p_user_id BIGINT)
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, created_at
        FROM users WHERE user_id = p_user_id;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_email');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_email(IN p_email VARCHAR(255))
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, created_at
        FROM users WHERE email = p_email;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_all');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_all(IN p_skip INT, IN p_take INT)
      READS SQL DATA
      BEGIN
        SELECT user_id, email, first_name, last_name, status, created_at
        FROM users ORDER BY created_at DESC LIMIT p_skip, p_take;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_count');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_count()
      READS SQL DATA
      BEGIN
        SELECT COUNT(*) as total FROM users;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_create');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_create(
        IN p_email VARCHAR(255),
        IN p_password_hash VARCHAR(255),
        IN p_first_name VARCHAR(100),
        IN p_last_name VARCHAR(100)
      )
      MODIFIES SQL DATA
      BEGIN
        INSERT INTO users (email, password_hash, first_name, last_name, status, created_at)
        VALUES (p_email, p_password_hash, p_first_name, p_last_name, 'ACTIVE', NOW());
        SELECT LAST_INSERT_ID() as user_id;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_update(
        IN p_user_id BIGINT,
        IN p_email VARCHAR(255),
        IN p_status VARCHAR(50)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET email = COALESCE(p_email, email), status = COALESCE(p_status, status)
        WHERE user_id = p_user_id;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_delete');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_delete(IN p_user_id BIGINT)
      MODIFIES SQL DATA
      BEGIN
        UPDATE users SET status = 'BANNED' WHERE user_id = p_user_id;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_get_statistics');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_get_statistics()
      READS SQL DATA
      BEGIN
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'BANNED' THEN 1 ELSE 0 END) as banned,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending
        FROM users;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_email_exists');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_email_exists(
        IN p_email VARCHAR(255),
        IN p_exclude_user_id BIGINT
      )
      READS SQL DATA
      BEGIN
        SELECT COUNT(*) as count
        FROM users
        WHERE email = p_email
          AND (p_exclude_user_id IS NULL OR user_id != p_exclude_user_id);
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_email_exists');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_get_statistics');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_delete');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_create');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_count');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_all');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_email');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
    // Optionally drop first_name, last_name - skip to avoid data loss
  }
}
