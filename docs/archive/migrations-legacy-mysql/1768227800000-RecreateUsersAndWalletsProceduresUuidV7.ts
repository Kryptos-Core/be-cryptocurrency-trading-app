import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recreate user and wallet legacy MySQL legacy MySQL stored procedures for UUID v7 schema.
 * All ID parameters use CHAR(36). Run after 1768227700000-RecreateMarketsProceduresUuidV7.
 */
export class RecreateUsersAndWalletsProceduresUuidV71768227800000 implements MigrationInterface {
  private isPostgres(queryRunner: QueryRunner): boolean {
    return queryRunner.connection.options.type === 'postgres';
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    // ========== USER PROCEDURES (CHAR(36)) ==========
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_find_by_id');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_find_by_id(IN p_user_id CHAR(36))
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

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_user_delete');
    await queryRunner.query(`
      CREATE PROCEDURE sp_user_delete(IN p_user_id CHAR(36))
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
        IN p_exclude_user_id CHAR(36)
      )
      READS SQL DATA
      BEGIN
        SELECT COUNT(*) as count
        FROM users
        WHERE email = p_email
          AND (p_exclude_user_id IS NULL OR p_exclude_user_id = '' OR user_id != p_exclude_user_id);
      END
    `);

    // ========== WALLET PROCEDURES (CHAR(36)) ==========
    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_wallet_find_by_user_currency');
    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_find_by_user_currency(
        IN p_user_id CHAR(36),
        IN p_currency_id CHAR(36)
      )
      READS SQL DATA
      BEGIN
        SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
        FROM wallets
        WHERE user_id = p_user_id AND currency_id = p_currency_id
        LIMIT 1;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_wallet_get_or_create_for_update');
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

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_wallet_apply_balance_delta');
    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_apply_balance_delta(
        IN p_wallet_id CHAR(36),
        IN p_delta_available DECIMAL(36, 18),
        IN p_delta_frozen DECIMAL(36, 18)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE v_new_available DECIMAL(36, 18);
        DECLARE v_new_frozen DECIMAL(36, 18);
        DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

        START TRANSACTION;

        SELECT available + p_delta_available, frozen + p_delta_frozen
        INTO v_new_available, v_new_frozen
        FROM wallets WHERE wallet_id = p_wallet_id FOR UPDATE;

        IF v_new_available < 0 OR v_new_frozen < 0 THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Insufficient balance';
        END IF;

        UPDATE wallets
        SET available = v_new_available, frozen = v_new_frozen, updated_at = CURRENT_TIMESTAMP(6)
        WHERE wallet_id = p_wallet_id;

        SELECT 1 as affected;
        SELECT wallet_id, user_id, currency_id, available, frozen, updated_at
        FROM wallets WHERE wallet_id = p_wallet_id;

        COMMIT;
      END
    `);

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_wallet_ledger_create');
    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_ledger_create(
        IN p_user_id CHAR(36),
        IN p_currency_id CHAR(36),
        IN p_ref_type ENUM('DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER', 'EXTERNAL_DEPOSIT', 'EXTERNAL_WITHDRAWAL', 'EXTERNAL_SYNC', 'RECONCILIATION'),
        IN p_ref_id VARCHAR(36),
        IN p_direction ENUM('CREDIT', 'DEBIT'),
        IN p_amount DECIMAL(36, 18),
        IN p_balance_after DECIMAL(36, 18)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE v_wallet_id CHAR(36);
        DECLARE v_ledger_id CHAR(36);
        DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

        SELECT wallet_id INTO v_wallet_id
        FROM wallets WHERE user_id = p_user_id AND currency_id = p_currency_id
        LIMIT 1;

        IF v_wallet_id IS NULL OR v_wallet_id = '' THEN
          SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Wallet not found for user and currency';
        END IF;

        SET v_ledger_id = UUID();

        START TRANSACTION;

        INSERT INTO wallet_ledger (ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after)
        VALUES (v_ledger_id, p_user_id, p_currency_id, v_wallet_id, p_ref_type, p_ref_id, p_direction, p_amount, p_balance_after);

        SELECT ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after, created_at
        FROM wallet_ledger WHERE ledger_id = v_ledger_id;

        COMMIT;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (this.isPostgres(queryRunner)) {
      return;
    }
    const userProcs = [
      'sp_user_email_exists',
      'sp_user_get_statistics',
      'sp_user_delete',
      'sp_user_update',
      'sp_user_create',
      'sp_user_count',
      'sp_user_find_all',
      'sp_user_find_by_email',
      'sp_user_find_by_id',
    ];
    for (const name of userProcs) {
      await queryRunner.query(`DROP PROCEDURE IF EXISTS \`${name}\``);
    }
    const walletProcs = [
      'sp_wallet_ledger_create',
      'sp_wallet_apply_balance_delta',
      'sp_wallet_get_or_create_for_update',
      'sp_wallet_find_by_user_currency',
    ];
    for (const name of walletProcs) {
      await queryRunner.query(`DROP PROCEDURE IF EXISTS \`${name}\``);
    }
  }
}
