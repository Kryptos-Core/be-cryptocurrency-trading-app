import { Process, Processor } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { BlockchainNetwork } from '@/common/enums';
import {
  DEPOSIT_WATCHER_EVM_SCAN_JOB,
  DEPOSIT_WATCHER_QUEUE,
  DEPOSIT_WATCHER_TRON_SCAN_JOB,
} from './deposit-watcher.constants';
import { EvmDepositObserverService } from './evm-deposit-observer.service';
import { TronDepositObserverService } from './tron-deposit-observer.service';

@Injectable()
@Processor(DEPOSIT_WATCHER_QUEUE)
export class DepositWatcherProcessor {
  private readonly logger = new Logger(DepositWatcherProcessor.name);

  constructor(
    private readonly tronObserver: TronDepositObserverService,
    private readonly evmObserver: EvmDepositObserverService,
  ) {}

  @Process(DEPOSIT_WATCHER_TRON_SCAN_JOB)
  async handleTronScan(job: Job<{ chain: BlockchainNetwork }>): Promise<void> {
    this.logger.log(
      JSON.stringify({
        domain: 'treasury',
        event: 'deposit.watcher.job.tron',
        chain: job.data.chain,
        jobId: job.id,
      }),
    );
    await this.tronObserver.scanChain(job.data.chain);
  }

  @Process(DEPOSIT_WATCHER_EVM_SCAN_JOB)
  async handleEvmScan(job: Job<{ chain: BlockchainNetwork }>): Promise<void> {
    this.logger.log(
      JSON.stringify({
        domain: 'treasury',
        event: 'deposit.watcher.job.evm',
        chain: job.data.chain,
        jobId: job.id,
      }),
    );
    await this.evmObserver.scanChain(job.data.chain);
  }
}
