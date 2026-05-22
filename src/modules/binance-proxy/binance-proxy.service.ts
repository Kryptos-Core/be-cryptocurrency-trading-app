import { Injectable, Logger } from '@nestjs/common';
import { BinanceRestClient } from '@/modules/binance-rest/binance-rest-client.service';
import { UserBinanceCredentialsService } from '@/modules/user-binance-credentials/user-binance-credentials.service';
import {
  PlaceSpotOrderDto,
  CancelSpotOrderDto,
  BinanceBalanceDto,
  BinanceOrderDto,
  BinanceSpotOrderResultDto,
  BinanceFuturesPositionDto,
  BinanceFuturesBalanceDto,
  BinanceOrderResultDto,
} from './dto';

@Injectable()
export class BinanceProxyService {
  private readonly logger = new Logger(BinanceProxyService.name);

  constructor(
    private readonly credentialsService: UserBinanceCredentialsService,
    private readonly binanceRestClient: BinanceRestClient,
  ) {}

  private getBaseUrl(testnet: boolean): string {
    return testnet ? 'https://testnet.binance.vision' : 'https://api.binance.com';
  }

  private getFuturesBaseUrl(testnet: boolean): string {
    return testnet ? 'https://testnet.binancefuture.com' : 'https://fapi.binance.com';
  }

  private async getCredentials(userId: string, credentialId: string) {
    return this.credentialsService.getDecryptedCredentials(userId, credentialId);
  }

  // ── SPOT ──────────────────────────────────────────────────────────────────

