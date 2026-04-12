import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Add first_name and last_name to users table
 * Pattern: Database Migration Pattern
 *
 * This migration:
 * 1. Adds first_name and last_name columns to users table
 * 2. Updates sp_user_create procedure to accept first_name and last_name
 * 3. Updates sp_user_find_by_id and sp_user_find_by_email to return new fields
 */
export class AddFirstNameLastNameToUsers1736812800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if users table exists before altering
    const tableExists = await queryRunner.hasTable('users');
    if (!tableExists) {
      // If table doesn't exist, skip this migration
      // It will be handled by InitialSchema migration
      return;
    }

    // Check if columns already exist
    const table = await queryRunner.getTable('users');
    const hasFirstName = table?.findColumnByName('first_name');
    const hasLastName = table?.findColumnByName('last_name');

    // Step 1: Add columns to users table (only if they don't exist)
    if (!hasFirstName && !hasLastName) {
      await queryRunner.query(`
        ALTER TABLE users 
        ADD COLUMN first_name VARCHAR(100) NULL AFTER password_hash,
        ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name
      `);
    } else if (!hasFirstName) {
      await queryRunner.query(`
        ALTER TABLE users 
        ADD COLUMN first_name VARCHAR(100) NULL AFTER password_hash
      `);
    } else if (!hasLastName) {
      await queryRunner.query(`
        ALTER TABLE users 
        ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name
      `);
    }

    // Step 2: Drop and recreate sp_user_create with new parameters
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_user_create`);

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

    // Step 3: Update sp_user_find_by_id to return first_name and last_name
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_user_find_by_id`);

    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(
        IN p_user_id BIGINT
      )
      READS SQL DATA
      BEGIN
        SELECT user_id, email, first_name, last_name, status, created_at
        FROM users
        WHERE user_id = p_user_id;
      END
    `);

    // Step 4: Update sp_user_find_by_email to return first_name and last_name
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_user_find_by_email`);

    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_email(
        IN p_email VARCHAR(255)
      )
      READS SQL DATA
      BEGIN
        SELECT user_id, email, password_hash, first_name, last_name, status, created_at
        FROM users
        WHERE email = p_email;
      END
    `);

    // Step 5: Update sp_user_find_all to return first_name and last_name
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_user_find_all`);

    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_all(
        IN p_skip INT,
        IN p_take INT
      )
      READS SQL DATA
      BEGIN
        SELECT user_id, email, first_name, last_name, status, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT p_skip, p_take;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback: Restore original procedures and remove columns

    // Step 1: Restore original sp_user_create
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_user_create`);

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

    // Step 2: Restore original sp_user_find_by_id
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_user_find_by_id`);

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

    // Step 3: Restore original sp_user_find_by_email
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_user_find_by_email`);

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

    // Step 4: Restore original sp_user_find_all
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_user_find_all`);

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

    // Step 5: Remove columns from users table
    await queryRunner.query(`
      ALTER TABLE users 
      DROP COLUMN first_name,
      DROP COLUMN last_name
    `);
  }
}
