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
import { BlockchainNetwork, OnchainTxStatus } from '@/common/enums';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import { WalletLinkingService } from './wallet-linking.service';
import { DepositFxService } from './deposit-fx.service';
import { SubmitDepositDto, RequestWithdrawalDto } from './dto';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { WalletReferenceType, WalletTransactionAction } from '@/common/enums';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { ConfigService } from '@nestjs/config';

/**
 * Onchain Transfer Service
 * Xử lý logic nạp/rút/chuyển tiền on-chain
 * - SRP: Chỉ xử lý giao dịch on-chain (tách biệt khỏi wallet linking)
 * - DIP: Dùng BlockchainProviderFactory (interface) + WalletLinkingService
 */
@Injectable()
export class OnchainTransferService {
  private readonly logger = new Logger(OnchainTransferService.name);

  private treasuryLog(event: string, fields: Record<string, unknown>): void {
    this.logger.log(JSON.stringify({
      domain: 'treasury',
      event,
      at: new Date().toISOString(),
      ...fields,
    }));
  }

  private treasuryAlert(event: string, fields: Record<string, unknown>): void {
    this.logger.warn(JSON.stringify({
      domain: 'treasury',
      severity: 'alert',
      event,
      at: new Date().toISOString(),
      ...fields,
    }));
  }


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
  /** TTL cache cho kết quả idempotent withdrawal (giây) */
  private static readonly WITHDRAWAL_IDEM_TTL = 24 * 60 * 60; // 24 giờ

  constructor(
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly walletLinkingService: WalletLinkingService,
    private readonly depositFxService: DepositFxService,
    private readonly walletsService: WalletsService,
    private readonly currencyRepository: CurrencyRepository,
    private readonly configService: ConfigService,
  ) {}

  private normalizeIdempotencyKey(userId: string, dto: RequestWithdrawalDto): string {
    const provided = dto.idempotencyKey?.trim();
    if (provided) return provided;
    return `${userId}:${dto.chain}:${dto.linkedWalletId}:${dto.amount}`;
  }

  private getWithdrawAutoMaxByChain(chain: BlockchainNetwork): Decimal {
    const globalMax = this.configService.get<string>('BLOCKCHAIN_WITHDRAW_AUTO_MAX') || '0';
    const chainKey = `BLOCKCHAIN_WITHDRAW_AUTO_MAX_${chain}`;
    const chainMax = this.configService.get<string>(chainKey);
    const resolved = chainMax?.trim() ? chainMax : globalMax;
    try {
      const parsed = new Decimal(resolved);
      return parsed.greaterThanOrEqualTo(0) ? parsed : new Decimal(0);
    } catch {
      return new Decimal(0);
    }
  }

  private getChainAssetSymbol(chain: BlockchainNetwork): string {
    switch (chain) {
      case BlockchainNetwork.ETH_SEPOLIA:
        return this.configService.get<string>('BLOCKCHAIN_WITHDRAW_ETH_SYMBOL')?.trim().toUpperCase() || 'ETH';
      case BlockchainNetwork.SOLANA_DEVNET:
        return this.configService.get<string>('BLOCKCHAIN_WITHDRAW_SOL_SYMBOL')?.trim().toUpperCase() || 'SOL';
      case BlockchainNetwork.TRON_NILE:
      case BlockchainNetwork.TRON_SHASTA:
        return this.configService.get<string>('BLOCKCHAIN_WITHDRAW_TRON_SYMBOL')?.trim().toUpperCase() || 'TRX';
      default:
        throw new BadRequestException('Mạng blockchain không được hỗ trợ', 'CHAIN_NOT_SUPPORTED');
    }
  }

