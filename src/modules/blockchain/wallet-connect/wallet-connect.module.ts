import { Module } from '@nestjs/common';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';
import { WalletLinkingService } from '../wallet-linking.service';
import { WalletConnectController } from './wallet-connect.controller';
import { WalletConnectSessionManager } from './wallet-connect-session-manager.service';
import { WalletConnectService } from './wallet-connect.service';

/**
 * WalletConnectModule
 *
 * Cung cấp WalletConnectService cho BlockchainModule.
 * Imports WalletLinkingService để tái dụng verify logic.
 *
 * Pattern: Feature Module với single responsibility
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
