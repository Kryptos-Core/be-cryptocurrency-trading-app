import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import Decimal from 'decimal.js';
import { CacheService } from '@/common/services';
import {
  BadRequestException,
  BusinessException,
  ConflictException,
} from '@/common/exceptions';
import { BlockchainNetwork, OnchainTxType, OnchainTxStatus } from '@/common/enums';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import { WalletLinkingService } from './wallet-linking.service';
import { SubmitDepositDto, RequestWithdrawalDto } from './dto';

/**
 * Onchain Transfer Service
 * Xử lý logic nạp/rút/chuyển tiền on-chain
 * - SRP: Chỉ xử lý giao dịch on-chain (tách biệt khỏi wallet linking)
 * - DIP: Dùng BlockchainProviderFactory (interface) + WalletLinkingService
 */
@Injectable()
export class OnchainTransferService {
  private readonly logger = new Logger(OnchainTransferService.name);


  /**
   * Preview giao dịch nạp tiền theo txHash để FE tự điền amount
   * Không tạo bản ghi giao dịch, chỉ đọc trạng thái on-chain.
   */
  async previewDepositTx(
    userId: string,
    chain: BlockchainNetwork,
    txHash: string,
  ): Promise<{
    chain: string;
    txHash: string;
    status: string;
    confirmations: number;
    fromAddress: string;
    toAddress: string;
    onchainAmount: string;
    senderLinked: boolean;
  }> {
    const provider = this.providerFactory.getProvider(chain);
    const txStatus = await provider.getTransactionStatus(txHash);

    if (txStatus.status === 'NOT_FOUND') {
      throw new BadRequestException(
        'Không tìm thấy giao dịch on-chain. Kiểm tra lại txHash.',
        'TX_NOT_FOUND',
      );
    }

    if (txStatus.status === 'FAILED') {
      throw new BadRequestException(
        'Giao dịch on-chain đã thất bại.',
        'TX_FAILED',
      );
    }

    const linked = await this.walletLinkingService.findVerifiedWallet(
      userId,
      chain,
      txStatus.from,
    );

    return {
      chain,
      txHash,
      status: txStatus.status,
      confirmations: txStatus.confirmations,
      fromAddress: txStatus.from,
      toAddress: txStatus.to,
      onchainAmount: txStatus.value,
      senderLinked: !!linked,
    };
  }
  /** TTL lock deposit (giây) */
  private static readonly DEPOSIT_LOCK_TTL = 600; // 10 phút
  /** TTL lock withdrawal (giây) */
  private static readonly WITHDRAWAL_LOCK_TTL = 60; // 1 phút

  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly walletLinkingService: WalletLinkingService,
  ) {}

  /**
   * Nạp tiền thủ công — user submit txHash đã gửi on-chain
   */
  async submitDeposit(
    userId: string,
    dto: SubmitDepositDto,
  ): Promise<{
    txId: string;
    status: string;
    amount: string;
    chain: string;
  }> {
    const provider = this.providerFactory.getProvider(dto.chain);

    // Lock chống double-submit
    const lockKey = `deposit:pending:${dto.txHash}`;
    const locked = await this.cacheService.exists(lockKey);
    if (locked) {
      throw new ConflictException(
        'Giao dịch này đang được xử lý. Vui lòng chờ.',
        'DEPOSIT_PROCESSING',
      );
    }
    await this.cacheService.set(lockKey, '1', OnchainTransferService.DEPOSIT_LOCK_TTL);

    try {
      // Kiểm tra txHash đã tồn tại chưa (idempotent)
      const existing = await this.dataSource.query(
        `SELECT tx_id FROM onchain_transactions WHERE chain = ? AND tx_hash = ? LIMIT 1`,
        [dto.chain, dto.txHash],
      );
      if (existing?.length > 0) {
        throw new ConflictException(
          'Giao dịch này đã được xử lý trước đó',
          'DEPOSIT_ALREADY_PROCESSED',
        );
      }

      // Verify on-chain
      const txStatus = await provider.getTransactionStatus(dto.txHash);

      if (txStatus.status === 'NOT_FOUND') {
        throw new BadRequestException(
          'Không tìm thấy giao dịch on-chain. Kiểm tra lại txHash hoặc chờ tx được confirm.',
          'TX_NOT_FOUND',
        );
      }

      if (txStatus.status === 'FAILED') {
        throw new BadRequestException(
          'Giao dịch on-chain đã thất bại',
          'TX_FAILED',
        );
      }

      // Verify sender = ví đã liên kết của user
      const senderAddress = txStatus.from;
      const linked = await this.walletLinkingService.findVerifiedWallet(
        userId,
        dto.chain,
        senderAddress,
      );

      if (!linked) {
        throw new BadRequestException(
          `Địa chỉ gửi (${senderAddress}) không phải ví đã liên kết của bạn. Hãy liên kết ví trước.`,
          'SENDER_NOT_LINKED',
        );
      }

      // Verify amount khớp (cho phép sai số nhỏ do gas)
      const onchainAmount = new Decimal(txStatus.value || '0');
      const submittedAmount = new Decimal(dto.amount);
      const tolerance = new Decimal('0.0001');

      if (onchainAmount.minus(submittedAmount).abs().greaterThan(tolerance)) {
        throw new BadRequestException(
          `Số tiền không khớp. On-chain: ${onchainAmount}, Submit: ${submittedAmount}`,
          'AMOUNT_MISMATCH',
        );
      }

      // Tạo bản ghi giao dịch
      const txId = uuidv7();
      const status =
        txStatus.status === 'CONFIRMED'
          ? OnchainTxStatus.COMPLETED
          : OnchainTxStatus.CONFIRMING;

      await this.dataSource.query(
        `INSERT INTO onchain_transactions
         (tx_id, user_id, linked_wallet_id, chain, type, tx_hash, from_address, to_address, amount, confirmations, status, confirmed_at)
         VALUES (?, ?, ?, ?, 'DEPOSIT', ?, ?, ?, ?, ?, ?, ?)`,
        [
          txId,
          userId,
          linked.link_id,
          dto.chain,
          dto.txHash,
          txStatus.from,
          txStatus.to,
          onchainAmount.toString(),
          txStatus.confirmations,
          status,
          status === OnchainTxStatus.COMPLETED ? new Date() : null,
        ],
      );

      this.logger.log(
        `[Deposit] userId=${userId}, chain=${dto.chain}, amount=${onchainAmount}, txHash=${dto.txHash}, status=${status}`,
      );

      return {
        txId,
        status,
        amount: onchainAmount.toString(),
        chain: dto.chain,
      };
    } finally {
      // Xoá lock sau khi xử lý xong
      await this.cacheService.delete(lockKey);
    }
  }

  /**
   * Yêu cầu rút tiền — gửi coin từ platform về ví đã liên kết
   */
  async requestWithdrawal(
    userId: string,
    dto: RequestWithdrawalDto,
  ): Promise<{
    txId: string;
    status: string;
    amount: string;
    chain: string;
    toAddress: string;
  }> {
    // Lock chống spam rút liên tục
    const lockKey = `withdrawal:lock:${userId}:${dto.chain}`;
    const locked = await this.cacheService.exists(lockKey);
    if (locked) {
      throw new ConflictException(
        'Bạn đã có yêu cầu rút tiền đang xử lý. Vui lòng chờ.',
        'WITHDRAWAL_RATE_LIMITED',
      );
    }

    // Kiểm tra ví liên kết
    const linkedWallet = await this.walletLinkingService.findByLinkId(
      userId,
      dto.linkedWalletId,
    );

    if (!linkedWallet) {
      throw new BadRequestException(
        'Ví liên kết không tìm thấy',
        'WALLET_NOT_FOUND',
      );
    }

    if (linkedWallet.status !== 'VERIFIED') {
      throw new BadRequestException(
        'Ví chưa được xác minh. Hãy xác minh ví trước khi rút tiền.',
        'WALLET_NOT_VERIFIED',
      );
    }

    if (linkedWallet.chain !== dto.chain) {
      throw new BadRequestException(
        'Mạng blockchain không khớp với ví liên kết',
        'CHAIN_MISMATCH',
      );
    }

    // Validate amount
    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Số tiền phải lớn hơn 0', 'INVALID_AMOUNT');
    }

    // Set lock
    await this.cacheService.set(lockKey, '1', OnchainTransferService.WITHDRAWAL_LOCK_TTL);

    // Lấy thông tin Hot Wallet và gửi giao dịch thật
    const provider = this.providerFactory.getProvider(dto.chain);
    const hotWalletAddress = provider.getHotWalletAddress();

    let txHash: string | null = null;
    let status = OnchainTxStatus.PENDING;

    try {
      txHash = await provider.sendTransaction(linkedWallet.address, amount.toString());
      status = OnchainTxStatus.CONFIRMING;
    } catch (error) {
      this.logger.error(`[Withdrawal] Gửi on-chain thất bại cho userId=${userId}:`, error);
      status = OnchainTxStatus.FAILED;
      // Trong thực tế, có thể cần cơ chế bù tiền hoặc thông báo cho admin ở đây
    }

    // Tạo bản ghi withdrawal
    const txId = uuidv7();

    await this.dataSource.query(
      `INSERT INTO onchain_transactions
       (tx_id, user_id, linked_wallet_id, chain, type, tx_hash, from_address, to_address, amount, status)
       VALUES (?, ?, ?, ?, 'WITHDRAWAL', ?, ?, ?, ?, ?)`,
      [
        txId,
        userId,
        dto.linkedWalletId,
        dto.chain,
        txHash,
        hotWalletAddress,
        linkedWallet.address,
        amount.toString(),
        status,
      ],
    );

    // Cache trạng thái để FE poll nhanh
    await this.cacheService.set(
      `withdrawal:status:${txId}`,
      { txId, status, amount: amount.toString(), txHash },
      3600,
    );

    this.logger.log(
      `[Withdrawal] userId=${userId}, chain=${dto.chain}, amount=${amount}, toAddress=${linkedWallet.address}`,
    );

    return {
      txId,
      status: OnchainTxStatus.PENDING,
      amount: amount.toString(),
      chain: dto.chain,
      toAddress: linkedWallet.address,
    };
  }

  /**
   * Lấy lịch sử giao dịch on-chain của user
   */
  async getTransactions(
    userId: string,
    limit: number = 50,
  ): Promise<
    Array<{
      txId: string;
      chain: string;
      type: string;
      txHash: string | null;
      fromAddress: string;
      toAddress: string;
      amount: string;
      status: string;
      confirmations: number;
      createdAt: string;
      confirmedAt: string | null;
    }>
  > {
    const rows = await this.dataSource.query(
      `SELECT tx_id, chain, type, tx_hash, from_address, to_address, amount, status, confirmations, created_at, confirmed_at
       FROM onchain_transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
      [userId, limit],
    );

    return (rows || []).map((r: any) => ({
      txId: r.tx_id,
      chain: r.chain,
      type: r.type,
      txHash: r.tx_hash ?? null,
      fromAddress: r.from_address,
      toAddress: r.to_address,
      amount: String(r.amount ?? '0'),
      status: r.status,
      confirmations: r.confirmations ?? 0,
      createdAt: r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
      confirmedAt: r.confirmed_at
        ? r.confirmed_at instanceof Date
          ? r.confirmed_at.toISOString()
          : String(r.confirmed_at)
        : null,
    }));
  }

  /**
   * Lấy chi tiết 1 giao dịch
   */
  async getTransactionById(
    userId: string,
    txId: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT tx_id, chain, type, tx_hash, from_address, to_address, amount, status, confirmations, created_at, confirmed_at
       FROM onchain_transactions
       WHERE tx_id = ? AND user_id = ?
       LIMIT 1`,
      [txId, userId],
    );

    const r = rows?.[0];
    if (!r) {
      throw new BadRequestException(
        'Giao dịch không tìm thấy',
        'TX_NOT_FOUND',
      );
    }

    return {
      txId: r.tx_id,
      chain: r.chain,
      type: r.type,
      txHash: r.tx_hash ?? null,
      fromAddress: r.from_address,
      toAddress: r.to_address,
      amount: String(r.amount ?? '0'),
      status: r.status,
      confirmations: r.confirmations ?? 0,
      createdAt: r.created_at instanceof Date
        ? r.created_at.toISOString()
        : String(r.created_at),
      confirmedAt: r.confirmed_at
        ? r.confirmed_at instanceof Date
          ? r.confirmed_at.toISOString()
          : String(r.confirmed_at)
        : null,
    };
  }
}
