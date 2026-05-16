import { Inject, Injectable, Logger } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import {
  BlockchainNetwork,
  OnchainTxStatus,
  OnchainTxType,
  UserRole,
  WalletReferenceType,
  WalletTransactionAction,
} from '@/common/enums';
import { ConflictException, InternalServerException, BusinessException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { UsersService } from '@/modules/users/users.service';
import type { TransactionWalletRecord } from '@/modules/treasury';
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import type { WalletTransactionDto } from '@/modules/wallets/dto/wallet-transaction.dto';
import { BlockchainProviderFactory } from '../../../blockchain-provider.factory';
import {
  ONCHAIN_TRANSACTION_REPOSITORY,
  type OnchainTransactionRepositoryPort,
} from '../../../domain/ports';
import { RequestWithdrawalDto, WithdrawalAsset } from '../../../dto';
import { WalletLinkingService } from '../wallet-linking/wallet-linking.service';

@Injectable()
export class OnchainWithdrawalService {
  private static readonly WITHDRAWAL_LOCK_TTL = 60;
  private static readonly WITHDRAWAL_IDEM_TTL = 24 * 60 * 60;
  private static readonly WITHDRAWAL_ACTION_LOCK_TTL = 120;

  // Currency IDs — resolved lazily on first use
  private _usdtCurrencyId?: string;
  private _trxCurrencyId?: string;

  private readonly _logger = new Logger(OnchainWithdrawalService.name);

  /**
   * Resolve USDT currency ID lazily from DB.
   * Uses cache so repeated calls are fast.
   */
  private async _resolveUsdtCurrencyId(): Promise<string> {
    if (this._usdtCurrencyId) return this._usdtCurrencyId;
    const currency = await this._currencyRepository.findBySymbol('USDT');
    if (!currency) throw new Error('USDT currency not found in database');
    this._usdtCurrencyId = currency.currency_id;
    return this._usdtCurrencyId;
  }

  /**
   * Resolve TRX currency ID lazily from DB.
   */
  private async _resolveTrxCurrencyId(): Promise<string> {
    if (this._trxCurrencyId) return this._trxCurrencyId;
    const currency = await this._currencyRepository.findBySymbol('TRX');
    if (!currency) throw new Error('TRX currency not found in database');
    this._trxCurrencyId = currency.currency_id;
    return this._trxCurrencyId;
  }

  private _currencyIdForAsset(asset: WithdrawalAsset): string {
    if (asset === WithdrawalAsset.USDT_TRC20) {
      if (!this._usdtCurrencyId) throw new Error('USDT currency not initialized — call _resolveUsdtCurrencyId() first');
      return this._usdtCurrencyId;
    }
    if (!this._trxCurrencyId) throw new Error('TRX currency not initialized — call _resolveTrxCurrencyId() first');
    return this._trxCurrencyId;
  }

  constructor(
    @Inject(ONCHAIN_TRANSACTION_REPOSITORY)
    private readonly onchainTxRepo: OnchainTransactionRepositoryPort,
    @Inject(CURRENCY_REPOSITORY) readonly _currencyRepository: CurrencyRepositoryPort,
    private readonly cacheService: CacheService,
    readonly _providerFactory: BlockchainProviderFactory,
    private readonly walletLinkingService: WalletLinkingService,
    readonly _walletsService: WalletsService,
    readonly _transactionWalletService: TransactionWalletService,
    readonly _notificationsService: NotificationsService,
    readonly _systemConfigService: SystemConfigService,
    private readonly _usersService: UsersService,
  ) {}

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    const isTronChain =
      dto.chain === BlockchainNetwork.TRON_MAINNET ||
      dto.chain === BlockchainNetwork.TRON_NILE ||
      dto.chain === BlockchainNetwork.TRON_SHASTA;

    // For Tron chains, always use USDT_TRC20
    // For other chains, use NATIVE (native coin like ETH, SOL, BNB, etc.)
    const asset = isTronChain ? WithdrawalAsset.USDT_TRC20 : WithdrawalAsset.NATIVE;

    const lockKey = `withdrawal:pending:${userId}:${dto.linkedWalletId}:${dto.amount}:${asset}`;
    if (await this.cacheService.exists(lockKey)) {
      throw new ConflictException('Yeu cau rut tien dang duoc xu ly.', 'WITHDRAWAL_PROCESSING');
    }
    await this.cacheService.set(lockKey, '1', OnchainWithdrawalService.WITHDRAWAL_LOCK_TTL);

    const idempotencyKey = dto.idempotencyKey?.trim();
    const idempotencyCacheKey = idempotencyKey
      ? `withdrawal:idempotency:${userId}:${idempotencyKey}`
      : null;
    if (idempotencyCacheKey && (await this.cacheService.exists(idempotencyCacheKey))) {
      throw new ConflictException('Yeu cau rut tien bi submit trung.', 'WITHDRAWAL_DUPLICATE');
    }

    try {
      const linkedWallet = await this.walletLinkingService.getLinkedWallet(
        dto.linkedWalletId,
        userId,
      );

      // Generate txId BEFORE freeze so refId is unique — avoids duplicate key on 'uk_ledger_ref'.
      const txId = uuidv7();

      // Resolve currency — freeze MUST happen before creating onchain_tx
      // so that insufficient-balance errors don't leave dangling records.
      const currencyId = asset === WithdrawalAsset.USDT_TRC20
        ? await this._resolveUsdtCurrencyId()
        : await this._resolveTrxCurrencyId();

      // Throws BusinessException if insufficient balance — prevents creating
      // an onchain_tx record for a withdrawal that can't be funded.
      await this._walletsService.applyTransaction(userId, {
        currencyId,
        amount: dto.amount,
        action: WalletTransactionAction.FREEZE,
        refType: WalletReferenceType.WITHDRAW,
        refId: txId,
      });

      await this.onchainTxRepo.create({
        tx_id: txId,
        user_id: userId,
        chain: dto.chain,
        type: OnchainTxType.WITHDRAWAL,
        linked_wallet_id: linkedWallet.link_id,
        to_address: linkedWallet.address,
        amount: dto.amount,
        status: OnchainTxStatus.PENDING,
        asset,
      });

      if (idempotencyCacheKey) {
        await this.cacheService.set(
          idempotencyCacheKey,
          { txId },
          OnchainWithdrawalService.WITHDRAWAL_IDEM_TTL,
        );
      }

      const result = {
        txId,
        status: OnchainTxStatus.PENDING,
        destination: linkedWallet.address,
        amount: dto.amount,
        chain: dto.chain,
        asset,
        linkedWalletId: linkedWallet.link_id,
      };

      // Fire-and-forget: notify FINANCE_MANAGERs about new withdrawal request
      const assetSymbol = asset === WithdrawalAsset.USDT_TRC20 ? 'USDT' : 'TRX';
      this._notifyFinanceManagers(
        {
          title: 'New Withdrawal Request',
          body: `User requested withdrawal of ${dto.amount} ${assetSymbol} on ${dto.chain}`,
          type: 'withdrawal_request',
          data: {
            txId,
            chain: dto.chain,
            amount: dto.amount,
            asset,
            assetSymbol,
            i18nKey: 'notifWithdrawalRequest',
          },
        },
        userId,
      ).catch(() => {}); // non-blocking

      return result;
    } finally {
      await this.cacheService.delete(lockKey);
    }
  }

  private async _notifyFinanceManagers(notification: {
    title: string;
    body: string;
    type: 'withdrawal_request' | 'withdrawal_approved' | 'withdrawal_rejected';
    data: Record<string, unknown>;
  }, actorUserId: string) {
    try {
      const financeManagers = await this._usersService.findActiveUsersByRole(UserRole.FINANCE_MANAGER);
      if (financeManagers.length === 0) return;

      const userIds = financeManagers.map((u) => u.user_id);
      await this._notificationsService.sendToUsers(
        userIds,
        {
          title: notification.title,
          body: notification.body,
          type: notification.type,
          data: notification.data,
        },
        actorUserId,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[WithdrawalNotification] Failed to notify finance managers: ${reason}`);
    }
  }

  async approveManualWithdrawal(
    actorUserId: string,
    txId: string,
  ): Promise<{ txId: string; status: string; actorUserId: string; txHash?: string }> {
    const lockKey = `withdrawal:action:${txId}`;
    if (await this.cacheService.exists(lockKey)) {
      throw new ConflictException(
        'Yeu cau rut tien dang duoc xu ly boi thao tac khac.',
        'WITHDRAWAL_ALREADY_PROCESSING',
      );
    }
    await this.cacheService.set(lockKey, actorUserId, OnchainWithdrawalService.WITHDRAWAL_ACTION_LOCK_TTL);

    try {
      const txRecord = await this.onchainTxRepo.findById(txId);
      if (!txRecord) {
        throw new ConflictException('Khong tim thay giao dich', 'WITHDRAWAL_NOT_FOUND');
      }

      if (txRecord.status !== OnchainTxStatus.PENDING) {
        throw new ConflictException(
          `Khong the chap nhan yeu cau dang o trang thai: ${txRecord.status}`,
          'WITHDRAWAL_INVALID_STATUS',
        );
      }

      const asset = (txRecord as { asset?: WithdrawalAsset }).asset ?? WithdrawalAsset.NATIVE;

      const wallet = await this.selectWithdrawalWallet(txRecord.chain, asset);
      if (!wallet) {
        throw new ConflictException('Khong tim thay vi rut tien', 'WALLET_NOT_FOUND');
      }

      let txHash: string;
      try {
        txHash = await this.executeWithdrawal(wallet, txRecord.to_address, txRecord.amount, asset);
        // #region agent debug log
        console.log(`[DEBUG:837714] executeWithdrawal returned: txHash=${txHash}`);
        // #endregion
      } catch (blockchainError) {
        const errorMessage = blockchainError instanceof Error ? blockchainError.message : String(blockchainError);

        this._logger.error(
          `[Withdrawal] Blockchain error on withdrawal ${txId}: ${errorMessage}`,
          blockchainError instanceof Error ? blockchainError.stack : undefined,
        );

        // Restore the frozen balance — the user gets their funds back
        if (txRecord.user_id) {
          const currencyId = asset === WithdrawalAsset.USDT_TRC20
            ? await this._resolveUsdtCurrencyId()
            : await this._resolveTrxCurrencyId();
          try {
            await this._walletsService.applyTransaction(txRecord.user_id, {
              currencyId,
              amount: txRecord.amount,
              action: WalletTransactionAction.UNFREEZE,
              refType: WalletReferenceType.WITHDRAW,
              refId: txId,
              // Use a unique suffix to avoid uk_ledger_ref conflict with FREEZE entries.
              // Must fit within ref_id CHARACTER(36) column, so suffix is limited to 3 chars.
              ledgerRefId: `${txId.slice(0, 33)}-r`,
            });
          } catch (unfreezeError) {
            this._logger.error(`UNFREEZE failed for ${txId}: ${unfreezeError instanceof Error ? unfreezeError.message : String(unfreezeError)}`);
          }
        }

        await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.FAILED, {});

        if (txRecord.user_id) {
          const assetSymbol = asset === WithdrawalAsset.USDT_TRC20 ? 'USDT' : 'TRX';
          this._notifyUser(
            txRecord.user_id,
            {
              title: 'Withdrawal Failed',
              body: `Your withdrawal of ${txRecord.amount} ${assetSymbol} on ${txRecord.chain} could not be processed. Please contact support.`,
              type: 'withdrawal_rejected',
              data: {
                txId,
                chain: txRecord.chain,
                amount: txRecord.amount,
                asset,
                assetSymbol,
                error: errorMessage,
                i18nKey: 'notifWithdrawalRejected',
              },
            },
            actorUserId,
          ).catch(() => {});
        }

        if (blockchainError instanceof BusinessException) {
          throw blockchainError;
        }
        throw new InternalServerException(
          `Giao dich blockchain that bai: ${errorMessage}`,
          { code: 'BLOCKCHAIN_EXECUTION_FAILED', txId },
        );
      }

      // #region agent debug log
      console.log(`[DEBUG:837714] about to call updateStatus(CONFIRMING), txId=${txId}, txHash=${txHash}`);
      // #endregion
      let debitWasPerformed = false;
      if (txRecord.user_id) {
        const currencyId = asset === WithdrawalAsset.USDT_TRC20
          ? await this._resolveUsdtCurrencyId()
          : await this._resolveTrxCurrencyId();
        // Check if DEBIT succeeded by verifying ledger entry exists
        try {
          await this._walletsService.applyTransaction(txRecord.user_id, {
            currencyId,
            amount: txRecord.amount,
            action: WalletTransactionAction.DEBIT,
            refType: WalletReferenceType.WITHDRAW,
            refId: txId,
            ledgerRefId: `${txId.slice(0, 33)}-d`,
          });
          debitWasPerformed = true;
        } catch (debitErr) {
          const errMsg = debitErr instanceof Error ? debitErr.message : String(debitErr);
          // #region agent debug log
          console.log(`[DEBUG:837714] DEBIT FAILED: txId=${txId}, error=${errMsg}`);
          // #endregion
          if (
            errMsg.includes('Duplicate transaction reference') ||
            errMsg.includes('DUPLICATE_LEDGER_ENTRY')
          ) {
            // Already debited from a previous retry/timeout — safe to continue.
            debitWasPerformed = false; // Not a fresh debit, balance was already reduced
            this._logger.warn(
              `[Withdrawal] Debit already recorded for ${txId} (duplicate ledger ref). Proceeding to updateStatus(CONFIRMING).`,
            );
          } else {
            throw debitErr;
          }
        }
        // #region agent debug log
        if (debitWasPerformed) {
          console.log(`[DEBUG:837714] DEBIT succeeded: txId=${txId}`);
        }
        // #endregion
      }

      try {
        await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.CONFIRMING, { txHash });
      } catch (updateErr) {
        // #region agent debug log
        console.log(`[DEBUG:837714] updateStatus(CONFIRMING) FAILED: txId=${txId}, error=${updateErr}`);
        // #endregion
        // CRITICAL: If updateStatus fails but DEBIT succeeded, we MUST refund the user.
        if (debitWasPerformed && txRecord.user_id) {
          const currencyId = asset === WithdrawalAsset.USDT_TRC20
            ? await this._resolveUsdtCurrencyId()
            : await this._resolveTrxCurrencyId();
          try {
            await this._walletsService.applyTransaction(txRecord.user_id, {
              currencyId,
              amount: txRecord.amount,
              action: WalletTransactionAction.CREDIT,
              refType: WalletReferenceType.WITHDRAW,
              refId: txId,
              ledgerRefId: `${txId.slice(0, 33)}-rc`,
            });
            this._logger.error(
              `[Withdrawal] CRITICAL: updateStatus(CONFIRMING) failed after DEBIT. Refunded ${txRecord.amount} to user ${txRecord.user_id} for txId=${txId}. Manual review required.`,
            );
          } catch (refundErr) {
            this._logger.error(
              `[Withdrawal] CRITICAL: Failed to refund user ${txRecord.user_id} for txId=${txId}. Manual intervention required immediately!`,
              refundErr instanceof Error ? refundErr.stack : undefined,
            );
          }
        }
        throw updateErr;
      }
      // #region agent debug log
      console.log(`[DEBUG:837714] approveManualWithdrawal: after updateStatus(CONFIRMING), txId=${txId}, txHash=${txHash}`);
      // #endregion

      if (txRecord.user_id) {
        const assetSymbol = asset === WithdrawalAsset.USDT_TRC20 ? 'USDT' : 'TRX';
        this._notifyUser(
          txRecord.user_id,
          {
            title: 'Withdrawal Approved',
            body: `Your withdrawal of ${txRecord.amount} ${assetSymbol} on ${txRecord.chain} has been approved and is being processed.`,
            type: 'withdrawal_approved',
            data: {
              txId,
              chain: txRecord.chain,
              amount: txRecord.amount,
              asset,
              assetSymbol,
              txHash,
              i18nKey: 'notifWithdrawalApproved',
            },
          },
          actorUserId,
        ).catch(() => {});
      }

      return { txId, status: 'APPROVED', actorUserId, txHash };
    } finally {
      await this.cacheService.delete(lockKey);
    }
  }

  async rejectManualWithdrawal(actorUserId: string, txId: string, reason?: string) {
    const lockKey = `withdrawal:action:${txId}`;
    if (await this.cacheService.exists(lockKey)) {
      throw new ConflictException(
        'Yeu cau rut tien dang duoc xu ly boi thao tac khac.',
        'WITHDRAWAL_ALREADY_PROCESSING',
      );
    }
    await this.cacheService.set(lockKey, actorUserId, OnchainWithdrawalService.WITHDRAWAL_ACTION_LOCK_TTL);

    try {
      const txRecord = await this.onchainTxRepo.findById(txId);
      if (!txRecord) {
        throw new ConflictException('Khong tim thay giao dich', 'WITHDRAWAL_NOT_FOUND');
      }

      if (txRecord.status !== OnchainTxStatus.PENDING) {
        throw new ConflictException(
          `Khong the tu choi yeu cau dang o trang thai: ${txRecord.status}`,
          'WITHDRAWAL_INVALID_STATUS',
        );
      }

      // Restore the frozen balance — user gets their funds back
      if (txRecord.user_id) {
        const asset = (txRecord as { asset?: WithdrawalAsset }).asset ?? WithdrawalAsset.NATIVE;
        const currencyId = asset === WithdrawalAsset.USDT_TRC20
          ? await this._resolveUsdtCurrencyId()
          : await this._resolveTrxCurrencyId();
        try {
          await this._walletsService.applyTransaction(txRecord.user_id, {
            currencyId,
            amount: txRecord.amount,
            action: WalletTransactionAction.UNFREEZE,
            refType: WalletReferenceType.WITHDRAW,
            refId: txId,
          });
        } catch (unfreezeError) {
          this._logger.error(`UNFREEZE on reject failed for ${txId}: ${unfreezeError instanceof Error ? unfreezeError.message : String(unfreezeError)}`);
        }
      }

      await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.FAILED, {});

      if (txRecord.user_id) {
        const asset = (txRecord as { asset?: WithdrawalAsset }).asset ?? WithdrawalAsset.NATIVE;
        const assetSymbol = asset === WithdrawalAsset.USDT_TRC20 ? 'USDT' : 'TRX';
        this._notifyUser(
          txRecord.user_id,
          {
            title: 'Withdrawal Rejected',
            body: reason != null
              ? `Your withdrawal request has been rejected. Reason: ${reason}`
              : 'Your withdrawal request has been rejected.',
            type: 'withdrawal_rejected',
            data: {
              txId,
              chain: txRecord.chain,
              amount: txRecord.amount,
              asset,
              assetSymbol,
              reason,
              i18nKey: 'notifWithdrawalRejected',
            },
          },
          actorUserId,
        ).catch(() => {});
      }

      return { txId, status: OnchainTxStatus.FAILED, actorUserId, reason: reason ?? null };
    } finally {
      await this.cacheService.delete(lockKey);
    }
  }

  private async _notifyUser(
    userId: string,
    notification: {
      title: string;
      body: string;
      type: 'withdrawal_approved' | 'withdrawal_rejected';
      data: Record<string, unknown>;
    },
    actorUserId: string,
  ) {
    await this._notificationsService.sendToUser(
      userId,
      {
        title: notification.title,
        body: notification.body,
        type: notification.type,
        data: notification.data,
      },
      actorUserId,
    );
  }

  private async selectWithdrawalWallet(
    chain: string,
    asset: WithdrawalAsset,
  ): Promise<TransactionWalletRecord | null> {
    if (asset === WithdrawalAsset.USDT_TRC20) {
      if (chain !== 'TRON_MAINNET' && chain !== 'TRON_NILE' && chain !== 'TRON_SHASTA') {
        throw new ConflictException(
          'USDT (TRC-20) withdrawal chi ho tro tren mang Tron',
          'USDT_WITHDRAWAL_UNSUPPORTED_CHAIN',
        );
      }
    }

    return this._transactionWalletService.getWithdrawalSourceWallet(chain);
  }

  private async executeWithdrawal(
    wallet: TransactionWalletRecord,
    toAddress: string,
    amount: string,
    asset: WithdrawalAsset,
  ): Promise<string> {
    if (asset === WithdrawalAsset.USDT_TRC20) {
      return this._transactionWalletService.sendWithdrawalUsdtTrc20(wallet, toAddress, amount);
    }

    return this._transactionWalletService.sendWithdrawalNativeTransfer(wallet, toAddress, amount);
  }

  /**
   * Check on-chain confirmations and settle withdrawal if confirmed.
   * Called by the withdrawal confirmation scheduler.
   */
  async settleWithdrawalByTxId(txId: string): Promise<{
    txId: string;
    status: string;
    confirmations: number;
    settled: boolean;
  }> {
    const tx = await this.onchainTxRepo.findById(txId);
    if (!tx) {
      this._logger.warn(`[WithdrawalConfirm] Transaction not found: ${txId}`);
      return { txId, status: 'NOT_FOUND', confirmations: 0, settled: false };
    }

    if (tx.type !== 'WITHDRAWAL') {
      this._logger.warn(`[WithdrawalConfirm] Not a withdrawal: ${txId}`);
      return { txId, status: 'INVALID_TYPE', confirmations: 0, settled: false };
    }

    if (tx.status !== 'CONFIRMING') {
      this._logger.debug(`[WithdrawalConfirm] Already processed: ${txId}, status=${tx.status}`);
      return { txId, status: tx.status, confirmations: tx.confirmations ?? 0, settled: tx.status === 'COMPLETED' };
    }

    if (!tx.tx_hash) {
      this._logger.warn(`[WithdrawalConfirm] No tx_hash for CONFIRMING withdrawal: ${txId}`);
      return { txId, status: tx.status, confirmations: 0, settled: false };
    }

    const chain = tx.chain as BlockchainNetwork;
    const provider = this._providerFactory.getProvider(chain);

    // #region agent debug log
    console.log(`[DEBUG:837714] settleWithdrawalByTxId: txId=${txId}, status=${tx.status}, tx_hash=${tx.tx_hash}, chain=${chain}`);
    // #endregion

    // Check on-chain status
    const chainStatus = await provider.getTransactionStatus(String(tx.tx_hash));

    // #region agent debug log
    console.log(`[DEBUG:837714] settleWithdrawalByTxId: chainStatus.status=${chainStatus.status}, confirmations=${chainStatus.confirmations}`);
    // #endregion

    if (chainStatus.status === 'FAILED') {
      // Restore frozen balance — the blockchain tx did not succeed
      if (tx.user_id) {
        const asset = (tx as { asset?: WithdrawalAsset }).asset ?? WithdrawalAsset.NATIVE;
        const currencyId = asset === WithdrawalAsset.USDT_TRC20
          ? await this._resolveUsdtCurrencyId()
          : await this._resolveTrxCurrencyId();
        try {
          await this._walletsService.applyTransaction(tx.user_id, {
            currencyId,
            amount: tx.amount,
            action: WalletTransactionAction.UNFREEZE,
            refType: WalletReferenceType.WITHDRAW,
            refId: txId,
          });
        } catch (unfreezeError) {
          this._logger.error(`UNFREEZE failed for ${txId}: ${unfreezeError instanceof Error ? unfreezeError.message : String(unfreezeError)}`);
        }
      }

      await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.FAILED, {
        confirmations: chainStatus.confirmations ?? 0,
      });
      this._logger.warn(`[WithdrawalConfirm] Chain tx failed: ${txId}, txHash=${tx.tx_hash}`);
      return {
        txId,
        status: OnchainTxStatus.FAILED,
        confirmations: chainStatus.confirmations ?? 0,
        settled: false,
      };
    }

    if (chainStatus.status === 'CONFIRMED') {
      // On-chain confirmed - mark as COMPLETED
      await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.COMPLETED, {
        confirmations: chainStatus.confirmations ?? 1,
        confirmed_at: new Date(),
      });

      // Notify user
      if (tx.user_id) {
        this._notifyUser(
          tx.user_id,
          {
            title: 'Withdrawal Completed',
            body: `Your withdrawal of ${tx.amount} on ${tx.chain} has been confirmed on the blockchain.`,
            type: 'withdrawal_approved' as const,
            data: { txId, chain: tx.chain, amount: tx.amount, txHash: tx.tx_hash },
          },
          'system',
        ).catch(() => {});
      }

      this._logger.log(`[WithdrawalConfirm] Withdrawal completed: ${txId}, txHash=${tx.tx_hash}`);
      return {
        txId,
        status: OnchainTxStatus.COMPLETED,
        confirmations: chainStatus.confirmations ?? 1,
        settled: true,
      };
    }

    // Still confirming - update confirmations count
    await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.CONFIRMING, {
      confirmations: chainStatus.confirmations ?? 0,
    });

    this._logger.debug(
      `[WithdrawalConfirm] Still confirming: ${txId}, txHash=${tx.tx_hash}, confirmations=${chainStatus.confirmations ?? 0}`,
    );
    return {
      txId,
      status: OnchainTxStatus.CONFIRMING,
      confirmations: chainStatus.confirmations ?? 0,
      settled: false,
    };
  }

  /**
   * Clean up withdrawals stuck in CONFIRMING without a tx_hash (orphaned).
   * These records have no blockchain transaction associated — mark as FAILED.
   */
  async cleanupOrphanConfirming(): Promise<number> {
    return this.onchainTxRepo.markOrphanConfirmingAsFailed();
  }

  /**
   * Internal helper to restore frozen balance for a withdrawal tx.
   * Does NOT catch errors — caller should handle.
   */
  private async _unfreezeWithdrawalBalance(
    txId: string,
    userId: string,
    amount: string,
    asset: WithdrawalAsset,
  ): Promise<void> {
    const currencyId = asset === WithdrawalAsset.USDT_TRC20
      ? await this._resolveUsdtCurrencyId()
      : await this._resolveTrxCurrencyId();
    await this._walletsService.applyTransaction(userId, {
      currencyId,
      amount,
      action: WalletTransactionAction.UNFREEZE,
      refType: WalletReferenceType.WITHDRAW,
      refId: txId,
    });
  }

  /**
   * Process all CONFIRMING withdrawals and settle those that are confirmed.
   */
  async processConfirmingWithdrawals(limit = 50): Promise<{
    processed: number;
    completed: number;
    failed: number;
    stillConfirming: number;
  }> {
    const withdrawals = await this.onchainTxRepo.findConfirmingWithdrawals(limit);

    let completed = 0;
    let failed = 0;
    let stillConfirming = 0;

    for (const withdrawal of withdrawals) {
      try {
        const result = await this.settleWithdrawalByTxId(withdrawal.tx_id);
        if (result.status === 'COMPLETED') {
          completed++;
        } else if (result.status === 'FAILED') {
          failed++;
        } else {
          stillConfirming++;
        }
      } catch (error) {
        this._logger.error(`[WithdrawalConfirm] Error processing ${withdrawal.tx_id}: ${error}`);
        stillConfirming++;
      }
    }

    return {
      processed: withdrawals.length,
      completed,
      failed,
      stillConfirming,
    };
  }

  async processPendingManualWithdrawals(actorUserId: string, limit: number) {
    return { actorUserId, processed: 0, limit };
  }

  /**
   * Force mark a withdrawal as FAILED and refund frozen balance to user.
   * Admin manual reconciliation action.
   */
  async forceFailWithdrawal(txId: string, reason: string): Promise<void> {
    const tx = await this.onchainTxRepo.findById(txId);
    if (!tx) {
      throw new Error(`Transaction not found: ${txId}`);
    }

    // Mark as FAILED
    await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.FAILED, {});

    // Refund frozen balance if user exists
    if (tx.user_id) {
      const asset = (tx as { asset?: WithdrawalAsset }).asset ?? WithdrawalAsset.NATIVE;
      const currencyId = asset === WithdrawalAsset.USDT_TRC20
        ? await this._resolveUsdtCurrencyId()
        : await this._resolveTrxCurrencyId();
      try {
        await this._walletsService.applyTransaction(tx.user_id, {
          currencyId,
          amount: tx.amount,
          action: WalletTransactionAction.UNFREEZE,
          refType: WalletReferenceType.WITHDRAW,
          refId: txId,
          ledgerRefId: `${txId.slice(0, 33)}-ff`,
        });
        this._logger.warn(
          `[AdminForceFail] Force-failed withdrawal ${txId}: ${reason}. Refunded ${tx.amount} to user ${tx.user_id}`,
        );
      } catch (err) {
        this._logger.error(
          `[AdminForceFail] Failed to refund user ${tx.user_id} for txId=${txId}. Manual intervention required!`,
          err instanceof Error ? err.stack : undefined,
        );
        throw err;
      }
    }
  }

  /**
   * Force mark a withdrawal as COMPLETED without checking blockchain.
   * Admin manual reconciliation action.
   */
  async forceCompleteWithdrawal(txId: string): Promise<void> {
    const tx = await this.onchainTxRepo.findById(txId);
    if (!tx) {
      throw new Error(`Transaction not found: ${txId}`);
    }

    await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.COMPLETED, {
      confirmations: 1,
      confirmed_at: new Date(),
    });

    this._logger.warn(`[AdminForceComplete] Force-completed withdrawal ${txId}`);
  }

  /**
   * Force refund frozen balance without changing tx status.
   * Use when user was debited but TX was never recorded properly.
   * Admin manual reconciliation action.
   */
  async forceRefundWithdrawal(txId: string, reason: string): Promise<void> {
    const tx = await this.onchainTxRepo.findById(txId);
    if (!tx) {
      throw new Error(`Transaction not found: ${txId}`);
    }

    if (tx.user_id) {
      const asset = (tx as { asset?: WithdrawalAsset }).asset ?? WithdrawalAsset.NATIVE;
      const currencyId = asset === WithdrawalAsset.USDT_TRC20
        ? await this._resolveUsdtCurrencyId()
        : await this._resolveTrxCurrencyId();
      try {
        await this._walletsService.applyTransaction(tx.user_id, {
          currencyId,
          amount: tx.amount,
          action: WalletTransactionAction.UNFREEZE,
          refType: WalletReferenceType.WITHDRAW,
          refId: txId,
          ledgerRefId: `${txId.slice(0, 33)}-fr`,
        });
        this._logger.warn(
          `[AdminForceRefund] Refunded ${tx.amount} to user ${tx.user_id} for txId=${txId}: ${reason}`,
        );
      } catch (err) {
        this._logger.error(
          `[AdminForceRefund] Failed to refund user ${tx.user_id} for txId=${txId}. Manual intervention required!`,
          err instanceof Error ? err.stack : undefined,
        );
        throw err;
      }
    }
  }
}
