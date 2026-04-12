import { Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import type {
  ExchangeBalanceDto,
  ExchangeOrderParams,
  ExchangeOrderResponse,
  IExchangeProvider,
} from '../interfaces/exchange.interface';

/**
 * Mock Exchange Service
 * For testing and development without real exchange
 */
@Injectable()
export class MockExchangeService implements IExchangeProvider {
  private readonly logger = new Logger(MockExchangeService.name);

  constructor(private readonly configService: ConfigService) {}

  private mockBalance(): Decimal {
    const raw = this.configService.get<string>('app.trading.mockExchange.balance') ?? '10000';
    return new Decimal(raw);
  }

  private mockOrderStatusPrice(): Decimal {
    const raw =
      this.configService.get<string>('app.trading.mockExchange.orderStatusPrice') ?? '50000';
    return new Decimal(raw);
  }

  async getBalance(asset: string): Promise<ExchangeBalanceDto> {
    this.logger.debug(`[MOCK] Getting balance for ${asset}`);
    const total = this.mockBalance();
    return {
      available: total,
      frozen: new Decimal(0),
      total,
      currency: asset,
      timestamp: new Date(),
    };
  }

  async createOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResponse> {
    this.logger.debug(`[MOCK] Creating order:`, params);

    return {
      orderId: `mock_order_${Date.now()}`,
      symbol: params.symbol,
      status: 'FILLED',
      side: params.side,
      type: params.type,
      price: params.price || new Decimal(0),
      quantity: params.quantity,
      executedQty: params.quantity,
      timestamp: new Date(),
    };
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    this.logger.debug(`[MOCK] Canceling order ${orderId} for ${symbol}`);
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<ExchangeOrderResponse> {
    this.logger.debug(`[MOCK] Getting order status ${orderId}`);
    const price = this.mockOrderStatusPrice();
    return {
      orderId,
      symbol,
      status: 'FILLED',
      side: 'BUY',
      type: 'LIMIT',
      price,
      quantity: new Decimal(1),
      executedQty: new Decimal(1),
      timestamp: new Date(),
    };
  }

  async verifyTransaction(txId: string, asset: string): Promise<boolean> {
    this.logger.debug(`[MOCK] Verifying transaction ${txId} for ${asset}`);
    return true;
  }

  async createWithdrawal(asset: string, amount: Decimal, address: string): Promise<string> {
    this.logger.debug(`[MOCK] Creating withdrawal: ${amount} ${asset} to ${address}`);
    return `mock_withdrawal_${Date.now()}`;
  }

  getName(): string {
    return 'MockExchange';
  }

  async ping(): Promise<boolean> {
    this.logger.debug('[MOCK] Ping');
    return true;
  }
}
