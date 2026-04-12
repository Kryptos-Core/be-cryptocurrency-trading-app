import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUnusedWalletGetOrCreateProcedure1773800000000 implements MigrationInterface {
  name = 'DropUnusedWalletGetOrCreateProcedure1773800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_wallet_get_or_create_for_update');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_get_or_create_for_update(
        IN p_user_id CHAR(36),
        IN p_currency_id CHAR(36)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN RESIGNAL; END;

        SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
        FROM wallets
        WHERE user_id = p_user_id AND currency_id = p_currency_id
        LIMIT 1 FOR UPDATE;

        IF ROW_COUNT() = 0 THEN
          INSERT INTO wallets (wallet_id, user_id, currency_id, available, frozen)
          VALUES (UUID(), p_user_id, p_currency_id, '0', '0');
        END IF;

        SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
        FROM wallets
        WHERE user_id = p_user_id AND currency_id = p_currency_id
        LIMIT 1 FOR UPDATE;
      END
    `);
  }
}
