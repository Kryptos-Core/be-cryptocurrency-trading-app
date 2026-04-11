import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1768226335531 implements MigrationInterface {
    name = 'InitialSchema1768226335531'

    /**
     * Skip ADD CONSTRAINT when: constraint exists; or FK column missing (legacy tables created
     * without TypeORM join columns, while CREATE TABLE IF NOT EXISTS left the old DDL in place).
     */
    private async addForeignKeyIfNotExists(queryRunner: QueryRunner, sql: string): Promise<void> {
        const m = sql.match(/ADD CONSTRAINT `([^`]+)`/);
        if (!m) {
            await queryRunner.query(sql);
            return;
        }
        const constraintName = m[1];
        const dbRows: { db: string | null }[] = await queryRunner.query(`SELECT DATABASE() AS db`);
        const schema = dbRows[0]?.db;
        if (!schema) {
            await queryRunner.query(sql);
            return;
        }
        const tableMatch = sql.match(/ALTER TABLE `([^`]+)`/);
        const fkColMatch = sql.match(/FOREIGN KEY \(`([^`]+)`\)/);
        if (tableMatch && fkColMatch) {
            const colRows: unknown[] = await queryRunner.query(
                `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
                [schema, tableMatch[1], fkColMatch[1]],
            );
            if (colRows.length === 0) {
                return;
            }
        }
        const existing: unknown[] = await queryRunner.query(
            `SELECT 1 AS ok FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ? LIMIT 1`,
            [schema, constraintName],
        );
        if (existing.length === 0) {
            try {
                await queryRunner.query(sql);
            } catch (e: unknown) {
                const err = e as {
                    code?: string;
                    errno?: number;
                    driverError?: { code?: string; errno?: number };
                };
                const errno = err.driverError?.errno ?? err.errno;
                const code = err.driverError?.code ?? err.code;
                // Legacy schema: join column exists but type differs from referenced PK (e.g. int vs bigint).
                if (errno === 3780 || code === "ER_FK_INCOMPATIBLE_COLUMNS") {
                    return;
                }
                throw e;
            }
        }
    }

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`user_sessions\` (\`session_id\` bigint NOT NULL AUTO_INCREMENT, \`user_id\` bigint NOT NULL, \`refresh_token_hash\` varbinary(255) NOT NULL, \`ip\` varchar(64) NULL, \`user_agent\` varchar(255) NULL, \`expires_at\` datetime NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userUserId\` bigint NULL, INDEX \`idx_sessions_exp\` (\`expires_at\`), INDEX \`idx_sessions_user\` (\`user_id\`), PRIMARY KEY (\`session_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`users\` (\`user_id\` bigint NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NOT NULL, \`password_hash\` varchar(255) NOT NULL, \`two_fa_secret\` varbinary(255) NULL, \`status\` enum ('ACTIVE', 'BANNED', 'PENDING') NOT NULL DEFAULT 'ACTIVE', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`uk_users_email\` (\`email\`), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`user_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`market_pairs\` (\`pair_id\` int NOT NULL AUTO_INCREMENT, \`base_currency_id\` int NOT NULL, \`quote_currency_id\` int NOT NULL, \`symbol\` varchar(32) NOT NULL, \`price_scale\` tinyint NOT NULL DEFAULT '2', \`amount_scale\` tinyint NOT NULL DEFAULT '6', \`min_order_amount\` decimal(36,18) NOT NULL DEFAULT '0.000100000000000000', \`maker_fee_rate\` decimal(10,8) NOT NULL DEFAULT '0.00100000', \`taker_fee_rate\` decimal(10,8) NOT NULL DEFAULT '0.00100000', \`is_active\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`baseCurrencyCurrencyId\` int NULL, \`quoteCurrencyCurrencyId\` int NULL, INDEX \`idx_pair_active\` (\`is_active\`), UNIQUE INDEX \`uk_pair_base_quote\` (\`base_currency_id\`, \`quote_currency_id\`), UNIQUE INDEX \`uk_pair_symbol\` (\`symbol\`), UNIQUE INDEX \`IDX_6376d86c1ea01cb29ed9e828e2\` (\`symbol\`), PRIMARY KEY (\`pair_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`currency_networks\` (\`network_id\` int NOT NULL AUTO_INCREMENT, \`currency_id\` int NOT NULL, \`network_code\` varchar(32) NOT NULL, \`deposit_enabled\` tinyint NOT NULL DEFAULT 1, \`withdraw_enabled\` tinyint NOT NULL DEFAULT 1, \`min_confirmations\` int NOT NULL DEFAULT '12', \`withdraw_fee\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`currencyCurrencyId\` int NULL, UNIQUE INDEX \`uk_currency_network\` (\`currency_id\`, \`network_code\`), PRIMARY KEY (\`network_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`currencies\` (\`currency_id\` int NOT NULL AUTO_INCREMENT, \`symbol\` varchar(16) NOT NULL, \`name\` varchar(64) NOT NULL, \`precision_scale\` tinyint NOT NULL DEFAULT '8', \`min_withdraw\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`is_tradable\` tinyint NOT NULL DEFAULT 1, \`is_active\` tinyint NOT NULL DEFAULT 1, UNIQUE INDEX \`uk_currency_symbol\` (\`symbol\`), UNIQUE INDEX \`IDX_30ed1fd0130c0874227d1817f2\` (\`symbol\`), PRIMARY KEY (\`currency_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`withdrawals\` (\`withdraw_id\` bigint NOT NULL AUTO_INCREMENT, \`user_id\` bigint NOT NULL, \`currency_id\` int NOT NULL, \`network_id\` int NULL, \`amount\` decimal(36,18) NOT NULL, \`fee\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`to_address\` varchar(255) NOT NULL, \`tx_hash\` varchar(255) NULL, \`status\` enum ('REQUESTED', 'APPROVED', 'SENT', 'COMPLETED', 'REJECTED', 'FAILED') NOT NULL DEFAULT 'REQUESTED', \`idempotency_key\` varchar(64) NOT NULL, \`requested_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`processed_at\` datetime NULL, \`userUserId\` bigint NULL, \`currencyCurrencyId\` int NULL, \`networkNetworkId\` int NULL, INDEX \`idx_withdraw_user\` (\`user_id\`, \`status\`), UNIQUE INDEX \`uk_withdraw_idem\` (\`user_id\`, \`idempotency_key\`), PRIMARY KEY (\`withdraw_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`wallets\` (\`wallet_id\` bigint NOT NULL AUTO_INCREMENT, \`user_id\` bigint NOT NULL, \`currency_id\` int NOT NULL, \`available\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`frozen\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`userUserId\` bigint NULL, \`currencyCurrencyId\` int NULL, INDEX \`idx_wallet_user\` (\`user_id\`), UNIQUE INDEX \`uk_wallet_user_currency\` (\`user_id\`, \`currency_id\`), PRIMARY KEY (\`wallet_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`wallet_ledger\` (\`ledger_id\` bigint NOT NULL AUTO_INCREMENT, \`user_id\` bigint NOT NULL, \`currency_id\` int NOT NULL, \`ref_type\` enum ('DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER', 'EXTERNAL_DEPOSIT', 'EXTERNAL_WITHDRAWAL', 'EXTERNAL_SYNC', 'RECONCILIATION') NOT NULL, \`ref_id\` bigint NOT NULL, \`direction\` enum ('CREDIT', 'DEBIT') NOT NULL, \`amount\` decimal(36,18) NOT NULL, \`balance_after\` decimal(36,18) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userUserId\` bigint NULL, \`currencyCurrencyId\` int NULL, \`walletWalletId\` bigint NULL, INDEX \`idx_ledger_ref\` (\`ref_type\`, \`ref_id\`), INDEX \`idx_ledger_user_time\` (\`user_id\`, \`created_at\`), UNIQUE INDEX \`uk_ledger_ref\` (\`ref_type\`, \`ref_id\`, \`user_id\`, \`currency_id\`, \`direction\`), PRIMARY KEY (\`ledger_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`orders\` (\`order_id\` bigint NOT NULL AUTO_INCREMENT, \`user_id\` bigint NOT NULL, \`pair_id\` int NOT NULL, \`side\` enum ('BUY', 'SELL') NOT NULL, \`type\` enum ('LIMIT', 'MARKET') NOT NULL, \`price\` decimal(36,18) NULL, \`amount\` decimal(36,18) NOT NULL, \`filled_amount\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`avg_price\` decimal(36,18) NULL, \`status\` enum ('OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED') NOT NULL DEFAULT 'OPEN', \`time_in_force\` enum ('GTC', 'IOC', 'FOK') NOT NULL DEFAULT 'GTC', \`reserved_quote\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`reserved_base\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`client_order_id\` varchar(64) NULL, \`idempotency_key\` varchar(64) NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`userUserId\` bigint NULL, \`pairPairId\` int NULL, INDEX \`idx_orders_book\` (\`pair_id\`, \`side\`, \`status\`, \`price\`, \`created_at\`), INDEX \`idx_orders_pair_status\` (\`pair_id\`, \`status\`, \`created_at\`), INDEX \`idx_orders_user\` (\`user_id\`, \`created_at\`), UNIQUE INDEX \`uk_order_idem\` (\`user_id\`, \`idempotency_key\`), PRIMARY KEY (\`order_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`trades\` (\`trade_id\` bigint NOT NULL AUTO_INCREMENT, \`pair_id\` int NOT NULL, \`taker_order_id\` bigint NOT NULL, \`maker_order_id\` bigint NOT NULL, \`price\` decimal(36,18) NOT NULL, \`amount\` decimal(36,18) NOT NULL, \`taker_fee\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`maker_fee\` decimal(36,18) NOT NULL DEFAULT '0.000000000000000000', \`fee_currency_id\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`pairPairId\` int NULL, \`takerOrderOrderId\` bigint NULL, \`makerOrderOrderId\` bigint NULL, \`feeCurrencyCurrencyId\` int NULL, INDEX \`idx_trades_maker\` (\`maker_order_id\`), INDEX \`idx_trades_taker\` (\`taker_order_id\`), INDEX \`idx_trades_pair_time\` (\`pair_id\`, \`created_at\`), PRIMARY KEY (\`trade_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`price_alerts\` (\`alert_id\` bigint NOT NULL AUTO_INCREMENT, \`user_id\` bigint NOT NULL, \`pair_id\` int NOT NULL, \`target_price\` decimal(36,18) NOT NULL, \`direction\` enum ('ABOVE', 'BELOW') NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`triggered_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userUserId\` bigint NULL, \`pairPairId\` int NULL, INDEX \`idx_alert_pair\` (\`pair_id\`, \`is_active\`), INDEX \`idx_alert_user\` (\`user_id\`, \`is_active\`), PRIMARY KEY (\`alert_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`ohlcv\` (\`pair_id\` int NOT NULL, \`interval_sec\` int NOT NULL, \`open_time\` datetime NOT NULL, \`open\` decimal(36,18) NOT NULL, \`high\` decimal(36,18) NOT NULL, \`low\` decimal(36,18) NOT NULL, \`close\` decimal(36,18) NOT NULL, \`volume\` decimal(36,18) NOT NULL, \`pairPairId\` int NULL, INDEX \`idx_ohlcv_time\` (\`open_time\`), PRIMARY KEY (\`pair_id\`, \`interval_sec\`, \`open_time\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`deposits\` (\`deposit_id\` bigint NOT NULL AUTO_INCREMENT, \`user_id\` bigint NOT NULL, \`currency_id\` int NOT NULL, \`network_id\` int NULL, \`amount\` decimal(36,18) NOT NULL, \`tx_hash\` varchar(255) NOT NULL, \`confirmations\` int NOT NULL DEFAULT '0', \`status\` enum ('PENDING', 'CONFIRMED', 'CREDITED', 'FAILED') NOT NULL DEFAULT 'PENDING', \`detected_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`credited_at\` datetime NULL, \`userUserId\` bigint NULL, \`currencyCurrencyId\` int NULL, \`networkNetworkId\` int NULL, INDEX \`idx_deposit_user\` (\`user_id\`, \`status\`), UNIQUE INDEX \`uk_deposit_tx\` (\`currency_id\`, \`tx_hash\`), PRIMARY KEY (\`deposit_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE IF NOT EXISTS \`app_settings\` (\`k\` varchar(64) NOT NULL, \`v\` varchar(2048) NOT NULL, \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), PRIMARY KEY (\`k\`)) ENGINE=InnoDB`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`user_sessions\` ADD CONSTRAINT \`FK_93bf1894c3056f0c3c9573e4ae3\` FOREIGN KEY (\`userUserId\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`user_sessions\` ADD CONSTRAINT \`FK_e9658e959c490b0a634dfc54783\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`market_pairs\` ADD CONSTRAINT \`FK_cc62fc736be0328a3ca80ef6b36\` FOREIGN KEY (\`baseCurrencyCurrencyId\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`market_pairs\` ADD CONSTRAINT \`FK_251f56fcca98f6807a341eb7068\` FOREIGN KEY (\`quoteCurrencyCurrencyId\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`market_pairs\` ADD CONSTRAINT \`FK_53f945c698b9bfb03485fceddf4\` FOREIGN KEY (\`base_currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`market_pairs\` ADD CONSTRAINT \`FK_8cfe588824a2ece145b8605afff\` FOREIGN KEY (\`quote_currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`currency_networks\` ADD CONSTRAINT \`FK_5aaf9dee3ec9e7b7f7324c78f01\` FOREIGN KEY (\`currencyCurrencyId\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`currency_networks\` ADD CONSTRAINT \`FK_82da04dcc43079dcf05ea1eb401\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` ADD CONSTRAINT \`FK_08bb514f5bafffed548bf47d15b\` FOREIGN KEY (\`userUserId\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` ADD CONSTRAINT \`FK_4169fa1db359730be9569da57ce\` FOREIGN KEY (\`currencyCurrencyId\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` ADD CONSTRAINT \`FK_3717c32c3be8fefceafc573185d\` FOREIGN KEY (\`networkNetworkId\`) REFERENCES \`currency_networks\`(\`network_id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` ADD CONSTRAINT \`FK_0bd35ddb3acfb323ae3e024d2f8\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` ADD CONSTRAINT \`FK_0518d2ac219c3e9a166a56191a5\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` ADD CONSTRAINT \`FK_d399752fb458571ef212a88d959\` FOREIGN KEY (\`network_id\`) REFERENCES \`currency_networks\`(\`network_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallets\` ADD CONSTRAINT \`FK_bbb8e4640ffea3ac7108e784f92\` FOREIGN KEY (\`userUserId\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallets\` ADD CONSTRAINT \`FK_837954889dbeb41a6c30cdbe7e9\` FOREIGN KEY (\`currencyCurrencyId\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallets\` ADD CONSTRAINT \`FK_92558c08091598f7a4439586cda\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallets\` ADD CONSTRAINT \`FK_b3167c57663ae949d67436465b3\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` ADD CONSTRAINT \`FK_0e0e6726e03a81956190815d940\` FOREIGN KEY (\`userUserId\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` ADD CONSTRAINT \`FK_a7a7810f50ca5893139a38ca285\` FOREIGN KEY (\`currencyCurrencyId\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` ADD CONSTRAINT \`FK_f3469cc7eb4db8a94b1a8c7c646\` FOREIGN KEY (\`walletWalletId\`) REFERENCES \`wallets\`(\`wallet_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` ADD CONSTRAINT \`FK_c7e9efe5a3b0a356eefbf012f64\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` ADD CONSTRAINT \`FK_5b036a738ec1a48769929e3f4fd\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_6a4ebad71685a4ed11e89b3e834\` FOREIGN KEY (\`userUserId\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_bfa5684824b41c6bb646fb46382\` FOREIGN KEY (\`pairPairId\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_a922b820eeef29ac1c6800e826a\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`orders\` ADD CONSTRAINT \`FK_da7cd995471468f69515ee94602\` FOREIGN KEY (\`pair_id\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` ADD CONSTRAINT \`FK_2ac38269134019eedd1a1d93496\` FOREIGN KEY (\`pairPairId\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` ADD CONSTRAINT \`FK_32c5261279d8313220178cb5d6d\` FOREIGN KEY (\`takerOrderOrderId\`) REFERENCES \`orders\`(\`order_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` ADD CONSTRAINT \`FK_f8edaf9f143f926e23a3aa291e2\` FOREIGN KEY (\`makerOrderOrderId\`) REFERENCES \`orders\`(\`order_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` ADD CONSTRAINT \`FK_1347a4d264ca862d0a83f135ac3\` FOREIGN KEY (\`feeCurrencyCurrencyId\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` ADD CONSTRAINT \`FK_8b861df9cd07c1dc0a9327248b2\` FOREIGN KEY (\`pair_id\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` ADD CONSTRAINT \`FK_2a60ab74154d9cf3c9b6d707f78\` FOREIGN KEY (\`taker_order_id\`) REFERENCES \`orders\`(\`order_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` ADD CONSTRAINT \`FK_90aa85c756d868da86928de5440\` FOREIGN KEY (\`maker_order_id\`) REFERENCES \`orders\`(\`order_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` ADD CONSTRAINT \`FK_74e263555895d2f609823fe05d5\` FOREIGN KEY (\`fee_currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`price_alerts\` ADD CONSTRAINT \`FK_2fe17ebd384032f0786a3129daf\` FOREIGN KEY (\`userUserId\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`price_alerts\` ADD CONSTRAINT \`FK_f84e23308bacfcd22b1e61c8b62\` FOREIGN KEY (\`pairPairId\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`price_alerts\` ADD CONSTRAINT \`FK_e935431220d8759d650a506472f\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`price_alerts\` ADD CONSTRAINT \`FK_e25f9e2e740c1b6e6dd7bbb2d01\` FOREIGN KEY (\`pair_id\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`ohlcv\` ADD CONSTRAINT \`FK_c3418ff3d769b0524947d394c83\` FOREIGN KEY (\`pairPairId\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`ohlcv\` ADD CONSTRAINT \`FK_e3ac86a0caa8709a74c0ed0d081\` FOREIGN KEY (\`pair_id\`) REFERENCES \`market_pairs\`(\`pair_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_72a0566d863a05155a3d4ffc7b2\` FOREIGN KEY (\`userUserId\`) REFERENCES \`users\`(\`user_id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_94c0c57b14c8ed166c47254c552\` FOREIGN KEY (\`currencyCurrencyId\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_1d56aaa741ecfbed08ac42842da\` FOREIGN KEY (\`networkNetworkId\`) REFERENCES \`currency_networks\`(\`network_id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_109b9d3209e5c344dae2ca8f221\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`user_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_dce38db03870f7a73551680ad68\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`currency_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` ADD CONSTRAINT \`FK_50143130bceddb0866ed5ea5bf7\` FOREIGN KEY (\`network_id\`) REFERENCES \`currency_networks\`(\`network_id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_50143130bceddb0866ed5ea5bf7\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_dce38db03870f7a73551680ad68\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_109b9d3209e5c344dae2ca8f221\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_1d56aaa741ecfbed08ac42842da\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_94c0c57b14c8ed166c47254c552\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`deposits\` DROP FOREIGN KEY \`FK_72a0566d863a05155a3d4ffc7b2\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`ohlcv\` DROP FOREIGN KEY \`FK_e3ac86a0caa8709a74c0ed0d081\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`ohlcv\` DROP FOREIGN KEY \`FK_c3418ff3d769b0524947d394c83\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`price_alerts\` DROP FOREIGN KEY \`FK_e25f9e2e740c1b6e6dd7bbb2d01\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`price_alerts\` DROP FOREIGN KEY \`FK_e935431220d8759d650a506472f\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`price_alerts\` DROP FOREIGN KEY \`FK_f84e23308bacfcd22b1e61c8b62\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`price_alerts\` DROP FOREIGN KEY \`FK_2fe17ebd384032f0786a3129daf\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_1347a4d264ca862d0a83f135ac3\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_74e263555895d2f609823fe05d5\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_90aa85c756d868da86928de5440\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_2a60ab74154d9cf3c9b6d707f78\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_8b861df9cd07c1dc0a9327248b2\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_1347a4d264ca862d0a83f135ac3\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_f8edaf9f143f926e23a3aa291e2\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_32c5261279d8313220178cb5d6d\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`trades\` DROP FOREIGN KEY \`FK_2ac38269134019eedd1a1d93496\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_da7cd995471468f69515ee94602\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_a922b820eeef29ac1c6800e826a\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_bfa5684824b41c6bb646fb46382\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`orders\` DROP FOREIGN KEY \`FK_6a4ebad71685a4ed11e89b3e834\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` DROP FOREIGN KEY \`FK_f3469cc7eb4db8a94b1a8c7c646\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` DROP FOREIGN KEY \`FK_a7a7810f50ca5893139a38ca285\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` DROP FOREIGN KEY \`FK_5b036a738ec1a48769929e3f4fd\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` DROP FOREIGN KEY \`FK_c7e9efe5a3b0a356eefbf012f64\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` DROP FOREIGN KEY \`FK_f3469cc7eb4db8a94b1a8c7c646\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` DROP FOREIGN KEY \`FK_a7a7810f50ca5893139a38ca285\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallet_ledger\` DROP FOREIGN KEY \`FK_0e0e6726e03a81956190815d940\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallets\` DROP FOREIGN KEY \`FK_b3167c57663ae949d67436465b3\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallets\` DROP FOREIGN KEY \`FK_92558c08091598f7a4439586cda\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallets\` DROP FOREIGN KEY \`FK_837954889dbeb41a6c30cdbe7e9\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`wallets\` DROP FOREIGN KEY \`FK_bbb8e4640ffea3ac7108e784f92\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` DROP FOREIGN KEY \`FK_d399752fb458571ef212a88d959\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` DROP FOREIGN KEY \`FK_0518d2ac219c3e9a166a56191a5\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` DROP FOREIGN KEY \`FK_0bd35ddb3acfb323ae3e024d2f8\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` DROP FOREIGN KEY \`FK_3717c32c3be8fefceafc573185d\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` DROP FOREIGN KEY \`FK_4169fa1db359730be9569da57ce\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`withdrawals\` DROP FOREIGN KEY \`FK_08bb514f5bafffed548bf47d15b\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`currency_networks\` DROP FOREIGN KEY \`FK_82da04dcc43079dcf05ea1eb401\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`currency_networks\` DROP FOREIGN KEY \`FK_5aaf9dee3ec9e7b7f7324c78f01\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`market_pairs\` DROP FOREIGN KEY \`FK_8cfe588824a2ece145b8605afff\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`market_pairs\` DROP FOREIGN KEY \`FK_53f945c698b9bfb03485fceddf4\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`market_pairs\` DROP FOREIGN KEY \`FK_251f56fcca98f6807a341eb7068\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`market_pairs\` DROP FOREIGN KEY \`FK_cc62fc736be0328a3ca80ef6b36\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`user_sessions\` DROP FOREIGN KEY \`FK_e9658e959c490b0a634dfc54783\``);
        await this.addForeignKeyIfNotExists(queryRunner, `ALTER TABLE \`user_sessions\` DROP FOREIGN KEY \`FK_93bf1894c3056f0c3c9573e4ae3\``);
        await queryRunner.query(`DROP TABLE \`app_settings\``);
        await queryRunner.query(`DROP INDEX \`uk_deposit_tx\` ON \`deposits\``);
        await queryRunner.query(`DROP INDEX \`idx_deposit_user\` ON \`deposits\``);
        await queryRunner.query(`DROP TABLE \`deposits\``);
        await queryRunner.query(`DROP INDEX \`idx_ohlcv_time\` ON \`ohlcv\``);
        await queryRunner.query(`DROP TABLE \`ohlcv\``);
        await queryRunner.query(`DROP INDEX \`idx_alert_user\` ON \`price_alerts\``);
        await queryRunner.query(`DROP INDEX \`idx_alert_pair\` ON \`price_alerts\``);
        await queryRunner.query(`DROP TABLE \`price_alerts\``);
        await queryRunner.query(`DROP INDEX \`idx_trades_pair_time\` ON \`trades\``);
        await queryRunner.query(`DROP INDEX \`idx_trades_taker\` ON \`trades\``);
        await queryRunner.query(`DROP INDEX \`idx_trades_maker\` ON \`trades\``);
        await queryRunner.query(`DROP TABLE \`trades\``);
        await queryRunner.query(`DROP INDEX \`uk_order_idem\` ON \`orders\``);
        await queryRunner.query(`DROP INDEX \`idx_orders_user\` ON \`orders\``);
        await queryRunner.query(`DROP INDEX \`idx_orders_pair_status\` ON \`orders\``);
        await queryRunner.query(`DROP INDEX \`idx_orders_book\` ON \`orders\``);
        await queryRunner.query(`DROP TABLE \`orders\``);
        await queryRunner.query(`DROP INDEX \`uk_ledger_ref\` ON \`wallet_ledger\``);
        await queryRunner.query(`DROP INDEX \`idx_ledger_user_time\` ON \`wallet_ledger\``);
        await queryRunner.query(`DROP INDEX \`idx_ledger_ref\` ON \`wallet_ledger\``);
        await queryRunner.query(`DROP TABLE \`wallet_ledger\``);
        await queryRunner.query(`DROP INDEX \`uk_wallet_user_currency\` ON \`wallets\``);
        await queryRunner.query(`DROP INDEX \`idx_wallet_user\` ON \`wallets\``);
        await queryRunner.query(`DROP TABLE \`wallets\``);
        await queryRunner.query(`DROP INDEX \`uk_withdraw_idem\` ON \`withdrawals\``);
        await queryRunner.query(`DROP INDEX \`idx_withdraw_user\` ON \`withdrawals\``);
        await queryRunner.query(`DROP TABLE \`withdrawals\``);
        await queryRunner.query(`DROP INDEX \`IDX_30ed1fd0130c0874227d1817f2\` ON \`currencies\``);
        await queryRunner.query(`DROP INDEX \`uk_currency_symbol\` ON \`currencies\``);
        await queryRunner.query(`DROP TABLE \`currencies\``);
        await queryRunner.query(`DROP INDEX \`uk_currency_network\` ON \`currency_networks\``);
        await queryRunner.query(`DROP TABLE \`currency_networks\``);
        await queryRunner.query(`DROP INDEX \`IDX_6376d86c1ea01cb29ed9e828e2\` ON \`market_pairs\``);
        await queryRunner.query(`DROP INDEX \`uk_pair_symbol\` ON \`market_pairs\``);
        await queryRunner.query(`DROP INDEX \`uk_pair_base_quote\` ON \`market_pairs\``);
        await queryRunner.query(`DROP INDEX \`idx_pair_active\` ON \`market_pairs\``);
        await queryRunner.query(`DROP TABLE \`market_pairs\``);
        await queryRunner.query(`DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`uk_users_email\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP INDEX \`idx_sessions_user\` ON \`user_sessions\``);
        await queryRunner.query(`DROP INDEX \`idx_sessions_exp\` ON \`user_sessions\``);
        await queryRunner.query(`DROP TABLE \`user_sessions\``);
    }

}
