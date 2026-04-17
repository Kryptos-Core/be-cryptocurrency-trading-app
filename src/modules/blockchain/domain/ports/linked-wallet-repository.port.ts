import type { BlockchainLinkedWalletRecord } from '@/modules/blockchain/contracts';

/**
 * Port: Linked Wallet Repository
 * Domain-level abstraction for linked-wallet persistence.
 */
export interface LinkedWalletRepositoryPort {
  findByUserAndChain(userId: string, chain: string): Promise<BlockchainLinkedWalletRecord | null>;

  findByAddress(chain: string, address: string): Promise<BlockchainLinkedWalletRecord | null>;

  findByUser(userId: string): Promise<BlockchainLinkedWalletRecord[]>;

  /** Lấy tất cả ví chưa bị REVOKED của user (dùng cho danh sách hiển thị) */
  findActiveByUser(userId: string): Promise<
    Array<{
      link_id: string;
      chain: string;
      address: string;
      label: string | null;
      status: string;
      linked_at: Date | null;
    }>
  >;

  /** Tìm ví VERIFIED theo user+chain+address */
  findVerifiedByUserChainAddress(
    userId: string,
    chain: string,
    address: string,
  ): Promise<BlockchainLinkedWalletRecord | null>;

  /** Tìm bất kỳ ví nào theo linkId + userId */
  findByLinkIdAndUserId(
    linkId: string,
    userId: string,
  ): Promise<BlockchainLinkedWalletRecord | null>;

  create(data: Partial<BlockchainLinkedWalletRecord>): Promise<BlockchainLinkedWalletRecord>;

  updateStatus(linkedWalletId: string, status: string): Promise<void>;

  /**
   * INSERT ... ON DUPLICATE KEY UPDATE - upsert ví với status = VERIFIED.
   * Trả về linkId được áp dụng (có thể là id đã tồn tại trên DB).
   */
  upsertVerified(params: {
    linkId: string;
    userId: string;
    chain: string;
    address: string;
    label: string | null;
    now: Date;
  }): Promise<string>;

  /**
   * Đặt status = REVOKED cho ví với linkId + userId (chỉ khi đang VERIFIED).
   * Trả về số row bị ảnh hưởng - 0 = không tìm thấy hoặc đã REVOKED.
   */
  revokeByLinkIdAndUserId(linkId: string, userId: string): Promise<number>;
}

export const LINKED_WALLET_REPOSITORY = Symbol('LINKED_WALLET_REPOSITORY');
