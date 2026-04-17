import { forwardRef, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVM_CHAIN_DEFINITIONS } from '@/common/constants/evm-chain-definitions';
import { BlockchainNetwork } from '@/common/enums';
import { LinkedWallet, OnchainTransaction } from '@/modules/blockchain';
import { OnchainTransferService } from '@/modules/blockchain/onchain-transfer.service';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { ManagedWalletsModule } from '@/modules/managed-wallets/managed-wallets.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { TreasuryModule } from '@/modules/treasury/treasury.module';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import {
  GetAdminWithdrawalByIdQuery,
  GetAdminWithdrawalStatsQuery,
  GetAdminWithdrawalsQuery,
  GetDepositAddressQuery,
  GetLinkedWalletBalanceQuery,
  GetLinkedWalletsQuery,
  GetSupportedNetworksQuery,
  GetTransactionByIdQuery,
  GetTransactionsQuery,
} from './application/queries';
import {
  ApproveWithdrawalUseCase,
  PreviewDepositUseCase,
  ProcessPendingWithdrawalsUseCase,
  RejectWithdrawalUseCase,
  RequestLinkWalletUseCase,
  RequestWithdrawalUseCase,
  SettleDepositUseCase,
  SubmitDepositUseCase,
  UnlinkWalletUseCase,
  VerifyLinkWalletUseCase,
} from './application/use-cases';
import { OnchainTransferQueryService } from './application/queries/transactions/onchain-transfer-query.service';
import { OnchainDepositService } from './application/use-cases/deposits/onchain-deposit.service';
import { WalletLinkingService } from './application/use-cases/wallet-linking/wallet-linking.service';
import { OnchainWithdrawalService } from './application/use-cases/withdrawals/onchain-withdrawal.service';
import { BlockchainController } from './blockchain.controller';
import {
  BC_SOLANA_DEVNET,
  BC_SOLANA_MAINNET,
  BC_TRON_MAINNET,
  BC_TRON_NILE,
  BC_TRON_SHASTA,
  EVM_PROVIDERS_MAP,
} from './blockchain.tokens';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import { DepositFxService } from './domain/services';
import { LINKED_WALLET_REPOSITORY, ONCHAIN_TRANSACTION_REPOSITORY } from './domain/ports';
import { LinkedWalletRepository, OnchainTransactionRepository } from './infrastructure/persistence';
import { EthereumProvider, SolanaProvider, TronProvider } from './infrastructure/providers';
import { WalletConnectController } from './wallet-connect/wallet-connect.controller';
import { WalletConnectService } from './wallet-connect/wallet-connect.service';
import { WalletConnectSessionManager } from './wallet-connect/wallet-connect-session-manager.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([LinkedWallet, OnchainTransaction]),
    WalletsModule,
    CurrenciesModule,
    ManagedWalletsModule,
    TreasuryModule,
    PaymentConfigModule,
    forwardRef(() => NotificationsModule),
    SystemConfigModule,
  ],
  controllers: [BlockchainController, WalletConnectController],
  providers: [
    {
      provide: BC_TRON_MAINNET,
      useFactory: (
        config: ConfigService,
        treasury: TreasuryMainWalletService,
        sys: SystemConfigService,
      ) =>
        new TronProvider(config, treasury, sys, {
          network: BlockchainNetwork.TRON_MAINNET,
          rpcRuntimeKey: 'TRON_MAINNET_FULL_HOST',
          treasuryChain: 'TRON_MAINNET',
        }),
      inject: [ConfigService, TreasuryMainWalletService, SystemConfigService],
    },
    {
      provide: BC_TRON_NILE,
      useFactory: (
        config: ConfigService,
        treasury: TreasuryMainWalletService,
        sys: SystemConfigService,
      ) =>
        new TronProvider(config, treasury, sys, {
          network: BlockchainNetwork.TRON_NILE,
          rpcRuntimeKey: 'TRON_NILE_FULL_HOST',
          treasuryChain: 'TRON_NILE',
        }),
      inject: [ConfigService, TreasuryMainWalletService, SystemConfigService],
    },
    {
      provide: BC_TRON_SHASTA,
      useFactory: (
        config: ConfigService,
        treasury: TreasuryMainWalletService,
        sys: SystemConfigService,
      ) =>
        new TronProvider(config, treasury, sys, {
          network: BlockchainNetwork.TRON_SHASTA,
          rpcRuntimeKey: 'TRON_SHASTA_FULL_HOST',
          treasuryChain: 'TRON_SHASTA',
        }),
      inject: [ConfigService, TreasuryMainWalletService, SystemConfigService],
    },
    {
      provide: BC_SOLANA_MAINNET,
      useFactory: (
        config: ConfigService,
        payment: PaymentConfigService,
        sys: SystemConfigService,
        treasury: TreasuryMainWalletService,
      ) =>
        new SolanaProvider(config, payment, sys, treasury, {
          network: BlockchainNetwork.SOLANA_MAINNET,
          rpcRuntimeKey: 'SOLANA_MAINNET_URL',
          paymentSolNetwork: 'SOLANA_MAINNET',
          treasuryChain: null,
        }),
      inject: [ConfigService, PaymentConfigService, SystemConfigService, TreasuryMainWalletService],
    },
    {
      provide: BC_SOLANA_DEVNET,
      useFactory: (
        config: ConfigService,
        payment: PaymentConfigService,
        sys: SystemConfigService,
        treasury: TreasuryMainWalletService,
      ) =>
        new SolanaProvider(config, payment, sys, treasury, {
          network: BlockchainNetwork.SOLANA_DEVNET,
          rpcRuntimeKey: 'SOLANA_DEVNET_URL',
          paymentSolNetwork: 'SOLANA_DEVNET',
          treasuryChain: 'SOLANA_DEVNET',
        }),
      inject: [ConfigService, PaymentConfigService, SystemConfigService, TreasuryMainWalletService],
    },
    {
      provide: EVM_PROVIDERS_MAP,
      useFactory: (
        config: ConfigService,
        treasury: TreasuryMainWalletService,
        sys: SystemConfigService,
      ) => {
        const m = new Map<BlockchainNetwork, EthereumProvider>();
        for (const def of EVM_CHAIN_DEFINITIONS) {
          m.set(def.network, new EthereumProvider(config, treasury, sys, def));
        }
        return m;
      },
      inject: [ConfigService, TreasuryMainWalletService, SystemConfigService],
    },
    BlockchainProviderFactory,
    LinkedWalletRepository,
    OnchainTransactionRepository,
    { provide: LINKED_WALLET_REPOSITORY, useExisting: LinkedWalletRepository },
    { provide: ONCHAIN_TRANSACTION_REPOSITORY, useExisting: OnchainTransactionRepository },
    DepositFxService,
    WalletLinkingService,
    OnchainDepositService,
    OnchainWithdrawalService,
    OnchainTransferQueryService,
    OnchainTransferService,
    WalletConnectSessionManager,
    WalletConnectService,
    RequestLinkWalletUseCase,
    VerifyLinkWalletUseCase,
    UnlinkWalletUseCase,
    SubmitDepositUseCase,
    PreviewDepositUseCase,
    SettleDepositUseCase,
    RequestWithdrawalUseCase,
    ApproveWithdrawalUseCase,
    RejectWithdrawalUseCase,
    ProcessPendingWithdrawalsUseCase,
    GetLinkedWalletsQuery,
    GetLinkedWalletBalanceQuery,
    GetDepositAddressQuery,
    GetTransactionsQuery,
    GetTransactionByIdQuery,
    GetAdminWithdrawalsQuery,
    GetAdminWithdrawalByIdQuery,
    GetAdminWithdrawalStatsQuery,
    GetSupportedNetworksQuery,
  ],
  exports: [
    BlockchainProviderFactory,
    LINKED_WALLET_REPOSITORY,
    ONCHAIN_TRANSACTION_REPOSITORY,
    WalletLinkingService,
    OnchainTransferService,
    DepositFxService,
  ],
})
export class BlockchainModule {}
