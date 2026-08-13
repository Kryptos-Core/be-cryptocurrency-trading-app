import { ConfigService } from '@nestjs/config';
import type { LogLevel } from 'typeorm/logger/Logger';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { AdminWalletAdjustment } from '../entities/admin-wallet-adjustment.entity';
import { AiConversation } from '../entities/ai-conversation.entity';
import { AiConversationDocChunk } from '../entities/ai-conversation-doc-chunk.entity';
import { AiMessage } from '../entities/ai-message.entity';
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
import { ProcessedIntegrationEvent } from '../entities/processed-integration-event.entity';
import { ReadMarketOhlcv } from '../entities/read-market-ohlcv.entity';
import { ReadMarketPair } from '../entities/read-market-pair.entity';
import { ReadMarketTicker } from '../entities/read-market-ticker.entity';
import { ReadMarketTrade } from '../entities/read-market-trade.entity';
import { ReadOnchainDeposit } from '../entities/read-onchain-deposit.entity';
import { SystemConfig } from '../entities/system-config.entity';
import { Trade } from '../entities/trade.entity';
import { TransactionWallet } from '../entities/transaction-wallet.entity';
import { TreasuryE2EConfig } from '../entities/treasury-e2e-config.entity';
import { TreasuryMainWallet } from '../entities/treasury-main-wallet.entity';
import { TreasuryOperation } from '../entities/treasury-operation.entity';
import { User } from '../entities/user.entity';
import { UserBinanceCredentials } from '../entities/user-binance-credentials.entity';
import { UserNotification } from '../entities/user-notification.entity';
import { Wallet } from '../entities/wallet.entity';
import { WalletLedger } from '../entities/wallet-ledger.entity';
import { Withdrawal } from '../entities/withdrawal.entity';
import { DepositMatchRequest } from '../modules/blockchain/entities/deposit-match-request.entity';
import { LinkedWallet } from '../modules/blockchain/entities/linked-wallet.entity';
import { OnchainTransaction } from '../modules/blockchain/entities/onchain-transaction.entity';
import { AddOpsCategoryToSystemConfigs1700000000003 } from '../migrations/1700000000003-AddOpsCategoryToSystemConfigs';
import { AddAuthSecurityCategoryToSystemConfigs1700000002000 } from '../migrations/1700000002000-AddAuthSecurityCategoryToSystemConfigs';
import { AddTreasuryWalletTotpRequiredToSystemConfigs1700000002001 } from '../migrations/1700000002001-AddTreasuryWalletTotpRequiredToSystemConfigs';
import { BaselinePostgresSchema1600000000000 } from '../migrations/1600000000000-BaselinePostgresSchema';
import { CreateTreasuryE2EConfigTable1800000001000 } from '../migrations/1800000001000-CreateTreasuryE2EConfigTable';
import { AddArchivedAtToTreasuryE2EConfig1800000001001 } from '../migrations/1800000001001-AddArchivedAtToTreasuryE2EConfig';
import { MakeOnchainTransactionFromAddressNullable1800000001002 } from '../migrations/1800000001002-MakeOnchainTransactionFromAddressNullable';
import { ExpandDedupeKeyLength1800000001003 } from '../migrations/1800000001003-ExpandDedupeKeyLength';
import { CreateIntegrationOutboxAndReadMarketPairs1800000001004 } from '../migrations/1800000001004-CreateIntegrationOutboxAndReadMarketPairs';
import { CreatePostgresMissingTables1800000001005 } from '../migrations/1800000001005-CreatePostgresMissingTables';
import { FixProcessedIntegrationEventsIdColumn1800000001006 } from '../migrations/1800000001006-FixProcessedIntegrationEventsIdColumn';
import { CreateReadMarketTrades1800000001006 } from '../migrations/1800000001006-CreateReadMarketTrades';
import { CreateBlockchainTablesAndFixEventType1800000001007 } from '../migrations/1800000001007-CreateBlockchainTablesAndFixEventType';
import { CreateReadMarketOhlcv1800000001007 } from '../migrations/1800000001007-CreateReadMarketOhlcv';
import { FixProcessedIntegrationEventsIdDefault1800000001008 } from '../migrations/1800000001008-FixProcessedIntegrationEventsIdDefault';
import { CreateAppSettingsTable1800000001009 } from '../migrations/1800000001009-CreateAppSettingsTable';
import { EnsureAssetColumnOnOnchainTransactions1800000001010 } from '../migrations/1800000001010-EnsureAssetColumnOnOnchainTransactions';
import { CreateDepositWatcherCursors1800000001011 } from '../migrations/1800000001011-CreateDepositWatcherCursors';
import { AddWithdrawalNotificationTypes1800000001012 } from '../migrations/1800000001012-AddWithdrawalNotificationTypes';
import { AddGlobalWalletUniqueness1800000001013 } from '../migrations/1800000001013-AddGlobalWalletUniqueness';
import { AddFraudRiskFlagsAndThresholds1800000001014 } from '../migrations/1800000001014-AddFraudRiskFlagsAndThresholds';
import { CreateFiatDepositsTable1800000001015 } from '../migrations/1800000001015-CreateFiatDepositsTable';
import { CreateMarketMakerConfigsPostgres1800000001016 } from '../migrations/1800000001016-CreateMarketMakerConfigsPostgres';
import { CreateUserSecurityChangeRequestsPostgres1800000001017 } from '../migrations/1800000001017-CreateUserSecurityChangeRequestsPostgres';
import { CreateAdminWalletAdjustmentsPostgres1800000001018 } from '../migrations/1800000001018-CreateAdminWalletAdjustmentsPostgres';
import { CreateAiAssistantTables1800000001019 } from '../migrations/1800000001019-CreateAiAssistantTables';
import { CreateUserBinanceCredentials1700000000001 } from '../migrations/1700000000001-CreateUserBinanceCredentials';

