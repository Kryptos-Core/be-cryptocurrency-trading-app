import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTwoFaEnabled1774500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const hasTwoFaEnabled = table?.findColumnByName('two_fa_enabled');
    if (!hasTwoFaEnabled) {
      await queryRunner.query(`
        ALTER TABLE users
        ADD COLUMN two_fa_enabled TINYINT(1) NOT NULL DEFAULT 0
        AFTER avatar_public_id
      `);
    }

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
          created_at
        FROM users
        WHERE email = p_email;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_set_two_fa');

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
          created_at
        FROM users
        WHERE email = p_email;
      END
    `);

    await queryRunner.query(`
      ALTER TABLE users
      DROP COLUMN two_fa_enabled
    `);
  }
}
