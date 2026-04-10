import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { ConfigService } from '@nestjs/config';
import { ethers, JsonRpcProvider } from 'ethers';
import { BlockchainNetwork } from '@/common/enums';
import {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '../interfaces';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import { TreasuryMainWalletChain } from '@/entities/treasury-main-wallet.entity';

const EVM_PROVIDER_CHAINS = new Set<BlockchainNetwork>([
  BlockchainNetwork.ETH_MAINNET,
  BlockchainNetwork.BSC_MAINNET,
  BlockchainNetwork.BSC_CHAPEL,
]);

/**
 * EVM provider — one Nest instance per chain (mainnet or sandbox).
 */
@Injectable()
export class EthereumProvider implements IBlockchainProvider, OnModuleInit {
  private readonly logger = new Logger(EthereumProvider.name);
  private provider!: JsonRpcProvider;
  private readonly rpcConfigKey: string;
  private readonly treasuryChain: TreasuryMainWalletChain;
  private readonly nativeSymbol: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    private readonly systemConfigService: SystemConfigService,
    private readonly evmChain: BlockchainNetwork,
  ) {
    if (!EVM_PROVIDER_CHAINS.has(evmChain)) {
      throw new Error(`EthereumProvider: unsupported evmChain ${evmChain}`);
    }
    const { rpcKey, treasury, symbol } = EthereumProvider.resolveEvmBindings(evmChain);
    this.treasuryChain = treasury;
    this.rpcConfigKey = rpcKey;
    this.nativeSymbol = symbol;
    const bootstrap = this.defaultBootstrapRpc();
    this.provider = new JsonRpcProvider(bootstrap);
  }

  private static resolveEvmBindings(chain: BlockchainNetwork): {
    rpcKey: string;
    treasury: TreasuryMainWalletChain;
    symbol: string;
  } {
    switch (chain) {
      case BlockchainNetwork.ETH_MAINNET:
        return { rpcKey: 'ETH_MAINNET_RPC_URL', treasury: 'ETH_MAINNET', symbol: 'ETH' };
      case BlockchainNetwork.BSC_MAINNET:
        return { rpcKey: 'BSC_MAINNET_RPC_URL', treasury: 'BSC_MAINNET', symbol: 'BNB' };
      case BlockchainNetwork.BSC_CHAPEL:
        return { rpcKey: 'BSC_CHAPEL_RPC_URL', treasury: 'BSC_CHAPEL', symbol: 'BNB' };
      default:
        throw new Error(`EthereumProvider: unsupported evmChain ${chain}`);
    }
  }

  private defaultBootstrapRpc(): string {
    switch (this.evmChain) {
      case BlockchainNetwork.BSC_MAINNET:
        return (
          this.configService.get<string>('app.blockchain.bsc.mainnetRpcUrl') ??
          'https://bsc-dataseed.binance.org'
        );
      case BlockchainNetwork.BSC_CHAPEL:
        return (
          this.configService.get<string>('app.blockchain.bsc.chapelRpcUrl') ??
          'https://data-seed-prebsc-1-s1.binance.org:8545'
        );
      default:
        return (
          this.configService.get<string>('app.blockchain.ethereum.mainnetRpcUrl') ??
          'https://eth.llamarpc.com'
        );
    }
  }

  async onModuleInit() {
    const rpcUrl = await this.resolveRpcUrl();
    this.provider = new JsonRpcProvider(rpcUrl);
    this.logger.log(`${this.evmChain} provider initialized → ${rpcUrl}`);
  }

  private async resolveRpcUrl(): Promise<string> {
    const fromDb = await this.systemConfigService.get<string>(this.rpcConfigKey);
    if (fromDb?.trim()) return fromDb.trim();
    return this.defaultBootstrapRpc();
  }

  @OnEvent('system_config_updated')
  async handleConfigChanged(payload: { key: string; value: string }) {
    if (payload.key !== this.rpcConfigKey) return;
    const url = payload.value?.trim() || (await this.resolveRpcUrl());
    this.logger.log(`[Dynamic Config] ${this.rpcConfigKey} → ${url}`);
    this.provider = new JsonRpcProvider(url);
  }

  getNetwork(): BlockchainNetwork {
    return this.evmChain;
  }

  private async resolveHotWalletKey(): Promise<string> {
    return this.treasuryMainWalletService.resolveMainWalletPrivateKey(this.treasuryChain);
  }

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    try {
      const weiBalance = await this.provider.getBalance(address);
      return {
        address,
        network: this.evmChain,
        balance: ethers.formatEther(weiBalance),
        symbol: this.nativeSymbol,
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error getting ${this.nativeSymbol} balance: ${address}`, error);
      throw error;
    }
  }

  async verifySignature(address: string, message: string, signature: string): Promise<boolean> {
    try {
      const recovered = ethers.verifyMessage(message, signature);
      return recovered.toLowerCase() === address.toLowerCase();
    } catch (error) {
      this.logger.warn(`EVM signature verification failed: ${address}`, error);
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
          network: this.evmChain,
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
        network: this.evmChain,
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
      this.logger.error(`Error getting EVM tx: ${txHash}`, error);
      return this.buildNotFound(txHash);
    }
  }

  isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  async sendTransaction(to: string, amount: string): Promise<string> {
    const privateKey = await this.resolveHotWalletKey();
    const wallet = new ethers.Wallet(privateKey, this.provider);

    this.logger.log(`Sending ${amount} ${this.nativeSymbol} to ${to}...`);
    const tx = await wallet.sendTransaction({
      to,
      value: ethers.parseEther(amount),
    });

    this.logger.log(`EVM transaction sent: ${tx.hash}`);
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
      network: this.evmChain,
      status: 'NOT_FOUND',
      confirmations: 0,
      from: '',
      to: '',
      value: '0',
    };
  }
}
