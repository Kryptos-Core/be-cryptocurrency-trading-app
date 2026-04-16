import { Brand, BrandedId, createBrandedIdFactory, OrderId, UserId, WalletId } from './primitives';

describe('createBrandedIdFactory', () => {
  const TestId = createBrandedIdFactory('TestId');

  describe('wrap', () => {
    it('should return a branded string', () => {
      const id = TestId.wrap('abc-123');
      expect(id).toBe('abc-123');
    });

    it('should preserve the original string value', () => {
      const raw = '018e9a7b-1234-7abc-8000-000000000001';
      const id = TestId.wrap(raw);
      expect(id as string).toBe(raw);
    });
  });

  describe('unwrap', () => {
    it('should return the raw string', () => {
      const id = TestId.wrap('abc-123');
      expect(TestId.unwrap(id)).toBe('abc-123');
    });
  });

  describe('isValid', () => {
    it('should return true for non-empty strings', () => {
      expect(TestId.isValid('abc')).toBe(true);
      expect(TestId.isValid(TestId.wrap('uuid'))).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(TestId.isValid('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(TestId.isValid(null)).toBe(false);
      expect(TestId.isValid(undefined)).toBe(false);
      expect(TestId.isValid(42)).toBe(false);
      expect(TestId.isValid({})).toBe(false);
    });
  });

  it('should expose the brand name', () => {
    expect(TestId.brand).toBe('TestId');
  });
});

describe('Common domain ID factories', () => {
  it('OrderId.wrap should return an OrderId', () => {
    const id = OrderId.wrap('order-001');
    expect(id as string).toBe('order-001');
    expect(OrderId.isValid(id)).toBe(true);
  });

  it('UserId.wrap should return a UserId', () => {
    const id = UserId.wrap('user-001');
    expect(id as string).toBe('user-001');
  });

  it('WalletId.wrap should return a WalletId', () => {
    const id = WalletId.wrap('wallet-001');
    expect(id as string).toBe('wallet-001');
  });

  it('different factories are nominally distinct types at runtime they share string value', () => {
    const orderId = OrderId.wrap('same-id');
    const userId = UserId.wrap('same-id');
    // At runtime they are both just strings
    expect((orderId as string) === (userId as string)).toBe(true);
    // isValid checks string content, not brand — valid for any factory
    expect(OrderId.isValid(orderId)).toBe(true);
  });
});

describe('BrandedId type usage', () => {
  it('T phantom type should be the branded type', () => {
    // T is a compile-time type only — at runtime it is undefined
    expect(OrderId.T).toBeUndefined();
  });
});
