import { Test, type TestingModule } from '@nestjs/testing';
import { TRADE_AUDIT_LOG_REPOSITORY, type TradeAuditLogRepositoryPort } from '../../domain/ports';
import type { TradeExecutionResult } from '../../interfaces';
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
  let repository: jest.Mocked<TradeAuditLogRepositoryPort>;

  beforeEach(async () => {
    repository = { save: jest.fn() } as unknown as jest.Mocked<TradeAuditLogRepositoryPort>;
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditTradeVisitor, { provide: TRADE_AUDIT_LOG_REPOSITORY, useValue: repository }],
    }).compile();

    visitor = module.get(AuditTradeVisitor);
  });

  it('persists trade audit records', async () => {
    await visitor.visit(makeTradeResult());
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ trade_id: 'trade-1' }));
  });
});
