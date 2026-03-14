import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ethers, JsonRpcProvider } from 'ethers';
import { BlockchainNetwork } from '@/common/enums';
import {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '../interfaces';

/**
 * Ethereum Blockchain Provider (Sepolia testnet)
 * Tương thích MetaMask — dùng EIP-191 personal_sign
 */
@Injectable()
export class EthereumProvider implements IBlockchainProvider {
  private readonly logger = new Logger(EthereumProvider.name);
  private readonly provider: JsonRpcProvider;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl =
      this.configService.get<string>('app.blockchain.ethereum.sepoliaRpcUrl') ??
      'https://rpc.sepolia.org';

    this.provider = new JsonRpcProvider(rpcUrl);
    this.logger.log(`EthereumProvider khởi tạo: Sepolia → ${rpcUrl}`);
  }

  getNetwork(): BlockchainNetwork {
    return BlockchainNetwork.ETH_SEPOLIA;
  }

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    try {
      const weiBalance = await this.provider.getBalance(address);
      const ethBalance = ethers.formatEther(weiBalance);

      return {
        address,
        network: BlockchainNetwork.ETH_SEPOLIA,
        balance: ethBalance,
        symbol: 'ETH',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Lỗi lấy balance ETH Sepolia: ${address}`, error);
      throw error;
    }
  }

  async verifySignature(
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      // EIP-191 personal_sign — chuẩn MetaMask
      const recovered = ethers.verifyMessage(message, signature);
      return recovered.toLowerCase() === address.toLowerCase();
    } catch (error) {
      this.logger.warn(
        `Xác minh chữ ký ETH Sepolia thất bại: ${address}`,
        error,
      );
      return false;
    }
  }

  async getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      const tx = await this.provider.getTransaction(txHash);

      if (!tx) {
        return this.buildNotFound(txHash);
      }

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
      const confirmations = receipt.blockNumber
        ? currentBlock - receipt.blockNumber + 1
        : 0;

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
              (
                await this.provider.getBlock(receipt.blockNumber)
              )?.timestamp ?? 0 * 1000,
            )
          : undefined,
      };
    } catch (error) {
      this.logger.error(`Lỗi lấy tx ETH Sepolia: ${txHash}`, error);
      return this.buildNotFound(txHash);
    }
  }

  isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
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
