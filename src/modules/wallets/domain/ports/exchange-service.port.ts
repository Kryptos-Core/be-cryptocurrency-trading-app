/**
 * Port: Exchange Service
 * Domain-level abstraction for exchange balance queries.
 */
export interface ExchangeServicePort {
  getBalance(asset: string): Promise<{ available: string; frozen: string }>;
}

export const EXCHANGE_SERVICE_PORT = Symbol('EXCHANGE_SERVICE_PORT');
