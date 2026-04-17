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
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
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
    private readonly transactionWalletService: TransactionWalletService,
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

  private async assertTronDepositRecipientMatchesConfiguredDefault(
    chain: BlockchainNetwork,
    txRecipient: string,
  ): Promise<void> {
    if (chain !== BlockchainNetwork.TRON_MAINNET) return;
    const tw = await this.transactionWalletService.getDefaultUserDepositWallet('TRON_MAINNET');
    if (!tw) {
      throw new BadRequestException(
        'Chưa có ví nạp mặc định cho mạng này. Nạp on-chain tạm dừng cho đến khi vận hành cấu hình.',
        'DEPOSIT_DEFAULT_NOT_CONFIGURED',
      );
    }
    if (tw.address !== txRecipient) {
      throw new BadRequestException(
        'Giao dịch không gửi đến địa chỉ nạp hiện tại của sàn cho mạng này.',
        'DEPOSIT_RECIPIENT_MISMATCH',
      );
    }
  }

  async previewDepositTx(userId: string, chain: BlockchainNetwork, txHash: string) {
    const provider = this.providerFactory.getProvider(chain);
    const txStatus = await provider.getTransactionStatus(txHash);

    if (txStatus.status === 'NOT_FOUND') {
      throw new BadRequestException(
        'Không tìm thấy giao dịch on-chain. Kiểm tra lại txHash.',
        'TX_NOT_FOUND',
      );
    }
    if (txStatus.status === 'FAILED') {
      throw new BadRequestException('Giao dịch on-chain đã thất bại.', 'TX_FAILED');
    }

    const linked = await this.walletLinkingService.findVerifiedWallet(userId, chain, txStatus.from);
    await this.assertTronDepositRecipientMatchesConfiguredDefault(chain, txStatus.to);

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
    const runner = joinTransaction ? (joinTransaction as unknown as EntityManager) : this.dataSource;
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
    joinTransaction?: TransactionContext,
  ): Promise<{
    settled: boolean;
    alreadySettled: boolean;
    creditCurrencyId?: string;
    creditAmount?: string;
    conversionRate?: string;
  }> {
    const conversion = await this.depositFxService.convertToPlatformCash(chain, amount);
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
    } catch (error: any) {
      if (error?.code === 'DUPLICATE_LEDGER_ENTRY') {
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

  async submitDeposit(userId: string, dto: SubmitDepositDto) {
    const provider = this.providerFactory.getProvider(dto.chain);
    const lockKey = `deposit:pending:${dto.txHash}`;
    const locked = await this.cacheService.exists(lockKey);
    if (locked) {
      throw new ConflictException(
        'Giao dịch này đang được xử lý. Vui lòng chờ.',
        'DEPOSIT_PROCESSING',
      );
    }
    await this.cacheService.set(lockKey, '1', OnchainDepositService.DEPOSIT_LOCK_TTL);

    try {
      const existing = await this.onchainTxRepo.findByChainAndTxHash(dto.chain, dto.txHash);
      if (existing) {
        throw new ConflictException(
          'Giao dịch này đã được xử lý trước đó',
          'DEPOSIT_ALREADY_PROCESSED',
        );
      }

      const txStatus = await provider.getTransactionStatus(dto.txHash);
      if (txStatus.status === 'NOT_FOUND') {
        throw new BadRequestException(
          'Không tìm thấy giao dịch on-chain. Kiểm tra lại txHash hoặc chờ tx được confirm.',
          'TX_NOT_FOUND',
        );
      }
      if (txStatus.status === 'FAILED') {
        throw new BadRequestException('Giao dịch on-chain đã thất bại', 'TX_FAILED');
      }

      await this.assertTronDepositRecipientMatchesConfiguredDefault(dto.chain, txStatus.to);
      const linked = await this.walletLinkingService.findVerifiedWallet(
        userId,
        dto.chain,
        txStatus.from,
      );
      if (!linked) {
        throw new BadRequestException(
          `Địa chỉ gửi (${txStatus.from}) không phải ví đã liên kết của bạn. Hãy liên kết ví trước.`,
          'SENDER_NOT_LINKED',
        );
      }

      const onchainAmount = new Decimal(txStatus.value || '0');
      const submittedAmount = new Decimal(dto.amount);
      const tolerance = new Decimal('0.0001');
      if (onchainAmount.minus(submittedAmount).abs().greaterThan(tolerance)) {
        throw new BadRequestException(
          `Số tiền không khớp. On-chain: ${onchainAmount}, Submit: ${submittedAmount}`,
          'AMOUNT_MISMATCH',
        );
      }

      const txId = uuidv7();
      const status =
        txStatus.status === 'CONFIRMED' ? OnchainTxStatus.COMPLETED : OnchainTxStatus.CONFIRMING;

      let settled = false;
      let creditPayload: Record<string, string> = {};

      await this.unitOfWork.run(async (ctx) => {
        const em = ctx as unknown as EntityManager;

        await this.onchainTxRepo.createWithinTransaction(ctx, {
          tx_id: txId,
          user_id: userId,
          linked_wallet_id: linked.link_id,
          chain: dto.chain,
          type: 'DEPOSIT',
          tx_hash: dto.txHash,
          from_address: txStatus.from,
          to_address: txStatus.to,
          amount: onchainAmount.toString() as any,
          confirmations: txStatus.confirmations,
          status: status as any,
          confirmed_at: status === OnchainTxStatus.COMPLETED ? new Date() : undefined,
        });

        if (status === OnchainTxStatus.COMPLETED) {
          const settlement = await this.settleDepositLedgerIfNeeded(
            txId,
            userId,
            dto.chain,
            onchainAmount.toString(),
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
          dedupeKey: `onchain:deposit:submit:${dto.chain}:${dto.txHash}`,
          payload: {
            payloadVersion: 1,
            userId,
            txId,
            chain: dto.chain,
            txHash: dto.txHash,
            status,
            amount: onchainAmount.toString(),
            settled,
            fromAddress: txStatus.from,
            toAddress: txStatus.to,
            confirmations: txStatus.confirmations,
            createdAt: new Date().toISOString(),
            confirmedAt:
              status === OnchainTxStatus.COMPLETED ? new Date().toISOString() : null,
            ...creditPayload,
          },
        });
      });

      this.treasuryLog('deposit.submit.result', {
        userId,
        txId,
        chain: dto.chain,
        txHash: dto.txHash,
        amount: onchainAmount.toString(),
        status,
        settled,
      });

      return { txId, status, amount: onchainAmount.toString(), chain: dto.chain, settled };
    } finally {
      await this.cacheService.delete(lockKey);
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

    const provider = this.providerFactory.getProvider(tx.chain as BlockchainNetwork);
    const latest = await provider.getTransactionStatus(String(tx.tx_hash));

    if (latest.status === 'FAILED') {
      await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.FAILED, {
        confirmations: latest.confirmations ?? 0,
      });
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
      await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.CONFIRMING, {
        confirmations: latest.confirmations ?? 0,
      });
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

    let settled = false;

    await this.unitOfWork.run(async (ctx) => {
      const em = ctx as unknown as EntityManager;

      await this.onchainTxRepo.updateStatusWithinTransaction(ctx, txId, OnchainTxStatus.COMPLETED, {
        confirmations: latest.confirmations ?? 0,
        confirmed_at: new Date(),
      });

      const settlement = await this.settleDepositLedgerIfNeeded(
        txId,
        userId,
        tx.chain as BlockchainNetwork,
        String(tx.amount),
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
          confirmations: latest.confirmations ?? 0,
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
      confirmations: latest.confirmations ?? 0,
      settled,
    });

    return {
      txId,
      status: OnchainTxStatus.COMPLETED,
      settled,
      confirmations: latest.confirmations ?? 0,
    };
  }
}
