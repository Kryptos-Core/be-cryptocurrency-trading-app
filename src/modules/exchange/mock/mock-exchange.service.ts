import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  IExchangeProvider,
  ExchangeBalanceDto,
  ExchangeOrderParams,
  ExchangeOrderResponse,
} from '../interfaces/exchange.interface';

/**
 * Mock Exchange Service
 * For testing and development without real exchange
 */
@Injectable()
export class MockExchangeService implements IExchangeProvider {
  private readonly logger = new Logger(MockExchangeService.name);

  async getBalance(asset: string): Promise<ExchangeBalanceDto> {
    this.logger.debug(`[MOCK] Getting balance for ${asset}`);
    
    return {
      available: new Decimal(10000),
      frozen: new Decimal(0),
      total: new Decimal(10000),
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
    
    return {
      orderId,
      symbol,
      status: 'FILLED',
      side: 'BUY',
      type: 'LIMIT',
      price: new Decimal(50000),
      quantity: new Decimal(1),
      executedQty: new Decimal(1),
      timestamp: new Date(),
    };
  }

  async verifyTransaction(txId: string, asset: string): Promise<boolean> {
    this.logger.debug(`[MOCK] Verifying transaction ${txId} for ${asset}`);
    return true;
  }

  async createWithdrawal(
    asset: string,
    amount: Decimal,
    address: string,
  ): Promise<string> {
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
