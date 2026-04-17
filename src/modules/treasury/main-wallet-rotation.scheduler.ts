import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@/common/services/redis.service';
import { withDistributedLock } from '@/common/utils/redis-distributed-lock';
import type { TreasuryMainWalletRecord } from '@/modules/treasury';
import {
  TREASURY_MAIN_WALLET_EVENTS_CHANNEL,
  TreasuryMainWalletService,
} from './treasury-main-wallet.service';

const ROTATION_LOCK_KEY = 'treasury:main_wallet_rotation:lock';
/** 3 h TTL — daily job shouldn't run more than a few minutes, but gives ample safety margin */
const ROTATION_LOCK_TTL_SECONDS = 10_800;

/**
 * MainWalletRotationScheduler
 *
 * Strategy Pattern: rotation triggered by schedule, uses TreasuryMainWalletService for state.
 * Template Method: checkAndRotate() defines the algorithm steps.
 *
 * Rotation logic:
 *  - Runs daily at 02:00 UTC
 *  - For each default ACTIVE main wallet that's due for rotation (based on last_rotated_at and
 *    rotation_interval_days), marks the wallet as rotated and emits a Redis event.
 *  - NOTE: Actual "create new wallet" is intentionally out-of-scope for auto-rotation:
 *    private keys cannot be generated with no operator involvement for security reasons.
 *    Instead, rotation = marking `last_rotated_at` and alerting operators to import a fresh key.
 *    The goal is to enforce a discipline of periodic key rotation via notifications.
 *
 * To enable full automated key rotation in the future:
 *   - Store a pool of pre-approved wallet keys
 *   - Scheduler rotates by setting a pool wallet as the new default
 *
 * Distributed lock: prevents duplicate rotation across multiple API instances.
 */
@Injectable()
export class MainWalletRotationScheduler {
  private readonly logger = new Logger(MainWalletRotationScheduler.name);

  /**
   * Default rotation interval (days) when no per-wallet `rotation_interval_days` is set.
   * Can be overridden by app setting: KEY=treasury.rotation_interval_days
   */
  private readonly DEFAULT_ROTATION_DAYS = 30;

  constructor(
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Runs daily at 02:00 UTC.
   * Using @Cron instead of setInterval for testability and observability.
   */
  @Cron('0 2 * * *', { name: 'treasury-main-wallet-rotation', timeZone: 'UTC' })
  async checkAndRotate(): Promise<void> {
    await withDistributedLock(
      this.redisService,
      {
        lockKey: ROTATION_LOCK_KEY,
        ttlSeconds: ROTATION_LOCK_TTL_SECONDS,
        callerName: MainWalletRotationScheduler.name,
      },
      () => this.doRotation(),
      this.logger,
    ).catch((err: Error) => {
      this.logger.error(`[RotationScheduler] Unexpected error in checkAndRotate: ${err.message}`);
    });
  }

  private async doRotation(): Promise<void> {
    const globalIntervalDays = this.resolveGlobalIntervalDays();

    this.logger.log(
      `[RotationScheduler] Running rotation check (globalIntervalDays=${globalIntervalDays})`,
    );

    let dueMallets: TreasuryMainWalletRecord[];
    try {
      dueMallets =
        await this.treasuryMainWalletService.getWalletsDueForRotation(globalIntervalDays);
    } catch (err) {
      this.logger.error(`[RotationScheduler] Failed to query wallets due for rotation`, err);
      return;
    }

    if (dueMallets.length === 0) {
      this.logger.log('[RotationScheduler] No wallets due for rotation today.');
      return;
    }

    for (const wallet of dueMallets) {
      try {
        this.logger.warn(
          `[RotationScheduler] Main wallet ${wallet.main_wallet_id} (chain=${wallet.chain}, address=${wallet.address}) is due for rotation. ` +
            `Marking rotated and notifying operators.`,
        );

        // Mark last_rotated_at so the scheduler doesn't re-alert until the next interval
        await this.treasuryMainWalletService.markRotated(wallet.main_wallet_id);

        // Publish rotation-due event for admin dashboard / notification handler
        await this.redisService.publish(
          TREASURY_MAIN_WALLET_EVENTS_CHANNEL,
          JSON.stringify({
            event: 'main_wallet.rotation_due',
            payload: {
              mainWalletId: wallet.main_wallet_id,
              chain: wallet.chain,
              address: wallet.address,
              rotationIntervalDays: wallet.rotation_interval_days ?? globalIntervalDays,
              lastRotatedAt: wallet.last_rotated_at?.toISOString() ?? null,
            },
            timestamp: new Date().toISOString(),
          }),
        );

        this.logger.log(
          `[RotationScheduler] Rotation event published for ${wallet.main_wallet_id}. ` +
            `Operator must import a new key via POST /treasury/main-wallets.`,
        );
      } catch (err) {
        this.logger.error(
          `[RotationScheduler] Failed to process rotation for wallet ${wallet.main_wallet_id}`,
          err,
        );
      }
    }
  }

  private resolveGlobalIntervalDays(): number {
    const fromConfig = this.configService.get<number>('TREASURY_ROTATION_INTERVAL_DAYS');
    if (fromConfig && Number.isFinite(fromConfig) && fromConfig > 0) {
      return fromConfig;
    }
    return this.DEFAULT_ROTATION_DAYS;
  }
}
