import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BlockchainModule } from '@/modules/blockchain/blockchain.module';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationScheduler } from './reconciliation.scheduler';
import { ReconciliationService } from './reconciliation.service';
import { BlockchainConfirmationScheduler } from './blockchain-confirmation.scheduler';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { ReadMarketOhlcv } from '@/entities/read-market-ohlcv.entity';
import { ReadMarketTrade } from '@/entities/read-market-trade.entity';
import { Wallet } from '@/entities/wallet.entity';
import { WalletLedger } from '@/entities/wallet-ledger.entity';
import { TelemetryModule } from '@/telemetry';

/**
 * Reconciliation Module
 *
 * Phase 10: Reconciliation Jobs
 *
 * Provides reconciliation checks for:
 * - Balance drift detection
 * - Trades mismatch
 * - Outbox/Kafka backlog
 * - Orderbook checksum
 * - OHLCV consistency
 * - Blockchain confirmations (withdrawals)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      IntegrationOutbox,
      ReadMarketTrade,
      ReadMarketOhlcv,
      Wallet,
      WalletLedger,
    ]),
    TelemetryModule,
    forwardRef(() => BlockchainModule),
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService, ReconciliationScheduler, BlockchainConfirmationScheduler],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
