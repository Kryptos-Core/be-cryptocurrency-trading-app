import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import type { PaymentMethodType } from '@/entities/payment-method-config.entity';
import { ACTIVATE_JOB, PAYMENT_CONFIG_QUEUE, PaymentConfigService } from './payment-config.service';

interface ActivateJobData {
  configId: string;
  type: PaymentMethodType;
  network: string;
  userId: string;
}

/**
 * PaymentConfigProcessor
 * Processes delayed Bull jobs for grace-period config activation.
 * After the grace period expires: deactivate old config, activate new config,
 * publish ACTIVATED event so WebSocket fans out to all connected clients.
 */
@Processor(PAYMENT_CONFIG_QUEUE)
export class PaymentConfigProcessor {
  private readonly logger = new Logger(PaymentConfigProcessor.name);

  constructor(private readonly paymentConfigService: PaymentConfigService) {}

  @Process(ACTIVATE_JOB)
  async handleActivation(job: Job<ActivateJobData>): Promise<void> {
    const { configId, type, network, userId } = job.data;
    this.logger.log(`Processing activation job for configId=${configId} (${type}/${network})`);

    try {
      await this.paymentConfigService.completeActivation(configId, type, network, userId);
    } catch (error) {
      this.logger.error(
        `Failed to activate configId=${configId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error; // Rethrow so Bull retries
    }
  }
}