  private async resolveWithdrawalCurrencyId(chain: BlockchainNetwork): Promise<number> {
    const symbol = this.getChainAssetSymbol(chain);
    const currency = await this.currencyRepository.findBySymbol(symbol);
    if (!currency?.currency_id) {
      throw new BadRequestException(
        `Không tìm thấy currency ${symbol} để xử lý rút tiền`,
        'WITHDRAWAL_CURRENCY_NOT_FOUND',
      );
    }
    const parsed = Number(currency.currency_id);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException(
        `currency_id của ${symbol} không hợp lệ: ${currency.currency_id}`,
        'WITHDRAWAL_CURRENCY_INVALID',
      );
    }
    return parsed;
  }

  private toLedgerRefId(seed: string): number {
    const compact = seed.replace(/[^a-fA-F0-9]/g, '').slice(0, 12);
    if (compact.length === 0) {
      return Date.now();
    }
    return parseInt(compact, 16);
  }

  private async hasLedgerEntry(
    userId: string,
    currencyId: string,
    refType: WalletReferenceType,
    refId: number,
    direction: 'CREDIT' | 'DEBIT',
  ): Promise<boolean> {
    const rows = await this.dataSource.query(
      `SELECT ledger_id
       FROM wallet_ledger
       WHERE user_id = ? AND currency_id = ? AND ref_type = ? AND ref_id = ? AND direction = ?
       LIMIT 1`,
      [userId, currencyId, refType, String(refId), direction],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async settleDepositLedgerIfNeeded(
    txId: string,
    userId: string,
    chain: BlockchainNetwork,
    amount: string,
  ): Promise<{ settled: boolean; alreadySettled: boolean }> {
    // Quy đổi native coin → platform cash currency (USDT)
    // Thay vì credit TRX/ETH trực tiếp, luôn credit vào ví tiền ảo (USDT)
    const conversion = await this.depositFxService.convertToPlatformCash(chain, amount);
    const { creditCurrencyId, creditAmount, conversionRate } = conversion;

    const refId = this.toLedgerRefId(`${txId}-credit`);
    const existed = await this.hasLedgerEntry(
      userId,
      String(creditCurrencyId),
      WalletReferenceType.EXTERNAL_DEPOSIT,
      refId,
      'CREDIT',
    );
    if (existed) {
      return { settled: false, alreadySettled: true };
    }

    try {
      await this.walletsService.applyTransaction(userId, {
        currencyId: creditCurrencyId,
        action: WalletTransactionAction.CREDIT,
        amount: creditAmount,
        refType: WalletReferenceType.EXTERNAL_DEPOSIT,
        refId,
      });
    } catch (error: any) {
      if (error?.code === 'DUPLICATE_LEDGER_ENTRY') {
        return { settled: false, alreadySettled: true };
      }
      throw error;
    }

    // Lưu thông tin quy đổi vào onchain_transactions để audit/hiển thị FE
    await this.dataSource.query(
      `UPDATE onchain_transactions
       SET credited_currency_id = ?, credited_amount = ?, conversion_rate = ?
       WHERE tx_id = ?`,
      [String(creditCurrencyId), creditAmount, conversionRate, txId],
    );

    return { settled: true, alreadySettled: false };
  }

  private async settleWithdrawalLedger(
    txId: string,
    userId: string,
    currencyId: number,
    amount: Decimal,
    success: boolean,
  ): Promise<void> {
    const unfreezeRefId = this.toLedgerRefId(`${txId}-unfreeze`);
    await this.walletsService.applyTransaction(userId, {
      currencyId,
      action: WalletTransactionAction.UNFREEZE,
      amount: amount.toString(),
      refType: WalletReferenceType.EXTERNAL_WITHDRAWAL,
      refId: unfreezeRefId,
    });

    if (!success) {
      return;
    }

    const debitRefId = this.toLedgerRefId(`${txId}-debit`);
    await this.walletsService.applyTransaction(userId, {
      currencyId,
      action: WalletTransactionAction.DEBIT,
      amount: amount.toString(),
      refType: WalletReferenceType.EXTERNAL_WITHDRAWAL,
      refId: debitRefId,
    });
  }

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
    settled?: boolean;
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

      let settled = false;
      if (status === OnchainTxStatus.COMPLETED) {
        const settlement = await this.settleDepositLedgerIfNeeded(
          txId,
          userId,
          dto.chain,
          onchainAmount.toString(),
        );
        settled = settlement.settled || settlement.alreadySettled;
      }

      this.logger.log(
        `[Deposit] userId=${userId}, chain=${dto.chain}, amount=${onchainAmount}, txHash=${dto.txHash}, status=${status}`,
      );

      this.treasuryLog('deposit.submit.result', {
        userId,
        txId,
        chain: dto.chain,
        txHash: dto.txHash,
        amount: onchainAmount.toString(),
        status,
        settled,
      });

      return {
        txId,
        status,
        amount: onchainAmount.toString(),
        chain: dto.chain,
        settled,
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
    reviewRequired?: boolean;
  }> {
    this.treasuryLog('withdraw.request.received', {
      userId,
      chain: dto.chain,
      linkedWalletId: dto.linkedWalletId,
      amount: dto.amount,
      idempotencyKey: dto.idempotencyKey || null,
    });

    const idempotencyKey = this.normalizeIdempotencyKey(userId, dto);
    const idemCacheKey = `withdrawal:idem:${userId}:${dto.chain}:${idempotencyKey}`;
    const cached = await this.cacheService.get<{
      txId: string;
      status: string;
      amount: string;
      chain: string;
      toAddress: string;
      reviewRequired?: boolean;
    }>(idemCacheKey);
    if (cached) {
      this.treasuryLog('withdraw.request.idempotent_hit', {
        userId,
        chain: dto.chain,
        idempotencyKey,
        txId: cached.txId,
        status: cached.status,
      });
      return cached;
    }

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

    const currencyId = await this.resolveWithdrawalCurrencyId(dto.chain);

    // Set lock
    await this.cacheService.set(lockKey, '1', OnchainTransferService.WITHDRAWAL_LOCK_TTL);

    const txId = uuidv7();
    const freezeRefId = this.toLedgerRefId(`${txId}-freeze`);

    // Luôn freeze trước để BE giữ state số dư, tránh overspend khi gọi rút đồng thời.
    await this.walletsService.applyTransaction(userId, {
      currencyId,
      action: WalletTransactionAction.FREEZE,
      amount: amount.toString(),
      refType: WalletReferenceType.EXTERNAL_WITHDRAWAL,
      refId: freezeRefId,
    });

    const autoMax = this.getWithdrawAutoMaxByChain(dto.chain);
    const shouldAutoSend = amount.lessThanOrEqualTo(autoMax);

    if (!shouldAutoSend) {
      const provider = this.providerFactory.getProvider(dto.chain);
      const hotWalletAddress = provider.getHotWalletAddress();

      await this.dataSource.query(
        `INSERT INTO onchain_transactions
         (tx_id, user_id, linked_wallet_id, chain, type, tx_hash, from_address, to_address, amount, status)
         VALUES (?, ?, ?, ?, 'WITHDRAWAL', NULL, ?, ?, ?, ?)`,
        [
          txId,
          userId,
          dto.linkedWalletId,
          dto.chain,
          hotWalletAddress,
          linkedWallet.address,
          amount.toString(),
          OnchainTxStatus.PENDING,
        ],
      );

      const manualResult = {
        txId,
        status: OnchainTxStatus.PENDING,
        amount: amount.toString(),
        chain: dto.chain,
        toAddress: linkedWallet.address,
        reviewRequired: true,
      };

      await this.cacheService.set(
        `withdrawal:status:${txId}`,
        { ...manualResult, mode: 'manual_review' },
        3600,
      );
      await this.cacheService.set(
        idemCacheKey,
        manualResult,
        OnchainTransferService.WITHDRAWAL_IDEM_TTL,
      );

      this.treasuryLog('withdraw.request.pending_manual_review', {
        userId,
        txId,
        chain: dto.chain,
        amount: amount.toString(),
        toAddress: linkedWallet.address,
        idempotencyKey,
      });

      return manualResult;
    }

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
      this.treasuryAlert('withdraw.request.send_failed', {
        userId,
        txId,
        chain: dto.chain,
        amount: amount.toString(),
        toAddress: linkedWallet.address,
        idempotencyKey,
      });
    }

    await this.settleWithdrawalLedger(
      txId,
      userId,
      currencyId,
      amount,
      status === OnchainTxStatus.CONFIRMING,
    );

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

    const result = {
      txId,
      status,
      amount: amount.toString(),
      chain: dto.chain,
      toAddress: linkedWallet.address,
    };

    await this.cacheService.set(
      idemCacheKey,
      result,
      OnchainTransferService.WITHDRAWAL_IDEM_TTL,
    );

    this.treasuryLog('withdraw.request.result', {
      userId,
      txId,
      chain: dto.chain,
      amount: amount.toString(),
      txHash,
      status,
      idempotencyKey,
    });

    return result;
  }

  async approveManualWithdrawal(
    actorUserId: string,
    txId: string,
  ): Promise<{
    txId: string;
    status: string;
    amount: string;
    chain: string;
    toAddress: string;
    txHash: string | null;
  }> {
    this.treasuryLog('withdraw.manual.approve.requested', {
      actorUserId,
      txId,
    });

    const rows = await this.dataSource.query(
      `SELECT tx_id, user_id, chain, type, tx_hash, from_address, to_address, amount, status
       FROM onchain_transactions
       WHERE tx_id = ?
       LIMIT 1`,
      [txId],
    );
    const tx = rows?.[0];
    if (!tx || tx.type !== 'WITHDRAWAL') {
      throw new BadRequestException('Yêu cầu rút tiền không tồn tại', 'WITHDRAWAL_NOT_FOUND');
    }

    if (tx.tx_hash) {
      return {
        txId: tx.tx_id,
        status: tx.status,
        amount: String(tx.amount),
        chain: tx.chain,
        toAddress: tx.to_address,
        txHash: tx.tx_hash,
      };
    }

    if (tx.status !== OnchainTxStatus.PENDING) {
      throw new BadRequestException(
        'Yêu cầu rút tiền không còn ở trạng thái chờ duyệt',
        'WITHDRAWAL_NOT_PENDING_REVIEW',
      );
    }

    const amount = new Decimal(String(tx.amount));
    const currencyId = await this.resolveWithdrawalCurrencyId(tx.chain as BlockchainNetwork);
    const provider = this.providerFactory.getProvider(tx.chain as BlockchainNetwork);

    let txHash: string | null = null;
    let status = OnchainTxStatus.FAILED;

    try {
      txHash = await provider.sendTransaction(tx.to_address, amount.toString());
      status = OnchainTxStatus.CONFIRMING;
    } catch (error) {
      this.logger.error(
        `[Withdrawal-ManualApprove] on-chain send failed txId=${txId} by actor=${actorUserId}`,
        error as any,
      );
      status = OnchainTxStatus.FAILED;
      this.treasuryAlert('withdraw.manual.approve.send_failed', {
        actorUserId,
        txId,
        userId: tx.user_id,
        chain: tx.chain,
        amount: amount.toString(),
        toAddress: tx.to_address,
      });
    }

    await this.settleWithdrawalLedger(
      txId,
      tx.user_id,
      currencyId,
      amount,
      status === OnchainTxStatus.CONFIRMING,
    );

    await this.dataSource.query(
      `UPDATE onchain_transactions
       SET tx_hash = ?, from_address = ?, status = ?, confirmations = ?, confirmed_at = ?
       WHERE tx_id = ?`,
      [
        txHash,
        provider.getHotWalletAddress(),
        status,
        status === OnchainTxStatus.CONFIRMING ? 0 : 0,
        null,
        txId,
      ],
    );

    const result = {
      txId,
      status,
      amount: amount.toString(),
      chain: tx.chain,
      toAddress: tx.to_address,
      txHash,
    };

    await this.cacheService.set(`withdrawal:status:${txId}`, result, 3600);

    this.treasuryLog('withdraw.manual.approve.result', {
      actorUserId,
      txId,
      userId: tx.user_id,
      chain: tx.chain,
      amount: amount.toString(),
      status,
      txHash,
    });

    return result;
  }

  async rejectManualWithdrawal(
    actorUserId: string,
    txId: string,
    reason?: string,
  ): Promise<{ txId: string; status: string; reason?: string }> {
    this.treasuryLog('withdraw.manual.reject.requested', {
      actorUserId,
      txId,
      reason: reason || null,
    });

    const rows = await this.dataSource.query(
      `SELECT tx_id, user_id, chain, type, tx_hash, amount, status
       FROM onchain_transactions
       WHERE tx_id = ?
       LIMIT 1`,
      [txId],
    );
    const tx = rows?.[0];
    if (!tx || tx.type !== 'WITHDRAWAL') {
      throw new BadRequestException('Yêu cầu rút tiền không tồn tại', 'WITHDRAWAL_NOT_FOUND');
    }

    if (tx.tx_hash) {
      throw new BadRequestException('Giao dịch đã được gửi on-chain, không thể từ chối', 'WITHDRAWAL_ALREADY_SENT');
    }

    if (tx.status !== OnchainTxStatus.PENDING) {
      throw new BadRequestException(
        'Yêu cầu rút tiền không còn ở trạng thái chờ duyệt',
        'WITHDRAWAL_NOT_PENDING_REVIEW',
      );
    }

    const amount = new Decimal(String(tx.amount));
    const currencyId = await this.resolveWithdrawalCurrencyId(tx.chain as BlockchainNetwork);
    await this.settleWithdrawalLedger(txId, tx.user_id, currencyId, amount, false);

    await this.dataSource.query(
      `UPDATE onchain_transactions
       SET status = ?, confirmed_at = ?
       WHERE tx_id = ?`,
      [OnchainTxStatus.FAILED, null, txId],
    );

    this.logger.log(
      `[Withdrawal-ManualReject] txId=${txId}, actor=${actorUserId}, reason=${reason || 'N/A'}`,
    );

    await this.cacheService.set(
      `withdrawal:status:${txId}`,
      { txId, status: OnchainTxStatus.FAILED, reason: reason || null },
      3600,
    );

    this.treasuryLog('withdraw.manual.reject.result', {
      actorUserId,
      txId,
      userId: tx.user_id,
      chain: tx.chain,
      amount: amount.toString(),
      status: OnchainTxStatus.FAILED,
      reason: reason || null,
    });

    return {
      txId,
      status: OnchainTxStatus.FAILED,
      reason,
    };
  }

  async processPendingManualWithdrawals(
    actorUserId: string,
    limit: number = 20,
  ): Promise<{ processed: number; success: number; failed: number; items: Array<{ txId: string; status: string }> }> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const rows = await this.dataSource.query(
      `SELECT tx_id
       FROM onchain_transactions
       WHERE type = 'WITHDRAWAL' AND status = 'PENDING' AND tx_hash IS NULL
       ORDER BY created_at ASC
       LIMIT ?`,
      [safeLimit],
    );

    const items: Array<{ txId: string; status: string }> = [];
    let success = 0;
    let failed = 0;

    for (const row of rows || []) {
      try {
        const result = await this.approveManualWithdrawal(actorUserId, String(row.tx_id));
        items.push({ txId: result.txId, status: result.status });
        if (result.status === OnchainTxStatus.CONFIRMING) {
          success += 1;
        } else {
          failed += 1;
        }
      } catch (error: any) {
        failed += 1;
        items.push({ txId: String(row.tx_id), status: 'FAILED' });
        this.logger.error(
          `[Withdrawal-ManualWorker] failed txId=${row.tx_id} actor=${actorUserId}: ${error?.message || error}`,
        );
      }
    }

    return {
      processed: (rows || []).length,
      success,
      failed,
      items,
    };
  }

  async settleDepositByTxId(
    userId: string,
    txId: string,
  ): Promise<{ txId: string; status: string; settled: boolean; confirmations: number }> {
    this.treasuryLog('deposit.settle.requested', {
      userId,
      txId,
    });

    const rows = await this.dataSource.query(
      `SELECT tx_id, user_id, chain, type, tx_hash, amount, status, confirmations
       FROM onchain_transactions
       WHERE tx_id = ? AND user_id = ?
       LIMIT 1`,
      [txId, userId],
    );
    const tx = rows?.[0];
    if (!tx || tx.type !== 'DEPOSIT') {
      throw new BadRequestException('Giao dịch nạp tiền không tồn tại', 'DEPOSIT_NOT_FOUND');
    }

    if (!tx.tx_hash) {
      throw new BusinessException('Giao dịch nạp chưa có tx_hash hợp lệ', 'DEPOSIT_TXHASH_MISSING');
    }

    const provider = this.providerFactory.getProvider(tx.chain as BlockchainNetwork);
    const latest = await provider.getTransactionStatus(String(tx.tx_hash));

    if (latest.status === 'FAILED') {
      await this.dataSource.query(
        `UPDATE onchain_transactions SET status = ?, confirmations = ? WHERE tx_id = ?`,
        [OnchainTxStatus.FAILED, latest.confirmations ?? 0, txId],
      );
      this.treasuryAlert('deposit.settle.chain_failed', {
        userId,
        txId,
        txHash: tx.tx_hash,
        confirmations: latest.confirmations ?? 0,
      });
      return {
        txId,
        status: OnchainTxStatus.FAILED,
        settled: false,
        confirmations: latest.confirmations ?? 0,
      };
    }

    if (latest.status !== 'CONFIRMED') {
      await this.dataSource.query(
        `UPDATE onchain_transactions SET status = ?, confirmations = ? WHERE tx_id = ?`,
        [OnchainTxStatus.CONFIRMING, latest.confirmations ?? 0, txId],
      );
      this.treasuryLog('deposit.settle.waiting_confirmations', {
        userId,
        txId,
        txHash: tx.tx_hash,
        confirmations: latest.confirmations ?? 0,
      });
      return {
        txId,
        status: OnchainTxStatus.CONFIRMING,
        settled: false,
        confirmations: latest.confirmations ?? 0,
      };
    }

    await this.dataSource.query(
      `UPDATE onchain_transactions
       SET status = ?, confirmations = ?, confirmed_at = ?
       WHERE tx_id = ?`,
      [OnchainTxStatus.COMPLETED, latest.confirmations ?? 0, new Date(), txId],
    );

    const settlement = await this.settleDepositLedgerIfNeeded(
      txId,
      userId,
      tx.chain as BlockchainNetwork,
      String(tx.amount),
    );

    this.treasuryLog('deposit.settle.result', {
      userId,
      txId,
      txHash: tx.tx_hash,
      confirmations: latest.confirmations ?? 0,
      settled: settlement.settled || settlement.alreadySettled,
    });

    return {
      txId,
      status: OnchainTxStatus.COMPLETED,
      settled: settlement.settled || settlement.alreadySettled,
      confirmations: latest.confirmations ?? 0,
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
      creditedAmount: string | null;
      creditedCurrencyId: string | null;
      conversionRate: string | null;
    }>
  > {
    const rows = await this.dataSource.query(
      `SELECT tx_id, chain, type, tx_hash, from_address, to_address, amount, status,
              confirmations, created_at, confirmed_at,
              credited_currency_id, credited_amount, conversion_rate
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
      creditedAmount: r.credited_amount != null ? String(r.credited_amount) : null,
      creditedCurrencyId: r.credited_currency_id ?? null,
      conversionRate: r.conversion_rate != null ? String(r.conversion_rate) : null,
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
      `SELECT tx_id, chain, type, tx_hash, from_address, to_address, amount, status,
              confirmations, created_at, confirmed_at,
              credited_currency_id, credited_amount, conversion_rate
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
      creditedAmount: r.credited_amount != null ? String(r.credited_amount) : null,
      creditedCurrencyId: r.credited_currency_id ?? null,
      conversionRate: r.conversion_rate != null ? String(r.conversion_rate) : null,
    };
  }
}
