import { Injectable } from '@nestjs/common';
import { BaseQuery, type IQueryHandler } from '@/common/cqrs';
import { OnchainTransferQueryService } from '../../onchain-transfer-query.service';

export class GetTransactionsRequest extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly limit: number = 50,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetTransactionsQuery
  implements IQueryHandler<GetTransactionsRequest, Awaited<ReturnType<OnchainTransferQueryService['getTransactions']>>>
{
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(query: GetTransactionsRequest) {
    return this.queryService.getTransactions(query.userId, query.limit);
  }
}

export class GetTransactionByIdRequest extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly txId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetTransactionByIdQuery
  implements
    IQueryHandler<
      GetTransactionByIdRequest,
      Awaited<ReturnType<OnchainTransferQueryService['getTransactionById']>>
    >
{
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(query: GetTransactionByIdRequest) {
    return this.queryService.getTransactionById(query.userId, query.txId);
  }
}

export class GetAdminWithdrawalsRequest extends BaseQuery {
  constructor(
    public readonly filters: {
      userId?: string;
      status?: string;
      chain?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    },
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetAdminWithdrawalsQuery
  implements
    IQueryHandler<
      GetAdminWithdrawalsRequest,
      Awaited<ReturnType<OnchainTransferQueryService['getAdminWithdrawals']>>
    >
{
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(query: GetAdminWithdrawalsRequest) {
    return this.queryService.getAdminWithdrawals(query.filters);
  }
}

export class GetAdminWithdrawalByIdRequest extends BaseQuery {
  constructor(
    public readonly txId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetAdminWithdrawalByIdQuery
  implements
    IQueryHandler<
      GetAdminWithdrawalByIdRequest,
      Awaited<ReturnType<OnchainTransferQueryService['getAdminWithdrawalById']>>
    >
{
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(query: GetAdminWithdrawalByIdRequest) {
    return this.queryService.getAdminWithdrawalById(query.txId);
  }
}

export class GetAdminWithdrawalStatsRequest extends BaseQuery {
  constructor(correlationId?: string) {
    super(correlationId);
  }
}

@Injectable()
export class GetAdminWithdrawalStatsQuery
  implements
    IQueryHandler<
      GetAdminWithdrawalStatsRequest,
      Awaited<ReturnType<OnchainTransferQueryService['getAdminWithdrawalStats']>>
    >
{
  constructor(private readonly queryService: OnchainTransferQueryService) {}

  async execute(_query: GetAdminWithdrawalStatsRequest) {
    return this.queryService.getAdminWithdrawalStats();
  }
}
