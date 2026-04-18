import { BusinessException } from '@/common/exceptions';
import { computeMarketBuyMaxQuoteReserve } from '@/modules/orders/utils/market-buy-reserve.util';
import type { PreparedCreateOrderContext } from './order-reserve-policy.types';

export class OrderReservePolicy {
  prepare(params: {
    dto: {
      side: 'BUY' | 'SELL';
      type: 'LIMIT' | 'MARKET';
      amount: string;
      price?: string;
      slippageTolerance?: string;
      timeInForce?: string;
      pairId: string;
    };
    pair: {
      min_order_amount?: string | null;
      amount_scale?: number | string | null;
      price_scale?: number | string | null;
    };
    availableQuote: string;
    availableBase: string;
    bestLimitSellPrice?: string | null;
  }): PreparedCreateOrderContext {
    const { dto, pair, availableQuote, availableBase, bestLimitSellPrice } = params;

    let requiredQuoteForBuy: string | undefined;
    let slippageTolerance: string | null = null;
    let marketBuyReservedQuote: string | null = null;

    if (dto.type === 'MARKET' && dto.side === 'BUY') {
      const slippage = dto.slippageTolerance?.trim() ?? '';
      if (!slippage) {
        throw new BusinessException(
          'slippageTolerance is required for MARKET BUY orders',
          'INVALID_INPUT',
        );
      }
      if (!bestLimitSellPrice) {
        throw new BusinessException('No sell-side limit liquidity for this pair', 'NO_LIQUIDITY');
      }

      const reservedQuote = computeMarketBuyMaxQuoteReserve(
        bestLimitSellPrice,
        dto.amount,
        slippage,
      );
      requiredQuoteForBuy = reservedQuote;
      marketBuyReservedQuote = reservedQuote;
      slippageTolerance = slippage;
    } else if (dto.type === 'MARKET') {
      const tol = dto.slippageTolerance?.trim();
      if (tol) {
        slippageTolerance = tol;
      }
    }

    return {
      validationContext: {
        pairId: dto.pairId,
        side: dto.side,
        type: dto.type,
        amount: dto.amount,
        price: dto.type === 'LIMIT' ? dto.price : undefined,
        timeInForce: dto.timeInForce,
        minOrderAmount: pair.min_order_amount ?? '0.0001',
        availableBalance: dto.side === 'BUY' ? availableQuote : availableBase,
        ...(requiredQuoteForBuy == null ? {} : { requiredQuoteForBuy }),
        amountScale: Number(pair.amount_scale ?? 18),
        priceScale: Number(pair.price_scale ?? 18),
      },
      slippageTolerance,
      marketBuyReservedQuote,
    };
  }
}
