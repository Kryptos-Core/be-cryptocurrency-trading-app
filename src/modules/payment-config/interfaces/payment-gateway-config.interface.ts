/**
 * Typed shapes of the decrypted JSON stored in payment_method_configs.encrypted_config.
 * Strategy Pattern: each gateway type has its own config shape.
 */

export interface PayosGatewayConfig {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  returnUrl: string;
  cancelUrl: string;
  /** e.g. 'VND' */
  fiatSymbol: string;
  /** e.g. 'USDT' */
  quoteCurrencySymbol: string;
  /** e.g. '0.00004' — 1 VND → X USDT */
  fiatToQuoteRate: string;
  /** Basis points deducted from gross amount, e.g. '0' */
  fxSpreadBps: string;
}

export interface BlockchainGatewayConfig {
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Hot wallet private key for signing withdrawal transactions */
  hotWalletPrivateKey: string;
  /** Chain ID (ETH only) */
  chainId?: number;
  /** Max amount for auto-send; amounts above require manual approval */
  withdrawAutoMax: string;
  /** e.g. 'ETH', 'TRX', 'SOL' */
  nativeCurrencySymbol: string;
  isMainnet: boolean;
  /** Fallback FX rate when external price API is unavailable */
  fxFallbackRate: string;
}

export type PaymentGatewayConfig = PayosGatewayConfig | BlockchainGatewayConfig;

/** Pub/Sub event payload emitted to Redis channel `payment_config:events` */
export interface PaymentConfigEvent {
  event: 'TRANSITIONING' | 'ACTIVATED' | 'DEACTIVATED';
  type: string;
  network: string;
  configId: string;
  graceMins?: number;
  timestamp: string;
}

export const PAYMENT_CONFIG_EVENTS_CHANNEL = 'payment_config:events';
