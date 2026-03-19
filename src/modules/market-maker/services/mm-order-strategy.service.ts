import { Injectable } from '@nestjs/common';
import { CacheService } from '@/common/services';
import { BusinessException } from '@/common/exceptions';
import { MarketsService } from '@/modules/markets/markets.service';
import { OrdersService } from '@/modules/orders/orders.service';
import { MarketMakerConfig } from '@/entities/market-maker-config.entity';

interface RedisTickerPayload {
  last_price?: string;
  bid?: string;
  ask?: string;
}

@Injectable()
export class MmOrderStrategyService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly marketsService: MarketsService,
    private readonly ordersService: OrdersService,
  ) {}

  async placeMakerOrders(params: {
    userId: string;
    pairId: string;
    config: MarketMakerConfig;
    orderAmountOverride?: string;
  }) {
    const { userId, pairId, config, orderAmountOverride } = params;

    const pair = await this.marketsService.findOne(pairId);
    const midPrice = await this.resolveMidPrice(pair.symbol, pairId);
    if (midPrice <= 0) {
      throw new BusinessException('Cannot determine market mid price', 'MM_PRICE_UNAVAILABLE');
    }

    const spreadFraction = config.spread_bps / 10000;
    const buyPrice = this.roundByScale(midPrice * (1 - spreadFraction / 2), pair.price_scale);
    const sellPrice = this.roundByScale(midPrice * (1 + spreadFraction / 2), pair.price_scale);

    if (buyPrice <= 0 || sellPrice <= 0 || buyPrice >= sellPrice) {
      throw new BusinessException('Invalid spread configuration for current market price', 'MM_INVALID_SPREAD');
    }

    const amount = (orderAmountOverride ?? config.order_amount).trim();
    const now = Date.now();

    const result = await this.ordersService.createBatch({
      userId,
      dto: {
        orders: [
          {
            pairId,
            side: 'BUY',
            type: 'LIMIT',
            price: this.toFixedNoSci(buyPrice, pair.price_scale),
            amount,
            timeInForce: 'GTC',
            idempotencyKey: `mm:${pairId}:${now}:buy`,
          },
          {
            pairId,
            side: 'SELL',
            type: 'LIMIT',
            price: this.toFixedNoSci(sellPrice, pair.price_scale),
            amount,
            timeInForce: 'GTC',
            idempotencyKey: `mm:${pairId}:${now}:sell`,
          },
        ],
      },
    });

    return {
      pairId,
      symbol: pair.symbol,
      spreadBps: config.spread_bps,
      midPrice: this.toFixedNoSci(midPrice, pair.price_scale),
      buyPrice: this.toFixedNoSci(buyPrice, pair.price_scale),
      sellPrice: this.toFixedNoSci(sellPrice, pair.price_scale),
      ...result,
    };
  }

  private async resolveMidPrice(symbol: string, pairId: string): Promise<number> {
    const normalizedSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const redisKey = `price:${normalizedSymbol}:latest`;

    const redisTicker = await this.cacheService.get<RedisTickerPayload>(redisKey);
    const fromRedis = this.midPriceFromTicker(redisTicker ?? null);
    if (fromRedis > 0) {
      return fromRedis;
    }

    const ticker = await this.marketsService.getTicker(pairId);
    const bid = Number.parseFloat(ticker.bestBid ?? '0');
    const ask = Number.parseFloat(ticker.bestAsk ?? '0');
    if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
      return (bid + ask) / 2;
    }

    const lastPrice = Number.parseFloat(ticker.lastPrice ?? '0');
    return Number.isFinite(lastPrice) ? lastPrice : 0;
  }

  private midPriceFromTicker(ticker: RedisTickerPayload | null): number {
    if (!ticker) return 0;

    const bid = Number.parseFloat(ticker.bid ?? '0');
    const ask = Number.parseFloat(ticker.ask ?? '0');
    if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
      return (bid + ask) / 2;
    }

    const last = Number.parseFloat(ticker.last_price ?? '0');
    return Number.isFinite(last) ? last : 0;
  }

  private roundByScale(value: number, scale: number): number {
    const factor = 10 ** Math.max(0, scale);
    return Math.round(value * factor) / factor;
  }

  private toFixedNoSci(value: number, scale: number): string {
    return value.toFixed(Math.max(0, scale));
  }
}
