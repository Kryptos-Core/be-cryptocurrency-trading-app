import { BlockchainAddress } from './blockchain-address.vo';

describe('BlockchainAddress', () => {
  // ─── EVM chains ───────────────────────────────────────────────────────────

  it('should create a valid EVM address', () => {
    const addr = BlockchainAddress.of('0xAbCd1234567890AbCd1234567890AbCd12345678', 'ethereum');
    expect(addr.address).toBe('0xAbCd1234567890AbCd1234567890AbCd12345678');
    expect(addr.chain).toBe('ethereum');
    expect(addr.isEvm()).toBe(true);
  });

  it('should accept BSC, Polygon, Arbitrum, Optimism, Base as EVM', () => {
    const evmAddr = '0x1234567890123456789012345678901234567890';
    for (const chain of ['bsc', 'polygon', 'arbitrum', 'optimism', 'base'] as const) {
      const addr = BlockchainAddress.of(evmAddr, chain);
      expect(addr.isEvm()).toBe(true);
    }
  });

  it('should reject invalid EVM address', () => {
    expect(() => BlockchainAddress.of('0xshort', 'ethereum')).toThrow();
    expect(() => BlockchainAddress.of('not-an-address', 'ethereum')).toThrow();
  });

  // ─── EVM case-insensitive equality ───────────────────────────────────────

  it('should equalise EVM addresses case-insensitively', () => {
    const lower = BlockchainAddress.of('0xabcdef1234567890abcdef1234567890abcdef12', 'ethereum');
    const upper = BlockchainAddress.of('0xABCDEF1234567890ABCDEF1234567890ABCDEF12', 'ethereum');
    expect(lower.equals(upper)).toBe(true);
  });

  // ─── Solana ───────────────────────────────────────────────────────────────

  it('should create a valid Solana address', () => {
    const addr = BlockchainAddress.of('So11111111111111111111111111111111111111112', 'solana');
    expect(addr.chain).toBe('solana');
    expect(addr.isEvm()).toBe(false);
  });

  // ─── Tron ─────────────────────────────────────────────────────────────────

  it('should create a valid Tron address', () => {
    // Valid Tron address: T + 33 base58 chars (no 0, O, I, l) = 34 total
    const addr = BlockchainAddress.of('TRonTestAddressABCDEFGHJKMNPQRSTUV', 'tron');
    expect(addr.chain).toBe('tron');
    expect(addr.isEvm()).toBe(false);
  });

  // ─── ofUnsafe ─────────────────────────────────────────────────────────────

  it('should create without validation via ofUnsafe', () => {
    const addr = BlockchainAddress.ofUnsafe('any-raw-address', 'ethereum');
    expect(addr.address).toBe('any-raw-address');
  });

  // ─── Equality ─────────────────────────────────────────────────────────────

  it('should not be equal when chains differ', () => {
    const eth = BlockchainAddress.ofUnsafe('0x1234', 'ethereum');
    const bsc = BlockchainAddress.ofUnsafe('0x1234', 'bsc');
    expect(eth.equals(bsc)).toBe(false);
  });

  it('should return false when comparing to null', () => {
    const addr = BlockchainAddress.ofUnsafe('0x1234', 'ethereum');
    expect(addr.equals(null as any)).toBe(false);
  });

  // ─── toString ─────────────────────────────────────────────────────────────

  it('should have human-readable toString', () => {
    const addr = BlockchainAddress.ofUnsafe('0xABC', 'ethereum');
    expect(addr.toString()).toBe('0xABC (ethereum)');
  });

  // ─── Errors ───────────────────────────────────────────────────────────────

  it('should throw on empty address', () => {
    expect(() => BlockchainAddress.of('', 'ethereum')).toThrow();
  });
});
