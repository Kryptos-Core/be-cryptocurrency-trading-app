import { Inject, Injectable, Logger } from '@nestjs/common';
import { BlockchainNetwork } from '@/common/enums';
import { BadRequestException } from '@/common/exceptions';
import {
  BC_SOLANA_DEVNET,
  BC_SOLANA_MAINNET,
  BC_TRON_MAINNET,
  BC_TRON_NILE,
  BC_TRON_SHASTA,
  EVM_PROVIDERS_MAP,
} from './blockchain.tokens';
import type { IBlockchainProvider } from './interfaces';
import { EthereumProvider } from './infrastructure/providers/ethereum.provider';
import { SolanaProvider } from './infrastructure/providers/solana.provider';
import { TronProvider } from './infrastructure/providers/tron.provider';

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
    @Inject(EVM_PROVIDERS_MAP) evmMap: Map<BlockchainNetwork, EthereumProvider>,
  ) {
    this.providerMap = new Map<BlockchainNetwork, IBlockchainProvider>([
      [BlockchainNetwork.TRON_MAINNET, this.tronMainnet],
      [BlockchainNetwork.TRON_NILE, this.tronNile],
      [BlockchainNetwork.TRON_SHASTA, this.tronShasta],
      [BlockchainNetwork.SOLANA_MAINNET, this.solanaMainnet],
      [BlockchainNetwork.SOLANA_DEVNET, this.solanaDevnet],
    ]);
    for (const [net, prov] of evmMap) {
      this.providerMap.set(net, prov);
    }

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

