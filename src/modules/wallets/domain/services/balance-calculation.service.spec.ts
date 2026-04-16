import { BalanceCalculationService, BalanceValidationError } from './balance-calculation.service';

describe('BalanceCalculationService', () => {
  let svc: BalanceCalculationService;

  beforeEach(() => {
    svc = new BalanceCalculationService();
  });

  // ── calculateTotal ────────────────────────────────────────────────────────

  describe('calculateTotal', () => {
    it('sums available and frozen', () => {
      expect(svc.calculateTotal('100', '50')).toBe('150');
    });

    it('handles zero frozen', () => {
      expect(svc.calculateTotal('200', '0')).toBe('200');
    });

    it('handles zero available', () => {
      expect(svc.calculateTotal('0', '75.5')).toBe('75.5');
    });

    it('handles decimal precision', () => {
      expect(svc.calculateTotal('0.1', '0.2')).toBe('0.3');
    });

    it('handles empty string as zero', () => {
      expect(svc.calculateTotal('', '')).toBe('0');
    });
  });

  // ── parsePositiveAmount ───────────────────────────────────────────────────

  describe('parsePositiveAmount', () => {
    it('parses valid positive integer', () => {
      const result = svc.parsePositiveAmount('100');
      expect(result.toString()).toBe('100');
    });

    it('parses valid positive decimal', () => {
      const result = svc.parsePositiveAmount('0.001');
      expect(result.toString()).toBe('0.001');
    });

    it('throws BalanceValidationError for zero', () => {
      expect(() => svc.parsePositiveAmount('0')).toThrow(BalanceValidationError);
      expect(() => svc.parsePositiveAmount('0')).toThrow('Amount must be greater than 0');
    });

    it('throws BalanceValidationError for negative amount', () => {
      expect(() => svc.parsePositiveAmount('-1')).toThrow(BalanceValidationError);
    });

    it('throws BalanceValidationError with INVALID_AMOUNT code for zero', () => {
      try {
        svc.parsePositiveAmount('0');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BalanceValidationError);
        expect((err as BalanceValidationError).code).toBe('INVALID_AMOUNT');
      }
    });

    it('throws BalanceValidationError for non-numeric string', () => {
      expect(() => svc.parsePositiveAmount('abc')).toThrow(BalanceValidationError);
    });

    it('throws BalanceValidationError with INVALID_AMOUNT code for non-numeric', () => {
      try {
        svc.parsePositiveAmount('xyz');
        fail('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BalanceValidationError);
        expect((err as BalanceValidationError).code).toBe('INVALID_AMOUNT');
      }
    });
  });

  // ── buildBalanceSnapshot ──────────────────────────────────────────────────

  describe('buildBalanceSnapshot', () => {
    it('builds snapshot with correct total', () => {
      const snap = svc.buildBalanceSnapshot('u1', 'c1', '300', '50');
      expect(snap).toEqual({
        userId: 'u1',
        currencyId: 'c1',
        available: '300',
        frozen: '50',
        total: '350',
      });
    });

    it('defaults null available/frozen to 0', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const snap = svc.buildBalanceSnapshot('u2', 'c2', null as any, null as any);
      expect(snap.available).toBe('0');
      expect(snap.frozen).toBe('0');
      expect(snap.total).toBe('0');
    });

    it('preserves decimal precision in total', () => {
      const snap = svc.buildBalanceSnapshot('u3', 'c3', '99.99', '0.01');
      expect(snap.total).toBe('100');
    });
  });

  // ── computeDiscrepancy ────────────────────────────────────────────────────

  describe('computeDiscrepancy', () => {
    it('returns BALANCED when internal equals external', () => {
      const result = svc.computeDiscrepancy('100', '100');
      expect(result.status).toBe('BALANCED');
      expect(result.discrepancy.isZero()).toBe(true);
    });

    it('returns DISCREPANCY_DETECTED when external exceeds internal', () => {
      const result = svc.computeDiscrepancy('90', '100');
      expect(result.status).toBe('DISCREPANCY_DETECTED');
      expect(result.discrepancy.toString()).toBe('10');
    });

    it('returns DISCREPANCY_DETECTED when internal exceeds external', () => {
      const result = svc.computeDiscrepancy('110', '100');
      expect(result.status).toBe('DISCREPANCY_DETECTED');
      expect(result.discrepancy.toString()).toBe('-10');
    });

    it('handles decimal discrepancy', () => {
      const result = svc.computeDiscrepancy('100.001', '100.002');
      expect(result.status).toBe('DISCREPANCY_DETECTED');
      expect(result.discrepancy.toString()).toBe('0.001');
    });

    it('handles zero balances as BALANCED', () => {
      const result = svc.computeDiscrepancy('0', '0');
      expect(result.status).toBe('BALANCED');
    });
  });
});
