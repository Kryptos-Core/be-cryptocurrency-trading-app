import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convert all tables to UUID v7 (CHAR(36)) for primary and foreign keys.
 * Drops all stored procedures that reference these tables, then drops and recreates tables.
 * Run migration 1768227700000-RecreateProceduresUuidV7 after this to recreate procedures.
 */
export class ConvertAllIdsToUuidV71768227600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- 1. Drop all stored procedures ----
    const procedures = [
      'sp_order_count_by_user',
      'sp_order_find_by_user',
      'sp_order_cancel',
      'sp_order_create',
      'sp_order_book',
      'sp_order_find_by_user_idempotency',
      'sp_order_find_by_id',
      'sp_market_recent_trades',
      'sp_market_ticker',
      'sp_market_order_book_asks',
      'sp_market_order_book_bids',
      'sp_market_find_by_currencies',
      'sp_market_find_active',
      'sp_market_pair_exists',
      'sp_market_symbol_exists',
      'sp_market_delete',
      'sp_market_update',
      'sp_market_create',
      'sp_market_count',
      'sp_market_find_all',
      'sp_market_find_by_symbol',
      'sp_market_find_by_id',
      'sp_trade_execute',
      'sp_orders_open_for_pair',
      'sp_wallet_ledger_create',
      'sp_wallet_apply_balance_delta',
      'sp_wallet_get_or_create_for_update',
      'sp_wallet_find_by_user_currency',
      'sp_currency_find_tradable',
      'sp_currency_find_active',
      'sp_currency_symbol_exists',
      'sp_currency_delete',
      'sp_currency_update',
      'sp_currency_create',
      'sp_currency_count',
      'sp_currency_find_all',
      'sp_currency_find_by_symbol',
      'sp_currency_find_by_id',
      'sp_user_email_exists',
      'sp_user_get_statistics',
      'sp_user_delete',
      'sp_user_update',
      'sp_user_create',
      'sp_user_count',
      'sp_user_find_all',
      'sp_user_find_by_email',
      'sp_user_find_by_id',
      'sp_ohlcv_upsert',
      'sp_ohlcv_get_by_pair_interval',
    ];
    for (const name of procedures) {
      await queryRunner.query(`DROP PROCEDURE IF EXISTS \`${name}\``);
    }

    // ---- 2. Drop tables (reverse FK order) ----
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    const tables = [
      'wallet_ledger',
      'trades',
      'orders',
      'price_alerts',
      'deposits',
      'withdrawals',
      'user_sessions',
      'wallets',
      'market_pairs',
      'currency_networks',
      'currencies',
      'users',
      'app_settings',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');

    // ---- 3. Create tables with CHAR(36) for all IDs ----
    await queryRunner.query(`
      CREATE TABLE \`users\` (
        \`user_id\` CHAR(36) NOT NULL,
        \`email\` VARCHAR(255) NOT NULL,
        \`password_hash\` VARCHAR(255) NOT NULL,
        \`first_name\` VARCHAR(100) NULL,
        \`last_name\` VARCHAR(100) NULL,
        \`two_fa_secret\` VARBINARY(255) NULL,
        \`status\` ENUM('ACTIVE','BANNED','PENDING') NOT NULL DEFAULT 'ACTIVE',
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`user_id\`),
        UNIQUE INDEX \`uk_users_email\` (\`email\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`currencies\` (
        \`currency_id\` CHAR(36) NOT NULL,
        \`symbol\` VARCHAR(16) NOT NULL,
        \`name\` VARCHAR(64) NOT NULL,
        \`precision_scale\` TINYINT NOT NULL DEFAULT 8,
        \`min_withdraw\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`is_tradable\` TINYINT NOT NULL DEFAULT 1,
        \`is_active\` TINYINT NOT NULL DEFAULT 1,
        PRIMARY KEY (\`currency_id\`),
        UNIQUE INDEX \`uk_currency_symbol\` (\`symbol\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`market_pairs\` (
        \`pair_id\` CHAR(36) NOT NULL,
        \`base_currency_id\` CHAR(36) NOT NULL,
        \`quote_currency_id\` CHAR(36) NOT NULL,
        \`symbol\` VARCHAR(32) NOT NULL,
        \`price_scale\` TINYINT NOT NULL DEFAULT 2,
        \`amount_scale\` TINYINT NOT NULL DEFAULT 6,
        \`min_order_amount\` DECIMAL(36,18) NOT NULL DEFAULT 0.0001,
        \`maker_fee_rate\` DECIMAL(10,8) NOT NULL DEFAULT 0.001,
        \`taker_fee_rate\` DECIMAL(10,8) NOT NULL DEFAULT 0.001,
        \`is_active\` TINYINT NOT NULL DEFAULT 1,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`pair_id\`),
        UNIQUE INDEX \`uk_pair_symbol\` (\`symbol\`),
        UNIQUE INDEX \`uk_pair_base_quote\` (\`base_currency_id\`, \`quote_currency_id\`),
        INDEX \`idx_pair_active\` (\`is_active\`),
        CONSTRAINT \`fk_pair_base\` FOREIGN KEY (\`base_currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_pair_quote\` FOREIGN KEY (\`quote_currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`currency_networks\` (
        \`network_id\` CHAR(36) NOT NULL,
        \`currency_id\` CHAR(36) NOT NULL,
        \`network_code\` VARCHAR(32) NOT NULL,
        \`deposit_enabled\` TINYINT NOT NULL DEFAULT 1,
        \`withdraw_enabled\` TINYINT NOT NULL DEFAULT 1,
        \`min_confirmations\` INT NOT NULL DEFAULT 12,
        \`withdraw_fee\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        PRIMARY KEY (\`network_id\`),
        UNIQUE INDEX \`uk_currency_network\` (\`currency_id\`, \`network_code\`),
        CONSTRAINT \`fk_network_currency\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`user_sessions\` (
        \`session_id\` CHAR(36) NOT NULL,
        \`user_id\` CHAR(36) NOT NULL,
        \`refresh_token_hash\` VARBINARY(255) NOT NULL,
        \`ip\` VARCHAR(64) NULL,
        \`user_agent\` VARCHAR(255) NULL,
        \`expires_at\` DATETIME NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`session_id\`),
        INDEX \`idx_sessions_user\` (\`user_id\`),
        INDEX \`idx_sessions_exp\` (\`expires_at\`),
        CONSTRAINT \`fk_session_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`wallets\` (
        \`wallet_id\` CHAR(36) NOT NULL,
        \`user_id\` CHAR(36) NOT NULL,
        \`currency_id\` CHAR(36) NOT NULL,
        \`available\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`frozen\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`wallet_id\`),
        UNIQUE INDEX \`uk_wallet_user_currency\` (\`user_id\`, \`currency_id\`),
        INDEX \`idx_wallet_user\` (\`user_id\`),
        CONSTRAINT \`fk_wallet_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_wallet_currency\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`orders\` (
        \`order_id\` CHAR(36) NOT NULL,
        \`user_id\` CHAR(36) NOT NULL,
        \`pair_id\` CHAR(36) NOT NULL,
        \`side\` ENUM('BUY','SELL') NOT NULL,
        \`type\` ENUM('LIMIT','MARKET') NOT NULL,
        \`price\` DECIMAL(36,18) NULL,
        \`amount\` DECIMAL(36,18) NOT NULL,
        \`filled_amount\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`avg_price\` DECIMAL(36,18) NULL,
        \`status\` ENUM('OPEN','PARTIAL','FILLED','CANCELLED','REJECTED') NOT NULL DEFAULT 'OPEN',
        \`time_in_force\` ENUM('GTC','IOC','FOK') NOT NULL DEFAULT 'GTC',
        \`reserved_quote\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`reserved_base\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`client_order_id\` VARCHAR(64) NULL,
        \`idempotency_key\` VARCHAR(64) NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`order_id\`),
        UNIQUE INDEX \`uk_order_idem\` (\`user_id\`, \`idempotency_key\`),
        INDEX \`idx_orders_user\` (\`user_id\`, \`created_at\`),
        INDEX \`idx_orders_pair_status\` (\`pair_id\`, \`status\`, \`created_at\`),
        INDEX \`idx_orders_book\` (\`pair_id\`, \`side\`, \`status\`, \`price\`, \`created_at\`),
        CONSTRAINT \`fk_order_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_order_pair\` FOREIGN KEY (\`pair_id\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE RESTRICT
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`trades\` (
        \`trade_id\` CHAR(36) NOT NULL,
        \`pair_id\` CHAR(36) NOT NULL,
        \`taker_order_id\` CHAR(36) NOT NULL,
        \`maker_order_id\` CHAR(36) NOT NULL,
        \`price\` DECIMAL(36,18) NOT NULL,
        \`amount\` DECIMAL(36,18) NOT NULL,
        \`taker_fee\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`maker_fee\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`fee_currency_id\` CHAR(36) NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`trade_id\`),
        INDEX \`idx_trades_pair_time\` (\`pair_id\`, \`created_at\`),
        INDEX \`idx_trades_taker\` (\`taker_order_id\`),
        INDEX \`idx_trades_maker\` (\`maker_order_id\`),
        CONSTRAINT \`fk_trade_pair\` FOREIGN KEY (\`pair_id\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_trade_taker\` FOREIGN KEY (\`taker_order_id\`) REFERENCES \`orders\`(\`order_id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_trade_maker\` FOREIGN KEY (\`maker_order_id\`) REFERENCES \`orders\`(\`order_id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_trade_fee_currency\` FOREIGN KEY (\`fee_currency_id\`) REFERENCES \`currencies\`(\`currency_id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`wallet_ledger\` (
        \`ledger_id\` CHAR(36) NOT NULL,
        \`user_id\` CHAR(36) NOT NULL,
        \`currency_id\` CHAR(36) NOT NULL,
        \`wallet_id\` CHAR(36) NOT NULL,
        \`ref_type\` ENUM('DEPOSIT','WITHDRAW','ORDER','TRADE','ADJUST','TRANSFER','EXTERNAL_DEPOSIT','EXTERNAL_WITHDRAWAL','EXTERNAL_SYNC','RECONCILIATION') NOT NULL,
        \`ref_id\` CHAR(36) NOT NULL,
        \`direction\` ENUM('CREDIT','DEBIT') NOT NULL,
        \`amount\` DECIMAL(36,18) NOT NULL,
        \`balance_after\` DECIMAL(36,18) NOT NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`ledger_id\`),
        UNIQUE INDEX \`uk_ledger_ref\` (\`ref_type\`, \`ref_id\`, \`user_id\`, \`currency_id\`, \`direction\`),
        INDEX \`idx_ledger_user_time\` (\`user_id\`, \`created_at\`),
        INDEX \`idx_ledger_ref\` (\`ref_type\`, \`ref_id\`),
        CONSTRAINT \`fk_ledger_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_ledger_currency\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`),
        CONSTRAINT \`fk_ledger_wallet\` FOREIGN KEY (\`wallet_id\`) REFERENCES \`wallets\`(\`wallet_id\`)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`price_alerts\` (
        \`alert_id\` CHAR(36) NOT NULL,
        \`user_id\` CHAR(36) NOT NULL,
        \`pair_id\` CHAR(36) NOT NULL,
        \`target_price\` DECIMAL(36,18) NOT NULL,
        \`direction\` ENUM('ABOVE','BELOW') NOT NULL,
        \`is_active\` TINYINT NOT NULL DEFAULT 1,
        \`triggered_at\` DATETIME NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`alert_id\`),
        INDEX \`idx_alert_user\` (\`user_id\`, \`is_active\`),
        INDEX \`idx_alert_pair\` (\`pair_id\`, \`is_active\`),
        CONSTRAINT \`fk_alert_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_alert_pair\` FOREIGN KEY (\`pair_id\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`deposits\` (
        \`deposit_id\` CHAR(36) NOT NULL,
        \`user_id\` CHAR(36) NOT NULL,
        \`currency_id\` CHAR(36) NOT NULL,
        \`network_id\` CHAR(36) NULL,
        \`amount\` DECIMAL(36,18) NOT NULL,
        \`tx_hash\` VARCHAR(255) NOT NULL,
        \`confirmations\` INT NOT NULL DEFAULT 0,
        \`status\` ENUM('PENDING','CONFIRMED','CREDITED','FAILED') NOT NULL DEFAULT 'PENDING',
        \`detected_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`credited_at\` DATETIME NULL,
        PRIMARY KEY (\`deposit_id\`),
        UNIQUE INDEX \`uk_deposit_tx\` (\`currency_id\`, \`tx_hash\`),
        INDEX \`idx_deposit_user\` (\`user_id\`, \`status\`),
        CONSTRAINT \`fk_deposit_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_deposit_currency\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_deposit_network\` FOREIGN KEY (\`network_id\`) REFERENCES \`currency_networks\`(\`network_id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`withdrawals\` (
        \`withdraw_id\` CHAR(36) NOT NULL,
        \`user_id\` CHAR(36) NOT NULL,
        \`currency_id\` CHAR(36) NOT NULL,
        \`network_id\` CHAR(36) NULL,
        \`amount\` DECIMAL(36,18) NOT NULL,
        \`fee\` DECIMAL(36,18) NOT NULL DEFAULT 0,
        \`to_address\` VARCHAR(255) NOT NULL,
        \`tx_hash\` VARCHAR(255) NULL,
        \`status\` ENUM('REQUESTED','APPROVED','SENT','COMPLETED','REJECTED','FAILED') NOT NULL DEFAULT 'REQUESTED',
        \`idempotency_key\` VARCHAR(64) NOT NULL,
        \`requested_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`processed_at\` DATETIME NULL,
        PRIMARY KEY (\`withdraw_id\`),
        UNIQUE INDEX \`uk_withdraw_idem\` (\`user_id\`, \`idempotency_key\`),
        INDEX \`idx_withdraw_user\` (\`user_id\`, \`status\`),
        CONSTRAINT \`fk_withdraw_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE,
        CONSTRAINT \`fk_withdraw_currency\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT,
        CONSTRAINT \`fk_withdraw_network\` FOREIGN KEY (\`network_id\`) REFERENCES \`currency_networks\`(\`network_id\`) ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE \`app_settings\` (
        \`k\` VARCHAR(64) NOT NULL,
        \`v\` VARCHAR(2048) NOT NULL,
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`k\`)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 0');
    const tables = [
      'app_settings',
      'withdrawals',
      'deposits',
      'price_alerts',
      'wallet_ledger',
      'trades',
      'orders',
      'wallets',
      'user_sessions',
      'currency_networks',
      'market_pairs',
      'currencies',
      'users',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS \`${t}\``);
    }
    await queryRunner.query('SET FOREIGN_KEY_CHECKS = 1');
    // Note: Procedures are not recreated in down(); run previous migrations to restore int schema + procedures.
  }
}
