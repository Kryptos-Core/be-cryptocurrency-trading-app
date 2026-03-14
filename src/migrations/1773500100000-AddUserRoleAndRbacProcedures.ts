import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRoleAndRbacProcedures1773500100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN role ENUM(
        'GUEST',
        'TRADER',
        'VERIFIED_USER',
        'ADMIN',
        'RISK_OFFICER',
        'SUPPORT_AGENT',
        'MARKET_MAKER'
      ) NOT NULL DEFAULT 'TRADER'
      AFTER status
    `);

    await queryRunner.query(`
      UPDATE users
      SET role = CASE
        WHEN email = 'admin@example.com' THEN 'ADMIN'
        ELSE 'TRADER'
      END
    `);

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

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_all');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_all(IN p_skip INT, IN p_take INT)
      READS SQL DATA
      BEGIN
        SELECT user_id, email, first_name, last_name, status, role, created_at
        FROM users ORDER BY created_at DESC LIMIT p_skip, p_take;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_create');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_create(
        IN p_user_id CHAR(36),
        IN p_email VARCHAR(255),
        IN p_password_hash VARCHAR(255),
        IN p_first_name VARCHAR(100),
        IN p_last_name VARCHAR(100),
        IN p_role VARCHAR(50)
      )
      MODIFIES SQL DATA
      BEGIN
        INSERT INTO users (user_id, email, password_hash, first_name, last_name, status, role, created_at)
        VALUES (
          p_user_id,
          p_email,
          p_password_hash,
          p_first_name,
          p_last_name,
          'ACTIVE',
          COALESCE(p_role, 'TRADER'),
          NOW(6)
        );
        SELECT p_user_id as user_id;
      END
    `);

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
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_update(
        IN p_user_id CHAR(36),
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

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_create');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_create(
        IN p_user_id CHAR(36),
        IN p_email VARCHAR(255),
        IN p_password_hash VARCHAR(255),
        IN p_first_name VARCHAR(100),
        IN p_last_name VARCHAR(100)
      )
      MODIFIES SQL DATA
      BEGIN
        INSERT INTO users (user_id, email, password_hash, first_name, last_name, status, created_at)
        VALUES (p_user_id, p_email, p_password_hash, p_first_name, p_last_name, 'ACTIVE', NOW(6));
        SELECT p_user_id as user_id;
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

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_email');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_email(IN p_email VARCHAR(255))
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, created_at
        FROM users WHERE email = p_email;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(IN p_user_id CHAR(36))
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, created_at
        FROM users WHERE user_id = p_user_id;
      END
    `);

    await queryRunner.query('ALTER TABLE users DROP COLUMN role');
  }
}