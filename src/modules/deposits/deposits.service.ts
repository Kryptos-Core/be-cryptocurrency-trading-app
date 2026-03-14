import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { FiatDepositRepository } from './repositories/fiat-deposit.repository';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { WalletTransactionAction, WalletReferenceType } from '@/common/enums';
import { ConfigService } from '@nestjs/config';
import { uuidv7 } from 'uuidv7';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { FiatDeposit } from '@/entities/fiat-deposit.entity';
// @ts-ignore
const { PayOS } = require('@payos/node');

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);
  private payOS: any;
  private readonly depositCurrencySymbol: string;

  constructor(
    private readonly fiatDepositRepo: FiatDepositRepository,
    private readonly walletsService: WalletsService,
    private readonly configService: ConfigService,
    private readonly currencyRepository: CurrencyRepository,
  ) {
    const clientId = this.configService.get<string>('PAYOS_CLIENT_ID');
    const apiKey = this.configService.get<string>('PAYOS_API_KEY');
    const checksumKey = this.configService.get<string>('PAYOS_CHECKSUM_KEY');
    
    if (clientId && apiKey && checksumKey) {
      this.payOS = new PayOS({
        clientId,
        apiKey,
        checksumKey,
      });
      this.logger.log('PayOS SDK initialized successfully');
    } else {
      this.logger.warn('PayOS config missing (PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY). Deposit API will fail if called.');
    }

    this.depositCurrencySymbol =
      this.configService
        .get<string>('PAYOS_DEPOSIT_CURRENCY_SYMBOL')
        ?.trim()
        .toUpperCase() || 'USDT';
  }

  private async resolveDepositCurrencyId(): Promise<number> {
    const currency = await this.currencyRepository.findBySymbol(
      this.depositCurrencySymbol,
    );
    if (!currency?.currency_id) {
      throw new Error(
        `Deposit currency symbol ${this.depositCurrencySymbol} not found. Configure PAYOS_DEPOSIT_CURRENCY_SYMBOL to a valid currency symbol.`,
      );
    }
    const parsedCurrencyId = Number(currency.currency_id);
    if (!Number.isInteger(parsedCurrencyId) || parsedCurrencyId <= 0) {
      throw new Error(
        `Deposit currency ID must be a positive integer, got: ${currency.currency_id}`,
      );
    }
    return parsedCurrencyId;
  }

  private async markDepositPaid(
    deposit: FiatDeposit,
    source: 'webhook' | 'manual_sync',
  ): Promise<void> {
    const depositCurrencyId = await this.resolveDepositCurrencyId();

    await this.fiatDepositRepo.transaction(async (manager) => {
      const updatedDeposit = await this.fiatDepositRepo.updateStatus(
        deposit.order_code,
        'PAID',
        manager,
      );

      await this.walletsService.applyTransaction(deposit.user_id, {
        currencyId: depositCurrencyId,
        action: WalletTransactionAction.CREDIT,
        amount: updatedDeposit.amount,
        refType: WalletReferenceType.EXTERNAL_DEPOSIT,
        refId: Number(updatedDeposit.order_code),
      });
    });

    this.logger.log(
      `Deposit ${deposit.deposit_id} marked PAID via ${source} and credited to ${this.depositCurrencySymbol} wallet`,
    );
  }

  async createPaymentLink(userId: string, amount: number) {
    if (!this.payOS) throw new Error('PayOS is not configured on this server');
    
    // Generate orderCode: numeric ID that must be unique and <= 9007199254740991
    const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 10000));
    const depositId = uuidv7();
    const returnUrl = this.configService.get<string>('PAYOS_RETURN_URL');
    const cancelUrl = this.configService.get<string>('PAYOS_CANCEL_URL');

    if (!returnUrl || !cancelUrl) {
      throw new Error('PayOS callback URLs are not configured (PAYOS_RETURN_URL, PAYOS_CANCEL_URL)');
    }

    const body = {
      orderCode,
      amount,
      description: 'Nap tien vao vi', // Keep short and without accent marks
      returnUrl,
      cancelUrl,
    };

    try {
      const paymentLinkRes = await this.payOS.paymentRequests.create(body);
      
      const deposit = await this.fiatDepositRepo.createDeposit(
        depositId,
        userId,
        String(amount),
        orderCode,
        paymentLinkRes.checkoutUrl
      );
      
      return {
        depositId: deposit.deposit_id,
        checkoutUrl: paymentLinkRes.checkoutUrl,
        orderCode: deposit.order_code,
      };
    } catch (error) {
      this.logger.error('Failed to create payment link using PayOS', error);
      throw new Error('Could not create deposit checkout context');
    }
  }

  async handleWebhook(webhookData: any) {
    if (!this.payOS) return { success: false };

    try {
      // Veryify signature
      const verifiedData = await this.payOS.webhooks.verify(webhookData);
      
      this.logger.log(`Received valid webhook data for Order ${verifiedData.orderCode} with status ${verifiedData.code}`);
      
      // If payment not successful, we don't process balance update
      // Depending on PayOS webhook structure, successful codes indicate payment passed.
      if (verifiedData.code === '00' || verifiedData.desc === 'success' || verifiedData.success) {

        // Find existing deposit
        const deposit = await this.fiatDepositRepo.findByOrderCode(Number(verifiedData.orderCode));
        if (!deposit || deposit.status === 'PAID') {
          return { message: 'Order already paid or not found' };
        }

        await this.markDepositPaid(deposit, 'webhook');
        
        return { success: true, message: 'Deposit successfully paid' };
      }

      return { success: true, message: 'Ignored due to code or status.' };
    } catch (e: any) {
      this.logger.error('Webhook signature failed or invalid handler logic', e);
      throw new ConflictException('Invalid webhook payload');
    }
  }

  async getMyDeposits(userId: string) {
    return this.fiatDepositRepo.findByUser(userId);
  }

  async syncPaymentStatusForUser(userId: string, orderCode: number) {
    if (!this.payOS) {
      throw new Error('PayOS is not configured on this server');
    }

    const deposit = await this.fiatDepositRepo.findByOrderCode(orderCode);
    if (!deposit || deposit.user_id !== userId) {
      throw new NotFoundException('Deposit not found for this order code');
    }

    if (deposit.status === 'PAID') {
      return {
        orderCode,
        localStatus: deposit.status,
        payosStatus: 'PAID',
        updated: false,
      };
    }

    const paymentLink = await this.payOS.paymentRequests.get(orderCode);
    const payosStatus = String(paymentLink?.status || 'PENDING').toUpperCase();

    if (payosStatus === 'PAID') {
      await this.markDepositPaid(deposit, 'manual_sync');

      return {
        orderCode,
        localStatus: 'PAID',
        payosStatus,
        updated: true,
      };
    }

    if (payosStatus === 'CANCELLED' || payosStatus === 'EXPIRED' || payosStatus === 'FAILED') {
      await this.fiatDepositRepo.updateStatus(orderCode, 'CANCELLED');
      return {
        orderCode,
        localStatus: 'CANCELLED',
        payosStatus,
        updated: true,
      };
    }

    return {
      orderCode,
      localStatus: deposit.status,
      payosStatus,
      updated: false,
    };
  }
}
