import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFiatDepositsModule1773700000000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  name = 'AddFiatDepositsModule1773700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`fiat_deposits\` (
        \`deposit_id\` char(36) NOT NULL,
        \`user_id\` char(36) NOT NULL,
        \`amount\` decimal(36,18) NOT NULL,
        \`status\` enum('PENDING', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
        \`order_code\` bigint NOT NULL UNIQUE,
        \`checkout_url\` varchar(512) NULL,
        \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`deposit_id\`),
        INDEX \`idx_fiat_deposits_user\` (\`user_id\`),
        INDEX \`idx_fiat_deposits_order_code\` (\`order_code\`)
      ) ENGINE=InnoDB
    `);

    // Create SP: Create
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_fiat_deposit_create`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_fiat_deposit_create(
        IN p_deposit_id CHAR(36),
        IN p_user_id CHAR(36),
        IN p_amount DECIMAL(36,18),
        IN p_order_code BIGINT,
        IN p_checkout_url VARCHAR(512)
      )
      BEGIN
        INSERT INTO fiat_deposits (deposit_id, user_id, amount, status, order_code, checkout_url)
        VALUES (p_deposit_id, p_user_id, p_amount, 'PENDING', p_order_code, p_checkout_url);
        
        SELECT * FROM fiat_deposits WHERE deposit_id = p_deposit_id;
      END
    `);

    // Create SP: Status Update
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_fiat_deposit_update_status`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_fiat_deposit_update_status(
        IN p_order_code BIGINT,
        IN p_status ENUM('PENDING', 'PAID', 'CANCELLED')
      )
      BEGIN
        UPDATE fiat_deposits
        SET status = p_status
        WHERE order_code = p_order_code;
        
        SELECT * FROM fiat_deposits WHERE order_code = p_order_code;
      END
    `);

    // Create SP: Find all for User
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_fiat_deposit_find_by_user`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_fiat_deposit_find_by_user(
        IN p_user_id CHAR(36)
      )
      BEGIN
        SELECT * FROM fiat_deposits WHERE user_id = p_user_id ORDER BY created_at DESC;
      END
    `);

    // Create SP: Find by Order Code
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_fiat_deposit_find_by_order_code`);
    await queryRunner.query(`
      CREATE PROCEDURE sp_fiat_deposit_find_by_order_code(
        IN p_order_code BIGINT
      )
      BEGIN
        SELECT * FROM fiat_deposits WHERE order_code = p_order_code;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_fiat_deposit_find_by_order_code`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_fiat_deposit_find_by_user`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_fiat_deposit_update_status`);
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_fiat_deposit_create`);
    await queryRunner.query(`DROP TABLE IF EXISTS \`fiat_deposits\``);
  }
}
