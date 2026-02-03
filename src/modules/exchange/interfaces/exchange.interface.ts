import Decimal from 'decimal.js';

/**
 * Exchange Balance DTO
 * Represents balance from external exchange
 */
export interface ExchangeBalanceDto {
  available: Decimal;
  frozen: Decimal;
  total: Decimal;
  currency: string;
  timestamp: Date;
}

/**
 * Exchange Order Parameters
 */
export interface ExchangeOrderParams {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  quantity: Decimal;
  price?: Decimal;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

/**
 * Exchange Order Response
 */
export interface ExchangeOrderResponse {
  orderId: string;
  symbol: string;
  status: 'NEW' | 'FILLED' | 'PARTIALLY_FILLED' | 'CANCELED' | 'REJECTED';
  side: 'BUY' | 'SELL';
  type: string;
  price: Decimal;
  quantity: Decimal;
  executedQty: Decimal;
  timestamp: Date;
}

/**
 * Exchange Transaction Verification
 */
export interface ExchangeTransaction {
  txId: string;
  currency: string;
  amount: Decimal;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED';
  confirmations: number;
  timestamp: Date;
}

/**
 * Exchange Provider Interface
 * Strategy Pattern: Different exchange implementations
 */
export interface IExchangeProvider {
  /**
   * Get balance for a specific asset
   */
  getBalance(asset: string): Promise<ExchangeBalanceDto>;

  /**
   * Create an order on the exchange
   */
  createOrder(params: ExchangeOrderParams): Promise<ExchangeOrderResponse>;

  /**
   * Cancel an existing order
   */
  cancelOrder(orderId: string, symbol: string): Promise<void>;

  /**
   * Get order status
   */
  getOrderStatus(orderId: string, symbol: string): Promise<ExchangeOrderResponse>;

  /**
   * Verify transaction on blockchain/exchange
   */
  verifyTransaction(txId: string, asset: string): Promise<boolean>;

  /**
   * Create withdrawal request
   */
  createWithdrawal(
    asset: string,
    amount: Decimal,
    address: string,
  ): Promise<string>; // Returns withdrawal ID

  /**
   * Get exchange name
   */
  getName(): string;

  /**
   * Health check
   */
  ping(): Promise<boolean>;
}
