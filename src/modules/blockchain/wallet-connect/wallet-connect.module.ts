import { Module } from '@nestjs/common';
import { WalletConnectController } from './wallet-connect.controller';
import { WalletConnectService } from './wallet-connect.service';
import { WalletLinkingService } from '../wallet-linking.service';
import { BlockchainProviderFactory } from '../blockchain-provider.factory';

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
  providers: [WalletConnectService, WalletLinkingService, BlockchainProviderFactory],
  exports: [WalletConnectService],
})
export class WalletConnectModule {}
