import { Module } from '@nestjs/common';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';
import { WalletLinkingService } from '../application/use-cases/wallet-linking/wallet-linking.service';
import { WalletConnectController } from './wallet-connect.controller';
import { WalletConnectService } from './wallet-connect.service';
import { WalletConnectSessionManager } from './wallet-connect-session-manager.service';

/**
 * WalletConnectModule
 *
 * Cung cap WalletConnectService cho BlockchainModule.
 * Imports WalletLinkingService de tai dung verify logic.
 *
 * Pattern: Feature Module voi single responsibility
 */
@Module({
  controllers: [WalletConnectController],
  providers: [
    WalletConnectSessionManager,
    WalletConnectService,
    WalletLinkingService,
    BlockchainProviderFactory,
  ],
  exports: [WalletConnectService],
})
export class WalletConnectModule {}
