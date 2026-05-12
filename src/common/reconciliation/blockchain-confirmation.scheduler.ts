import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OnchainWithdrawalService } from '@/modules/blockchain/application/use-cases/withdrawals/onchain-withdrawal.service';

/**
 * Blockchain Confirmation Scheduler
 *
 * Phase 10: On-chain Confirmation Jobs
 *
 * Runs confirmation checks at configured intervals:
 * - Withdrawal confirmations: every 1 minute
 */
@Injectable()
export class BlockchainConfirmationScheduler {
  private readonly logger = new Logger(BlockchainConfirmationScheduler.name);

  constructor(private readonly withdrawalService: OnchainWithdrawalService) {}

  /**
   * Check withdrawal confirmations every minute.
   * Settles withdrawals that have been confirmed on-chain.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async processWithdrawalConfirmations(): Promise<void> {
    const start = Date.now();
    try {
      // Clean up orphaned withdrawals (CONFIRMING but no tx_hash) first
      const orphanCount = await this.withdrawalService.cleanupOrphanConfirming();
      if (orphanCount > 0) {
        this.logger.warn(
          `[WithdrawalConfirm] Marked ${orphanCount} orphaned CONFIRMING withdrawals as FAILED (no tx_hash)`,
        );
      }

      const result = await this.withdrawalService.processConfirmingWithdrawals(100);
      const duration = Date.now() - start;

      if (result.processed > 0) {
        this.logger.log(
          `Withdrawal confirmations processed in ${duration}ms: ` +
            `total=${result.processed} completed=${result.completed} failed=${result.failed} stillConfirming=${result.stillConfirming}`,
        );
      } else {
        this.logger.debug(
          `Withdrawal confirmations check completed in ${duration}ms: no pending withdrawals`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Withdrawal confirmations check failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
