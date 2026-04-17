import type { BlockchainNetwork } from '@/common/enums';
import type {
  ResolveDepositTransfersContext,
  ResolvedDepositTransfer,
} from '@/modules/blockchain/deposit-transfer.types';

/**
 * Số dư on-chain trả về từ blockchain provider
 */
export interface BlockchainBalanceDto {
  address: string;
  network: BlockchainNetwork;
  /** Số dư native token (TRX / SOL / ETH) dạng string decimal */
  balance: string;
  /** Symbol native (TRX, SOL, ETH) */
  symbol: string;
  timestamp: Date;
}

/**
 * Trạng thái giao dịch on-chain
 */
export interface BlockchainTxStatusDto {
  txHash: string;
  network: BlockchainNetwork;
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'NOT_FOUND';
  confirmations: number;
  from: string;
  to: string;
  /** Giá trị native token dạng string decimal */
  value: string;
  blockNumber?: number;
  timestamp?: Date;
}

/**
 * Blockchain Provider Interface
 * Strategy Pattern: Mỗi chain implement interface này
 */
export interface IBlockchainProvider {
  /** Lấy mạng mà provider hỗ trợ */
  getNetwork(): BlockchainNetwork;

  /** Lấy số dư on-chain (native token) */
  getBalance(address: string): Promise<BlockchainBalanceDto>;

  /** Xác minh chữ ký (challenge-response flow) */
  verifySignature(address: string, message: string, signature: string): Promise<boolean>;

  /** Lấy trạng thái giao dịch on-chain */
  getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto>;

  /**
   * Inbound deposit legs for this tx hash whose recipient matches [ctx.expectedDepositAddress].
   * Native + whitelisted tokens (e.g. USDT on Tron); empty if none match.
   */
  resolveDepositTransfers(
    txHash: string,
    ctx: ResolveDepositTransfersContext,
  ): Promise<ResolvedDepositTransfer[]>;

  /** Kiểm tra address có hợp lệ trên chain này không */
  isValidAddress(address: string): boolean;

  /** Gửi giao dịch từ Hot Wallet sàn */
  sendTransaction(to: string, amount: string): Promise<string>;

  /** Lấy địa chỉ ví nóng của sàn (async vì key có thể được load từ DB) */
  getHotWalletAddress(): Promise<string>;
}
