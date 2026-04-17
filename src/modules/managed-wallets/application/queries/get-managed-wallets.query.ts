import { Injectable } from '@nestjs/common';
import type { BlockchainChainDbValue } from '@/common/constants/blockchain-chain-db';
import { BaseQuery, type IQueryHandler } from '@/common/cqrs';
import type { UserRole } from '@/common/enums';
import type { BlockchainOnchainTransactionRecord } from '@/modules/blockchain';
import type { ManagedWalletResponseDto } from '../../dto';
import { ManagedWalletsService } from '../../managed-wallets.service';

export class GetManagedWalletsRequest extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly role: UserRole,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetManagedWalletsQuery
  implements IQueryHandler<GetManagedWalletsRequest, ManagedWalletResponseDto[]>
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(query: GetManagedWalletsRequest): Promise<ManagedWalletResponseDto[]> {
    return this.managedWalletsService.listWallets(query.userId, query.role);
  }
}

export class GetManagedWalletDepositDefaultsRequest extends BaseQuery {
  constructor(correlationId?: string) {
    super(correlationId);
  }
}

@Injectable()
export class GetManagedWalletDepositDefaultsQuery
  implements
    IQueryHandler<
      GetManagedWalletDepositDefaultsRequest,
      {
        recommended_chain: BlockchainChainDbValue;
        defaults: ManagedWalletResponseDto[];
      }
    >
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(query: GetManagedWalletDepositDefaultsRequest): Promise<{
    recommended_chain: BlockchainChainDbValue;
    defaults: ManagedWalletResponseDto[];
  }> {
    return this.managedWalletsService.getDepositDefaults();
  }
}

export class GetManagedWalletDetailRequest extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly walletId: string,
    public readonly role: UserRole,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetManagedWalletDetailQuery
  implements
    IQueryHandler<
      GetManagedWalletDetailRequest,
      ManagedWalletResponseDto & { balance: string; symbol: string }
    >
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(
    query: GetManagedWalletDetailRequest,
  ): Promise<ManagedWalletResponseDto & { balance: string; symbol: string }> {
    return this.managedWalletsService.getWalletDetail(query.userId, query.walletId, query.role);
  }
}

export class GetManagedWalletTransactionsRequest extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly walletId: string,
    public readonly role: UserRole,
    public readonly limit: number = 50,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetManagedWalletTransactionsQuery
  implements
    IQueryHandler<GetManagedWalletTransactionsRequest, BlockchainOnchainTransactionRecord[]>
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(
    query: GetManagedWalletTransactionsRequest,
  ): Promise<BlockchainOnchainTransactionRecord[]> {
    return this.managedWalletsService.getWalletTransactions(
      query.userId,
      query.walletId,
      query.role,
      query.limit,
    );
  }
}

export class GetDepositMethodsRequest extends BaseQuery {
  constructor(correlationId?: string) {
    super(correlationId);
  }
}

@Injectable()
export class GetDepositMethodsQuery
  implements
    IQueryHandler<
      GetDepositMethodsRequest,
      {
        recommended_chain: string;
        methods: Array<{
          chain: string;
          label: string;
          deposit_address: string;
          is_recommended: boolean;
          deposit_enabled: boolean;
          min_confirmations: number;
          estimated_time: string;
        }>;
      }
    >
{
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

  async execute(query: GetDepositMethodsRequest): Promise<{
    recommended_chain: string;
    methods: Array<{
      chain: string;
      label: string;
      deposit_address: string;
      is_recommended: boolean;
      deposit_enabled: boolean;
      min_confirmations: number;
      estimated_time: string;
    }>;
  }> {
    return this.managedWalletsService.getDepositMethods();
  }
}
