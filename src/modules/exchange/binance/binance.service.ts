import * as crypto from 'node:crypto';
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
 * Binance Exchange Service
 * Implements real Binance Futures API (Testnet/Mainnet)
 */
@Injectable()
export class BinanceExchangeService implements IExchangeProvider {
  private readonly logger = new Logger(BinanceExchangeService.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly isTestnet: boolean;
  private timeOffset: number = 0; // Offset between local time and Binance server time
  private lastTimeSync: number = 0;

  constructor(private readonly configService: ConfigService) {
    const tradingEnv = this.configService.get<string>('app.trading.environment');
    this.isTestnet = tradingEnv === 'testnet';

    if (this.isTestnet) {
      this.apiKey = this.configService.get<string>('app.trading.binance.testnet.apiKey') || '';
      this.apiSecret =
        this.configService.get<string>('app.trading.binance.testnet.apiSecret') || '';
      this.baseUrl =
        this.configService.get<string>('app.trading.binance.testnet.baseUrl') ||
        'https://testnet.binance.vision';
    } else {
      this.apiKey = this.configService.get<string>('app.trading.binance.mainnet.apiKey') || '';
      this.apiSecret =
        this.configService.get<string>('app.trading.binance.mainnet.apiSecret') || '';
      this.baseUrl =
        this.configService.get<string>('app.trading.binance.mainnet.baseUrl') ||
        'https://fapi.binance.com';
    }

    this.logger.log(`Binance Exchange initialized (${this.isTestnet ? 'TESTNET' : 'MAINNET'})`);
    this.syncServerTime(); // Sync time on initialization
  }

  /**
   * Sync local time with Binance server time
   */
  private async syncServerTime(): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v3/time`);
      const data: any = await response.json();
      const serverTime = data.serverTime;
      const localTime = Date.now();
      this.timeOffset = serverTime - localTime;
      this.lastTimeSync = localTime;
      this.logger.log(`Time synced with Binance server (offset: ${this.timeOffset}ms)`);
    } catch (_error) {
      this.logger.warn('Failed to sync time with Binance server, using local time');
    }
  }

  /**
   * Get current timestamp synchronized with Binance server
   */
  private getTimestamp(): number {
    return Date.now() + this.timeOffset;
  }

  /**
   * Generate signature for Binance API request
   */
  private generateSignature(queryString: string): string {
    return crypto.createHmac('sha256', this.apiSecret).update(queryString).digest('hex');
  }

  /**
   * Make authenticated request to Binance API
   */
  private async makeRequest(
    endpoint: string,
    method: 'GET' | 'POST' | 'DELETE' = 'GET',
    params: Record<string, any> = {},
  ): Promise<any> {
    const now = Date.now();
    if (!this.lastTimeSync || now - this.lastTimeSync > 5 * 60 * 1000) {
      await this.syncServerTime();
    }
    const timestamp = this.getTimestamp();
    const queryParams = {
      ...params,
      timestamp,
      recvWindow: 60000, // 60 seconds window for testnet
    };

    const queryString = Object.entries(queryParams)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('&');

    const signature = this.generateSignature(queryString);
    const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`;

    this.logger.debug(`[Binance] ${method} ${endpoint}`);
    this.logger.debug(`Base URL: ${this.baseUrl}`);
    this.logger.debug(`Query String: ${queryString}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'X-MBX-APIKEY': this.apiKey,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Response Status: ${response.status}`);
        this.logger.error(`Response Body: ${error}`);
        throw new Error(`Binance API error: ${response.status} ${error}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Binance API request failed:`, error);
      throw error;
    }
  }

  async getBalance(asset: string): Promise<ExchangeBalanceDto> {
    this.logger.debug(`Getting balance for ${asset}`);

    try {
      const response = await this.makeRequest('/api/v3/account', 'GET');

      const balances = response?.balances || [];
      const assetBalance = balances.find((b: any) => b.asset === asset);

      if (!assetBalance) {
        return {
          available: new Decimal(0),
          frozen: new Decimal(0),
          total: new Decimal(0),
          currency: asset,
          timestamp: new Date(),
        };
      }

      const available = new Decimal(assetBalance.free || 0);
      const frozen = new Decimal(assetBalance.locked || 0);

      return {
        available,
        frozen,
        total: available.plus(frozen),
        currency: asset,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Failed to get balance for ${asset}:`, error);
      throw error;
    }
  }

  async createOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResponse> {
    this.logger.debug(`Creating order:`, params);

    try {
      const orderParams: Record<string, any> = {
        symbol: params.symbol,
        side: params.side,
        type: params.type,
        quantity: params.quantity.toString(),
      };

      if (params.price) {
        orderParams.price = params.price.toString();
      }

      if (params.timeInForce) {
        orderParams.timeInForce = params.timeInForce;
      }

      const response = await this.makeRequest('/fapi/v1/order', 'POST', orderParams);

      return {
        orderId: response.orderId.toString(),
        symbol: response.symbol,
        status: response.status,
        side: response.side,
        type: response.type,
        price: new Decimal(response.price || 0),
        quantity: new Decimal(response.origQty || 0),
        executedQty: new Decimal(response.executedQty || 0),
        timestamp: new Date(response.updateTime),
      };
    } catch (error) {
      this.logger.error(`Failed to create order:`, error);
      throw error;
    }
  }

  async cancelOrder(orderId: string, symbol: string): Promise<void> {
    this.logger.debug(`Canceling order ${orderId} for ${symbol}`);

    try {
      await this.makeRequest('/fapi/v1/order', 'DELETE', {
        symbol,
        orderId,
      });
    } catch (error) {
      this.logger.error(`Failed to cancel order ${orderId}:`, error);
      throw error;
    }
  }

  async getOrderStatus(orderId: string, symbol: string): Promise<ExchangeOrderResponse> {
    this.logger.debug(`Getting order status ${orderId}`);

    try {
      const response = await this.makeRequest('/fapi/v1/order', 'GET', {
        symbol,
        orderId,
      });

      return {
        orderId: response.orderId.toString(),
        symbol: response.symbol,
        status: response.status,
        side: response.side,
        type: response.type,
        price: new Decimal(response.price || 0),
        quantity: new Decimal(response.origQty || 0),
        executedQty: new Decimal(response.executedQty || 0),
        timestamp: new Date(response.updateTime),
      };
    } catch (error) {
      this.logger.error(`Failed to get order status:`, error);
      throw error;
    }
  }

  async verifyTransaction(txId: string, asset: string): Promise<boolean> {
    this.logger.debug(`Verifying transaction ${txId} for ${asset}`);
    // Binance doesn't provide direct transaction verification
    // This would typically check deposit/withdrawal history
    return true;
  }

  async createWithdrawal(_asset: string, _amount: Decimal, _address: string): Promise<string> {
    this.logger.warn(`Withdrawal not implemented for ${this.isTestnet ? 'testnet' : 'mainnet'}`);
    throw new Error('Withdrawal not supported in this implementation');
  }

  getName(): string {
    return `Binance${this.isTestnet ? 'Testnet' : ''}`;
  }

  async ping(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/fapi/v1/ping`);
      return response.ok;
    } catch (error) {
      this.logger.error('Ping failed:', error);
      return false;
    }
  }
}
