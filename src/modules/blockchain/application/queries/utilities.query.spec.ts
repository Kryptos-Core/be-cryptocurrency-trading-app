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
    getConfiguredDepositWallet: jest.fn(),
  };
  const providerFactory = {
    getProvider: jest.fn(),
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

  it('returns configured Tron default deposit wallet', async () => {
    managedWalletsService.getConfiguredDepositWallet.mockResolvedValue({
      address: 'TRON_ADDR',
      source: 'transaction_wallet_default',
    });

    const result = await getDepositAddressQuery.execute(
      new GetDepositAddressRequest(BlockchainNetwork.TRON_MAINNET),
    );

    expect(result).toEqual({
      chain: BlockchainNetwork.TRON_MAINNET,
      depositAddress: 'TRON_ADDR',
      source: 'transaction_wallet_default',
      note: expect.any(String),
    });
    expect(providerFactory.getProvider).not.toHaveBeenCalled();
  });

  it('rejects when Tron default deposit wallet is missing', async () => {
    managedWalletsService.getConfiguredDepositWallet.mockResolvedValue(null);

    await expect(
      getDepositAddressQuery.execute(new GetDepositAddressRequest(BlockchainNetwork.TRON_MAINNET)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns hot wallet address for non-Tron chains', async () => {
    const provider = {
      getHotWalletAddress: jest.fn().mockResolvedValue('0xhotwallet'),
    };
    managedWalletsService.getConfiguredDepositWallet.mockResolvedValue(null);
    providerFactory.getProvider.mockReturnValue(provider);

    const result = await getDepositAddressQuery.execute(
      new GetDepositAddressRequest('eth_mainnet'),
    );

    expect(providerFactory.getProvider).toHaveBeenCalledWith(BlockchainNetwork.ETH_MAINNET);
    expect(result).toEqual({
      chain: BlockchainNetwork.ETH_MAINNET,
      depositAddress: '0xhotwallet',
      source: 'hot_wallet',
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
