import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { BinanceExchangeService } from './binance/binance.service';
import type { ExchangeOrderParams, IExchangeProvider } from './interfaces/exchange.interface';
import { MockExchangeService } from './mock/mock-exchange.service';

@Injectable()
export class ExchangeService implements IExchangeProvider {
  private readonly logger = new Logger(ExchangeService.name);
  private readonly provider: IExchangeProvider;

  constructor(
    private readonly configService: ConfigService,
    private readonly binanceService: BinanceExchangeService,
    private readonly mockService: MockExchangeService,
  ) {
    const exchangeMode = this.configService.get<string>('app.trading.exchangeMode');

    if (exchangeMode === 'binance') {
      this.provider = this.binanceService;
      this.logger.log('Using Binance Exchange Provider');
    } else {
      this.provider = this.mockService;
      this.logger.log('Using Mock Exchange Provider');
    }
  }

  getBalance(asset: string) {
    return this.provider.getBalance(asset);
  }
  createOrder(params: ExchangeOrderParams) {
    return this.provider.createOrder(params);
  }
  cancelOrder(orderId: string, symbol: string) {
    return this.provider.cancelOrder(orderId, symbol);
  }
  getOrderStatus(orderId: string, symbol: string) {
    return this.provider.getOrderStatus(orderId, symbol);
  }
  verifyTransaction(txId: string, asset: string) {
    return this.provider.verifyTransaction(txId, asset);
  }
  createWithdrawal(asset: string, amount: Decimal, address: string) {
    return this.provider.createWithdrawal(asset, amount, address);
  }
  getName() {
    return this.provider.getName();
  }
  ping() {
    return this.provider.ping();
  }
}
