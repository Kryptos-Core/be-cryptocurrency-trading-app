import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LinkedWallet } from '@/entities/linked-wallet.entity';
import { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import { TronProvider } from './providers/tron.provider';
import { SolanaProvider } from './providers/solana.provider';
import { EthereumProvider } from './providers/ethereum.provider';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import { WalletLinkingService } from './wallet-linking.service';
import { OnchainTransferService } from './onchain-transfer.service';
import { BlockchainController } from './blockchain.controller';
import { WalletsModule } from '@/modules/wallets/wallets.module';
import { CurrenciesModule } from '@/modules/currencies/currencies.module';

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
    WalletLinkingService,
    OnchainTransferService,
  ],
  exports: [
    BlockchainProviderFactory,
    WalletLinkingService,
    OnchainTransferService,
  ],
})
export class BlockchainModule {}
