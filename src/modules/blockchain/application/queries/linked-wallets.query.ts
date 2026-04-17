import { Injectable } from '@nestjs/common';
import { BaseQuery, type IQueryHandler } from '@/common/cqrs';
import { WalletLinkingService } from '../../wallet-linking.service';

export class GetLinkedWalletsRequest extends BaseQuery {
  constructor(
    public readonly userId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetLinkedWalletsQuery
  implements
    IQueryHandler<
      GetLinkedWalletsRequest,
      Array<{
        linkId: string;
        chain: string;
        address: string;
        label: string | null;
        status: string;
        linkedAt: string | null;
      }>
    >
{
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(query: GetLinkedWalletsRequest): Promise<
    Array<{
      linkId: string;
      chain: string;
      address: string;
      label: string | null;
      status: string;
      linkedAt: string | null;
    }>
  > {
    return this.walletLinkingService.getLinkedWallets(query.userId);
  }
}

export class GetLinkedWalletBalanceRequest extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly linkId: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetLinkedWalletBalanceQuery
  implements IQueryHandler<GetLinkedWalletBalanceRequest, Awaited<ReturnType<WalletLinkingService['getLinkedWalletBalance']>>>
{
  constructor(private readonly walletLinkingService: WalletLinkingService) {}

  async execute(query: GetLinkedWalletBalanceRequest) {
    return this.walletLinkingService.getLinkedWalletBalance(query.userId, query.linkId);
  }
}
