import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  sendAndConfirmTransaction,
  Transaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import * as nacl from 'tweetnacl';
import { BlockchainNetwork } from '@/common/enums';
import type { TreasuryMainWalletChain } from '@/entities/treasury-main-wallet.entity';
import type { BlockchainGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import type {
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
  IBlockchainProvider,
} from '../interfaces';
import { buildNotFoundTxStatus } from '../utils/build-not-found-tx.util';

export interface SolanaProviderBindings {
  network: BlockchainNetwork;
  rpcRuntimeKey: string;
  /** Payment config row key: matches payment_method_configs.network (chain code). */
  paymentSolNetwork: 'SOLANA_MAINNET' | 'SOLANA_DEVNET';
  /** When set, devnet signing uses treasury main wallet for this chain. */
  treasuryChain: TreasuryMainWalletChain | null;
}

@Injectable()
export class SolanaProvider implements IBlockchainProvider, OnModuleInit {
  private readonly logger = new Logger(SolanaProvider.name);
  private connection!: Connection;

  constructor(
    private readonly configService: ConfigService,
    private readonly paymentConfigService: PaymentConfigService,
    private readonly systemConfigService: SystemConfigService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    private readonly bindings: SolanaProviderBindings,
  ) {
    const bootstrap = this.defaultBootstrapRpc();
    this.connection = new Connection(bootstrap, 'confirmed');
  }

  private defaultBootstrapRpc(): string {
    if (this.bindings.network === BlockchainNetwork.SOLANA_DEVNET) {
      return (
        this.configService.get<string>('app.blockchain.solana.devnetUrl') ??
        'https://api.devnet.solana.com'
      );
    }
    return (
      this.configService.get<string>('app.blockchain.solana.mainnetUrl') ??
      'https://api.mainnet-beta.solana.com'
    );
  }

  async onModuleInit() {
    const rpcUrl = await this.resolveRpcUrl();
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.logger.log(`SolanaProvider initialized: ${this.bindings.network} → ${rpcUrl}`);
  }

  private async resolveRpcUrl(): Promise<string> {
    const fromDb = await this.systemConfigService.get<string>(this.bindings.rpcRuntimeKey);
    if (fromDb?.trim()) return fromDb.trim();
    return this.defaultBootstrapRpc();
  }

  @OnEvent('system_config_updated')
  async handleConfigChanged(payload: { key: string; value: string }) {
    if (payload.key !== this.bindings.rpcRuntimeKey) return;
    const url = payload.value?.trim() || (await this.resolveRpcUrl());
    this.logger.log(`[Dynamic Config] ${this.bindings.rpcRuntimeKey} → ${url}`);
    this.connection = new Connection(url, 'confirmed');
  }

  getNetwork(): BlockchainNetwork {
    return this.bindings.network;
  }

  private async resolveHotWallet(): Promise<Keypair> {
    if (this.bindings.treasuryChain) {
      const pk = await this.treasuryMainWalletService.resolveMainWalletPrivateKey(
        this.bindings.treasuryChain,
      );
      try {
        const decoded = bs58.decode(pk.trim());
        return Keypair.fromSecretKey(decoded);
      } catch {
        const buf = Buffer.from(pk.trim(), 'base64');
        return Keypair.fromSecretKey(buf);
      }
    }

    const dbConfig = await this.paymentConfigService.getActiveConfig(
      'SOL',
      this.bindings.paymentSolNetwork,
    );
    if (dbConfig) {
      const blockchainConfig = dbConfig as BlockchainGatewayConfig;
      if (blockchainConfig.hotWalletPrivateKey) {
        const secretKey = Buffer.from(blockchainConfig.hotWalletPrivateKey, 'base64');
        return Keypair.fromSecretKey(secretKey);
      }
    }

    const envKey =
      this.configService.get<string>('app.blockchain.solana.hotWalletPrivateKey') ?? '';
    if (!envKey) {
      throw new Error(
        'Solana hot wallet not configured. Add SOL gateway in payment configs, treasury main wallet, or env hot key.',
      );
    }
    return Keypair.fromSecretKey(Buffer.from(envKey, 'base64'));
  }

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    const pubkey = new PublicKey(address);
    const lamports = await this.connection.getBalance(pubkey);
    return {
      address,
      network: this.bindings.network,
      balance: (lamports / LAMPORTS_PER_SOL).toString(),
      symbol: 'SOL',
      timestamp: new Date(),
    };
  }

  async verifySignature(address: string, message: string, signature: string): Promise<boolean> {
    try {
      const pubkey = new PublicKey(address);
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = Buffer.from(signature, 'base64');
      return nacl.sign.detached.verify(messageBytes, signatureBytes, pubkey.toBytes());
    } catch (error) {
      this.logger.warn(`Solana signature verification failed: ${address}`, error);
      return false;
    }
  }

  async getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto> {
    try {
      const tx = await this.connection.getTransaction(txHash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) return buildNotFoundTxStatus(txHash, this.bindings.network);

      const meta = tx.meta;
      const failed = meta?.err !== null;
      const message = tx.transaction.message;
      const accountKeys =
        'staticAccountKeys' in message
          ? (message as any).staticAccountKeys
          : (message as any).accountKeys;

      return {
        txHash,
        network: this.bindings.network,
        status: failed ? 'FAILED' : 'CONFIRMED',
        confirmations: 1,
        from: accountKeys?.[0]?.toBase58?.() ?? '',
        to: accountKeys?.[1]?.toBase58?.() ?? '',
        value: meta
          ? (
              Math.abs((meta.preBalances?.[1] ?? 0) - (meta.postBalances?.[1] ?? 0)) /
              LAMPORTS_PER_SOL
            ).toString()
          : '0',
        blockNumber: tx.slot,
        timestamp: tx.blockTime ? new Date(tx.blockTime * 1000) : undefined,
      };
    } catch (error) {
      this.logger.error(`Error getting Solana tx: ${txHash}`, error);
      return buildNotFoundTxStatus(txHash, this.bindings.network);
    }
  }

  isValidAddress(address: string): boolean {
    try {
      const pubkey = new PublicKey(address);
      return PublicKey.isOnCurve(pubkey.toBytes());
    } catch {
      return false;
    }
  }

  async sendTransaction(to: string, amount: string): Promise<string> {
    const hotWallet = await this.resolveHotWallet();
    const toPubkey = new PublicKey(to);
    const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: hotWallet.publicKey,
        toPubkey,
        lamports,
      }),
    );

    const txHash = await sendAndConfirmTransaction(this.connection, transaction, [hotWallet]);
    this.logger.log(`Solana sendTransaction OK: ${txHash}`);
    return txHash;
  }

  async getHotWalletAddress(): Promise<string> {
    const hotWallet = await this.resolveHotWallet();
    return hotWallet.publicKey.toBase58();
  }
}
