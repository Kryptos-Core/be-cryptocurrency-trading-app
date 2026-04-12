import { Injectable } from '@nestjs/common';
import type { BlockchainNetwork } from '@/common/enums';
import type { RequestWithdrawalDto, SubmitDepositDto } from './dto';
import { OnchainDepositService } from './onchain-deposit.service';
import { OnchainTransferQueryService } from './onchain-transfer-query.service';
import { OnchainWithdrawalService } from './onchain-withdrawal.service';

/**
 * Facade service giữ nguyên API cũ cho controller/spec,
 * đồng thời ủy quyền xử lý sang các service theo domain.
 */
@Injectable()
export class OnchainTransferService {
  constructor(
    private readonly depositService: OnchainDepositService,
    private readonly withdrawalService: OnchainWithdrawalService,
    private readonly queryService: OnchainTransferQueryService,
  ) {}

  async previewDepositTx(userId: string, chain: BlockchainNetwork, txHash: string) {
    return this.depositService.previewDepositTx(userId, chain, txHash);
  }

  async submitDeposit(userId: string, dto: SubmitDepositDto) {
    return this.depositService.submitDeposit(userId, dto);
  }

  async settleDepositByTxId(userId: string, txId: string) {
    return this.depositService.settleDepositByTxId(userId, txId);
  }

  async requestWithdrawal(userId: string, dto: RequestWithdrawalDto) {
    return this.withdrawalService.requestWithdrawal(userId, dto);
  }

  async approveManualWithdrawal(actorUserId: string, txId: string) {
    return this.withdrawalService.approveManualWithdrawal(actorUserId, txId);
  }

  async rejectManualWithdrawal(actorUserId: string, txId: string, reason?: string) {
    return this.withdrawalService.rejectManualWithdrawal(actorUserId, txId, reason);
  }

  async processPendingManualWithdrawals(actorUserId: string, limit: number = 20) {
    return this.withdrawalService.processPendingManualWithdrawals(actorUserId, limit);
  }

  async getTransactions(userId: string, limit: number = 50) {
    return this.queryService.getTransactions(userId, limit);
  }

  async getTransactionById(userId: string, txId: string) {
    return this.queryService.getTransactionById(userId, txId);
  }

  async getAdminWithdrawals(filters: {
    userId?: string;
    status?: string;
    chain?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }) {
    return this.queryService.getAdminWithdrawals(filters);
  }

  async getAdminWithdrawalById(txId: string) {
    return this.queryService.getAdminWithdrawalById(txId);
  }

  async getAdminWithdrawalStats() {
    return this.queryService.getAdminWithdrawalStats();
  }
}
