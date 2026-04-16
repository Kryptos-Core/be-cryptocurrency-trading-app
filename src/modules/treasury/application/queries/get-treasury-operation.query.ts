import { Injectable } from '@nestjs/common';
import type { OnchainTransaction } from '@/entities/onchain-transaction.entity';
import type { TreasuryOperation } from '@/entities/treasury-operation.entity';
import type { ListTreasuryOperationsDto, ListTreasuryTransactionsDto } from '../../dto';
import type { TreasuryOperationsService } from '../../treasury-operations.service';

@Injectable()
export class GetTreasuryOperationQuery {
  constructor(private readonly service: TreasuryOperationsService) {}

  async listOperations(filter: ListTreasuryOperationsDto): Promise<{
    items: TreasuryOperation[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.service.listOperations(filter);
  }

  async getOperation(operationId: string): Promise<TreasuryOperation> {
    return this.service.getOperation(operationId);
  }

  async listTreasuryTransactions(filter: ListTreasuryTransactionsDto): Promise<{
    items: OnchainTransaction[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.service.listTreasuryTransactions(filter);
  }
}
