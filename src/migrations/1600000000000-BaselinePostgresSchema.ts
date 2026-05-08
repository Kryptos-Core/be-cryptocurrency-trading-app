import { MigrationInterface, QueryRunner } from 'typeorm';

export class BaselinePostgresSchema1600000000000 implements MigrationInterface {
  name = 'BaselinePostgresSchema1600000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "currency_networks" ("network_id" character(36) NOT NULL, "currency_id" character(36) NOT NULL, "network_code" character varying(32) NOT NULL, "deposit_enabled" boolean NOT NULL DEFAULT true, "withdraw_enabled" boolean NOT NULL DEFAULT true, "min_confirmations" integer NOT NULL DEFAULT '12', "withdraw_fee" numeric(36,18) NOT NULL DEFAULT '0', "currencyCurrencyId" character(36), CONSTRAINT "PK_3023cebf977bb4317f2e5070793" PRIMARY KEY ("network_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_currency_network" ON "currency_networks" ("currency_id", "network_code") `,
    );
    await queryRunner.query(
      `CREATE TABLE "market_pairs" ("pair_id" character(36) NOT NULL, "base_currency_id" character(36) NOT NULL, "quote_currency_id" character(36) NOT NULL, "symbol" character varying(32) NOT NULL, "price_scale" smallint NOT NULL DEFAULT '2', "amount_scale" smallint NOT NULL DEFAULT '6', "min_order_amount" numeric(36,18) NOT NULL DEFAULT '0.0001', "maker_fee_rate" numeric(10,8) NOT NULL DEFAULT '0.001', "taker_fee_rate" numeric(10,8) NOT NULL DEFAULT '0.001', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_6376d86c1ea01cb29ed9e828e27" UNIQUE ("symbol"), CONSTRAINT "PK_a6ffaba71b4e8084d50aa21b8d7" PRIMARY KEY ("pair_id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_pair_active" ON "market_pairs" ("is_active") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_pair_base_quote" ON "market_pairs" ("base_currency_id", "quote_currency_id") `,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uk_pair_symbol" ON "market_pairs" ("symbol") `);
    await queryRunner.query(
      `CREATE TABLE "currencies" ("currency_id" character(36) NOT NULL, "symbol" character varying(16) NOT NULL, "name" character varying(64) NOT NULL, "precision_scale" smallint NOT NULL DEFAULT '8', "min_withdraw" numeric(36,18) NOT NULL DEFAULT '0', "is_tradable" boolean NOT NULL DEFAULT true, "is_active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_30ed1fd0130c0874227d1817f2c" UNIQUE ("symbol"), CONSTRAINT "PK_8ea4cc194d333e79b3a8e8a9a24" PRIMARY KEY ("currency_id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uk_currency_symbol" ON "currencies" ("symbol") `);
    await queryRunner.query(
      `CREATE TYPE "public"."managed_wallets_chain_enum" AS ENUM('ARBITRUM_MAINNET', 'ARBITRUM_SEPOLIA', 'AVALANCHE_FUJI', 'AVALANCHE_MAINNET', 'BASE_MAINNET', 'BASE_SEPOLIA', 'BSC_CHAPEL', 'BSC_MAINNET', 'ETH_MAINNET', 'ETH_SEPOLIA', 'FANTOM_MAINNET', 'FANTOM_TESTNET', 'GNOSIS_CHIADO', 'GNOSIS_MAINNET', 'LINEA_MAINNET', 'LINEA_SEPOLIA', 'OPTIMISM_MAINNET', 'OPTIMISM_SEPOLIA', 'POLYGON_AMOY', 'POLYGON_MAINNET', 'SOLANA_DEVNET', 'SOLANA_MAINNET', 'TON_MAINNET', 'TON_TESTNET', 'TRON_MAINNET', 'TRON_NILE', 'TRON_SHASTA')`,
    );
    await queryRunner.query(
      `CREATE TABLE "managed_wallets" ("wallet_id" character(36) NOT NULL, "user_id" character(36) NOT NULL, "chain" "public"."managed_wallets_chain_enum" NOT NULL, "address" character varying(255) NOT NULL, "public_key" character varying(255) NOT NULL, "encrypted_private_key" text NOT NULL, "encrypted_seed_phrase" text, "label" character varying(100), "is_default_deposit" boolean NOT NULL DEFAULT false, "default_set_at" TIMESTAMP, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_91f744b89af1a7287b7e29362c8" PRIMARY KEY ("wallet_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_managed_wallet_user_active" ON "managed_wallets" ("user_id", "is_active") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_managed_wallet_chain_default" ON "managed_wallets" ("chain", "is_default_deposit") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_managed_wallet_user_chain_addr" ON "managed_wallets" ("user_id", "chain", "address") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_wallets_chain_enum" AS ENUM('ARBITRUM_MAINNET', 'ARBITRUM_SEPOLIA', 'AVALANCHE_FUJI', 'AVALANCHE_MAINNET', 'BASE_MAINNET', 'BASE_SEPOLIA', 'BSC_CHAPEL', 'BSC_MAINNET', 'ETH_MAINNET', 'ETH_SEPOLIA', 'FANTOM_MAINNET', 'FANTOM_TESTNET', 'GNOSIS_CHIADO', 'GNOSIS_MAINNET', 'LINEA_MAINNET', 'LINEA_SEPOLIA', 'OPTIMISM_MAINNET', 'OPTIMISM_SEPOLIA', 'POLYGON_AMOY', 'POLYGON_MAINNET', 'SOLANA_DEVNET', 'SOLANA_MAINNET', 'TON_MAINNET', 'TON_TESTNET', 'TRON_MAINNET', 'TRON_NILE', 'TRON_SHASTA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."transaction_wallets_purpose_enum" AS ENUM('DEPOSIT', 'WITHDRAWAL', 'BOTH')`,
    );
    await queryRunner.query(
      `CREATE TABLE "transaction_wallets" ("wallet_id" character(36) NOT NULL, "chain" "public"."transaction_wallets_chain_enum" NOT NULL, "address" character varying(255) NOT NULL, "purpose" "public"."transaction_wallets_purpose_enum" NOT NULL DEFAULT 'BOTH', "encrypted_private_key" text NOT NULL, "label" character varying(100), "is_active" boolean NOT NULL DEFAULT true, "is_default_user_deposit" boolean NOT NULL DEFAULT false, "default_set_at" TIMESTAMP(6), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_892a330c34b0c582a5263c43bb6" PRIMARY KEY ("wallet_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tx_wallet_chain_active" ON "transaction_wallets" ("chain", "is_active") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_tx_wallet_chain_purpose" ON "transaction_wallets" ("chain", "purpose") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_tx_wallet_chain_address" ON "transaction_wallets" ("chain", "address") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."treasury_operations_type_enum" AS ENUM('SWEEP', 'FUND')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."treasury_operations_chain_enum" AS ENUM('ARBITRUM_MAINNET', 'ARBITRUM_SEPOLIA', 'AVALANCHE_FUJI', 'AVALANCHE_MAINNET', 'BASE_MAINNET', 'BASE_SEPOLIA', 'BSC_CHAPEL', 'BSC_MAINNET', 'ETH_MAINNET', 'ETH_SEPOLIA', 'FANTOM_MAINNET', 'FANTOM_TESTNET', 'GNOSIS_CHIADO', 'GNOSIS_MAINNET', 'LINEA_MAINNET', 'LINEA_SEPOLIA', 'OPTIMISM_MAINNET', 'OPTIMISM_SEPOLIA', 'POLYGON_AMOY', 'POLYGON_MAINNET', 'SOLANA_DEVNET', 'SOLANA_MAINNET', 'TON_MAINNET', 'TON_TESTNET', 'TRON_MAINNET', 'TRON_NILE', 'TRON_SHASTA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."treasury_operations_status_enum" AS ENUM('PENDING', 'PROCESSING', 'TX_BROADCAST', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "treasury_operations" ("operation_id" character(36) NOT NULL, "type" "public"."treasury_operations_type_enum" NOT NULL, "chain" "public"."treasury_operations_chain_enum" NOT NULL, "from_wallet_id" character(36), "to_wallet_id" character(36), "amount" numeric(36,18) NOT NULL DEFAULT '0', "asset" character varying(24) NOT NULL DEFAULT 'NATIVE', "tx_hash" character varying(255), "onchain_tx_id" character(36), "status" "public"."treasury_operations_status_enum" NOT NULL DEFAULT 'PENDING', "broadcast_idempotency_key" character varying(255), "actor_user_id" character(36) NOT NULL, "failure_reason" character varying(512), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "completed_at" TIMESTAMP, CONSTRAINT "PK_ad016c84a520adc20f8e010ddd8" PRIMARY KEY ("operation_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_treasury_op_created" ON "treasury_operations" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_treasury_op_chain_type_status" ON "treasury_operations" ("chain", "type", "status") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('ACTIVE', 'BANNED', 'PENDING')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('TRADER', 'ADMIN', 'RISK_OFFICER', 'SUPPORT_AGENT', 'MARKET_MAKER', 'FINANCE_MANAGER')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("user_id" character(36) NOT NULL, "email" character varying(255) NOT NULL, "password_hash" character varying(255) NOT NULL, "first_name" character varying(100), "last_name" character varying(100), "two_fa_secret" bytea, "status" "public"."users_status_enum" NOT NULL DEFAULT 'ACTIVE', "role" "public"."users_role_enum" NOT NULL DEFAULT 'TRADER', "identity_verified" smallint NOT NULL DEFAULT '0', "email_verified" smallint NOT NULL DEFAULT '0', "avatar_url" character varying(512), "avatar_public_id" character varying(255), "fcm_token" character varying(512), "two_fa_enabled" smallint NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_96aac72f1574b88752e9fb00089" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "uk_users_email" ON "users" ("email") `);
    await queryRunner.query(
      `CREATE TYPE "public"."withdrawals_status_enum" AS ENUM('REQUESTED', 'APPROVED', 'SENT', 'COMPLETED', 'REJECTED', 'FAILED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "withdrawals" ("withdraw_id" character(36) NOT NULL, "user_id" character(36) NOT NULL, "currency_id" character(36) NOT NULL, "network_id" character(36), "amount" numeric(36,18) NOT NULL, "fee" numeric(36,18) NOT NULL DEFAULT '0', "to_address" character varying(255) NOT NULL, "tx_hash" character varying(255), "status" "public"."withdrawals_status_enum" NOT NULL DEFAULT 'REQUESTED', "idempotency_key" character varying(64) NOT NULL, "requested_at" TIMESTAMP NOT NULL DEFAULT now(), "processed_at" TIMESTAMP, "userUserId" character(36), "currencyCurrencyId" character(36), "networkNetworkId" character(36), CONSTRAINT "PK_f95de34e79cfa6dc37d64ed0475" PRIMARY KEY ("withdraw_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_withdraw_user" ON "withdrawals" ("user_id", "status") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_withdraw_idem" ON "withdrawals" ("user_id", "idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "wallets" ("wallet_id" character(36) NOT NULL, "user_id" character(36) NOT NULL, "currency_id" character(36) NOT NULL, "available" numeric(36,18) NOT NULL DEFAULT '0', "frozen" numeric(36,18) NOT NULL DEFAULT '0', "updated_at" TIMESTAMP NOT NULL DEFAULT now(), "userUserId" character(36), "currencyCurrencyId" character(36), CONSTRAINT "PK_c1cf06e248522005c350032ee3b" PRIMARY KEY ("wallet_id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_wallet_user" ON "wallets" ("user_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_wallet_user_currency" ON "wallets" ("user_id", "currency_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."wallet_ledger_ref_type_enum" AS ENUM('DEPOSIT', 'WITHDRAW', 'ORDER', 'TRADE', 'ADJUST', 'TRANSFER', 'EXTERNAL_DEPOSIT', 'EXTERNAL_WITHDRAWAL', 'EXTERNAL_SYNC')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."wallet_ledger_direction_enum" AS ENUM('CREDIT', 'DEBIT')`,
    );
    await queryRunner.query(
      `CREATE TABLE "wallet_ledger" ("ledger_id" character(36) NOT NULL, "user_id" character(36) NOT NULL, "currency_id" character(36) NOT NULL, "wallet_id" character(36) NOT NULL, "ref_type" "public"."wallet_ledger_ref_type_enum" NOT NULL, "ref_id" character(36) NOT NULL, "direction" "public"."wallet_ledger_direction_enum" NOT NULL, "amount" numeric(36,18) NOT NULL, "balance_after" numeric(36,18) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "userUserId" character(36), "currencyCurrencyId" character(36), "walletWalletId" character(36), CONSTRAINT "PK_453e962ed6d1262bd231482c2b1" PRIMARY KEY ("ledger_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ledger_ref" ON "wallet_ledger" ("ref_type", "ref_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_ledger_user_time" ON "wallet_ledger" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_ledger_ref" ON "wallet_ledger" ("ref_type", "ref_id", "user_id", "currency_id", "direction") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."notifications_type_enum" AS ENUM('system', 'alert', 'promo')`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("notification_id" character(36) NOT NULL, "title" character varying(255) NOT NULL, "body" text NOT NULL, "type" "public"."notifications_type_enum" NOT NULL DEFAULT 'system', "created_by" character(36) NOT NULL, "data" json, "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(), "creatorUserId" character(36), CONSTRAINT "PK_eaedfe19f0f765d26afafa85956" PRIMARY KEY ("notification_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_notifications_created_at" ON "notifications" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "user_notifications" ("id" character(36) NOT NULL, "user_id" character(36) NOT NULL, "notification_id" character(36) NOT NULL, "is_read" smallint NOT NULL DEFAULT '0', "read_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(), "userUserId" character(36), "notificationNotificationId" character(36), CONSTRAINT "PK_569622b0fd6e6ab3661de985a2b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_un_user_unread" ON "user_notifications" ("user_id", "is_read") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_user_notif" ON "user_notifications" ("user_id", "notification_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."treasury_main_wallets_chain_enum" AS ENUM('ARBITRUM_MAINNET', 'ARBITRUM_SEPOLIA', 'AVALANCHE_FUJI', 'AVALANCHE_MAINNET', 'BASE_MAINNET', 'BASE_SEPOLIA', 'BSC_CHAPEL', 'BSC_MAINNET', 'ETH_MAINNET', 'ETH_SEPOLIA', 'FANTOM_MAINNET', 'FANTOM_TESTNET', 'GNOSIS_CHIADO', 'GNOSIS_MAINNET', 'LINEA_MAINNET', 'LINEA_SEPOLIA', 'OPTIMISM_MAINNET', 'OPTIMISM_SEPOLIA', 'POLYGON_AMOY', 'POLYGON_MAINNET', 'SOLANA_DEVNET', 'SOLANA_MAINNET', 'TON_MAINNET', 'TON_TESTNET', 'TRON_MAINNET', 'TRON_NILE', 'TRON_SHASTA')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."treasury_main_wallets_status_enum" AS ENUM('PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'PENDING_DELETION')`,
    );
    await queryRunner.query(
      `CREATE TABLE "treasury_main_wallets" ("main_wallet_id" character(36) NOT NULL, "chain" "public"."treasury_main_wallets_chain_enum" NOT NULL, "address" character varying(255) NOT NULL, "encrypted_private_key" text NOT NULL, "label" character varying(100), "is_default" boolean NOT NULL DEFAULT false, "status" "public"."treasury_main_wallets_status_enum" NOT NULL DEFAULT 'ACTIVE', "created_by" character(36), "approved_by" character(36), "approved_at" TIMESTAMP(6), "rejected_by" character(36), "rejected_at" TIMESTAMP(6), "last_rotated_at" TIMESTAMP(6), "rotation_interval_days" integer, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_9ab93f828d5947bfe9f7c188fb7" PRIMARY KEY ("main_wallet_id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_tmw_chain_address" ON "treasury_main_wallets" ("chain", "address") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_tmw_status" ON "treasury_main_wallets" ("status") `);
    await queryRunner.query(
      `CREATE INDEX "idx_tmw_chain_default" ON "treasury_main_wallets" ("chain", "is_default") `,
    );
    await queryRunner.query(`CREATE INDEX "idx_tmw_chain" ON "treasury_main_wallets" ("chain") `);
    await queryRunner.query(`CREATE TYPE "public"."orders_side_enum" AS ENUM('BUY', 'SELL')`);
    await queryRunner.query(`CREATE TYPE "public"."orders_type_enum" AS ENUM('LIMIT', 'MARKET')`);
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_time_in_force_enum" AS ENUM('GTC', 'IOC', 'FOK')`,
    );
    await queryRunner.query(
      `CREATE TABLE "orders" ("order_id" character(36) NOT NULL, "user_id" character(36) NOT NULL, "pair_id" character(36) NOT NULL, "side" "public"."orders_side_enum" NOT NULL, "type" "public"."orders_type_enum" NOT NULL, "price" numeric(36,18), "amount" numeric(36,18) NOT NULL, "filled_amount" numeric(36,18) NOT NULL DEFAULT '0', "avg_price" numeric(36,18), "status" "public"."orders_status_enum" NOT NULL DEFAULT 'OPEN', "time_in_force" "public"."orders_time_in_force_enum" NOT NULL DEFAULT 'GTC', "reserved_quote" numeric(36,18) NOT NULL DEFAULT '0', "reserved_base" numeric(36,18) NOT NULL DEFAULT '0', "client_order_id" character varying(64), "idempotency_key" character varying(64) NOT NULL, "slippage_tolerance" numeric(36,18), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cad55b3cb25b38be94d2ce831db" PRIMARY KEY ("order_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_book" ON "orders" ("pair_id", "side", "status", "price", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_pair_status" ON "orders" ("pair_id", "status", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_orders_user" ON "orders" ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "uk_order_idem" ON "orders" ("user_id", "idempotency_key") `,
    );
    await queryRunner.query(
      `CREATE TABLE "trades" ("trade_id" character(36) NOT NULL, "pair_id" character(36) NOT NULL, "taker_order_id" character(36) NOT NULL, "maker_order_id" character(36) NOT NULL, "price" numeric(36,18) NOT NULL, "amount" numeric(36,18) NOT NULL, "taker_fee" numeric(36,18) NOT NULL DEFAULT '0', "maker_fee" numeric(36,18) NOT NULL DEFAULT '0', "fee_currency_id" character(36) NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "pairPairId" character(36), "takerOrderOrderId" character(36), "makerOrderOrderId" character(36), "feeCurrencyCurrencyId" character(36), CONSTRAINT "PK_2c21f7caf3ffad61ea326d72853" PRIMARY KEY ("trade_id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_trades_maker" ON "trades" ("maker_order_id") `);
    await queryRunner.query(`CREATE INDEX "idx_trades_taker" ON "trades" ("taker_order_id") `);
    await queryRunner.query(
      `CREATE INDEX "idx_trades_pair_time" ON "trades" ("pair_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "trade_audit_log" ("trade_id" character(36) NOT NULL, "pair_id" character(36) NOT NULL, "maker_order_id" character(36) NOT NULL, "taker_order_id" character(36) NOT NULL, "price" numeric(36,18) NOT NULL, "amount" numeric(36,18) NOT NULL, "taker_fee" numeric(36,18) NOT NULL, "maker_fee" numeric(36,18) NOT NULL, "fee_currency_id" character(36) NOT NULL, "logged_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3f297f1a129b66156b24d6eb133" PRIMARY KEY ("trade_id"))`,
    );
    await queryRunner.query(`CREATE INDEX "idx_audit_trade" ON "trade_audit_log" ("trade_id") `);
    await queryRunner.query(
      `CREATE INDEX "idx_audit_pair_time" ON "trade_audit_log" ("pair_id", "logged_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."system_configs_type_enum" AS ENUM('string', 'int', 'float', 'bool')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."system_configs_category_enum" AS ENUM('tech', 'finance', 'core')`,
    );
    await queryRunner.query(
      `CREATE TABLE "system_configs" ("key" character varying(100) NOT NULL, "value" text NOT NULL, "type" "public"."system_configs_type_enum" NOT NULL DEFAULT 'string', "category" "public"."system_configs_category_enum" NOT NULL DEFAULT 'core', "name" character varying(255) NOT NULL, "description" text, "isReadOnly" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5aff9a6d272a5cedf54d7aaf617" PRIMARY KEY ("key"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "read_onchain_deposits" ("tx_id" character(36) NOT NULL, "user_id" character(36) NOT NULL, "chain" character varying(64) NOT NULL, "type" character varying(32) NOT NULL DEFAULT 'DEPOSIT', "tx_hash" character varying(255), "from_address" character varying(255) NOT NULL DEFAULT '', "to_address" character varying(255) NOT NULL DEFAULT '', "amount" numeric(36,18) NOT NULL, "status" character varying(32) NOT NULL, "confirmations" integer NOT NULL DEFAULT '0', "settled" boolean NOT NULL DEFAULT false, "credited_currency_id" character(36), "credited_amount" numeric(36,18), "conversion_rate" numeric(36,18), "created_at" TIMESTAMP(6) NOT NULL, "confirmed_at" TIMESTAMP(6), "last_outbox_id" character(36) NOT NULL, "updated_at" TIMESTAMP(6) NOT NULL DEFAULT now(), CONSTRAINT "PK_23c32be2949bc77157361a4ce4a" PRIMARY KEY ("tx_id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_read_onchain_deposits_user_created" ON "read_onchain_deposits" ("user_id", "created_at") `,
    );
    /* full baseline continues with all table/types/indices and foreign keys (omitted here for brevity) */
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // down body omitted for brevity
  }
}
