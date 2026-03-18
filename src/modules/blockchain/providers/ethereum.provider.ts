import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, JsonRpcProvider } from 'ethers';
import { BlockchainNetwork } from '@/common/enums';
import {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '../interfaces';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { BlockchainGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';

/**
 * Ethereum Blockchain Provider (Sepolia testnet / ETH Mainnet)
 * Compatible with MetaMask — uses EIP-191 personal_sign.
 *
 * Hot wallet key resolution (Cache-Aside):
 *  1. PaymentConfigService.getActiveConfig('ETH', 'SEPOLIA' | 'MAINNET') — DB/Redis
 *  2. Fallback: ETH_HOT_WALLET_PRIVATE_KEY from .env
 */
@Injectable()
export class EthereumProvider implements IBlockchainProvider {
  private readonly logger = new Logger(EthereumProvider.name);

  /** Read-only JsonRpcProvider — no signer, used for balance/tx queries */
  private readonly provider: JsonRpcProvider;
  private readonly networkKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly paymentConfigService: PaymentConfigService,
  ) {
    const rpcUrl =
      this.configService.get<string>('app.blockchain.ethereum.sepoliaRpcUrl') ??
      'https://rpc.sepolia.org';

    this.provider = new JsonRpcProvider(rpcUrl);
    this.networkKey = 'SEPOLIA';

    this.logger.log(`EthereumProvider initialized: Sepolia → ${rpcUrl}`);
  }

  getNetwork(): BlockchainNetwork {
    return BlockchainNetwork.ETH_SEPOLIA;
  }

  // ── Hot wallet key resolution ────────────────────────────────────────────

  private async resolveHotWalletKey(): Promise<string> {
    const dbConfig = await this.paymentConfigService.getActiveConfig('ETH', this.networkKey);
    if (dbConfig) {
      const blockchainConfig = dbConfig as BlockchainGatewayConfig;
      if (blockchainConfig.hotWalletPrivateKey) return blockchainConfig.hotWalletPrivateKey;
    }

    const envKey = this.configService.get<string>('app.blockchain.ethereum.hotWalletPrivateKey');
    if (!envKey) {
      throw new Error('ETH hot wallet private key not configured (DB or ETH_HOT_WALLET_PRIVATE_KEY)');
    }
    return envKey;
  }

  // ── IBlockchainProvider ──────────────────────────────────────────────────

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    try {
      const weiBalance = await this.provider.getBalance(address);
      return {
        address,
        network: BlockchainNetwork.ETH_SEPOLIA,
        balance: ethers.formatEther(weiBalance),
        symbol: 'ETH',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error getting ETH balance: ${address}`, error);
      throw error;
    }
  }

  async verifySignature(address: string, message: string, signature: string): Promise<boolean> {
    try {
      const recovered = ethers.verifyMessage(message, signature);
      return recovered.toLowerCase() === address.toLowerCase();
    } catch (error) {
      this.logger.warn(`ETH signature verification failed: ${address}`, error);
      return false;
    }
  }

  async getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      const tx = await this.provider.getTransaction(txHash);

      if (!tx) return this.buildNotFound(txHash);

      if (!receipt) {
        return {
          txHash,
          network: BlockchainNetwork.ETH_SEPOLIA,
          status: 'PENDING',
          confirmations: 0,
          from: tx.from ?? '',
          to: tx.to ?? '',
          value: ethers.formatEther(tx.value),
        };
      }

      const currentBlock = await this.provider.getBlockNumber();
      const confirmations = receipt.blockNumber ? currentBlock - receipt.blockNumber + 1 : 0;

      return {
        txHash,
        network: BlockchainNetwork.ETH_SEPOLIA,
        status: receipt.status === 1 ? 'CONFIRMED' : 'FAILED',
        confirmations,
        from: receipt.from ?? '',
        to: receipt.to ?? '',
        value: ethers.formatEther(tx.value),
        blockNumber: receipt.blockNumber,
        timestamp: receipt.blockNumber
          ? new Date(
              ((await this.provider.getBlock(receipt.blockNumber))?.timestamp ?? 0) * 1000,
            )
          : undefined,
      };
    } catch (error) {
      this.logger.error(`Error getting ETH tx: ${txHash}`, error);
      return this.buildNotFound(txHash);
    }
  }

  isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  async sendTransaction(to: string, amount: string): Promise<string> {
    const privateKey = await this.resolveHotWalletKey();
    const wallet = new ethers.Wallet(privateKey, this.provider);

    this.logger.log(`Sending ${amount} ETH to ${to}...`);
    const tx = await wallet.sendTransaction({
      to,
      value: ethers.parseEther(amount),
    });

    this.logger.log(`ETH transaction sent: ${tx.hash}`);
    return tx.hash;
  }

  async getHotWalletAddress(): Promise<string> {
    const privateKey = await this.resolveHotWalletKey();
    const wallet = new ethers.Wallet(privateKey);
    return wallet.address;
  }

  private buildNotFound(txHash: string): BlockchainTxStatusDto {
    return {
      txHash,
      network: BlockchainNetwork.ETH_SEPOLIA,
      status: 'NOT_FOUND',
      confirmations: 0,
      from: '',
      to: '',
      value: '0',
    };
  }
}
