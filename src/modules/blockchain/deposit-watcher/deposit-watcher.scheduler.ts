import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import type { Queue } from 'bull';
import {
  DEPOSIT_WATCHER_EVM_SCAN_JOB,
  DEPOSIT_WATCHER_QUEUE,
  DEPOSIT_WATCHER_TRON_SCAN_JOB,
} from './deposit-watcher.constants';
import { DepositWatcherConfigService } from './deposit-watcher-config.service';

/**
 * Enqueues deposit watcher jobs (Bull). Actual RPC work runs in [DepositWatcherProcessor]
 * so scans are serialized per worker and can be retried.
 */
@Injectable()
export class DepositWatcherScheduler {
  private readonly logger = new Logger(DepositWatcherScheduler.name);
  private lastBurstAt = 0;

  constructor(
    @InjectQueue(DEPOSIT_WATCHER_QUEUE) private readonly queue: Queue,
    private readonly cfg: DepositWatcherConfigService,
  ) {}

  @Interval(5000)
  async enqueueWatcherJobs(): Promise<void> {
    if (!(await this.cfg.isGloballyEnabled())) return;

    const interval = await this.cfg.getPollIntervalMs();
    const now = Date.now();
    if (now - this.lastBurstAt < interval) return;
    this.lastBurstAt = now;

    const tronChains = await this.cfg.enabledTronChains();
    const evmChains = await this.cfg.enabledEvmChains();

    for (const chain of tronChains) {
      await this.queue.add(DEPOSIT_WATCHER_TRON_SCAN_JOB, { chain }, { removeOnComplete: 100 });
    }
    for (const chain of evmChains) {
      await this.queue.add(DEPOSIT_WATCHER_EVM_SCAN_JOB, { chain }, { removeOnComplete: 100 });
    }

    if (tronChains.length || evmChains.length) {
      this.logger.debug(
        JSON.stringify({
          domain: 'treasury',
          event: 'deposit.watcher.enqueue',
          tron: tronChains,
          evm: evmChains,
        }),
      );
    }
  }
}
