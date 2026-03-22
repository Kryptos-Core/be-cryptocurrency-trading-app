import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkedWallet } from '@/entities/linked-wallet.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { TronProvider } from './providers/tron.provider';
import { SolanaProvider } from './providers/solana.provider';
import { EthereumProvider } from './providers/ethereum.provider';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import { WalletLinkingService } from './wallet-linking.service';
import { OnchainTransferService } from './onchain-transfer.service';
import { DepositFxService } from './deposit-fx.service';
import { BlockchainController } from './blockchain.controller';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';
import { ManagedWalletsModule } from '@/modules/managed-wallets/managed-wallets.module';
import { TreasuryModule } from '@/modules/treasury/treasury.module';
import { PaymentConfigModule } from '@/modules/payment-config/payment-config.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';

/**
 * Blockchain Module
 * Tích hợp đa chuỗi: Tron (Nile/Shasta), Solana (devnet), Ethereum (Sepolia)
 * - Providers (Strategy Pattern)
 * - Factory (Factory Pattern)
 * - Wallet Linking (Challenge-Response)
 * - On-chain Transfer (Nạp/Rút/Chuyển)
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
  ],
  controllers: [BlockchainController],
  providers: [
    // Blockchain providers (Strategy Pattern)
    TronProvider,
    SolanaProvider,
    EthereumProvider,

    // Factory (Factory Pattern)
    BlockchainProviderFactory,

    // Business logic services
    DepositFxService,
    WalletLinkingService,
    OnchainTransferService,
  ],
  exports: [
    BlockchainProviderFactory,
    DepositFxService,
    WalletLinkingService,
    OnchainTransferService,
  ],
})
export class BlockchainModule {}
