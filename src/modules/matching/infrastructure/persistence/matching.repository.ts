import { Injectable, Logger } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { newUuid } from '@/common/utils/uuid.util';
import type { MatchingRepositoryPort, TradeExecuteResult } from '../../domain/ports';
import type { OrderBookOrder } from '../../interfaces';

type OrderRow = {
  order_id: string;
  pair_id: string;
  user_id: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  time_in_force: string;
  price: string | null;
  amount: string;
  filled_amount: string;
  status: string;
  reserved_quote: string;
  reserved_base: string;
  slippage_tolerance: string | null;
  created_at: Date;
};

type PairRow = {
  base_currency_id: string;
  quote_currency_id: string;
};

type WalletRow = {
  wallet_id: string;
  available: string;
  frozen: string;
};

function numeric(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

@Injectable()
export class MatchingRepository implements MatchingRepositoryPort {
  private readonly logger = new Logger(MatchingRepository.name);

  constructor(private readonly dataSource: DataSource) {}

  async getOpenOrdersForPair(pairId: string, side: 'BUY' | 'SELL'): Promise<OrderBookOrder[]> {
    const rows = await this.dataSource.query(
      `SELECT order_id, user_id, pair_id, side, type, price, amount, filled_amount,
              status, time_in_force, reserved_quote, reserved_base,
              slippage_tolerance, created_at
       FROM orders
       WHERE pair_id = $1 AND side = $2 AND status IN ('OPEN', 'PARTIAL')
       ORDER BY
         CASE WHEN $2 = 'BUY' THEN price END DESC,
         CASE WHEN $2 = 'SELL' THEN price END ASC,
         created_at ASC`,
      [pairId, side],
    );
    return (rows ?? []).map((row: OrderRow) => this.mapRowToOrderBookOrder(row));
  }

  async executeTrade(params: {
    pairId: string;
    makerOrderId: string;
    takerOrderId: string;
    price: string;
    amount: string;
    feeCurrencyId: string;
    takerFee: string;
    makerFee: string;
  }): Promise<TradeExecuteResult> {
    return this.dataSource.transaction(async (manager) => {
      if (numeric(params.amount) <= 0 || numeric(params.price) <= 0) {
        return {
          trade_id: null,
          error_code: 'INVALID_TRADE_INPUT',
          error_message: 'Trade amount and price must be positive',
        };
      }

      const maker = await this.findOrderForUpdate(manager, params.makerOrderId);
      const taker = await this.findOrderForUpdate(manager, params.takerOrderId);
      if (!maker || !taker) {
        return {
          trade_id: null,
          error_code: 'ORDER_NOT_FOUND',
          error_message: 'Maker or taker order not found',
        };
      }

      const makerRemaining = numeric(maker.amount) - numeric(maker.filled_amount);
      const takerRemaining = numeric(taker.amount) - numeric(taker.filled_amount);
      const amount = numeric(params.amount);
      const price = numeric(params.price);
      const quoteDelta = amount * price;

      if (makerRemaining <= 0 || takerRemaining <= 0) {
        return {
          trade_id: null,
          error_code: 'ORDER_NOT_OPEN',
          error_message: 'Maker or taker order has no remaining quantity',
        };
      }
      if (amount > makerRemaining || amount > takerRemaining) {
        return {
          trade_id: null,
          error_code: 'OVERFILL_ATTEMPT',
          error_message: 'Requested fill amount exceeds current DB remaining',
        };
      }

      const pair = await this.findPair(manager, params.pairId);
      if (!pair) {
        return {
          trade_id: null,
          error_code: 'PAIR_NOT_FOUND',
          error_message: 'Market pair not found',
        };
      }

      const makerBaseWallet = await this.getOrCreateWalletForUpdate(
        manager,
        maker.user_id,
        pair.base_currency_id,
      );
      const makerQuoteWallet = await this.getOrCreateWalletForUpdate(
        manager,
        maker.user_id,
        pair.quote_currency_id,
      );
      const takerBaseWallet = await this.getOrCreateWalletForUpdate(
        manager,
        taker.user_id,
        pair.base_currency_id,
      );
      const takerQuoteWallet = await this.getOrCreateWalletForUpdate(
        manager,
        taker.user_id,
        pair.quote_currency_id,
      );

      if (maker.side === 'SELL') {
        const fromFrozen = Math.min(numeric(takerQuoteWallet.frozen), quoteDelta);
        const fromAvailable = quoteDelta - fromFrozen;
        if (fromAvailable > numeric(takerQuoteWallet.available)) {
          return {
            trade_id: null,
            error_code: 'INSUFFICIENT_BALANCE',
            error_message: 'Taker quote wallet cannot cover trade',
          };
        }
      }

      const tradeId = newUuid();
      await manager.query(
        `INSERT INTO trades (
          trade_id, pair_id, taker_order_id, maker_order_id, price, amount,
          taker_fee, maker_fee, fee_currency_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
        [
          tradeId,
          params.pairId,
          params.takerOrderId,
          params.makerOrderId,
          params.price,
          params.amount,
          params.takerFee,
          params.makerFee,
          params.feeCurrencyId,
        ],
      );

      await this.applyOrderFill(manager, maker, params.amount, params.price, quoteDelta);
      await this.applyOrderFill(manager, taker, params.amount, params.price, quoteDelta);

      if (maker.side === 'SELL') {
        const fromFrozen = Math.min(numeric(takerQuoteWallet.frozen), quoteDelta);
        const fromAvailable = quoteDelta - fromFrozen;

        await this.applyWalletDelta(manager, makerBaseWallet.wallet_id, 0, -amount);
        await this.applyWalletDelta(manager, makerQuoteWallet.wallet_id, quoteDelta - numeric(params.makerFee), 0);
        await this.applyWalletDelta(manager, takerQuoteWallet.wallet_id, -fromAvailable, -fromFrozen);
        await this.applyWalletDelta(manager, takerBaseWallet.wallet_id, amount - numeric(params.takerFee), 0);
      } else {
        await this.applyWalletDelta(manager, makerQuoteWallet.wallet_id, 0, -quoteDelta);
        await this.applyWalletDelta(manager, makerBaseWallet.wallet_id, amount - numeric(params.makerFee), 0);
        await this.applyWalletDelta(manager, takerBaseWallet.wallet_id, 0, -amount);
        await this.applyWalletDelta(manager, takerQuoteWallet.wallet_id, quoteDelta - numeric(params.takerFee), 0);
      }

      const makerBaseAfter = await this.getWalletBalanceAfter(manager, maker.user_id, pair.base_currency_id);
      const makerQuoteAfter = await this.getWalletBalanceAfter(manager, maker.user_id, pair.quote_currency_id);
      const takerBaseAfter = await this.getWalletBalanceAfter(manager, taker.user_id, pair.base_currency_id);
      const takerQuoteAfter = await this.getWalletBalanceAfter(manager, taker.user_id, pair.quote_currency_id);

      if (!makerBaseAfter || !makerQuoteAfter || !takerBaseAfter || !takerQuoteAfter) {
        return {
          trade_id: null,
          error_code: 'WALLET_NOT_FOUND',
          error_message: 'Trade settlement wallet not found',
        };
      }

      if (maker.side === 'SELL') {
        await this.insertLedger(manager, maker.user_id, pair.base_currency_id, makerBaseAfter.wallet_id, tradeId, 'DEBIT', params.amount, makerBaseAfter.balance_after);
        await this.insertLedger(manager, maker.user_id, pair.quote_currency_id, makerQuoteAfter.wallet_id, tradeId, 'CREDIT', String(quoteDelta - numeric(params.makerFee)), makerQuoteAfter.balance_after);
        await this.insertLedger(manager, taker.user_id, pair.quote_currency_id, takerQuoteAfter.wallet_id, tradeId, 'DEBIT', String(quoteDelta), takerQuoteAfter.balance_after);
        await this.insertLedger(manager, taker.user_id, pair.base_currency_id, takerBaseAfter.wallet_id, tradeId, 'CREDIT', String(amount - numeric(params.takerFee)), takerBaseAfter.balance_after);
      } else {
        await this.insertLedger(manager, maker.user_id, pair.quote_currency_id, makerQuoteAfter.wallet_id, tradeId, 'DEBIT', String(quoteDelta), makerQuoteAfter.balance_after);
        await this.insertLedger(manager, maker.user_id, pair.base_currency_id, makerBaseAfter.wallet_id, tradeId, 'CREDIT', String(amount - numeric(params.makerFee)), makerBaseAfter.balance_after);
        await this.insertLedger(manager, taker.user_id, pair.base_currency_id, takerBaseAfter.wallet_id, tradeId, 'DEBIT', params.amount, takerBaseAfter.balance_after);
        await this.insertLedger(manager, taker.user_id, pair.quote_currency_id, takerQuoteAfter.wallet_id, tradeId, 'CREDIT', String(quoteDelta - numeric(params.takerFee)), takerQuoteAfter.balance_after);
      }

      return {
        trade_id: tradeId,
        error_code: null,
        error_message: null,
      };
    });
  }

  async cancelIocRemainder(orderId: string, userId: string): Promise<void> {
    const ok = await this.dataSource.transaction(async (manager) => {
      const order = await this.findOrderForUpdate(manager, orderId);
      if (!order || order.user_id !== userId || !['OPEN', 'PARTIAL'].includes(order.status)) {
        return false;
      }

      const pair = await this.findPair(manager, order.pair_id);
      if (!pair) {
        return false;
      }

      const releaseAmount = order.side === 'BUY' ? numeric(order.reserved_quote) : numeric(order.reserved_base);
      const releaseCurrencyId = order.side === 'BUY' ? pair.quote_currency_id : pair.base_currency_id;
      const wallet = await this.getOrCreateWalletForUpdate(manager, order.user_id, releaseCurrencyId);

      if (releaseAmount > 0) {
        await this.applyWalletDelta(manager, wallet.wallet_id, releaseAmount, -releaseAmount);
      }

      await manager.query(
        `UPDATE orders
         SET status = 'CANCELLED',
             reserved_quote = CASE WHEN side = 'BUY' THEN 0 ELSE reserved_quote END,
             reserved_base = CASE WHEN side = 'SELL' THEN 0 ELSE reserved_base END,
             updated_at = NOW()
         WHERE order_id = $1`,
        [orderId],
      );
      return true;
    });

    if (!ok) {
      this.logger.warn(`cancelIocRemainder noop for ${orderId}: INVALID_STATE`);
    }
  }

  private async findOrderForUpdate(manager: EntityManager, orderId: string): Promise<OrderRow | null> {
    const rows = await manager.query(
      `SELECT order_id, pair_id, user_id, side, type, time_in_force, price, amount, filled_amount,
              status, reserved_quote, reserved_base, slippage_tolerance, created_at
       FROM orders
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId],
    );
    return (rows?.[0] as OrderRow | undefined) ?? null;
  }

  private async findPair(manager: EntityManager, pairId: string): Promise<PairRow | null> {
    const rows = await manager.query(
      `SELECT base_currency_id, quote_currency_id
       FROM market_pairs
       WHERE pair_id = $1
       LIMIT 1`,
      [pairId],
    );
    return (rows?.[0] as PairRow | undefined) ?? null;
  }

  private async getOrCreateWalletForUpdate(
    manager: EntityManager,
    userId: string,
    currencyId: string,
  ): Promise<WalletRow> {
    let rows = await manager.query(
      `SELECT wallet_id, available, frozen
       FROM wallets
       WHERE user_id = $1 AND currency_id = $2
       LIMIT 1
       FOR UPDATE`,
      [userId, currencyId],
    );
    if (rows?.[0]) return rows[0] as WalletRow;

    await manager.query(
      `INSERT INTO wallets (wallet_id, user_id, currency_id, available, frozen, updated_at)
       VALUES ($1, $2, $3, 0, 0, NOW())
       ON CONFLICT (user_id, currency_id) DO NOTHING`,
      [newUuid(), userId, currencyId],
    );

    rows = await manager.query(
      `SELECT wallet_id, available, frozen
       FROM wallets
       WHERE user_id = $1 AND currency_id = $2
       LIMIT 1
       FOR UPDATE`,
      [userId, currencyId],
    );
    return rows[0] as WalletRow;
  }

  private async applyOrderFill(
    manager: EntityManager,
    order: OrderRow,
    fillAmount: string,
    fillPrice: string,
    quoteDelta: number,
  ): Promise<void> {
    const prevFilled = numeric(order.filled_amount);
    const remainingBefore = numeric(order.amount) - prevFilled;
    await manager.query(
      `UPDATE orders
       SET filled_amount = filled_amount + $1::numeric,
           avg_price = ((COALESCE(avg_price, 0) * $2::numeric) + ($3::numeric * $1::numeric))
             / NULLIF(($2::numeric + $1::numeric), 0),
           status = CASE WHEN ($4::numeric - $1::numeric) <= 0 THEN 'FILLED' ELSE 'PARTIAL' END,
           reserved_quote = CASE WHEN side = 'BUY' THEN GREATEST(0, reserved_quote - $5::numeric) ELSE reserved_quote END,
           reserved_base = CASE WHEN side = 'SELL' THEN GREATEST(0, reserved_base - $1::numeric) ELSE reserved_base END,
           updated_at = NOW()
       WHERE order_id = $6`,
      [fillAmount, String(prevFilled), fillPrice, String(remainingBefore), String(quoteDelta), order.order_id],
    );
  }

  private async applyWalletDelta(
    manager: EntityManager,
    walletId: string,
    deltaAvailable: number,
    deltaFrozen: number,
  ): Promise<void> {
    await manager.query(
      `UPDATE wallets
       SET available = available + $1::numeric,
           frozen = frozen + $2::numeric,
           updated_at = NOW()
       WHERE wallet_id = $3`,
      [String(deltaAvailable), String(deltaFrozen), walletId],
    );
  }

  private async getWalletBalanceAfter(
    manager: EntityManager,
    userId: string,
    currencyId: string,
  ): Promise<{ wallet_id: string; balance_after: string } | null> {
    const rows = await manager.query(
      `SELECT wallet_id, (available + frozen)::text AS balance_after
       FROM wallets
       WHERE user_id = $1 AND currency_id = $2
       LIMIT 1`,
      [userId, currencyId],
    );
    return (rows?.[0] as { wallet_id: string; balance_after: string } | undefined) ?? null;
  }

  private async insertLedger(
    manager: EntityManager,
    userId: string,
    currencyId: string,
    walletId: string,
    tradeId: string,
    direction: 'CREDIT' | 'DEBIT',
    amount: string,
    balanceAfter: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO wallet_ledger (
        ledger_id, user_id, currency_id, wallet_id, ref_type, ref_id, direction, amount, balance_after, created_at
      ) VALUES ($1, $2, $3, $4, 'TRADE', $5, $6, $7, $8, NOW())
      ON CONFLICT (ref_type, ref_id, user_id, currency_id, direction) DO NOTHING`,
      [newUuid(), userId, currencyId, walletId, tradeId, direction, amount, balanceAfter],
    );
  }

  private mapRowToOrderBookOrder(r: OrderRow): OrderBookOrder {
    const amount = parseFloat(String(r.amount ?? '0'));
    const filled = parseFloat(String(r.filled_amount ?? '0'));
    return {
      order_id: String(r.order_id ?? '').trim(),
      pair_id: String(r.pair_id ?? '').trim(),
      user_id: String(r.user_id ?? '').trim(),
      side: String(r.side ?? '').trim().toUpperCase() as 'BUY' | 'SELL',
      type: String(r.type ?? '').trim().toUpperCase() as 'LIMIT' | 'MARKET',
      time_in_force: r.time_in_force ?? 'GTC',
      price: r.price != null ? String(r.price) : null,
      amount: String(r.amount ?? '0'),
      filled_amount: String(r.filled_amount ?? '0'),
      status: r.status ?? 'OPEN',
      created_at: r.created_at,
      remaining: String(amount - filled),
      slippage_tolerance: r.slippage_tolerance != null ? String(r.slippage_tolerance) : null,
    };
  }
}
