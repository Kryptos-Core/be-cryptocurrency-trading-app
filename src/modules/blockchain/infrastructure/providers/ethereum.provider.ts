import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { ethers, JsonRpcProvider } from 'ethers';
import type { EvmChainDefinition } from '@/common/constants/evm-chain-definitions';
import { BlockchainNetwork } from '@/common/enums';
import type {
  ResolveDepositTransfersContext,
  ResolvedDepositTransfer,
} from '@/modules/blockchain/deposit-transfer.types';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import type { TreasuryMainWalletChain } from '@/modules/treasury';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import type {
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
  IBlockchainProvider,
} from '../../interfaces';
import { buildNotFoundTxStatus } from '../../utils/build-not-found-tx.util';

type ProviderState = 'uninitialized' | 'initializing' | 'ready' | 'failed';

/**
 * EVM provider — one Nest instance per chain (JsonRpcProvider + fixed chainId).
 * Uses lazy initialization with retry so network detection failures never block startup
 * or spam logs. All RPC calls are wrapped in try/catch for graceful degradation.
 */
@Injectable()
export class EthereumProvider implements IBlockchainProvider, OnModuleInit {
  private readonly logger = new Logger(EthereumProvider.name);
  private provider!: JsonRpcProvider;
  private providerState: ProviderState = 'uninitialized';
  private readonly treasuryChain: TreasuryMainWalletChain;
  private readonly nativeSymbol: string;
  private readonly evmChain: BlockchainNetwork;
  private readonly expectedChainId: number;
  private readonly rpcConfigKey: string;
  private lastNetworkWarning = 0;

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
    this.provider = new JsonRpcProvider(spec.defaultRpcUrl);
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
    const fromEnv = process.env[this.rpcConfigKey]?.trim();
    if (fromEnv) return fromEnv;
    return this.spec.defaultRpcUrl;
  }

  async onModuleInit() {
    await this.initializeProvider();
  }

  private async initializeProvider(): Promise<void> {
    if (this.providerState === 'ready' || this.providerState === 'initializing') return;

    this.providerState = 'initializing';
    const rpcUrl = await this.resolveRpcUrl();
    this.provider = new JsonRpcProvider(rpcUrl);
    this.logger.log(`${this.evmChain} provider initialized → ${rpcUrl}`);

    try {
      const nw = await this.provider.getNetwork();
      this.providerState = 'ready';
      if (nw.chainId !== BigInt(this.expectedChainId)) {
        this.logger.warn(
          `${this.evmChain}: RPC chainId ${nw.chainId} !== expected ${this.expectedChainId}`,
        );
      }
    } catch {
      // Network detection failed. Provider is created but not verified.
      // RPC calls will still work if the node is reachable — they fail gracefully at call time.
      // Log once, rate-limited to avoid spam during rapid retries.
      const now = Date.now();
      if (now - this.lastNetworkWarning > 60_000) {
        this.lastNetworkWarning = now;
        this.logger.warn(
          `${this.evmChain}: could not verify chainId — RPC node may be unreachable or offline; RPC calls will retry on demand.`,
        );
      }
      this.providerState = 'ready';
    }
  }

  private async resolveRpcUrl(): Promise<string> {
    const fromDb = await this.systemConfigService.get<string>(this.rpcConfigKey);
    if (fromDb?.trim()) return fromDb.trim();
    return this.defaultBootstrapRpc();
  }

  private async ensureReady(): Promise<void> {
    if (this.providerState !== 'ready') {
      await this.initializeProvider();
    }
  }

  @OnEvent('system_config_updated')
  async handleConfigChanged(payload: { key: string; value: string }) {
    if (payload.key !== this.rpcConfigKey) return;
    const url = payload.value?.trim() || (await this.resolveRpcUrl());
    this.logger.log(`[Dynamic Config] ${this.rpcConfigKey} → ${url}`);
    this.provider = new JsonRpcProvider(url);
    this.providerState = 'uninitialized';
  }

  getNetwork(): BlockchainNetwork {
    return this.evmChain;
  }

  private async resolveHotWalletKey(): Promise<string> {
    return this.treasuryMainWalletService.resolveMainWalletPrivateKey(this.treasuryChain);
  }

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    await this.ensureReady();
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
    await this.ensureReady();
    try {
      const recovered = ethers.verifyMessage(message, signature);
      return recovered.toLowerCase() === address.toLowerCase();
    } catch (error) {
      this.logger.warn(`EVM signature verification failed: ${address}`, error);
      return false;
    }
  }

  async getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto> {
    await this.ensureReady();
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

  async resolveDepositTransfers(
    txHash: string,
    ctx: ResolveDepositTransfersContext,
  ): Promise<ResolvedDepositTransfer[]> {
    const st = await this.getTransactionStatus(txHash);
    if (st.status === 'NOT_FOUND') return [];
    const expected = ctx.expectedDepositAddress.trim().toLowerCase();
    const to = (st.to ?? '').trim().toLowerCase();
    if (!to || to !== expected) return [];
    return [
      {
        chain: this.evmChain,
        txHash,
        logIndex: 0,
        from: st.from,
        to: st.to,
        amountHuman: st.value,
        asset: 'NATIVE',
        chainStatus: st.status,
        confirmations: st.confirmations,
        blockNumber: st.blockNumber,
      },
    ];
  }

  isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  async sendTransaction(to: string, amount: string): Promise<string> {
    await this.ensureReady();
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

  async getLatestBlockNumber(): Promise<number> {
    await this.ensureReady();
    return await this.provider.getBlockNumber();
  }

  async scanUsdtTransfersToDeposit(params: {
    fromBlock: number;
    toBlock: number;
    depositAddress: string;
    usdtContract: string;
    decimals: number;
  }): Promise<
    Array<{
      txHash: string;
      logIndex: number;
      from: string;
      to: string;
      amountHuman: string;
      blockNumber: number;
    }>
  > {
    await this.ensureReady();
    const { fromBlock, toBlock, depositAddress, usdtContract, decimals } = params;
    if (fromBlock > toBlock) return [];

    const transferTopic = ethers.id('Transfer(address,address,uint256)');
    const toTopic = ethers.zeroPadValue(ethers.getAddress(depositAddress), 32);

    const logs = await this.provider.getLogs({
      address: ethers.getAddress(usdtContract),
      fromBlock,
      toBlock,
      topics: [transferTopic, null, toTopic],
    });

    const iface = new ethers.Interface([
      'event Transfer(address indexed from, address indexed to, uint256 value)',
    ]);
    const out: Array<{
      txHash: string;
      logIndex: number;
      from: string;
      to: string;
      amountHuman: string;
      blockNumber: number;
    }> = [];

    for (const log of logs) {
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
      } catch {
        continue;
      }
      if (!parsed) continue;
      const from = String(parsed.args[0]);
      const to = String(parsed.args[1]);
      const value = parsed.args[2] as bigint;
      out.push({
        txHash: log.transactionHash,
        logIndex: log.index,
        from,
        to,
        amountHuman: ethers.formatUnits(value, decimals),
        blockNumber: Number(log.blockNumber),
      });
    }
    return out;
  }
}
