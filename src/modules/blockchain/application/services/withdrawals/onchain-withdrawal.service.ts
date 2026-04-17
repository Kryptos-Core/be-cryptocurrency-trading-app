import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import { nativeSymbolForChain } from '@/common/constants/chain-registry';
import {
  BlockchainNetwork,
  OnchainTxStatus,
  WalletReferenceType,
  WalletTransactionAction,
} from '@/common/enums';
import { BadRequestException, ConflictException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { BlockchainProviderFactory } from './blockchain-provider.factory';
import {
  ONCHAIN_TRANSACTION_REPOSITORY,
  type OnchainTransactionRepositoryPort,
} from './domain/ports';
import type { RequestWithdrawalDto } from './dto';
import { WalletLinkingService } from '../wallet-linking/wallet-linking.service';

@Injectable()
export class OnchainWithdrawalService {
  private readonly logger = new Logger(OnchainWithdrawalService.name);

  /** TTL lock withdrawal (giây) */
  private static readonly WITHDRAWAL_LOCK_TTL = 60; // 1 phút
  /** TTL cache cho kết quả idempotent withdrawal (giây) */
  private static readonly WITHDRAWAL_IDEM_TTL = 24 * 60 * 60; // 24 giờ

  constructor(
    @Inject(ONCHAIN_TRANSACTION_REPOSITORY)
    private readonly onchainTxRepo: OnchainTransactionRepositoryPort,
    private readonly cacheService: CacheService,
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly walletLinkingService: WalletLinkingService,
    private readonly walletsService: WalletsService,
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepository: CurrencyRepositoryPort,
    private readonly systemConfigService: SystemConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly transactionWalletService: TransactionWalletService,
  ) {}

  private treasuryLog(event: string, fields: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({
        domain: 'treasury',
        event,
        at: new Date().toISOString(),
        ...fields,
      }),
    );
  }

  private treasuryAlert(event: string, fields: Record<string, unknown>): void {
    this.logger.warn(
      JSON.stringify({
        domain: 'treasury',
        severity: 'alert',
        event,
        at: new Date().toISOString(),
        ...fields,
      }),
    );
  }

  /**
   * Signs user withdrawals from an active treasury transaction wallet (WITHDRAWAL/BOTH) when configured;
   * otherwise falls back to the chain hot wallet from payment config / env.
   */
  private async resolveWithdrawalPayout(chain: BlockchainNetwork): Promise<{
    fromAddress: string;
    send: (to: string, amount: string) => Promise<string>;
  }> {
    const tw = await this.transactionWalletService.getWithdrawalSourceWallet(chain as string);
    if (tw) {
      return {
        fromAddress: tw.address,
        send: (to, amount) =>
          this.transactionWalletService.sendWithdrawalNativeTransfer(tw, to, amount),
      };
    }
    const provider = this.providerFactory.getProvider(chain);
    return {
      fromAddress: await provider.getHotWalletAddress(),
      send: (to, amount) => provider.sendTransaction(to, amount),
    };
  }

  private normalizeIdempotencyKey(userId: string, dto: RequestWithdrawalDto): string {
    const provided = dto.idempotencyKey?.trim();
    if (provided) return provided;
    return `${userId}:${dto.chain}:${dto.linkedWalletId}:${dto.amount}`;
  }

  private async getWithdrawAutoMaxByChain(chain: BlockchainNetwork): Promise<Decimal> {
    const globalMax =
      (await this.systemConfigService.get<string>('BLOCKCHAIN_WITHDRAW_AUTO_MAX')) || '0';
    const chainKey = `BLOCKCHAIN_WITHDRAW_AUTO_MAX_${chain}`;
    const chainMax = await this.systemConfigService.get<string>(chainKey);
    const resolved = chainMax?.trim() ? chainMax : globalMax;
    try {
      const parsed = new Decimal(resolved);
      return parsed.greaterThanOrEqualTo(0) ? parsed : new Decimal(0);
    } catch {
      return new Decimal(0);
    }
  }

  private async getChainAssetSymbol(chain: BlockchainNetwork): Promise<string> {
    let base: string;
    try {
      base = nativeSymbolForChain(chain);
    } catch {
      throw new BadRequestException('Mạng blockchain không được hỗ trợ', 'CHAIN_NOT_SUPPORTED');
    }
    const keyByBase: Record<string, string> = {
      ETH: 'BLOCKCHAIN_WITHDRAW_ETH_SYMBOL',
      BNB: 'BLOCKCHAIN_WITHDRAW_BNB_SYMBOL',
      SOL: 'BLOCKCHAIN_WITHDRAW_SOL_SYMBOL',
      TRX: 'BLOCKCHAIN_WITHDRAW_TRON_SYMBOL',
      POL: 'BLOCKCHAIN_WITHDRAW_POL_SYMBOL',
      AVAX: 'BLOCKCHAIN_WITHDRAW_AVAX_SYMBOL',
      XDAI: 'BLOCKCHAIN_WITHDRAW_XDAI_SYMBOL',
      FTM: 'BLOCKCHAIN_WITHDRAW_FTM_SYMBOL',
    };
    const cfgKey = keyByBase[base];
    if (cfgKey) {
      const o = (await this.systemConfigService.get<string>(cfgKey))?.trim().toUpperCase();
      if (o) return o;
    }
    return base;
  }

  private async resolveWithdrawalCurrencyId(chain: BlockchainNetwork): Promise<string> {
    const symbol = await this.getChainAssetSymbol(chain);
    const currency = await this.currencyRepository.findBySymbol(symbol);
    if (!currency?.currency_id) {
      throw new BadRequestException(
        `Không tìm thấy currency ${symbol} để xử lý rút tiền`,
        'WITHDRAWAL_CURRENCY_NOT_FOUND',
      );
    }
    return String(currency.currency_id);
  }

  private toLedgerRefId(seed: string): number {
    const compact = seed.replace(/[^a-fA-F0-9]/g, '').slice(0, 12);
    if (compact.length === 0) {
      return Date.now();
    }
    return parseInt(compact, 16);
  }

  private async settleWithdrawalLedger(
    txId: string,
    userId: string,
    currencyId: string,
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
   * Yêu cầu rút tiền - gửi coin từ platform về ví đã liên kết
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
    const linkedWallet = await this.walletLinkingService.findByLinkId(userId, dto.linkedWalletId);

    if (!linkedWallet) {
      throw new BadRequestException('Ví liên kết không tìm thấy', 'WALLET_NOT_FOUND');
    }

    if (linkedWallet.status !== 'VERIFIED') {
      throw new BadRequestException(
        'Ví chưa được xác minh. Hãy xác minh ví trước khi rút tiền.',
        'WALLET_NOT_VERIFIED',
      );
    }

    if (linkedWallet.chain !== dto.chain) {
      throw new BadRequestException('Mạng blockchain không khớp với ví liên kết', 'CHAIN_MISMATCH');
    }

    // Validate amount
    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) {
      throw new BadRequestException('Số tiền phải lớn hơn 0', 'INVALID_AMOUNT');
    }

    const currencyId = await this.resolveWithdrawalCurrencyId(dto.chain);

    // Set lock
    await this.cacheService.set(lockKey, '1', OnchainWithdrawalService.WITHDRAWAL_LOCK_TTL);

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

    const autoMax = await this.getWithdrawAutoMaxByChain(dto.chain as BlockchainNetwork);
    const shouldAutoSend = amount.lessThanOrEqualTo(autoMax);

    if (!shouldAutoSend) {
      const payout = await this.resolveWithdrawalPayout(dto.chain);

      await this.onchainTxRepo.create({
        tx_id: txId,
        user_id: userId,
        linked_wallet_id: dto.linkedWalletId,
        chain: dto.chain,
        type: 'WITHDRAWAL',
        tx_hash: undefined,
        from_address: payout.fromAddress,
        to_address: linkedWallet.address,
        amount: amount.toString() as any,
        status: OnchainTxStatus.PENDING as any,
      });

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
        OnchainWithdrawalService.WITHDRAWAL_IDEM_TTL,
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

    const payout = await this.resolveWithdrawalPayout(dto.chain);

    let txHash: string | null = null;
    let status = OnchainTxStatus.PENDING;

    try {
      txHash = await payout.send(linkedWallet.address, amount.toString());
      status = OnchainTxStatus.CONFIRMING;
    } catch (error) {
      this.logger.error(`[Withdrawal] Gửi on-chain thất bại cho userId=${userId}:`, error);
      status = OnchainTxStatus.FAILED;
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

    await this.onchainTxRepo.create({
      tx_id: txId,
      user_id: userId,
      linked_wallet_id: dto.linkedWalletId,
      chain: dto.chain,
      type: 'WITHDRAWAL',
      tx_hash: txHash ?? undefined,
      from_address: payout.fromAddress,
      to_address: linkedWallet.address,
      amount: amount.toString() as any,
      status: status as any,
    });

    // Cache trạng thái để FE poll nhanh
    await this.cacheService.set(
      `withdrawal:status:${txId}`,
      { txId, status, amount: amount.toString(), txHash },
      3600,
    );

    this.logger.log(
      `[Withdrawal] userId=${userId}, chain=${dto.chain}, from=${payout.fromAddress}, amount=${amount}, toAddress=${linkedWallet.address}`,
    );

    const result = {
      txId,
      status,
      amount: amount.toString(),
      chain: dto.chain,
      toAddress: linkedWallet.address,
    };

    await this.cacheService.set(idemCacheKey, result, OnchainWithdrawalService.WITHDRAWAL_IDEM_TTL);

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

    const tx = await this.onchainTxRepo.findById(txId);
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
    const payout = await this.resolveWithdrawalPayout(tx.chain as BlockchainNetwork);

    let txHash: string | null = null;
    let status = OnchainTxStatus.FAILED;

    try {
      txHash = await payout.send(tx.to_address, amount.toString());
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

    await this.onchainTxRepo.updateAfterManualApproval(
      txId,
      txHash,
      payout.fromAddress,
      status,
      null,
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

    try {
      const symbol = await this.getChainAssetSymbol(tx.chain as BlockchainNetwork);
      await this.notificationsService.sendToUser(
        tx.user_id,
        {
          title: 'Yêu cầu rút tiền đã được xử lý',
          body: `${amount.toString()} ${symbol} — ${status === OnchainTxStatus.CONFIRMING ? 'Đã gửi on-chain' : 'Thất bại'}`,
          type: 'alert',
          data: {
            type: 'WITHDRAWAL_STATUS',
            txId,
            status,
            amount: amount.toString(),
            chain: tx.chain,
          },
        },
        actorUserId,
      );
    } catch (err) {
      this.logger.warn('Failed to send withdrawal notification (non-critical)', err);
    }

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

    const tx = await this.onchainTxRepo.findById(txId);
    if (!tx || tx.type !== 'WITHDRAWAL') {
      throw new BadRequestException('Yêu cầu rút tiền không tồn tại', 'WITHDRAWAL_NOT_FOUND');
    }

    if (tx.tx_hash) {
      throw new BadRequestException(
        'Giao dịch đã được gửi on-chain, không thể từ chối',
        'WITHDRAWAL_ALREADY_SENT',
      );
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

    await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.FAILED);

    this.logger.log(
      `[Withdrawal-ManualReject] txId=${txId}, actor=${actorUserId}, reason=${reason || 'N/A'}`,
    );

    await this.cacheService.set(
      `withdrawal:status:${txId}`,
      { txId, status: OnchainTxStatus.FAILED, reason: reason || null },
      3600,
    );

    try {
      const symbol = await this.getChainAssetSymbol(tx.chain as BlockchainNetwork);
      await this.notificationsService.sendToUser(
        tx.user_id,
        {
          title: 'Yêu cầu rút tiền đã bị từ chối',
          body: `${amount.toString()} ${symbol} — Đã hoàn số dư về ví`,
          type: 'alert',
          data: {
            type: 'WITHDRAWAL_STATUS',
            txId,
            status: OnchainTxStatus.FAILED,
            amount: amount.toString(),
            chain: tx.chain,
            reason: reason || null,
          },
        },
        actorUserId,
      );
    } catch (err) {
      this.logger.warn('Failed to send withdrawal rejection notification (non-critical)', err);
    }

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
  ): Promise<{
    processed: number;
    success: number;
    failed: number;
    items: Array<{ txId: string; status: string }>;
  }> {
    const txList = await this.onchainTxRepo.findPendingManualWithdrawals(limit);

    const items: Array<{ txId: string; status: string }> = [];
    let success = 0;
    let failed = 0;

    for (const row of txList) {
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
      processed: txList.length,
      success,
      failed,
      items,
    };
  }
}

