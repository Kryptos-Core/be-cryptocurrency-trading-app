import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '@/app.module';
import { CreateOrderCommand } from '@/modules/orders/commands/create-order.command';
import { OrdersService } from '@/modules/orders/orders.service';

function nowTag(): string {
  return Date.now().toString().slice(-8);
}

/** Poll until the order status is no longer OPEN (queue job processed), or timeout. */
async function waitForOrderProcessed(
  dataSource: DataSource,
  orderId: string,
  timeoutMs = 10000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [row] = await dataSource.query('SELECT status FROM orders WHERE order_id = ? LIMIT 1', [
      orderId,
    ]);
    if (!row) {
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }
    if (row.status !== 'OPEN') return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`waitForOrderProcessed timed out for order ${orderId}`);
}

describe('Matching IOC/FOK Integration', () => {
  let dataSource: DataSource;
  let ordersService: OrdersService;
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>;

  beforeAll(async () => {
    jest.setTimeout(120000);
    app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    dataSource = app.get(DataSource);
    ordersService = app.get(OrdersService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should reject FOK insufficient liquidity, cancel IOC residual, and write 4 trade ledger entries', async () => {
    const ids = {
      baseCurrencyId: uuidv7(),
      quoteCurrencyId: uuidv7(),
      pairId: uuidv7(),
      makerUserId: uuidv7(),
      fokUserId: uuidv7(),
      iocUserId: uuidv7(),
    };

    const tag = nowTag();
    const baseSymbol = `QAB${tag}`;
    const quoteSymbol = `QAQ${tag}`;
    const pairSymbol = `${baseSymbol}/${quoteSymbol}`;

    const createdOrderIds: string[] = [];
    const createdTradeIds: string[] = [];
    const testUserIds = [ids.makerUserId, ids.fokUserId, ids.iocUserId];

    const createWallet = async (
      userId: string,
      currencyId: string,
      available: string,
      frozen: string = '0',
    ) => {
      await dataSource.query(
        `INSERT INTO wallets (wallet_id, user_id, currency_id, available, frozen, updated_at)
         VALUES (UUID(), ?, ?, ?, ?, NOW(6))`,
        [userId, currencyId, available, frozen],
      );
    };

    try {
      await dataSource.query(
        `INSERT INTO currencies (currency_id, symbol, name, precision_scale, min_withdraw, is_tradable, is_active)
         VALUES (?, ?, ?, 8, 0, 1, 1), (?, ?, ?, 8, 0, 1, 1)`,
        [
          ids.baseCurrencyId,
          baseSymbol,
          `${baseSymbol} Coin`,
          ids.quoteCurrencyId,
          quoteSymbol,
          `${quoteSymbol} Coin`,
        ],
      );

      await dataSource.query(
        `INSERT INTO market_pairs (
           pair_id, base_currency_id, quote_currency_id, symbol,
           price_scale, amount_scale, min_order_amount, maker_fee_rate, taker_fee_rate, is_active
         ) VALUES (?, ?, ?, ?, 8, 8, 0.0001, 0.001, 0.001, 1)`,
        [ids.pairId, ids.baseCurrencyId, ids.quoteCurrencyId, pairSymbol],
      );

      await dataSource.query(
        `INSERT INTO users (user_id, email, password_hash, status, role, created_at)
         VALUES
         (?, ?, 'x', 'ACTIVE', 'TRADER', NOW(6)),
         (?, ?, 'x', 'ACTIVE', 'TRADER', NOW(6)),
         (?, ?, 'x', 'ACTIVE', 'TRADER', NOW(6))`,
        [
          ids.makerUserId,
          `maker_${tag}@qa.local`,
          ids.fokUserId,
          `fok_${tag}@qa.local`,
          ids.iocUserId,
          `ioc_${tag}@qa.local`,
        ],
      );

      await createWallet(ids.makerUserId, ids.baseCurrencyId, '10');
      await createWallet(ids.makerUserId, ids.quoteCurrencyId, '0');

      await createWallet(ids.fokUserId, ids.baseCurrencyId, '0');
      await createWallet(ids.fokUserId, ids.quoteCurrencyId, '1000');

      await createWallet(ids.iocUserId, ids.baseCurrencyId, '0');
      await createWallet(ids.iocUserId, ids.quoteCurrencyId, '1000');

      const makerOrder = await ordersService.create(
        new CreateOrderCommand(ids.makerUserId, {
          pairId: ids.pairId,
          side: 'SELL',
          type: 'LIMIT',
          price: '100',
          amount: '1',
          timeInForce: 'GTC',
          idempotencyKey: `maker-${tag}`,
        }),
      );
      createdOrderIds.push(makerOrder.order_id);

      const fokOrder = await ordersService.create(
        new CreateOrderCommand(ids.fokUserId, {
          pairId: ids.pairId,
          side: 'BUY',
          type: 'LIMIT',
          price: '100',
          amount: '2',
          timeInForce: 'FOK',
          idempotencyKey: `fok-${tag}`,
        }),
      );
      createdOrderIds.push(fokOrder.order_id);

      const iocOrder = await ordersService.create(
        new CreateOrderCommand(ids.iocUserId, {
          pairId: ids.pairId,
          side: 'BUY',
          type: 'LIMIT',
          price: '100',
          amount: '1.5',
          timeInForce: 'IOC',
          idempotencyKey: `ioc-${tag}`,
        }),
      );
      createdOrderIds.push(iocOrder.order_id);

      // Wait for the async Bull queue jobs to process both orders before asserting DB state.
      await waitForOrderProcessed(dataSource, fokOrder.order_id);
      await waitForOrderProcessed(dataSource, iocOrder.order_id);

      const [fokRow] = await dataSource.query(
        `SELECT status, amount, filled_amount
         FROM orders WHERE order_id = ? LIMIT 1`,
        [fokOrder.order_id],
      );

      const [iocRow] = await dataSource.query(
        `SELECT status, amount, filled_amount
         FROM orders WHERE order_id = ? LIMIT 1`,
        [iocOrder.order_id],
      );

      const [makerRow] = await dataSource.query(
        `SELECT status, amount, filled_amount
         FROM orders WHERE order_id = ? LIMIT 1`,
        [makerOrder.order_id],
      );

      const [tradeRow] = await dataSource.query(
        `SELECT trade_id FROM trades
         WHERE maker_order_id = ? AND taker_order_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [makerOrder.order_id, iocOrder.order_id],
      );

      expect(fokRow.status).toBe('CANCELLED');
      expect(Number(fokRow.filled_amount)).toBe(0);

      expect(iocRow.status).toBe('CANCELLED');
      expect(Number(iocRow.filled_amount)).toBeGreaterThan(0);
      expect(Number(iocRow.filled_amount)).toBeLessThan(Number(iocRow.amount));

      expect(makerRow.status).toBe('FILLED');
      expect(Number(makerRow.filled_amount)).toBe(1);

      expect(tradeRow?.trade_id).toBeTruthy();
      if (tradeRow?.trade_id) {
        createdTradeIds.push(tradeRow.trade_id);
      }

      const ledgerRows = tradeRow?.trade_id
        ? await dataSource.query(
            `SELECT direction, amount, currency_id
             FROM wallet_ledger
             WHERE ref_type = 'TRADE' AND ref_id = ?
             ORDER BY created_at ASC`,
            [tradeRow.trade_id],
          )
        : [];

      expect(ledgerRows.length).toBe(4);
    } finally {
      await dataSource.query('DELETE FROM wallet_ledger WHERE user_id IN (?, ?, ?)', testUserIds);

      if (createdTradeIds.length > 0) {
        await dataSource.query(
          `DELETE FROM trades WHERE trade_id IN (${createdTradeIds.map(() => '?').join(',')})`,
          createdTradeIds,
        );
      }

      if (createdOrderIds.length > 0) {
        await dataSource.query(
          `DELETE FROM orders WHERE order_id IN (${createdOrderIds.map(() => '?').join(',')})`,
          createdOrderIds,
        );
      }

      await dataSource.query('DELETE FROM wallets WHERE user_id IN (?, ?, ?)', testUserIds);

      await dataSource.query('DELETE FROM market_pairs WHERE pair_id = ?', [ids.pairId]);

      await dataSource.query('DELETE FROM currencies WHERE currency_id IN (?, ?)', [
        ids.baseCurrencyId,
        ids.quoteCurrencyId,
      ]);

      await dataSource.query('DELETE FROM users WHERE user_id IN (?, ?, ?)', [...testUserIds]);
    }
  });
});
