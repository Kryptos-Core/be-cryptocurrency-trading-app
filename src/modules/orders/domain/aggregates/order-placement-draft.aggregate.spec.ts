import { OrderPlacementDraftAggregate } from './order-placement-draft.aggregate';

describe('OrderPlacementDraftAggregate', () => {
  it('creates when amount is positive', () => {
    const a = OrderPlacementDraftAggregate.create({
      orderId: 'o1',
      pairId: 'p1',
      side: 'BUY',
      amount: '1.5',
    });
    expect(a.amount).toBe('1.5');
  });

  it('rejects non-positive amount', () => {
    expect(() =>
      OrderPlacementDraftAggregate.create({
        orderId: 'o1',
        pairId: 'p1',
        side: 'BUY',
        amount: '0',
      }),
    ).toThrow('ORDER_AMOUNT_MUST_BE_POSITIVE');
  });

  it('rejects empty pair', () => {
    expect(() =>
      OrderPlacementDraftAggregate.create({
        orderId: 'o1',
        pairId: '   ',
        side: 'SELL',
        amount: '1',
      }),
    ).toThrow('ORDER_PAIR_REQUIRED');
  });
});
