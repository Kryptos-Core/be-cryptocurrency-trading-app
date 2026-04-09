import { Inject, Injectable, Logger } from '@nestjs/common';
import { BlockchainNetwork } from '@/common/enums';
import { IBlockchainProvider } from './interfaces';
import { TronProvider } from './providers/tron.provider';
import { SolanaProvider } from './providers/solana.provider';
import { EthereumProvider } from './providers/ethereum.provider';
import { BadRequestException } from '@/common/exceptions';
import {
  BC_TRON_MAINNET,
  BC_TRON_NILE,
  BC_TRON_SHASTA,
  BC_SOLANA_MAINNET,
  BC_SOLANA_DEVNET,
  EVM_BSC_CHAPEL_PROVIDER,
  EVM_BSC_MAINNET_PROVIDER,
  EVM_ETH_MAINNET_PROVIDER,
  EVM_ETH_SEPOLIA_PROVIDER,
} from './blockchain.tokens';

@Injectable()
export class BlockchainProviderFactory {
  private readonly logger = new Logger(BlockchainProviderFactory.name);
  private readonly providerMap: Map<BlockchainNetwork, IBlockchainProvider>;

  constructor(
    @Inject(BC_TRON_MAINNET) private readonly tronMainnet: TronProvider,
    @Inject(BC_TRON_NILE) private readonly tronNile: TronProvider,
    @Inject(BC_TRON_SHASTA) private readonly tronShasta: TronProvider,
    @Inject(BC_SOLANA_MAINNET) private readonly solanaMainnet: SolanaProvider,
    @Inject(BC_SOLANA_DEVNET) private readonly solanaDevnet: SolanaProvider,
    @Inject(EVM_ETH_MAINNET_PROVIDER) private readonly ethMainnetProvider: EthereumProvider,
    @Inject(EVM_ETH_SEPOLIA_PROVIDER) private readonly ethSepoliaProvider: EthereumProvider,
    @Inject(EVM_BSC_MAINNET_PROVIDER) private readonly bscMainnetProvider: EthereumProvider,
    @Inject(EVM_BSC_CHAPEL_PROVIDER) private readonly bscChapelProvider: EthereumProvider,
  ) {
    this.providerMap = new Map<BlockchainNetwork, IBlockchainProvider>([
      [BlockchainNetwork.TRON_MAINNET, this.tronMainnet],
      [BlockchainNetwork.TRON_NILE, this.tronNile],
      [BlockchainNetwork.TRON_SHASTA, this.tronShasta],
      [BlockchainNetwork.SOLANA_MAINNET, this.solanaMainnet],
      [BlockchainNetwork.SOLANA_DEVNET, this.solanaDevnet],
      [BlockchainNetwork.ETH_MAINNET, this.ethMainnetProvider],
      [BlockchainNetwork.ETH_SEPOLIA, this.ethSepoliaProvider],
      [BlockchainNetwork.BSC_MAINNET, this.bscMainnetProvider],
      [BlockchainNetwork.BSC_CHAPEL, this.bscChapelProvider],
    ]);

    this.logger.log(
      `BlockchainProviderFactory initialized with ${this.providerMap.size} network mappings`,
    );
  }

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

  getSupportedNetworks(): BlockchainNetwork[] {
    return Array.from(this.providerMap.keys());
  }
}
