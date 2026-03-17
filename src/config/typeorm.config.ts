import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import * as path from 'path';

// Explicit entity imports — required when webpack bundles everything into dist/main.js
// because filesystem globs resolve to empty arrays in bundled environments.
import { AppSetting } from '../entities/app-setting.entity';
import { Currency } from '../entities/currency.entity';
import { CurrencyNetwork } from '../entities/currency-network.entity';
import { Deposit } from '../entities/deposit.entity';
import { FiatDeposit } from '../entities/fiat-deposit.entity';
import { LinkedWallet } from '../entities/linked-wallet.entity';
import { ManagedWallet } from '../entities/managed-wallet.entity';
import { MarketPair } from '../entities/market-pair.entity';
import { OnchainTransaction } from '../entities/onchain-transaction.entity';
import { Order } from '../entities/order.entity';
import { PriceAlert } from '../entities/price-alert.entity';
import { Trade } from '../entities/trade.entity';
import { User } from '../entities/user.entity';
import { UserSession } from '../entities/user-session.entity';
import { Wallet } from '../entities/wallet.entity';
import { WalletLedger } from '../entities/wallet-ledger.entity';
import { Withdrawal } from '../entities/withdrawal.entity';

const ALL_ENTITIES = [
  AppSetting,
  Currency,
  CurrencyNetwork,
  Deposit,
  FiatDeposit,
  LinkedWallet,
  ManagedWallet,
  MarketPair,
  OnchainTransaction,
  Order,
  PriceAlert,
  Trade,
  User,
  UserSession,
  Wallet,
  WalletLedger,
  Withdrawal,
];

export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'mysql',
  host: configService.get<string>('DB_HOST'),
  port: configService.get<number>('DB_PORT'),
  username: configService.get<string>('DB_USERNAME'),
  password: configService.get<string>('DB_PASSWORD'),
  database: configService.get<string>('DB_NAME'),
  entities: ALL_ENTITIES,
  migrations: [path.join(__dirname, '../migrations/*{.ts,.js}')],
  migrationsRun: configService.get<string>('NODE_ENV') !== 'production',
  synchronize: false,
  logging: configService.get<string>('NODE_ENV') !== 'production',
  connectTimeout: 30000,
  extra: {
    connectionLimit: 10,
    connectTimeout: 30000,
  },
});
