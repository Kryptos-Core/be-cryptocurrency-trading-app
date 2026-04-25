import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

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
import { ReadMarketTrade } from '../entities/read-market-trade.entity';
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
  ReadMarketTrade,
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

  const host = configService.get<string>('CORE_DB_HOST') ?? configService.get<string>('DB_HOST');
  const port =
    configService.get<number>('CORE_DB_PORT') ?? configService.get<number>('DB_PORT') ?? 5432;
  const username =
    configService.get<string>('CORE_DB_USERNAME') ?? configService.get<string>('DB_USERNAME');
  const password =
    configService.get<string>('CORE_DB_PASSWORD') ?? configService.get<string>('DB_PASSWORD');
  const database =
    configService.get<string>('CORE_DB_NAME') ?? configService.get<string>('DB_NAME');

  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    entities: ALL_ENTITIES,
    migrations: typeormMigrationFilePaths(__dirname),
    migrationsRun: configService.get<string>('NODE_ENV') !== 'production',
    synchronize: false,
    logging: debugSql ? (['query', 'error'] as const) : false,
    extra: {
      max: 10,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000,
    },
  };
};
