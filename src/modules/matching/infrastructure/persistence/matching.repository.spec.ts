import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { MatchingRepository } from './matching.repository';

describe('MatchingRepository', () => {
  it('appends trade.executed outbox event when trade execution succeeds', async () => {
    const outboxAppender = {
      append: jest.fn().mockResolvedValue(undefined),
    } as unknown as OutboxAppender;

    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
    };

    const dataSource = {
      transaction: jest.fn(async (work) => work(manager)),
      query: jest.fn(),
    } as any;

    const repo = new MatchingRepository(dataSource, outboxAppender);

    (repo as any).findOrderForUpdate = jest
      .fn()
      .mockResolvedValueOnce({
        order_id: 'maker-1',
        pair_id: 'pair-1',
        user_id: 'user-maker',
        side: 'SELL',
        type: 'LIMIT',
        time_in_force: 'GTC',
        price: '100',
        amount: '2',
        filled_amount: '0',
        status: 'OPEN',
        reserved_quote: '0',
        reserved_base: '2',
        slippage_tolerance: null,
        created_at: new Date('2026-04-25T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        order_id: 'taker-1',
        pair_id: 'pair-1',
        user_id: 'user-taker',
        side: 'BUY',
        type: 'LIMIT',
        time_in_force: 'GTC',
        price: '100',
        amount: '2',
        filled_amount: '0',
        status: 'OPEN',
        reserved_quote: '200',
        reserved_base: '0',
        slippage_tolerance: null,
        created_at: new Date('2026-04-25T00:00:00.000Z'),
      });
    (repo as any).findPair = jest
      .fn()
      .mockResolvedValue({ base_currency_id: 'btc', quote_currency_id: 'usdt' });
    (repo as any).getOrCreateWalletForUpdate = jest
      .fn()
      .mockResolvedValueOnce({ wallet_id: 'maker-base', available: '0', frozen: '2' })
      .mockResolvedValueOnce({ wallet_id: 'maker-quote', available: '0', frozen: '0' })
      .mockResolvedValueOnce({ wallet_id: 'taker-base', available: '0', frozen: '0' })
      .mockResolvedValueOnce({ wallet_id: 'taker-quote', available: '0', frozen: '200' });
    (repo as any).applyOrderFill = jest.fn().mockResolvedValue(undefined);
    (repo as any).applyWalletDelta = jest.fn().mockResolvedValue(undefined);
    (repo as any).getWalletBalanceAfter = jest
      .fn()
      .mockResolvedValueOnce({ wallet_id: 'maker-base', balance_after: '1' })
      .mockResolvedValueOnce({ wallet_id: 'maker-quote', balance_after: '99.9' })
      .mockResolvedValueOnce({ wallet_id: 'taker-base', balance_after: '0.9' })
      .mockResolvedValueOnce({ wallet_id: 'taker-quote', balance_after: '100' });
    (repo as any).insertLedger = jest.fn().mockResolvedValue(undefined);

    const result = await repo.executeTrade({
      pairId: 'pair-1',
      makerOrderId: 'maker-1',
      takerOrderId: 'taker-1',
      price: '100',
      amount: '1',
      feeCurrencyId: 'usdt',
      takerFee: '0.1',
      makerFee: '0.1',
    });

    expect(result.error_code).toBeNull();
    expect(result.trade_id).toBeTruthy();
    expect(outboxAppender.append).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({
        aggregateType: 'trade',
        aggregateId: result.trade_id,
        eventType: 'trade.executed',
        kafkaTopic: 'trades.executed',
        partitionKey: 'pair-1',
      }),
    );
  });
});
