import { ValueObject } from '../value-object.base';

/**
 * Supported blockchain networks.
 * Mirrors BlockchainNetwork enum used elsewhere in the project.
 */
export type SupportedChain =
  | 'ethereum'
  | 'bsc'
  | 'polygon'
  | 'arbitrum'
  | 'optimism'
  | 'base'
  | 'solana'
  | 'tron'
  | 'ton';

/**
 * Regex patterns per chain type.
 * EVM chains share the same address format.
 */
const CHAIN_PATTERNS: Record<string, RegExp> = {
  evm: /^0x[0-9a-fA-F]{40}$/,
  solana: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  tron: /^T[1-9A-HJ-NP-Za-km-z]{33}$/,
  ton: /^(EQ|UQ)[0-9a-zA-Z_-]{46}$/,
};

const EVM_CHAINS: SupportedChain[] = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism', 'base'];

/**
 * BlockchainAddress — Value Object for validated on-chain addresses.
 *
 * Validates address format per chain at construction time.
 * Does NOT perform checksum validation (requires web3 library).
 *
 * @example
 * ```typescript
 * const addr = BlockchainAddress.of('0xAbCd...', 'ethereum');
 * addr.address; // '0xAbCd...'
 * addr.chain;   // 'ethereum'
 * addr.isEvm(); // true
 * ```
 */
export class BlockchainAddress extends ValueObject<{ address: string; chain: SupportedChain }> {
  private constructor(props: { address: string; chain: SupportedChain }) {
    super(props);
  }

  static of(address: string, chain: SupportedChain): BlockchainAddress {
    const trimmed = address.trim();
    if (!trimmed) throw new Error('BlockchainAddress: address must be non-empty');

    const pattern = BlockchainAddress.patternFor(chain);
    if (!pattern.test(trimmed)) {
      throw new Error(`BlockchainAddress: invalid address "${trimmed}" for chain "${chain}"`);
    }

    return new BlockchainAddress({ address: trimmed, chain });
  }

  /**
   * Create without validation — use only for addresses already validated externally.
   */
  static ofUnsafe(address: string, chain: SupportedChain): BlockchainAddress {
    return new BlockchainAddress({ address: address.trim(), chain });
  }

  get address(): string {
    return this.props.address;
  }

  get chain(): SupportedChain {
    return this.props.chain;
  }

  isEvm(): boolean {
    return EVM_CHAINS.includes(this.props.chain);
  }

  equals(other: BlockchainAddress): boolean {
    if (!other || !(other instanceof BlockchainAddress)) return false;
    const addressMatch = this.isEvm()
      ? this.address.toLowerCase() === other.address.toLowerCase()
      : this.address === other.address;
    return addressMatch && this.chain === other.chain;
  }

  override toString(): string {
    return `${this.address} (${this.chain})`;
  }

  private static patternFor(chain: SupportedChain): RegExp {
    if (EVM_CHAINS.includes(chain)) return CHAIN_PATTERNS.evm;
    if (chain === 'solana') return CHAIN_PATTERNS.solana;
    if (chain === 'tron') return CHAIN_PATTERNS.tron;
    if (chain === 'ton') return CHAIN_PATTERNS.ton;
    throw new Error(`BlockchainAddress: unsupported chain "${chain}"`);
  }
}
