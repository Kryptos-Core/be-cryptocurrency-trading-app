import { Injectable } from '@nestjs/common';
import { BaseQuery, type IQueryHandler } from '@/common/cqrs';
import { BlockchainNetwork } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import { BlockchainProviderFactory } from '../../blockchain-provider.factory';

export class GetDepositAddressRequest extends BaseQuery {
  constructor(
    public readonly chain: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

@Injectable()
export class GetDepositAddressQuery
  implements
    IQueryHandler<
      GetDepositAddressRequest,
      {
        chain: BlockchainNetwork;
        depositAddress: string;
        source: string;
        note: string;
      }
    >
{
  constructor(
    private readonly managedWalletsService: ManagedWalletsService,
    private readonly providerFactory: BlockchainProviderFactory,
  ) {}

  async execute(query: GetDepositAddressRequest): Promise<{
    chain: BlockchainNetwork;
    depositAddress: string;
    source: string;
    note: string;
  }> {
    const rawChain = query.chain?.trim();
    if (!rawChain) {
      throw new BadRequestException('Thiếu query param chain', 'CHAIN_REQUIRED');
    }

    const normalizedChain = rawChain.toUpperCase() as BlockchainNetwork;
    const depositWallet =
      await this.managedWalletsService.getConfiguredDepositWallet(normalizedChain);

    if (normalizedChain === BlockchainNetwork.TRON_MAINNET) {
      if (!depositWallet) {
        throw new BadRequestException(
          'Chưa cấu hình ví nạp mặc định cho mạng này. Vui lòng đặt default trong Nạp tiền & ví quản lý.',
          'DEPOSIT_DEFAULT_NOT_CONFIGURED',
        );
      }

      return {
        chain: normalizedChain,
        depositAddress: depositWallet.address,
        source: depositWallet.source,
        note: 'Đây là địa chỉ ví nhận nạp on-chain do vận hành chỉ định (transaction wallet default).',
      };
    }

    const provider = this.providerFactory.getProvider(normalizedChain);
    return {
      chain: normalizedChain,
      depositAddress: await provider.getHotWalletAddress(),
      source: 'hot_wallet',
      note: 'Đây là địa chỉ ví nhận tiền của platform cho mạng đã chọn.',
    };
  }
}

export class GetSupportedNetworksRequest extends BaseQuery {
  constructor(correlationId?: string) {
    super(correlationId);
  }
}

@Injectable()
export class GetSupportedNetworksQuery
  implements IQueryHandler<GetSupportedNetworksRequest, { networks: string[] }>
{
  constructor(private readonly providerFactory: BlockchainProviderFactory) {}

  async execute(_query: GetSupportedNetworksRequest): Promise<{ networks: string[] }> {
    return {
      networks: this.providerFactory.getSupportedNetworks(),
    };
  }
}
