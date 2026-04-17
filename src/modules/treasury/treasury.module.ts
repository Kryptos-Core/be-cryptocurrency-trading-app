import * as path from 'node:path';
import { BullModule } from '@nestjs/bull';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletEncryptionService } from '@/common/services';
import { WorkerPoolModule } from '@/common/worker-pool/worker-pool.module';
import { RedisModule } from '@/modules/redis/redis.module';

/** Resolve the crypto-account worker path for both dev (webpack/nest watch) and production (compiled JS). */
const isDev = process.env.NODE_ENV !== 'production';
const cryptoWorkerFile = isDev
  ? path.resolve(process.cwd(), 'src', 'modules', 'treasury', 'workers', 'crypto-account.worker.ts')
  : path.resolve(__dirname, 'workers', 'crypto-account.worker.js');
const workerExecArgv = isDev ? ['-r', 'ts-node/register', '-r', 'tsconfig-paths/register'] : [];

import { TransactionWallet } from '@/entities/transaction-wallet.entity';
import { TreasuryMainWallet } from '@/entities/treasury-main-wallet.entity';
import { TreasuryOperation } from '@/entities/treasury-operation.entity';
import { AuthModule } from '@/modules/auth/auth.module';
import { OnchainTransaction } from '@/modules/blockchain';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import {
  ApproveMainWalletDeletionUseCase,
  ApproveMainWalletUseCase,
  CreateTransactionWalletUseCase,
  DeactivateTransactionWalletUseCase,
  DeleteTransactionWalletUseCase,
  GetMainWalletQuery,
  GetTransactionWalletQuery,
  GetTreasuryOperationQuery,
  ImportMainWalletUseCase,
  RejectMainWalletDeletionUseCase,
  RejectMainWalletUseCase,
  RequestMainWalletDeletionUseCase,
  RevealMainWalletPrivateKeyUseCase,
  SendWithdrawalUseCase,
  SetDefaultMainWalletUseCase,
  SetDefaultUserDepositUseCase,
  UnsetDefaultUserDepositUseCase,
  UpdateMainWalletLabelUseCase,
} from './application';
import { TREASURY_QUEUE } from './constants';
import {
  TREASURY_MAIN_WALLET_REPOSITORY,
  TREASURY_ONCHAIN_READ_REPOSITORY,
  TREASURY_OPERATION_REPOSITORY,
  TREASURY_TRANSACTION_WALLET_REPOSITORY,
} from './domain/ports';
import {
  TreasuryMainWalletRepository,
  TreasuryOnchainReadRepository,
  TreasuryOperationRepository,
  TreasuryTransactionWalletRepository,
} from './infrastructure/persistence';
import { MainWalletRotationScheduler } from './main-wallet-rotation.scheduler';
import { OnchainChainPickerService } from './onchain-chain-picker.service';
import { TransactionWalletService } from './transaction-wallet.service';
import { TreasuryController } from './treasury.controller';
import { TreasuryProcessor } from './treasury.processor';
import { TreasuryMainWalletService } from './treasury-main-wallet.service';
import { TreasuryOperationsService } from './treasury-operations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TransactionWallet,
      TreasuryMainWallet,
      TreasuryOperation,
      OnchainTransaction,
    ]),
    WorkerPoolModule.forRoot({
      workerFile: cryptoWorkerFile,
      execArgv: workerExecArgv,
      maxThreads: 2, // 2 threads sufficient — wallets created one-at-a-time per request
    }),
    RedisModule,
    PaymentConfigModule,
    SystemConfigModule,
    forwardRef(() => AuthModule), // forwardRef avoids potential circular deps
    BullModule.registerQueue({
      name: TREASURY_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2_000 },
        removeOnComplete: 100, // keep last 100 completed jobs for inspection
        removeOnFail: false, // failed jobs stay in Bull's failed set (acts as DLQ)
      },
    }),
  ],
  controllers: [TreasuryController],
  providers: [
    WalletEncryptionService,
    // Port → Implementation bindings
    {
      provide: TREASURY_TRANSACTION_WALLET_REPOSITORY,
      useClass: TreasuryTransactionWalletRepository,
    },
    { provide: TREASURY_MAIN_WALLET_REPOSITORY, useClass: TreasuryMainWalletRepository },
    { provide: TREASURY_OPERATION_REPOSITORY, useClass: TreasuryOperationRepository },
    { provide: TREASURY_ONCHAIN_READ_REPOSITORY, useClass: TreasuryOnchainReadRepository },
    // Core services (kept for schedulers, processors, and internal use)
    TransactionWalletService,
    TreasuryMainWalletService,
    TreasuryOperationsService,
    TreasuryProcessor,
    MainWalletRotationScheduler,
    OnchainChainPickerService,
    // Application layer — queries
    GetMainWalletQuery,
    GetTransactionWalletQuery,
    GetTreasuryOperationQuery,
    // Application layer — use cases
    ImportMainWalletUseCase,
    ApproveMainWalletUseCase,
    RejectMainWalletUseCase,
    SetDefaultMainWalletUseCase,
    RevealMainWalletPrivateKeyUseCase,
    UpdateMainWalletLabelUseCase,
    RequestMainWalletDeletionUseCase,
    ApproveMainWalletDeletionUseCase,
    RejectMainWalletDeletionUseCase,
    CreateTransactionWalletUseCase,
    SendWithdrawalUseCase,
    DeactivateTransactionWalletUseCase,
    DeleteTransactionWalletUseCase,
    SetDefaultUserDepositUseCase,
    UnsetDefaultUserDepositUseCase,
  ],
  exports: [
    TransactionWalletService,
    TreasuryMainWalletService,
    TreasuryOperationsService,
    OnchainChainPickerService,
    TREASURY_TRANSACTION_WALLET_REPOSITORY,
  ],
})
export class TreasuryModule {}
