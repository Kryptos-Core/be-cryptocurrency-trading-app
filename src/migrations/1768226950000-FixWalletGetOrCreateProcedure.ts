import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix sp_wallet_get_or_create_for_update: remove internal START TRANSACTION/COMMIT
 * so the procedure runs inside the caller's transaction (TypeORM transaction).
 * When called from WalletsService.applyTransaction(), the procedure must not
 * start its own transaction or MySQL/connection behavior causes "Failed to get or create wallet".
 */
export class FixWalletGetOrCreateProcedure1768226950000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_wallet_get_or_create_for_update;`);

    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_get_or_create_for_update(
        IN p_user_id BIGINT,
        IN p_currency_id INT
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          RESIGNAL;
        END;

        -- Get existing wallet with write lock (runs in caller's transaction)
        SELECT
          wallet_id,
          user_id,
          currency_id,
          available,
          frozen,
          updated_at
        FROM wallets
        WHERE user_id = p_user_id
          AND currency_id = p_currency_id
        LIMIT 1
        FOR UPDATE;

        -- If not exists, create new
        IF ROW_COUNT() = 0 THEN
          INSERT INTO wallets (user_id, currency_id, available, frozen)
          VALUES (p_user_id, p_currency_id, '0', '0');
        END IF;

        -- Return wallet (same row, lock held by caller's transaction)
        SELECT
          wallet_id,
          user_id,
          currency_id,
          available,
          frozen,
          updated_at
        FROM wallets
        WHERE user_id = p_user_id
          AND currency_id = p_currency_id
        LIMIT 1
        FOR UPDATE;
      END;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_wallet_get_or_create_for_update;`);

    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_get_or_create_for_update(
        IN p_user_id BIGINT,
        IN p_currency_id INT
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
        FROM wallets
        WHERE user_id = p_user_id AND currency_id = p_currency_id
        LIMIT 1 FOR UPDATE;

        IF ROW_COUNT() = 0 THEN
          INSERT INTO wallets (user_id, currency_id, available, frozen)
          VALUES (p_user_id, p_currency_id, '0', '0');
        END IF;

        SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
        FROM wallets
        WHERE user_id = p_user_id AND currency_id = p_currency_id
        LIMIT 1 FOR UPDATE;

        COMMIT;
      END;
    `);
  }
}
