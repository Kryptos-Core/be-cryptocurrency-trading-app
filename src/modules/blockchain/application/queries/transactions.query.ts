import { Injectable } from '@nestjs/common';
import { OnchainTransferQueryService } from '../../onchain-transfer-query.service';

@Injectable()
export class GetTransactionsQuery {
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(userId: string, limit: number = 50) {
    return this.queryService.getTransactions(userId, limit);
  }
}

@Injectable()
export class GetTransactionByIdQuery {
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(userId: string, txId: string) {
    return this.queryService.getTransactionById(userId, txId);
  }
}

@Injectable()
export class GetAdminWithdrawalsQuery {
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(filters: {
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
}

@Injectable()
export class GetAdminWithdrawalByIdQuery {
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(txId: string) {
    return this.queryService.getAdminWithdrawalById(txId);
  }
}

@Injectable()
export class GetAdminWithdrawalStatsQuery {
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute() {
    return this.queryService.getAdminWithdrawalStats();
  }
}
