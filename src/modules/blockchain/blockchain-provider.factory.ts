import { Injectable, Logger } from '@nestjs/common';
import { BlockchainNetwork } from '@/common/enums';
import { IBlockchainProvider } from './interfaces';
import { TronProvider } from './providers/tron.provider';
import { SolanaProvider } from './providers/solana.provider';
import { EthereumProvider } from './providers/ethereum.provider';
import { BadRequestException } from '@/common/exceptions';

/**
 * Blockchain Provider Factory
 * Factory Pattern: Trả về provider phù hợp theo network enum
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
    this.providerMap = new Map<BlockchainNetwork, IBlockchainProvider>([
      [BlockchainNetwork.TRON_NILE, this.tronProvider],
      [BlockchainNetwork.TRON_SHASTA, this.tronProvider],
      [BlockchainNetwork.SOLANA_DEVNET, this.solanaProvider],
      [BlockchainNetwork.ETH_SEPOLIA, this.ethereumProvider],
    ]);

    this.logger.log(
      `BlockchainProviderFactory khởi tạo: ${this.providerMap.size} providers`,
    );
  }

  /**
   * Lấy provider theo network
   * @throws BadRequestException nếu network không được hỗ trợ
   */
  getProvider(network: BlockchainNetwork): IBlockchainProvider {
    const provider = this.providerMap.get(network);
    if (!provider) {
      throw new BadRequestException(
        `Mạng blockchain không được hỗ trợ: ${network}`,
        'UNSUPPORTED_NETWORK',
      );
    }
    return provider;
  }

  /** Lấy danh sách tất cả network được hỗ trợ */
  getSupportedNetworks(): BlockchainNetwork[] {
    return Array.from(this.providerMap.keys());
  }
}
