import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Create Stored Procedures for Users Operations
 * Sử dụng procedures thay vì raw ORM queries
 * Lợi ích:
 * - Security: Tránh SQL injection
 * - Performance: Query được optimize ở DB
 * - Maintainability: Logic phức tạp ở DB, app chỉ gọi
 */
export class CreateUsersProcedures1673616000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Find user by ID
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(
        IN p_user_id BIGINT
      )
      READS SQL DATA
      BEGIN
        SELECT user_id, email, status, created_at
        FROM users
        WHERE user_id = p_user_id;
      END
    `);

    // 2. Find user by email
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_email(
        IN p_email VARCHAR(255)
      )
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, status, created_at
        FROM users
        WHERE email = p_email;
      END
    `);

    // 3. Get all users with pagination
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_all(
        IN p_skip INT,
        IN p_take INT
      )
      READS SQL DATA
      BEGIN
        SELECT user_id, email, status, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT p_skip, p_take;
      END
    `);

    // 4. Count total users
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_count()
      READS SQL DATA
      BEGIN
        SELECT COUNT(*) as total FROM users;
      END
    `);

    // 5. Create new user
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_create(
        IN p_email VARCHAR(255),
        IN p_password_hash VARCHAR(255)
      )
      MODIFIES SQL DATA
      BEGIN
        INSERT INTO users (email, password_hash, status, created_at)
        VALUES (p_email, p_password_hash, 'ACTIVE', NOW());
        
        SELECT LAST_INSERT_ID() as user_id;
      END
    `);

    // 6. Update user
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_update(
        IN p_user_id BIGINT,
        IN p_email VARCHAR(255),
        IN p_status VARCHAR(50)
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET 
          email = COALESCE(p_email, email),
          status = COALESCE(p_status, status)
        WHERE user_id = p_user_id;
      END
    `);

    // 7. Delete user (soft delete)
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_delete(
        IN p_user_id BIGINT
      )
      MODIFIES SQL DATA
      BEGIN
        UPDATE users
        SET status = 'BANNED'
        WHERE user_id = p_user_id;
      END
    `);

    // 8. Get user statistics
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

    // 9. Check if email exists
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
    // Drop procedures in reverse order
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_email_exists');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_get_statistics');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_delete');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_update');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_create');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_count');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_all');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_email');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
  }
}
