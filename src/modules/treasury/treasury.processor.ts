import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { BusinessException, TreasuryWalletBusyException } from '@/common/exceptions';
import {
  TREASURY_CONFIRM_JOB,
  TREASURY_FUND_JOB,
  TREASURY_QUEUE,
  TREASURY_SWEEP_JOB,
} from './constants';
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

  private async handleTreasuryError(
    job: Job<TreasuryJobData>,
    error: unknown,
    label: string,
  ): Promise<void> {
    if (this.isTreasuryDuplicateJobAfterTerminalState(error)) {
      this.logger.debug(
        `Treasury ${label} job skipped (already terminal): operation=${job.data.operationId}, ${(error as Error).message}`,
      );
      return;
    }

    if (error instanceof TreasuryWalletBusyException) {
      throw error;
    }

    if (error instanceof BusinessException && error.code === 'TREASURY_WALLET_BUSY_TIMEOUT') {
      await this.treasuryOperationsService.markFailed(job.data.operationId, error.message);
      throw error;
    }

    const message = (error as Error).message;
    this.logger.error(
      `Treasury ${label} job failed: operation=${job.data.operationId}, ${message}`,
    );
    await this.treasuryOperationsService.markFailed(job.data.operationId, message);
    throw error;
  }

  @Process(TREASURY_SWEEP_JOB)
  async handleSweep(job: Job<TreasuryJobData>): Promise<void> {
    try {
      await this.treasuryOperationsService.processSweepJob(job.data);
    } catch (error) {
      await this.handleTreasuryError(job, error, 'sweep');
    }
  }

  @Process(TREASURY_FUND_JOB)
  async handleFund(job: Job<TreasuryJobData>): Promise<void> {
    try {
      await this.treasuryOperationsService.processFundJob(job.data);
    } catch (error) {
      await this.handleTreasuryError(job, error, 'fund');
    }
  }

  @Process(TREASURY_CONFIRM_JOB)
  async handleConfirm(job: Job<TreasuryJobData>): Promise<void> {
    try {
      await this.treasuryOperationsService.processTreasuryConfirmJob(job.data as never);
    } catch (error) {
      if (this.isTreasuryDuplicateJobAfterTerminalState(error)) {
        this.logger.debug(
          `Treasury confirm job skipped (already terminal): operation=${job.data.operationId}`,
        );
        return;
      }
      const message = (error as Error).message;
      this.logger.error(
        `Treasury confirm job failed: operation=${job.data.operationId}, ${message}`,
      );
      // Don't mark failed here — confirm job retries on its own; let Bull exhaust attempts first.
      throw error;
    }
  }
}
