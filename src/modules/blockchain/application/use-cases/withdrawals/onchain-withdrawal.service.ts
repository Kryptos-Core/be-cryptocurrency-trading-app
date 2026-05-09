import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { BlockchainNetwork, OnchainTxStatus, OnchainTxType } from '@/common/enums';
import { ConflictException } from '@/common/exceptions';
import { CacheService } from '@/common/services';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import type { TransactionWalletRecord } from '@/modules/treasury';
import { TransactionWalletService } from '@/modules/treasury/transaction-wallet.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
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
      const txId = uuidv7();

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

      return {
        txId,
        status: OnchainTxStatus.PENDING,
        destination: linkedWallet.address,
        amount: dto.amount,
        chain: dto.chain,
        asset,
        linkedWalletId: linkedWallet.link_id,
      };
    } finally {
      await this.cacheService.delete(lockKey);
    }
  }

  async approveManualWithdrawal(
    actorUserId: string,
    txId: string,
  ): Promise<{ txId: string; status: string; actorUserId: string; txHash?: string }> {
    const txRecord = await this.onchainTxRepo.findById(txId);
    if (!txRecord) {
      throw new ConflictException('Khong tim thay giao dich', 'WITHDRAWAL_NOT_FOUND');
    }

    const asset = (txRecord as { asset?: WithdrawalAsset }).asset ?? WithdrawalAsset.NATIVE;

    const wallet = await this.selectWithdrawalWallet(txRecord.chain, asset);
    if (!wallet) {
      throw new ConflictException('Khong tim thay vi rút tiền', 'WALLET_NOT_FOUND');
    }
    const txHash = await this.executeWithdrawal(wallet, txRecord.to_address, txRecord.amount, asset);

    await this.onchainTxRepo.updateStatus(txId, OnchainTxStatus.CONFIRMING, { txHash });

    return { txId, status: 'APPROVED', actorUserId, txHash };
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

  async rejectManualWithdrawal(actorUserId: string, txId: string, reason?: string) {
    return { txId, status: 'REJECTED', actorUserId, reason: reason ?? null };
  }

  async processPendingManualWithdrawals(actorUserId: string, limit: number) {
    return { actorUserId, processed: 0, limit };
  }
}
