import { Inject, Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { DataSource, type EntityManager } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import {
  BlockchainNetwork,
  OnchainTxStatus,
  WalletReferenceType,
  WalletTransactionAction,
} from '@/common/enums';
import { BadRequestException, BusinessException, ConflictException } from '@/common/exceptions';
import { OutboxIntegrationEventType } from '@/common/integration-events/integration-event-catalog';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { CacheService } from '@/common/services';
import type { TransactionContext } from '@/common/types/transaction-context';
import { UnitOfWork } from '@/common/unit-of-work/unit-of-work';
import type {
  DepositSettlementAsset,
  ResolvedDepositTransfer,
} from '@/modules/blockchain/deposit-transfer.types';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { BlockchainProviderFactory } from '../../../blockchain-provider.factory';
import {
  ONCHAIN_TRANSACTION_REPOSITORY,
  type OnchainTransactionRepositoryPort,
} from '../../../domain/ports';
import { DepositFxService } from '../../../domain/services/deposit-fx.service';
import type { SubmitDepositDto } from '../../../dto';
import { WalletLinkingService } from '../wallet-linking/wallet-linking.service';

@Injectable()
export class OnchainDepositService {
  private readonly logger = new Logger(OnchainDepositService.name);
  private static readonly DEPOSIT_LOCK_TTL = 600;

  constructor(
    @Inject(ONCHAIN_TRANSACTION_REPOSITORY)
    private readonly onchainTxRepo: OnchainTransactionRepositoryPort,
    private readonly dataSource: DataSource,
    private readonly cacheService: CacheService,
    private readonly providerFactory: BlockchainProviderFactory,
    private readonly walletLinkingService: WalletLinkingService,
    private readonly depositFxService: DepositFxService,
    private readonly walletsService: WalletsService,
    private readonly managedWalletsService: ManagedWalletsService,
    private readonly unitOfWork: UnitOfWork,
    private readonly outboxAppender: OutboxAppender,
  ) {}

  private treasuryLog(event: string, fields: Record<string, unknown>): void {
    this.logger.log(
      JSON.stringify({ domain: 'treasury', event, at: new Date().toISOString(), ...fields }),
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

  /** Redis lock per chain + tx + log index so multiple ERC-20 legs can settle independently. */
  private depositProcessingLockKey(
    chain: BlockchainNetwork,
    txHash: string,
    logIndex: number,
  ): string {
    return `deposit:pending:${chain}:${txHash}:${logIndex}`;
  }

  private sortDepositLegsByPreference(legs: ResolvedDepositTransfer[]): ResolvedDepositTransfer[] {
    const rank = (a: ResolvedDepositTransfer) =>
      a.asset === 'USDT_TRC20' || a.asset === 'USDT_ERC20' ? 0 : 1;
    return [...legs].sort((a, b) => rank(a) - rank(b));
  }

  private async requireExpectedDepositAddress(chain: BlockchainNetwork): Promise<string> {
    const addr = (await this.managedWalletsService.getPublicDepositRecipientAddress(chain))?.trim();
    if (!addr) {
      throw new BadRequestException(
        'Chưa cấu hình địa chỉ nạp cho mạng này. Kiểm tra ví nạp mặc định hoặc ví chính (treasury) trên mạng đã chọn.',
        'DEPOSIT_ADDRESS_NOT_CONFIGURED',
      );
    }
    return addr;
  }

  private pickResolvedLeg(legs: ResolvedDepositTransfer[]): ResolvedDepositTransfer {
    const ordered = this.sortDepositLegsByPreference(legs);
    return ordered[0];
  }

  async previewDepositTx(userId: string, chain: BlockchainNetwork, txHash: string) {
    const provider = this.providerFactory.getProvider(chain);
    const expected = await this.requireExpectedDepositAddress(chain);
    const legs = await provider.resolveDepositTransfers(txHash, {
      expectedDepositAddress: expected,
    });
    if (legs.length === 0) {
      const st = await provider.getTransactionStatus(txHash);
      if (st.status === 'NOT_FOUND') {
        throw new BadRequestException(
          'Không tìm thấy giao dịch on-chain. Kiểm tra lại txHash.',
          'TX_NOT_FOUND',
        );
      }
      throw new BadRequestException(
        'Không tìm thấy khoản chuyển đến địa chỉ nạp của sàn trong giao dịch này.',
        'DEPOSIT_LEG_NOT_FOUND',
      );
    }
    const chosen = this.pickResolvedLeg(legs);
    const senderLinked = !!(await this.walletLinkingService.findVerifiedWallet(
      userId,
      chain,
      chosen.from,
    ));
    if (chosen.chainStatus === 'FAILED') {
      throw new BadRequestException('Giao dịch on-chain đã thất bại.', 'TX_FAILED');
    }

    return {
      chain,
      txHash,
      status: chosen.chainStatus,
      confirmations: chosen.confirmations,
      fromAddress: chosen.from,
      toAddress: chosen.to,
      onchainAmount: chosen.amountHuman,
      senderLinked,
    };
  }

  private toLedgerRefId(seed: string): number {
    const compact = seed.replace(/[^a-fA-F0-9]/g, '').slice(0, 12);
    if (compact.length === 0) return Date.now();
    return parseInt(compact, 16);
  }

  private async hasLedgerEntry(
    userId: string,
    currencyId: string,
    refType: WalletReferenceType,
    refId: number,
    direction: 'CREDIT' | 'DEBIT',
    joinTransaction?: TransactionContext,
  ): Promise<boolean> {
    const runner = joinTransaction
      ? (joinTransaction as unknown as EntityManager)
      : this.dataSource;
    const rows = await runner.query(
      `SELECT ledger_id FROM wallet_ledger WHERE user_id = ? AND currency_id = ? AND ref_type = ? AND ref_id = ? AND direction = ? LIMIT 1`,
      [userId, currencyId, refType, String(refId), direction],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  private async settleDepositLedgerIfNeeded(
    txId: string,
    userId: string,
    chain: BlockchainNetwork,
    amount: string,
    settlementAsset: DepositSettlementAsset,
    joinTransaction?: TransactionContext,
  ): Promise<{
    settled: boolean;
    alreadySettled: boolean;
    creditCurrencyId?: string;
    creditAmount?: string;
    conversionRate?: string;
  }> {
    const fxAsset =
      settlementAsset === 'NATIVE'
        ? 'NATIVE'
        : settlementAsset === 'USDT_ERC20'
          ? 'USDT_ERC20'
          : 'USDT_TRC20';
    const conversion = await this.depositFxService.convertToPlatformCash(chain, amount, fxAsset);
    const { creditCurrencyId, creditAmount, conversionRate } = conversion;

    const refId = this.toLedgerRefId(`${txId}-credit`);
    const existed = await this.hasLedgerEntry(
      userId,
      creditCurrencyId,
      WalletReferenceType.EXTERNAL_DEPOSIT,
      refId,
      'CREDIT',
      joinTransaction,
    );
    if (existed) {
      return { settled: false, alreadySettled: true };
    }

    try {
      await this.walletsService.applyTransaction(
        userId,
        {
          currencyId: creditCurrencyId,
          action: WalletTransactionAction.CREDIT,
          amount: creditAmount,
          refType: WalletReferenceType.EXTERNAL_DEPOSIT,
          refId,
        },
        joinTransaction,
      );
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: unknown }).code === 'DUPLICATE_LEDGER_ENTRY'
      ) {
        return { settled: false, alreadySettled: true };
      }
      throw error;
    }

    if (joinTransaction) {
      await this.onchainTxRepo.updateCreditConversionWithinTransaction(
        joinTransaction,
        txId,
        String(creditCurrencyId),
        creditAmount,
        conversionRate,
      );
    } else {
      await this.onchainTxRepo.updateCreditConversion(
        txId,
        String(creditCurrencyId),
        creditAmount,
        conversionRate,
      );
    }

    return {
      settled: true,
      alreadySettled: false,
      creditCurrencyId: String(creditCurrencyId),
      creditAmount,
      conversionRate,
    };
  }

  /**
   * Auto-watcher path — same persistence rules as submitDeposit; caller resolves user from linked `from`.
   */
  async ingestIncomingDepositForUser(
    userId: string,
    resolved: ResolvedDepositTransfer,
  ): Promise<{
    txId: string;
    status: string;
    amount: string;
    chain: string;
    settled: boolean;
  } | null> {
    const lockKey = this.depositProcessingLockKey(
      resolved.chain,
      resolved.txHash,
      resolved.logIndex,
    );
    if (await this.cacheService.exists(lockKey)) {
      return null;
    }
    await this.cacheService.set(lockKey, '1', OnchainDepositService.DEPOSIT_LOCK_TTL);
    try {
      return await this.persistDepositFromResolved(userId, null, resolved, {
        lockHeld: true,
      });
    } finally {
      await this.cacheService.delete(lockKey);
    }
  }

  async submitDeposit(userId: string, dto: SubmitDepositDto) {
    const provider = this.providerFactory.getProvider(dto.chain);
    const expected = await this.requireExpectedDepositAddress(dto.chain);
    const legs = await provider.resolveDepositTransfers(dto.txHash, {
      expectedDepositAddress: expected,
    });
    if (legs.length === 0) {
      const st = await provider.getTransactionStatus(dto.txHash);
      if (st.status === 'NOT_FOUND') {
        throw new BadRequestException(
          'Không tìm thấy giao dịch on-chain. Kiểm tra lại txHash hoặc chờ tx được confirm.',
          'TX_NOT_FOUND',
        );
      }
      throw new BadRequestException(
        'Không tìm thấy khoản chuyển đến địa chỉ nạp của sàn trong giao dịch này.',
        'DEPOSIT_LEG_NOT_FOUND',
      );
    }

    const resolved = this.pickResolvedLeg(legs);
    const lockKey = this.depositProcessingLockKey(dto.chain, dto.txHash, resolved.logIndex);
    const locked = await this.cacheService.exists(lockKey);
    if (locked) {
      throw new ConflictException(
        'Giao dịch này đang được xử lý. Vui lòng chờ.',
        'DEPOSIT_PROCESSING',
      );
    }
    await this.cacheService.set(lockKey, '1', OnchainDepositService.DEPOSIT_LOCK_TTL);

    try {
      const existing = await this.onchainTxRepo.findByChainAndTxHash(
        dto.chain,
        dto.txHash,
        resolved.logIndex,
      );
      if (existing) {
        throw new ConflictException(
          'Giao dịch này đã được xử lý trước đó',
          'DEPOSIT_ALREADY_PROCESSED',
        );
      }

      if (resolved.chainStatus === 'FAILED') {
        throw new BadRequestException('Giao dịch on-chain đã thất bại', 'TX_FAILED');
      }

      const onchainAmount = new Decimal(resolved.amountHuman || '0');
      if (dto.amount?.trim()) {
        const submittedAmount = new Decimal(dto.amount.trim());
        const tolerance = new Decimal('0.0001');
        if (onchainAmount.minus(submittedAmount).abs().greaterThan(tolerance)) {
          throw new BadRequestException(
            `Số tiền không khớp. On-chain: ${onchainAmount}, Submit: ${submittedAmount}`,
            'AMOUNT_MISMATCH',
          );
        }
      }

      return await this.persistDepositFromResolved(userId, null, resolved, { lockHeld: true });
    } finally {
      await this.cacheService.delete(lockKey);
    }
  }

  private async persistDepositFromResolved(
    userId: string,
    linkedWalletId: string | null,
    resolved: ResolvedDepositTransfer,
    opts?: { lockHeld?: boolean },
  ): Promise<{ txId: string; status: string; amount: string; chain: string; settled: boolean }> {
    const lockKey = this.depositProcessingLockKey(
      resolved.chain,
      resolved.txHash,
      resolved.logIndex,
    );
    const lockHeld = opts?.lockHeld === true;
    if (!lockHeld) {
      await this.cacheService.set(lockKey, '1', OnchainDepositService.DEPOSIT_LOCK_TTL);
    }

    try {
      const existing = await this.onchainTxRepo.findByChainAndTxHash(
        resolved.chain,
        resolved.txHash,
        resolved.logIndex,
      );
      if (existing) {
        throw new ConflictException(
          'Giao dịch này đã được xử lý trước đó',
          'DEPOSIT_ALREADY_PROCESSED',
        );
      }

      const onchainAmount = new Decimal(resolved.amountHuman || '0');
      const status =
        resolved.chainStatus === 'CONFIRMED'
          ? OnchainTxStatus.COMPLETED
          : OnchainTxStatus.CONFIRMING;

      let settled = false;
      let creditPayload: Record<string, string> = {};
      const txId = uuidv7();

      await this.unitOfWork.run(async (ctx) => {
        const em = ctx as unknown as EntityManager;

        await this.onchainTxRepo.createWithinTransaction(ctx, {
          tx_id: txId,
          user_id: userId,
          linked_wallet_id: linkedWalletId,
          chain: resolved.chain,
          type: 'DEPOSIT',
          tx_hash: resolved.txHash,
          log_index: resolved.logIndex,
          from_address: resolved.from,
          to_address: resolved.to,
          amount: onchainAmount.toString(),
          confirmations: resolved.confirmations,
          status,
          confirmed_at: status === OnchainTxStatus.COMPLETED ? new Date() : undefined,
        });

        if (status === OnchainTxStatus.COMPLETED) {
          const settlement = await this.settleDepositLedgerIfNeeded(
            txId,
            userId,
            resolved.chain,
            onchainAmount.toString(),
            resolved.asset,
            ctx,
          );
          settled = settlement.settled || settlement.alreadySettled;
          if (settlement.settled && settlement.creditCurrencyId) {
            creditPayload = {
              creditedCurrencyId: settlement.creditCurrencyId,
              creditedAmount: settlement.creditAmount ?? '',
              conversionRate: settlement.conversionRate ?? '',
            };
          }
        }

        await this.outboxAppender.append(em, {
          aggregateType: 'OnchainTransaction',
          aggregateId: txId,
          eventType: OutboxIntegrationEventType.OnchainDepositSubmittedV1,
          dedupeKey: `onchain:deposit:submit:${resolved.chain}:${resolved.txHash}:${resolved.logIndex}`,
          payload: {
            payloadVersion: 1,
            userId,
            txId,
            chain: resolved.chain,
            txHash: resolved.txHash,
            status,
            amount: onchainAmount.toString(),
            settled,
            fromAddress: resolved.from,
            toAddress: resolved.to,
            confirmations: resolved.confirmations,
            createdAt: new Date().toISOString(),
            confirmedAt: status === OnchainTxStatus.COMPLETED ? new Date().toISOString() : null,
            ...creditPayload,
          },
        });
      });

      this.treasuryLog('deposit.submit.result', {
        userId,
        txId,
        chain: resolved.chain,
        txHash: resolved.txHash,
        amount: onchainAmount.toString(),
        status,
        settled,
      });

      return { txId, status, amount: onchainAmount.toString(), chain: resolved.chain, settled };
    } finally {
      if (!lockHeld) {
        await this.cacheService.delete(lockKey);
      }
    }
  }

  async settleDepositByTxId(userId: string, txId: string) {
    this.treasuryLog('deposit.settle.requested', { userId, txId });

    const tx = await this.onchainTxRepo.findByIdAndUserId(txId, userId);
    if (!tx || tx.type !== 'DEPOSIT') {
      throw new BadRequestException('Giao dịch nạp tiền không tồn tại', 'DEPOSIT_NOT_FOUND');
    }
    if (!tx.tx_hash) {
      throw new BusinessException('Giao dịch nạp chưa có tx_hash hợp lệ', 'DEPOSIT_TXHASH_MISSING');
    }

    const chain = tx.chain as BlockchainNetwork;
    const provider = this.providerFactory.getProvider(chain);
    const expected = await this.requireExpectedDepositAddress(chain);
    const legs = await provider.resolveDepositTransfers(String(tx.tx_hash), {
      expectedDepositAddress: expected,
    });
    const storedLog = Number(tx.log_index ?? 0);
    const leg =
      legs.find(
        (l) =>
          l.logIndex === storedLog &&
          l.from === tx.from_address &&
          new Decimal(l.amountHuman)
            .minus(new Decimal(String(tx.amount)))
            .abs()
            .lte('0.0000001'),
      ) ??
      legs.find((l) => l.logIndex === storedLog && l.from === tx.from_address) ??
      legs.find(
        (l) =>
          l.from === tx.from_address &&
          new Decimal(l.amountHuman)
            .minus(new Decimal(String(tx.amount)))
            .abs()
            .lte('0.0000001'),
      ) ??
      legs.find((l) => l.from === tx.from_address);

    let latestStatus: ResolvedDepositTransfer['chainStatus'] | 'NOT_FOUND' = 'NOT_FOUND';
    let confirmations = 0;
    if (leg) {
      latestStatus = leg.chainStatus;
      confirmations = leg.confirmations ?? 0;
    } else {
      const legacy = await provider.getTransactionStatus(String(tx.tx_hash));
      latestStatus = legacy.status;
      confirmations = legacy.confirmations ?? 0;
    }

    if (latestStatus === 'FAILED') {
      await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.FAILED, {
        confirmations,
      });
      this.treasuryAlert('deposit.settle.chain_failed', {
        userId,
        txId,
        txHash: tx.tx_hash,
        confirmations,
      });
      return {
        txId,
        status: OnchainTxStatus.FAILED,
        settled: false,
        confirmations,
      };
    }

    if (latestStatus !== 'CONFIRMED') {
      await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.CONFIRMING, {
        confirmations,
      });
      this.treasuryLog('deposit.settle.waiting_confirmations', {
        userId,
        txId,
        txHash: tx.tx_hash,
        confirmations,
      });
      return {
        txId,
        status: OnchainTxStatus.CONFIRMING,
        settled: false,
        confirmations,
      };
    }

    const settlementAsset: DepositSettlementAsset =
      leg?.asset === 'USDT_TRC20' || leg?.asset === 'USDT_ERC20' ? leg.asset : 'NATIVE';

    let settled = false;

    await this.unitOfWork.run(async (ctx) => {
      const em = ctx as unknown as EntityManager;

      await this.onchainTxRepo.updateStatusWithinTransaction(ctx, txId, OnchainTxStatus.COMPLETED, {
        confirmations,
        confirmed_at: new Date(),
      });

      const settlement = await this.settleDepositLedgerIfNeeded(
        txId,
        userId,
        chain,
        String(tx.amount),
        settlementAsset,
        ctx,
      );
      settled = settlement.settled || settlement.alreadySettled;

      let settleCredit: Record<string, string> = {};
      if (settlement.settled && settlement.creditCurrencyId) {
        settleCredit = {
          creditedCurrencyId: settlement.creditCurrencyId,
          creditedAmount: settlement.creditAmount ?? '',
          conversionRate: settlement.conversionRate ?? '',
        };
      }

      await this.outboxAppender.append(em, {
        aggregateType: 'OnchainTransaction',
        aggregateId: txId,
        eventType: OutboxIntegrationEventType.OnchainDepositSettledV1,
        dedupeKey: `onchain:deposit:settle:${txId}`,
        payload: {
          payloadVersion: 1,
          userId,
          txId,
          chain: tx.chain,
          txHash: tx.tx_hash,
          settled,
          status: OnchainTxStatus.COMPLETED,
          amount: String(tx.amount),
          fromAddress: tx.from_address,
          toAddress: tx.to_address,
          confirmations,
          createdAt:
            tx.created_at instanceof Date ? tx.created_at.toISOString() : String(tx.created_at),
          confirmedAt: new Date().toISOString(),
          ...settleCredit,
        },
      });
    });

    this.treasuryLog('deposit.settle.result', {
      userId,
      txId,
      txHash: tx.tx_hash,
      confirmations,
      settled,
    });

    return {
      txId,
      status: OnchainTxStatus.COMPLETED,
      settled,
      confirmations,
    };
  }

  /**
   * Create an UNMATCHED onchain_transactions row for a deposit whose sender is not linked to any user.
   * Idempotent: throws ConflictException if the tx+logIndex was already recorded.
   * Emits UnmatchedDepositDetectedV1 for admin notification.
   */
  async ingestUnmatchedDeposit(resolved: ResolvedDepositTransfer): Promise<void> {
    const txId = uuidv7();

    await this.dataSource.transaction(async (em: EntityManager) => {
      // Check unique constraint before insert to give a clean ConflictException.
      const existing = await em.getRepository('onchain_transactions').findOne({
        where: {
          chain: resolved.chain,
          tx_hash: resolved.txHash,
          log_index: resolved.logIndex ?? 0,
        },
        select: ['tx_id'],
      });

      if (existing) {
        throw new ConflictException(
          `Onchain tx ${resolved.txHash}:${resolved.logIndex ?? 0} already recorded`,
          'DEPOSIT_ALREADY_RECORDED',
        );
      }

      await em.getRepository('onchain_transactions').save({
        tx_id: txId,
        user_id: null,
        linked_wallet_id: null,
        treasury_operation_id: null,
        chain: resolved.chain,
        type: 'DEPOSIT',
        tx_hash: resolved.txHash,
        log_index: resolved.logIndex ?? 0,
        from_address: resolved.from,
        to_address: resolved.to,
        amount: resolved.amountHuman,
        confirmations: 0,
        status: OnchainTxStatus.UNMATCHED,
        confirmed_at: null,
        credited_currency_id: null,
        credited_amount: null,
        conversion_rate: null,
      });

      await this.outboxAppender.append(em, {
        aggregateType: 'OnchainTransaction',
        aggregateId: txId,
        eventType: OutboxIntegrationEventType.UnmatchedDepositDetectedV1,
        dedupeKey: `unmatched:deposit:${resolved.chain}:${resolved.txHash}:${resolved.logIndex ?? 0}`,
        payload: {
          payloadVersion: 1,
          txId,
          chain: resolved.chain,
          txHash: resolved.txHash,
          logIndex: resolved.logIndex ?? 0,
          fromAddress: resolved.from,
          toAddress: resolved.to,
          amount: resolved.amountHuman,
          asset: resolved.asset,
          detectedAt: new Date().toISOString(),
        },
      });
    });
  }
}
