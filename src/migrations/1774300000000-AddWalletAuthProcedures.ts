import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Wallet Auth: stored procedures for find user by linked wallet and create wallet-only user.
 */
export class AddWalletAuthProcedures1774300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_linked_wallet');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_linked_wallet(
        IN p_chain VARCHAR(50),
        IN p_address VARCHAR(255)
      )
      READS SQL DATA
      BEGIN
        SELECT u.user_id, u.email, u.password_hash, u.first_name, u.last_name, u.status, u.role, u.created_at
        FROM users u
        INNER JOIN linked_wallets lw ON lw.user_id = u.user_id
        WHERE lw.chain = p_chain AND lw.address = p_address AND lw.status = 'VERIFIED'
        LIMIT 1;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_create_wallet_only');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_create_wallet_only(
        IN p_user_id CHAR(36),
        IN p_email VARCHAR(255),
        IN p_password_hash VARCHAR(255),
        IN p_chain VARCHAR(50),
        IN p_address VARCHAR(255)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE v_link_id CHAR(36);
        SET v_link_id = UUID();
        INSERT INTO users (user_id, email, password_hash, first_name, last_name, status, role, created_at)
        VALUES (p_user_id, p_email, p_password_hash, NULL, NULL, 'ACTIVE', 'TRADER', NOW(6));
        INSERT INTO linked_wallets (link_id, user_id, chain, address, label, status, linked_at, created_at)
        VALUES (v_link_id, p_user_id, p_chain, p_address, NULL, 'VERIFIED', NOW(6), NOW(6));
        SELECT p_user_id AS user_id;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_create_wallet_only');
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_linked_wallet');
  }
}
