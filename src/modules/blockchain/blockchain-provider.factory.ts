import { Injectable, Logger } from '@nestjs/common';
import { BlockchainNetwork } from '@/common/enums';
import { IBlockchainProvider } from './interfaces';
import { TronProvider } from './providers/tron.provider';
import { SolanaProvider } from './providers/solana.provider';
import { EthereumProvider } from './providers/ethereum.provider';
import { BadRequestException } from '@/common/exceptions';

/**
 * Blockchain Provider Factory
 * Pattern applied: Simple Factory
 *
 * Purpose: Encapsulates the logic of retrieving the correct IBlockchainProvider implementation
 * based on the network type. Client code acts against the IBlockchainProvider interface
 * and relies on this factory to supply the correct concrete implementation.
 */
@Injectable()
export class BlockchainProviderFactory {
  private readonly logger = new Logger(BlockchainProviderFactory.name);
  private readonly providerMap: Map<BlockchainNetwork, IBlockchainProvider>;

  constructor(
    private readonly tronProvider: TronProvider,
    private readonly solanaProvider: SolanaProvider,
    private readonly ethereumProvider: EthereumProvider,
  ) {
    // Register concrete providers for each network
    this.providerMap = new Map<BlockchainNetwork, IBlockchainProvider>([
      [BlockchainNetwork.TRON_NILE, this.tronProvider],
      [BlockchainNetwork.TRON_SHASTA, this.tronProvider],
      [BlockchainNetwork.SOLANA_DEVNET, this.solanaProvider],
      [BlockchainNetwork.ETH_SEPOLIA, this.ethereumProvider],
    ]);

    this.logger.log(
      `BlockchainProviderFactory initialized with ${this.providerMap.size} network mappings`,
    );
  }

  /**
   * Factory Method: Returns the specific provider instance for the requested network.
   *
   * @param network The blockchain network enum
   * @returns IBlockchainProvider implementation
   * @throws BadRequestException if the network is unknown
   */
  getProvider(network: BlockchainNetwork): IBlockchainProvider {
    const provider = this.providerMap.get(network);
    if (!provider) {
      throw new BadRequestException(
        `Unsupported blockchain network: ${network}`,
        'UNSUPPORTED_NETWORK',
      );
    }
    return provider;
  }

  /** Returns list of all supported networks in this factory */
  getSupportedNetworks(): BlockchainNetwork[] {
    return Array.from(this.providerMap.keys());
  }
}
