import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { BusinessException } from '@/common/exceptions';
import { TREASURY_FUND_JOB, TREASURY_QUEUE, TREASURY_SWEEP_JOB } from './constants';
import { TreasuryOperationsService } from './treasury-operations.service';

interface TreasuryJobData {
  operationId: string;
}

@Processor(TREASURY_QUEUE)
export class TreasuryProcessor {
  private readonly logger = new Logger(TreasuryProcessor.name);

  constructor(private readonly treasuryOperationsService: TreasuryOperationsService) {}

  /**
   * Duplicate Bull attempts after a terminal DB state must not call markFailed — that would
   * overwrite COMPLETED with FAILED. Only real chain/send failures should markFailed.
   */
  private isTreasuryDuplicateJobAfterTerminalState(error: unknown): boolean {
    return error instanceof BusinessException && error.code === 'TREASURY_OPERATION_INVALID_STATUS';
  }

  @Process(TREASURY_SWEEP_JOB)
  async handleSweep(job: Job<TreasuryJobData>): Promise<void> {
    try {
      await this.treasuryOperationsService.processSweepJob(job.data);
    } catch (error) {
      if (this.isTreasuryDuplicateJobAfterTerminalState(error)) {
        this.logger.debug(
          `Treasury sweep job skipped (already terminal): operation=${job.data.operationId}, ${(error as Error).message}`,
        );
        return;
      }
      const message = (error as Error).message;
      this.logger.error(`Treasury sweep job failed: operation=${job.data.operationId}, ${message}`);
      await this.treasuryOperationsService.markFailed(job.data.operationId, message);
      throw error;
    }
  }

  @Process(TREASURY_FUND_JOB)
  async handleFund(job: Job<TreasuryJobData>): Promise<void> {
    try {
      await this.treasuryOperationsService.processFundJob(job.data);
    } catch (error) {
      if (this.isTreasuryDuplicateJobAfterTerminalState(error)) {
        this.logger.debug(
          `Treasury fund job skipped (already terminal): operation=${job.data.operationId}, ${(error as Error).message}`,
        );
        return;
      }
      const message = (error as Error).message;
      this.logger.error(`Treasury fund job failed: operation=${job.data.operationId}, ${message}`);
      await this.treasuryOperationsService.markFailed(job.data.operationId, message);
      throw error;
    }
  }
}
