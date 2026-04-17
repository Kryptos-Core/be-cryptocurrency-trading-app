import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { ethers, JsonRpcProvider } from 'ethers';
import type { EvmChainDefinition } from '@/common/constants/evm-chain-definitions';
import { BlockchainNetwork } from '@/common/enums';
import type { TreasuryMainWalletChain } from '@/modules/treasury';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import type {
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
  IBlockchainProvider,
} from '../../interfaces';
import { buildNotFoundTxStatus } from '../../utils/build-not-found-tx.util';

/**
 * EVM provider — one Nest instance per chain (JsonRpcProvider + fixed chainId).
 */
@Injectable()
export class EthereumProvider implements IBlockchainProvider, OnModuleInit {
  private readonly logger = new Logger(EthereumProvider.name);
  private provider!: JsonRpcProvider;
  private readonly rpcConfigKey: string;
  private readonly treasuryChain: TreasuryMainWalletChain;
  private readonly nativeSymbol: string;
  private readonly evmChain: BlockchainNetwork;
  private readonly expectedChainId: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    private readonly systemConfigService: SystemConfigService,
    private readonly spec: EvmChainDefinition,
  ) {
    this.evmChain = spec.network;
    this.expectedChainId = spec.chainId;
    this.treasuryChain = spec.treasuryChain;
    this.rpcConfigKey = spec.rpcConfigKey;
    this.nativeSymbol = spec.nativeSymbol;
    const bootstrap = this.defaultBootstrapRpc();
    this.provider = new JsonRpcProvider(bootstrap);
  }

  private defaultBootstrapRpc(): string {
    if (this.spec.network === BlockchainNetwork.ETH_MAINNET) {
      return (
        this.configService.get<string>('app.blockchain.ethereum.mainnetRpcUrl') ??
        this.spec.defaultRpcUrl
      );
    }
    if (this.spec.network === BlockchainNetwork.BSC_MAINNET) {
      return (
        this.configService.get<string>('app.blockchain.bsc.mainnetRpcUrl') ??
        this.spec.defaultRpcUrl
      );
    }
    if (this.spec.network === BlockchainNetwork.BSC_CHAPEL) {
      return (
        this.configService.get<string>('app.blockchain.bsc.chapelRpcUrl') ?? this.spec.defaultRpcUrl
      );
    }
    const fromEnv = process.env[this.spec.rpcConfigKey]?.trim();
    if (fromEnv) return fromEnv;
    return this.spec.defaultRpcUrl;
  }

  async onModuleInit() {
    const rpcUrl = await this.resolveRpcUrl();
    this.provider = new JsonRpcProvider(rpcUrl);
    this.logger.log(`${this.evmChain} provider initialized → ${rpcUrl}`);
    try {
      const nw = await this.provider.getNetwork();
      if (nw.chainId !== BigInt(this.expectedChainId)) {
        this.logger.warn(
          `${this.evmChain}: RPC chainId ${nw.chainId} !== expected ${this.expectedChainId}`,
        );
      }
    } catch (e) {
      this.logger.warn(`${this.evmChain}: could not verify chainId`, e);
    }
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
    const weiBalance = await this.provider.getBalance(address);
    return {
      address,
      network: this.evmChain,
      balance: ethers.formatEther(weiBalance),
      symbol: this.nativeSymbol,
      timestamp: new Date(),
    };
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

      if (!tx) return buildNotFoundTxStatus(txHash, this.evmChain);

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
          ? new Date(((await this.provider.getBlock(receipt.blockNumber))?.timestamp ?? 0) * 1000)
          : undefined,
      };
    } catch (error) {
      this.logger.error(`Error getting EVM tx: ${txHash}`, error);
      return buildNotFoundTxStatus(txHash, this.evmChain);
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
}


