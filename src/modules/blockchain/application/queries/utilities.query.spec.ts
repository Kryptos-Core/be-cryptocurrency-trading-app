import { Test } from '@nestjs/testing';
import { BlockchainNetwork } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import { ManagedWalletsService } from '@/modules/managed-wallets/managed-wallets.service';
import { BlockchainProviderFactory } from '../../blockchain-provider.factory';
import {
  GetDepositAddressQuery,
  GetDepositAddressRequest,
  GetSupportedNetworksQuery,
  GetSupportedNetworksRequest,
} from './utilities.query';

describe('Blockchain utilities queries', () => {
  const managedWalletsService = {
    getPublicDepositRecipientAddress: jest.fn(),
  };
  const providerFactory = {
    getSupportedNetworks: jest.fn(),
  };

  let getDepositAddressQuery: GetDepositAddressQuery;
  let getSupportedNetworksQuery: GetSupportedNetworksQuery;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GetDepositAddressQuery,
        GetSupportedNetworksQuery,
        { provide: ManagedWalletsService, useValue: managedWalletsService },
        { provide: BlockchainProviderFactory, useValue: providerFactory },
      ],
    }).compile();

    getDepositAddressQuery = moduleRef.get(GetDepositAddressQuery);
    getSupportedNetworksQuery = moduleRef.get(GetSupportedNetworksQuery);
  });

  it('returns public deposit recipient (same as deposit methods row)', async () => {
    managedWalletsService.getPublicDepositRecipientAddress.mockResolvedValue('TRON_ADDR');

    const result = await getDepositAddressQuery.execute(
      new GetDepositAddressRequest(BlockchainNetwork.TRON_MAINNET),
    );

    expect(result).toEqual({
      chain: BlockchainNetwork.TRON_MAINNET,
      depositAddress: 'TRON_ADDR',
      source: 'deposit_methods_sync',
      note: expect.any(String),
    });
    expect(managedWalletsService.getPublicDepositRecipientAddress).toHaveBeenCalledWith(
      BlockchainNetwork.TRON_MAINNET,
    );
  });

  it('rejects when Tron default deposit wallet is missing', async () => {
    managedWalletsService.getPublicDepositRecipientAddress.mockResolvedValue('');

    await expect(
      getDepositAddressQuery.execute(new GetDepositAddressRequest(BlockchainNetwork.TRON_MAINNET)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns treasury-aligned deposit address for non-Tron chains', async () => {
    managedWalletsService.getPublicDepositRecipientAddress.mockResolvedValue('0xtreasury');

    const result = await getDepositAddressQuery.execute(
      new GetDepositAddressRequest('eth_mainnet'),
    );

    expect(managedWalletsService.getPublicDepositRecipientAddress).toHaveBeenCalledWith(
      BlockchainNetwork.ETH_MAINNET,
    );
    expect(result).toEqual({
      chain: BlockchainNetwork.ETH_MAINNET,
      depositAddress: '0xtreasury',
      source: 'deposit_methods_sync',
      note: expect.any(String),
    });
  });

  it('returns supported networks through query object', async () => {
    providerFactory.getSupportedNetworks.mockReturnValue(['ETH_MAINNET', 'TRON_MAINNET']);

    await expect(
      getSupportedNetworksQuery.execute(new GetSupportedNetworksRequest()),
    ).resolves.toEqual({
      networks: ['ETH_MAINNET', 'TRON_MAINNET'],
    });
  });
});
