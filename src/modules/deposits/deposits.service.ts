import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { FiatDepositRepository } from './repositories/fiat-deposit.repository';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { WalletTransactionAction, WalletReferenceType } from '@/common/enums';
import { ConfigService } from '@nestjs/config';
import { uuidv7 } from 'uuidv7';
// @ts-ignore
const { PayOS } = require('@payos/node');

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);
  private payOS: any;

  constructor(
    private readonly fiatDepositRepo: FiatDepositRepository,
    private readonly walletsService: WalletsService,
    private readonly configService: ConfigService,
  ) {
    const clientId = this.configService.get<string>('PAYOS_CLIENT_ID');
    const apiKey = this.configService.get<string>('PAYOS_API_KEY');
    const checksumKey = this.configService.get<string>('PAYOS_CHECKSUM_KEY');
    
    if (clientId && apiKey && checksumKey) {
      this.payOS = new PayOS(clientId, apiKey, checksumKey);
      this.logger.log('PayOS SDK initialized successfully');
    } else {
      this.logger.warn('PayOS config missing (PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY). Deposit API will fail if called.');
    }
  }

  async createPaymentLink(userId: string, amount: number) {
    if (!this.payOS) throw new Error('PayOS is not configured on this server');
    
    // Generate orderCode: numeric ID that must be unique and <= 9007199254740991
    const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 10000));
    const depositId = uuidv7();
    const returnUrl = 'http://localhost:3000/success'; // in a real app this would be a deep link
    const cancelUrl = 'http://localhost:3000/cancel'; // or back to app

    const body = {
      orderCode,
      amount,
      description: 'Nap tien vao vi', // Keep short and without accent marks
      returnUrl,
      cancelUrl,
    };

    try {
      const paymentLinkRes = await this.payOS.createPaymentLink(body);
      
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
      const verifiedData = this.payOS.verifyPaymentWebhookData(webhookData);
      
      this.logger.log(`Received valid webhook data for Order ${verifiedData.orderCode} with status ${verifiedData.code}`);
      
      // If payment not successful, we don't process balance update
      // Depending on PayOS webhook structure, successful codes indicate payment passed.
      if (verifiedData.code === '00' || verifiedData.desc === 'success' || verifiedData.success) {
        
        // Find existing deposit
        const deposit = await this.fiatDepositRepo.findByOrderCode(Number(verifiedData.orderCode));
        if (!deposit || deposit.status === 'PAID') {
          return { message: 'Order already paid or not found' };
        }

        // We wrap database updates and wallet application in a single flow
        await this.fiatDepositRepo.transaction(async (manager) => {
          // Update status
          const updatedDeposit = await this.fiatDepositRepo.updateStatus(deposit.order_code, 'PAID', manager);
          
          // Credit user's wallet. Assume we drop it to a "VND" wallet, or auto convert.
          // In this system, user often trades "USDT". For now, we fund "VND" currency.
          // Note: ensuring "VND" currency object exists in the currency tables!
          // We will use 2 as an example currency ID, assuming you have seeded it.
          const VND_CURRENCY_ID = 2; 
          
          await this.walletsService.applyTransaction(deposit.user_id, {
            currencyId: VND_CURRENCY_ID,
            action: WalletTransactionAction.CREDIT,
            amount: updatedDeposit.amount,
            refType: WalletReferenceType.EXTERNAL_DEPOSIT, 
            refId: Number(updatedDeposit.order_code) // or deposit_id integer hash if needed
          });
        });
        
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
}
