import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';

export type TransactionWalletPurpose = 'DEPOSIT' | 'WITHDRAWAL' | 'BOTH';

export interface TransactionWalletRecord {
  wallet_id: string;
  chain: BlockchainChainDbValue;
  address: string;
  purpose: TransactionWalletPurpose;
  encrypted_private_key: string;
  label: string | null;
  is_active: boolean;
  is_default_user_deposit: boolean;
  default_set_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type TreasuryMainWalletChain = BlockchainChainDbValue;
export type TreasuryMainWalletStatus =
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'REJECTED'
  | 'PENDING_DELETION';

export interface TreasuryMainWalletRecord {
  main_wallet_id: string;
  chain: TreasuryMainWalletChain;
  address: string;
  encrypted_private_key: string;
  label: string | null;
  is_default: boolean;
  status: TreasuryMainWalletStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  last_rotated_at: Date | null;
  rotation_interval_days: number | null;
  created_at: Date;
  updated_at: Date;
}

export type TreasuryOperationAsset = 'NATIVE' | 'USDT_TRC20';

export interface TreasuryOperationRecord {
  operation_id: string;
  type: 'SWEEP' | 'FUND';
  chain: BlockchainChainDbValue;
  from_wallet_id: string | null;
  to_wallet_id: string | null;
  amount: string;
  asset: TreasuryOperationAsset;
  tx_hash: string | null;
  onchain_tx_id: string | null;
  status: 'PENDING' | 'PROCESSING' | 'TX_BROADCAST' | 'COMPLETED' | 'FAILED';
  broadcast_idempotency_key: string | null;
  actor_user_id: string;
  failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
  from_wallet?: TransactionWalletRecord | null;
  to_wallet?: TransactionWalletRecord | null;
}