const ALL_MIGRATIONS = [
  BaselinePostgresSchema1600000000000,
  CreateUserBinanceCredentials1700000000001,
  AddOpsCategoryToSystemConfigs1700000000003,
  AddAuthSecurityCategoryToSystemConfigs1700000002000,
  AddTreasuryWalletTotpRequiredToSystemConfigs1700000002001,
  CreateTreasuryE2EConfigTable1800000001000,
  AddArchivedAtToTreasuryE2EConfig1800000001001,
  MakeOnchainTransactionFromAddressNullable1800000001002,
  ExpandDedupeKeyLength1800000001003,
  CreateIntegrationOutboxAndReadMarketPairs1800000001004,
  CreatePostgresMissingTables1800000001005,
  FixProcessedIntegrationEventsIdColumn1800000001006,
  CreateReadMarketTrades1800000001006,
  CreateBlockchainTablesAndFixEventType1800000001007,
  CreateReadMarketOhlcv1800000001007,
  FixProcessedIntegrationEventsIdDefault1800000001008,
  CreateAppSettingsTable1800000001009,
  EnsureAssetColumnOnOnchainTransactions1800000001010,
  CreateDepositWatcherCursors1800000001011,
  AddWithdrawalNotificationTypes1800000001012,
  AddGlobalWalletUniqueness1800000001013,
  AddFraudRiskFlagsAndThresholds1800000001014,
  CreateFiatDepositsTable1800000001015,
  CreateMarketMakerConfigsPostgres1800000001016,
  CreateUserSecurityChangeRequestsPostgres1800000001017,
  CreateAdminWalletAdjustmentsPostgres1800000001018,
  CreateAiAssistantTables1800000001019,
];

const ALL_ENTITIES = [
  AdminWalletAdjustment,
  AiConversation,
  AiConversationDocChunk,
  AiMessage,
  AppSetting,
  Currency,
  CurrencyNetwork,
  Deposit,
  DepositWatcherCursor,
  ExchangeRateAuditLog,
  IntegrationOutbox,
  ProcessedIntegrationEvent,
  FiatDeposit,
  LinkedWallet,
  ManagedWallet,
  MarketMakerConfig,
  MarketPair,
  ReadMarketPair,
  ReadMarketOhlcv,
  ReadMarketTicker,
  ReadMarketTrade,
  ReadOnchainDeposit,
  OnchainTransaction,
  DepositMatchRequest,
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
  TreasuryE2EConfig,
  TreasuryOperation,
  SystemConfig,
  UserBinanceCredentials,
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
    migrations: ALL_MIGRATIONS,
    migrationsRun: configService.get<string>('NODE_ENV') !== 'production',
    synchronize: false,
    logging: debugSql ? (['query', 'error'] as LogLevel[]) : false,
    extra: {
      max: 10,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000,
    },
  };
};
