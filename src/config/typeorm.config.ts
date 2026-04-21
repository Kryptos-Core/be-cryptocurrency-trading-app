import * as path from 'node:path';
import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

// Explicit entity imports — required when webpack bundles everything into dist/main.js
// because filesystem globs resolve to empty arrays in bundled environments.
import { AdminWalletAdjustment } from '../entities/admin-wallet-adjustment.entity';
import { AppSetting } from '../entities/app-setting.entity';
import { Currency } from '../entities/currency.entity';
import { CurrencyNetwork } from '../entities/currency-network.entity';
import { Deposit } from '../entities/deposit.entity';
import { DepositWatcherCursor } from '../entities/deposit-watcher-cursor.entity';
import { ExchangeRateAuditLog } from '../entities/exchange-rate-audit-log.entity';
import { FiatDeposit } from '../entities/fiat-deposit.entity';
import { IntegrationOutbox } from '../entities/integration-outbox.entity';
import { ManagedWallet } from '../entities/managed-wallet.entity';
import { MarketMakerConfig } from '../entities/market-maker-config.entity';
import { MarketPair } from '../entities/market-pair.entity';
import { Notification } from '../entities/notification.entity';
import { Order } from '../entities/order.entity';
import { PaymentMethodConfig } from '../entities/payment-method-config.entity';
import { ReadMarketPair } from '../entities/read-market-pair.entity';
import { ReadOnchainDeposit } from '../entities/read-onchain-deposit.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { Trade } from '../entities/trade.entity';
import { TransactionWallet } from '../entities/transaction-wallet.entity';
import { TreasuryMainWallet } from '../entities/treasury-main-wallet.entity';
import { TreasuryOperation } from '../entities/treasury-operation.entity';
import { User } from '../entities/user.entity';
import { UserNotification } from '../entities/user-notification.entity';
import { Wallet } from '../entities/wallet.entity';
import { WalletLedger } from '../entities/wallet-ledger.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { LinkedWallet } from '../modules/blockchain/entities/linked-wallet.entity';
import { OnchainTransaction } from '../modules/blockchain/entities/onchain-transaction.entity';
import { typeormMigrationFilePaths } from './typeorm-entity-glob-paths';

const ALL_ENTITIES = [
  AdminWalletAdjustment,
  AppSetting,
  Currency,
  CurrencyNetwork,
  Deposit,
  DepositWatcherCursor,
  ExchangeRateAuditLog,
  IntegrationOutbox,
  FiatDeposit,
  LinkedWallet,
  ManagedWallet,
  MarketMakerConfig,
  MarketPair,
  ReadMarketPair,
  ReadOnchainDeposit,
  OnchainTransaction,
  Order,
  Trade,
  User,
  Wallet,
  WalletLedger,
  Withdrawal,
  Notification,
  UserNotification,
  PaymentMethodConfig,
  TransactionWallet,
  TreasuryMainWallet,
  TreasuryOperation,
  SystemConfig,
];

export const getTypeOrmConfig = (configService: ConfigService): TypeOrmModuleOptions => {
  const nodeEnv = configService.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';
  const debugSqlFlag = (configService.get<string>('TYPEORM_DEBUG_SQL') ?? '').trim().toLowerCase();
  const debugSql = !isProduction && ['true', '1', 'yes', 'on'].includes(debugSqlFlag);

  return {
    type: 'mysql',
    host: configService.get<string>('DB_HOST'),
    port: configService.get<number>('DB_PORT'),
    username: configService.get<string>('DB_USERNAME'),
    password: configService.get<string>('DB_PASSWORD'),
    database: configService.get<string>('DB_NAME'),
    entities: ALL_ENTITIES,
    migrations: typeormMigrationFilePaths(__dirname),
    migrationsRun: configService.get<string>('NODE_ENV') !== 'production',
    synchronize: false,
    logging: debugSql ? (['query', 'error'] as const) : false,
    connectTimeout: 30000,
    extra: {
      connectionLimit: 10,
      connectTimeout: 30000,
    },
  };
};
