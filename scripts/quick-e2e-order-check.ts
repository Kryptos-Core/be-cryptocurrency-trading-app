import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { AppModule } from '@/app.module';
import { CreateOrderCommand } from '@/modules/orders/commands/create-order.command';
import { OrdersService } from '@/modules/orders/orders.service';

function nowTag(): string {
  return Date.now().toString().slice(-8);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  const dataSource = app.get(DataSource);
  const ordersService = app.get(OrdersService);

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
    // 1) Setup isolated test data
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

    // maker: base available for SELL; takers: quote available for BUY
    await createWallet(ids.makerUserId, ids.baseCurrencyId, '10');
    await createWallet(ids.makerUserId, ids.quoteCurrencyId, '0');

    await createWallet(ids.fokUserId, ids.baseCurrencyId, '0');
    await createWallet(ids.fokUserId, ids.quoteCurrencyId, '1000');

    await createWallet(ids.iocUserId, ids.baseCurrencyId, '0');
    await createWallet(ids.iocUserId, ids.quoteCurrencyId, '1000');

    // 2) Place maker liquidity: SELL 1 @ 100 (GTC)
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

    // 3) FOK check: BUY 2 @ 100 (only 1 available) => reject match + auto-cancel
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

    const fokStatusRows = await dataSource.query(
      `SELECT status, amount, filled_amount, reserved_quote
       FROM orders WHERE order_id = ? LIMIT 1`,
      [fokOrder.order_id],
    );
    const fokRow = fokStatusRows[0];

    // 4) IOC check: BUY 1.5 @ 100 (only 1 available) => partial fill then cancel rest
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

    const iocStatusRows = await dataSource.query(
      `SELECT status, amount, filled_amount, reserved_quote
       FROM orders WHERE order_id = ? LIMIT 1`,
      [iocOrder.order_id],
    );
    const iocRow = iocStatusRows[0];

    const makerAfterRows = await dataSource.query(
      `SELECT status, amount, filled_amount FROM orders WHERE order_id = ? LIMIT 1`,
      [makerOrder.order_id],
    );
    const makerAfter = makerAfterRows[0];

    // 5) Ledger check: trade from IOC should produce 4 TRADE ledger rows
    const tradeRows = await dataSource.query(
      `SELECT trade_id FROM trades
       WHERE maker_order_id = ? AND taker_order_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      [makerOrder.order_id, iocOrder.order_id],
    );

    const tradeId = tradeRows[0]?.trade_id as string | undefined;
    if (tradeId) {
      createdTradeIds.push(tradeId);
    }

    const ledgerRows = tradeId
      ? await dataSource.query(
          `SELECT direction, amount, currency_id
           FROM wallet_ledger
           WHERE ref_type = 'TRADE' AND ref_id = ?
           ORDER BY created_at ASC`,
          [tradeId],
        )
      : [];

    const result = {
      pair: pairSymbol,
      fok: {
        orderId: fokOrder.order_id,
        status: fokRow?.status,
        amount: fokRow?.amount,
        filledAmount: fokRow?.filled_amount,
        reservedQuote: fokRow?.reserved_quote,
        pass: fokRow?.status === 'CANCELLED' && Number(fokRow?.filled_amount ?? 0) === 0,
      },
      ioc: {
        orderId: iocOrder.order_id,
        status: iocRow?.status,
        amount: iocRow?.amount,
        filledAmount: iocRow?.filled_amount,
        reservedQuote: iocRow?.reserved_quote,
        pass:
          iocRow?.status === 'CANCELLED' &&
          Number(iocRow?.filled_amount ?? 0) > 0 &&
          Number(iocRow?.filled_amount ?? 0) < Number(iocRow?.amount ?? 0),
      },
      makerAfterIoc: {
        orderId: makerOrder.order_id,
        status: makerAfter?.status,
        filledAmount: makerAfter?.filled_amount,
      },
      ledger: {
        tradeId: tradeId ?? null,
        rowCount: ledgerRows.length,
        pass: ledgerRows.length === 4,
        entries: ledgerRows,
      },
    };

    console.log(JSON.stringify(result, null, 2));

    const allPass = result.fok.pass && result.ioc.pass && result.ledger.pass;
    if (!allPass) {
      process.exitCode = 1;
    }
  } finally {
    // Cleanup test data
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

    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
