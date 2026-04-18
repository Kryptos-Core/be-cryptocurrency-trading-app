import { BusinessException, TreasuryWalletBusyException } from '@/common/exceptions';
import { treasuryDeferBackoff } from './treasury-queue-backoff';

describe('treasuryDeferBackoff', () => {
  it('returns capped exponential delay for TREASURY_WALLET_BUSY', () => {
    const err = new TreasuryWalletBusyException();
    expect(treasuryDeferBackoff(1, err, { delay: 3000 })).toBe(3000);
    expect(treasuryDeferBackoff(2, err, { delay: 3000 })).toBe(6000);
    expect(treasuryDeferBackoff(10, err, { delay: 3000 })).toBe(20_000);
  });

  it('returns -1 for busy-timeout (terminal)', () => {
    const err = new BusinessException('timeout', 'TREASURY_WALLET_BUSY_TIMEOUT');
    expect(treasuryDeferBackoff(1, err, { delay: 3000 })).toBe(-1);
  });

  it('uses exponential backoff vs delay base for other failures', () => {
    const err = new BusinessException('chain failed', 'TREASURY_FUND_SEND_FAILED');
    expect(treasuryDeferBackoff(1, err, { delay: 3000 })).toBe(3000);
    expect(treasuryDeferBackoff(2, err, { delay: 3000 })).toBe(9000);
  });
});
