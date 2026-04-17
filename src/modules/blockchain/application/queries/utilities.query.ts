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
  constructor(private readonly managedWalletsService: ManagedWalletsService) {}

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
    const depositAddress =
      await this.managedWalletsService.getPublicDepositRecipientAddress(normalizedChain);

    if (!depositAddress) {
      const isTronMainnet = normalizedChain === BlockchainNetwork.TRON_MAINNET;
      throw new BadRequestException(
        isTronMainnet
          ? 'Chưa cấu hình ví nạp mặc định cho mạng này. Vui lòng đặt default trong Nạp tiền & ví quản lý.'
          : 'Chưa cấu hình địa chỉ nạp cho mạng này. Kiểm tra ví nạp mặc định hoặc ví chính (treasury) trên mạng đã chọn.',
        isTronMainnet ? 'DEPOSIT_DEFAULT_NOT_CONFIGURED' : 'DEPOSIT_ADDRESS_NOT_CONFIGURED',
      );
    }

    return {
      chain: normalizedChain,
      depositAddress,
      source: 'deposit_methods_sync',
      note: 'Địa chỉ này khớp với mục “Phương thức nạp tiền của sàn” cho cùng mạng (mainnet/testnet theo cấu hình hệ thống).',
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
