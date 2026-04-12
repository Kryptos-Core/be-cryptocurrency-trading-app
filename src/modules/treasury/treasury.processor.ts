import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { TREASURY_FUND_JOB, TREASURY_QUEUE, TREASURY_SWEEP_JOB } from './constants';
import { TreasuryOperationsService } from './treasury-operations.service';

interface TreasuryJobData {
  operationId: string;
}

@Processor(TREASURY_QUEUE)
export class TreasuryProcessor {
  private readonly logger = new Logger(TreasuryProcessor.name);

  constructor(private readonly treasuryOperationsService: TreasuryOperationsService) {}

  @Process(TREASURY_SWEEP_JOB)
  async handleSweep(job: Job<TreasuryJobData>): Promise<void> {
    try {
      await this.treasuryOperationsService.processSweepJob(job.data);
    } catch (error) {
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
      const message = (error as Error).message;
      this.logger.error(`Treasury fund job failed: operation=${job.data.operationId}, ${message}`);
      await this.treasuryOperationsService.markFailed(job.data.operationId, message);
      throw error;
    }
  }
}
