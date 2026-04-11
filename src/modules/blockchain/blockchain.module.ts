import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkedWallet } from '@/entities/linked-wallet.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { TronProvider } from './providers/tron.provider';
import { SolanaProvider } from './providers/solana.provider';
import { EthereumProvider } from './providers/ethereum.provider';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import {
  BC_TRON_MAINNET,
  BC_TRON_NILE,
  BC_TRON_SHASTA,
  BC_SOLANA_MAINNET,
  BC_SOLANA_DEVNET,
  EVM_PROVIDERS_MAP,
} from './blockchain.tokens';
import { BlockchainNetwork } from '@/common/enums';
import { EVM_CHAIN_DEFINITIONS } from '@/common/constants/evm-chain-definitions';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { WalletLinkingService } from './wallet-linking.service';
import { OnchainTransferService } from './onchain-transfer.service';
import { DepositFxService } from './deposit-fx.service';
import { BlockchainController } from './blockchain.controller';
import { WalletConnectModule } from './wallet-connect/wallet-connect.module';
import { WalletConnectController } from './wallet-connect/wallet-connect.controller';
import { WalletConnectService } from './wallet-connect/wallet-connect.service';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { ManagedWalletsModule } from '@/modules/managed-wallets/managed-wallets.module';
import { TreasuryModule } from '@/modules/treasury/treasury.module';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { SystemConfigModule } from '@/modules/system-config/system-config.module';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';

/**
 * Blockchain Module — Tron / Solana / EVM (mainnet + sandbox chains).
 */
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
          paymentSolNetwork: 'MAINNET',
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
          paymentSolNetwork: 'DEVNET',
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

    DepositFxService,
    WalletLinkingService,
    OnchainTransferService,
    WalletConnectService,
  ],
  exports: [
    BlockchainProviderFactory,
    DepositFxService,
    WalletLinkingService,
    WalletConnectService,
    OnchainTransferService,
  ],
})
export class BlockchainModule {}