  async getSpotBalance(userId: string, credentialId: string): Promise<BinanceBalanceDto[]> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, credentialId);
    const baseUrl = this.getBaseUrl(testnet);

    const data = await this.binanceRestClient.signedRequest<{
      balances: Array<{ asset: string; free: string; locked: string }>;
    }>({
      baseUrl,
      endpoint: '/api/v3/account',
      method: 'GET',
      apiKey,
      apiSecret,
      params: {},
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 10000,
    });

    return data.balances
      .filter((b) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
      .map((b) => ({
        asset: b.asset,
        free: b.free,
        locked: b.locked,
      }));
  }

  async placeSpotOrder(userId: string, dto: PlaceSpotOrderDto): Promise<BinanceSpotOrderResultDto> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, dto.credentialId);
    const baseUrl = this.getBaseUrl(testnet);

    const params: Record<string, string | number | boolean | undefined> = {
      symbol: dto.symbol,
      side: dto.side,
      type: dto.type,
      quantity: dto.quantity,
    };

    if (dto.type === 'LIMIT' || dto.type === 'STOP_LOSS_LIMIT' || dto.type === 'TAKE_PROFIT_LIMIT') {
      params.timeInForce = dto.timeInForce ?? 'GTC';
    }
    if (dto.price !== undefined) params.price = dto.price;
    if (dto.stopPrice !== undefined) params.stopPrice = dto.stopPrice;

    const data = await this.binanceRestClient.signedRequest<BinanceSpotOrderResultDto>({
      baseUrl,
      endpoint: '/api/v3/order',
      method: 'POST',
      apiKey,
      apiSecret,
      params,
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 15000,
    });

    this.logger.log(
      `Spot order placed: user=${userId} symbol=${dto.symbol} side=${dto.side} type=${dto.type} qty=${dto.quantity}`,
    );

    return data;
  }

  async cancelSpotOrder(userId: string, dto: CancelSpotOrderDto): Promise<void> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, dto.credentialId);
    const baseUrl = this.getBaseUrl(testnet);

    await this.binanceRestClient.signedRequest({
      baseUrl,
      endpoint: '/api/v3/order',
      method: 'DELETE',
      apiKey,
      apiSecret,
      params: { symbol: dto.symbol, orderId: dto.orderId },
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 10000,
    });

    this.logger.log(`Spot order cancelled: user=${userId} orderId=${dto.orderId} symbol=${dto.symbol}`);
  }

  async getOpenOrders(
    userId: string,
    credentialId: string,
    symbol?: string,
  ): Promise<BinanceOrderDto[]> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, credentialId);
    const baseUrl = this.getBaseUrl(testnet);

    const params: Record<string, string | number | undefined> = {};
    if (symbol) params.symbol = symbol;

    return this.binanceRestClient.signedRequest({
      baseUrl,
      endpoint: '/api/v3/openOrders',
      method: 'GET',
      apiKey,
      apiSecret,
      params,
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 10000,
    });
  }

  async getOrderHistory(
    userId: string,
    credentialId: string,
    symbol?: string,
    limit: number = 50,
  ): Promise<BinanceOrderDto[]> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, credentialId);
    const baseUrl = this.getBaseUrl(testnet);

    const params: Record<string, string | number> = { limit };
    if (symbol) params.symbol = symbol;

    return this.binanceRestClient.signedRequest({
      baseUrl,
      endpoint: '/api/v3/allOrders',
      method: 'GET',
      apiKey,
      apiSecret,
      params,
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 10000,
    });
  }

  // ── FUTURES ───────────────────────────────────────────────────────────────

  async getFuturesBalance(userId: string, credentialId: string): Promise<BinanceFuturesBalanceDto[]> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, credentialId);
    const baseUrl = this.getFuturesBaseUrl(testnet);

    const data = await this.binanceRestClient.signedRequest<Array<{
      asset: string;
      walletBalance: string;
      unrealizedProfit: string;
      availableBalance: string;
    }>>({
      baseUrl,
      endpoint: '/fapi/v2/balance',
      method: 'GET',
      apiKey,
      apiSecret,
      params: {},
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 10000,
    });

    return data
      .filter((b) => parseFloat(b.walletBalance) > 0 || parseFloat(b.unrealizedProfit) !== 0)
      .map((b) => ({
        asset: b.asset,
        walletBalance: b.walletBalance,
        unrealizedProfit: b.unrealizedProfit,
        availableBalance: b.availableBalance,
      }));
  }

  async getFuturesPositions(userId: string, credentialId: string): Promise<BinanceFuturesPositionDto[]> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, credentialId);
    const baseUrl = this.getFuturesBaseUrl(testnet);

    const data = await this.binanceRestClient.signedRequest<BinanceFuturesPositionDto[]>({
      baseUrl,
      endpoint: '/fapi/v2/positionRisk',
      method: 'GET',
      apiKey,
      apiSecret,
      params: {},
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 10000,
    });

    return data.filter((p) => parseFloat(p.positionAmt) !== 0);
  }

  async placeFuturesOrder(
    userId: string,
    credentialId: string,
    dto: {
      symbol: string;
      side: string;
      positionSide?: string;
      type: string;
      quantity: string;
      price?: number;
      timeInForce?: string;
      stopPrice?: number;
      leverage?: number;
    },
  ): Promise<BinanceOrderResultDto> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, credentialId);
    const baseUrl = this.getFuturesBaseUrl(testnet);

    const params: Record<string, string | number | undefined> = {
      symbol: dto.symbol,
      side: dto.side,
      type: dto.type,
      quantity: dto.quantity,
    };

    if (dto.positionSide) params.positionSide = dto.positionSide;
    if (dto.type === 'LIMIT') {
      params.timeInForce = dto.timeInForce ?? 'GTC';
    }
    if (dto.price !== undefined) params.price = dto.price;
    if (dto.stopPrice !== undefined) params.stopPrice = dto.stopPrice;
    if (dto.leverage !== undefined) params.leverage = dto.leverage;

    const data = await this.binanceRestClient.signedRequest<BinanceOrderResultDto>({
      baseUrl,
      endpoint: '/fapi/v1/order',
      method: 'POST',
      apiKey,
      apiSecret,
      params,
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 15000,
    });

    this.logger.log(
      `Futures order placed: user=${userId} symbol=${dto.symbol} side=${dto.side} type=${dto.type} qty=${dto.quantity}`,
    );

    return data;
  }

  async cancelFuturesOrder(
    userId: string,
    credentialId: string,
    symbol: string,
    orderId: string,
  ): Promise<void> {
    const { apiKey, apiSecret, testnet } = await this.getCredentials(userId, credentialId);
    const baseUrl = this.getFuturesBaseUrl(testnet);

    await this.binanceRestClient.signedRequest({
      baseUrl,
      endpoint: '/fapi/v1/order',
      method: 'DELETE',
      apiKey,
      apiSecret,
      params: { symbol, orderId },
      timestamp: Date.now(),
      recvWindow: 60000,
      timeoutMs: 10000,
    });

    this.logger.log(`Futures order cancelled: user=${userId} orderId=${orderId} symbol=${symbol}`);
  }
}
