/**
 * Port: Wallet Event Publisher
 * Domain-level abstraction for publishing wallet balance change events.
 */
export interface WalletEventPublisherPort {
  publishBalanceChange(event: {
    userId: string;
    currencyId: string;
    symbol: string;
    available: string;
    frozen: string;
    total: string;
  }): Promise<void>;
}

export const WALLET_EVENT_PUBLISHER = Symbol('WALLET_EVENT_PUBLISHER');
