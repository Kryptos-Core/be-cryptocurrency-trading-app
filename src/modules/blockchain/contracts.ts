export interface BlockchainLinkedWalletRecord {
  link_id: string;
  user_id: string;
  chain: string;
  address: string;
  label: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REVOKED';
  linked_at: Date | null;
  created_at: Date;
  updated_at?: Date;
}

export interface BlockchainOnchainTransactionRecord {
  tx_id: string;
  user_id: string;
  linked_wallet_id: string | null;
  chain: string;
  type: string;
  tx_hash: string | null;
  from_address: string;
  to_address: string;
  amount: string;
  confirmations: number;
  status: string;
  confirmed_at: Date | null;
  credited_currency_id?: string | null;
  credited_amount?: string | null;
  conversion_rate?: string | null;
  credit_tx_id?: string | null;
  credited_at?: Date | null;
  treasury_operation_id?: string | null;
  /** Present for treasury Fund/Sweep rows: mirrors linked `treasury_operations.asset`. */
  asset?: 'NATIVE' | 'USDT_TRC20' | null;
  created_at: Date;
  updated_at?: Date;
}

export type BlockchainOnchainTransactionWriteInput = Partial<BlockchainOnchainTransactionRecord>;
