import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fiat withdrawal MVP: bank accounts, withdrawal requests, wallet_ledger ref_type FIAT_WITHDRAWAL.
 */
export class AddFiatWithdrawalsAndLedgerRefType1775430000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_bank_accounts (
        bank_account_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        bank_code VARCHAR(32) NOT NULL,
        bank_name VARCHAR(128) NOT NULL,
        account_number_encrypted TEXT NOT NULL,
        account_number_last4 CHAR(4) NOT NULL,
        account_holder_name VARCHAR(200) NOT NULL,
        status ENUM('PENDING', 'VERIFIED', 'REJECTED', 'REVOKED') NOT NULL DEFAULT 'PENDING',
        verified_at DATETIME(6) NULL,
        verified_by_user_id CHAR(36) NULL,
        rejection_reason VARCHAR(512) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (bank_account_id),
        INDEX idx_ubank_user (user_id),
        INDEX idx_ubank_user_status (user_id, status),
        CONSTRAINT fk_ubank_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE fiat_withdrawal_requests (
        request_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        bank_account_id CHAR(36) NOT NULL,
        currency_id CHAR(36) NOT NULL,
        amount DECIMAL(36, 18) NOT NULL,
        fee DECIMAL(36, 18) NOT NULL DEFAULT 0,
        status ENUM('PENDING_REVIEW', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
        idempotency_key VARCHAR(64) NOT NULL,
        admin_note VARCHAR(512) NULL,
        transfer_reference VARCHAR(255) NULL,
        processed_by_user_id CHAR(36) NULL,
        processed_at DATETIME(6) NULL,
        rejection_reason VARCHAR(512) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (request_id),
        UNIQUE KEY uk_fiat_wd_idem (user_id, idempotency_key),
        INDEX idx_fiat_wd_user (user_id, created_at),
        INDEX idx_fiat_wd_status (status, created_at),
        CONSTRAINT fk_fiat_wd_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        CONSTRAINT fk_fiat_wd_bank FOREIGN KEY (bank_account_id) REFERENCES user_bank_accounts(bank_account_id),
        CONSTRAINT fk_fiat_wd_currency FOREIGN KEY (currency_id) REFERENCES currencies(currency_id)
      ) ENGINE=InnoDB
    `);

    const ledgerExists = await queryRunner.hasTable('wallet_ledger');
    if (ledgerExists) {
      await queryRunner.query(`
        ALTER TABLE wallet_ledger
        MODIFY ref_type ENUM(
          'DEPOSIT',
          'WITHDRAW',
          'ORDER',
          'TRADE',
          'ADJUST',
          'TRANSFER',
          'EXTERNAL_DEPOSIT',
          'EXTERNAL_WITHDRAWAL',
          'EXTERNAL_SYNC',
          'RECONCILIATION',
          'FIAT_WITHDRAWAL'
        ) NOT NULL
      `);
    }

    await queryRunner.query('DROP PROCEDURE IF EXISTS sp_wallet_ledger_create');
    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_ledger_create(
        IN p_user_id CHAR(36),
        IN p_currency_id CHAR(36),
        IN p_ref_type ENUM(
          'DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER',
          'EXTERNAL_DEPOSIT', 'EXTERNAL_WITHDRAWAL', 'EXTERNAL_SYNC', 'RECONCILIATION',
          'FIAT_WITHDRAWAL'
        ),
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
    await queryRunner.query('DROP TABLE IF EXISTS fiat_withdrawal_requests');
    await queryRunner.query('DROP TABLE IF EXISTS user_bank_accounts');

    const ledgerExists = await queryRunner.hasTable('wallet_ledger');
    if (ledgerExists) {
      await queryRunner.query(`
        ALTER TABLE wallet_ledger
        MODIFY ref_type ENUM(
          'DEPOSIT',
          'WITHDRAW',
          'ORDER',
          'TRADE',
          'ADJUST',
          'TRANSFER',
          'EXTERNAL_DEPOSIT',
          'EXTERNAL_WITHDRAWAL',
          'EXTERNAL_SYNC',
          'RECONCILIATION'
        ) NOT NULL
      `);
    }

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
}
