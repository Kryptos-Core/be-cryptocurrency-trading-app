import { Injectable } from '@nestjs/common';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import type { TreasuryOperation } from '@/entities/treasury-operation.entity';
import type { ListTreasuryOperationsDto, ListTreasuryTransactionsDto } from '../../dto';
import { TreasuryOperationsService } from '../../treasury-operations.service';

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
    items: BlockchainOnchainTransactionRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.service.listTreasuryTransactions(filter);
  }
}


