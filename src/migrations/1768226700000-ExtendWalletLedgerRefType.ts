import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Extend wallet_ledger ref_type enum values and procedure
 */
export class ExtendWalletLedgerRefType1768226700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('wallet_ledger');
    if (!tableExists) {
      return;
    }

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

    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_wallet_ledger_create`);

    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_ledger_create(
        IN p_user_id BIGINT,
        IN p_currency_id INT,
        IN p_ref_type ENUM('DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER', 'EXTERNAL_DEPOSIT', 'EXTERNAL_WITHDRAWAL', 'EXTERNAL_SYNC', 'RECONCILIATION'),
        IN p_ref_id BIGINT,
        IN p_direction ENUM('CREDIT', 'DEBIT'),
        IN p_amount DECIMAL(36, 18),
        IN p_balance_after DECIMAL(36, 18)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE v_ledger_id BIGINT;
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        INSERT INTO wallet_ledger (
          user_id,
          currency_id,
          ref_type,
          ref_id,
          direction,
          amount,
          balance_after
        ) VALUES (
          p_user_id,
          p_currency_id,
          p_ref_type,
          p_ref_id,
          p_direction,
          p_amount,
          p_balance_after
        );

        SET v_ledger_id = LAST_INSERT_ID();

        SELECT 
          ledger_id,
          user_id,
          currency_id,
          ref_type,
          ref_id,
          direction,
          amount,
          balance_after,
          created_at
        FROM wallet_ledger
        WHERE ledger_id = v_ledger_id;

        COMMIT;
      END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('wallet_ledger');
    if (!tableExists) {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE wallet_ledger
      MODIFY ref_type ENUM(
        'DEPOSIT',
        'WITHDRAW',
        'ORDER',
        'TRADE',
        'ADJUST',
        'TRANSFER'
      ) NOT NULL
    `);

    await queryRunner.query(`DROP PROCEDURE IF EXISTS sp_wallet_ledger_create`);

    await queryRunner.query(`
      CREATE PROCEDURE sp_wallet_ledger_create(
        IN p_user_id BIGINT,
        IN p_currency_id INT,
        IN p_ref_type ENUM('DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER'),
        IN p_ref_id BIGINT,
        IN p_direction ENUM('CREDIT', 'DEBIT'),
        IN p_amount DECIMAL(36, 18),
        IN p_balance_after DECIMAL(36, 18)
      )
      MODIFIES SQL DATA
      BEGIN
        DECLARE v_ledger_id BIGINT;
        DECLARE EXIT HANDLER FOR SQLEXCEPTION
        BEGIN
          ROLLBACK;
          RESIGNAL;
        END;

        START TRANSACTION;

        INSERT INTO wallet_ledger (
          user_id,
          currency_id,
          ref_type,
          ref_id,
          direction,
          amount,
          balance_after
        ) VALUES (
          p_user_id,
          p_currency_id,
          p_ref_type,
          p_ref_id,
          p_direction,
          p_amount,
          p_balance_after
        );

        SET v_ledger_id = LAST_INSERT_ID();

        SELECT 
          ledger_id,
          user_id,
          currency_id,
          ref_type,
          ref_id,
          direction,
          amount,
          balance_after,
          created_at
        FROM wallet_ledger
        WHERE ledger_id = v_ledger_id;

        COMMIT;
      END
    `);
  }
}
