import { Test, type TestingModule } from '@nestjs/testing';
import { TRADE_AUDIT_LOG_REPOSITORY, type TradeAuditLogRepositoryPort } from '../domain/ports';
import type { TradeExecutionResult } from '../interfaces';
import { AuditTradeVisitor } from './audit-trade.visitor';

function makeTradeResult(overrides: Partial<TradeExecutionResult> = {}): TradeExecutionResult {
  return {
    trade_id: 'trade-1',
    pair_id: 'pair-1',
    maker_order_id: 'maker-1',
    taker_order_id: 'taker-1',
    price: '100.00',
    amount: '1.00',
    taker_fee: '0.001',
    maker_fee: '0.001',
    fee_currency_id: 'usdt',
    created_at: new Date('2025-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('AuditTradeVisitor', () => {
  let visitor: AuditTradeVisitor;
  let auditRepo: jest.Mocked<TradeAuditLogRepositoryPort>;

  beforeEach(async () => {
    auditRepo = {
      save: jest.fn().mockResolvedValue(undefined),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditTradeVisitor, { provide: TRADE_AUDIT_LOG_REPOSITORY, useValue: auditRepo }],
    }).compile();

    visitor = module.get(AuditTradeVisitor);
  });

  it('persists an audit record to the repository on each trade', async () => {
    const trade = makeTradeResult();
    await visitor.visit(trade);

    expect(auditRepo.save).toHaveBeenCalledTimes(1);
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        trade_id: 'trade-1',
        pair_id: 'pair-1',
        maker_order_id: 'maker-1',
        taker_order_id: 'taker-1',
        price: '100.00',
        amount: '1.00',
        taker_fee: '0.001',
        maker_fee: '0.001',
        fee_currency_id: 'usdt',
      }),
    );
  });

  it('persists multiple trades independently', async () => {
    await visitor.visit(makeTradeResult({ trade_id: 'trade-1' }));
    await visitor.visit(makeTradeResult({ trade_id: 'trade-2' }));

    expect(auditRepo.save).toHaveBeenCalledTimes(2);
    expect(auditRepo.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ trade_id: 'trade-1' }),
    );
    expect(auditRepo.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ trade_id: 'trade-2' }),
    );
  });

  it('does not throw when repository save fails (logs error, audit failure non-critical)', async () => {
    auditRepo.save.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(visitor.visit(makeTradeResult())).resolves.not.toThrow();
  });
});
