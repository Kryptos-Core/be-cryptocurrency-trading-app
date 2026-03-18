import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import { BlockchainNetwork } from '@/common/enums';
import {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '../interfaces';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { BlockchainGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';

/**
 * Solana Blockchain Provider
 * Connects to Solana devnet / mainnet via @solana/web3.js.
 *
 * Hot wallet key resolution (Cache-Aside):
 *  1. PaymentConfigService.getActiveConfig('SOL', 'DEVNET' | 'MAINNET') — DB/Redis
 *  2. Fallback: SOLANA_HOT_WALLET_PRIVATE_KEY from .env (base64 encoded secret key)
 */
@Injectable()
export class SolanaProvider implements IBlockchainProvider {
  private readonly logger = new Logger(SolanaProvider.name);
  private readonly connection: Connection;
  private readonly networkKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly paymentConfigService: PaymentConfigService,
  ) {
    const rpcUrl =
      this.configService.get<string>('app.blockchain.solana.devnetUrl') ??
      'https://api.devnet.solana.com';

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.networkKey = 'DEVNET';

    this.logger.log(`SolanaProvider initialized: devnet → ${rpcUrl}`);
  }

  getNetwork(): BlockchainNetwork {
    return BlockchainNetwork.SOLANA_DEVNET;
  }

  // ── Hot wallet key resolution ────────────────────────────────────────────

  private async resolveHotWallet(): Promise<Keypair> {
    const dbConfig = await this.paymentConfigService.getActiveConfig('SOL', this.networkKey);
    if (dbConfig) {
      const blockchainConfig = dbConfig as BlockchainGatewayConfig;
      if (blockchainConfig.hotWalletPrivateKey) {
        const secretKey = Buffer.from(blockchainConfig.hotWalletPrivateKey, 'base64');
        return Keypair.fromSecretKey(secretKey);
      }
    }

    const envKey = this.configService.get<string>('app.blockchain.solana.hotWalletPrivateKey') ?? '';
    if (!envKey) {
      // Devnet: ephemeral keypair when no key is configured
      this.logger.warn('SOL hot wallet key not configured — using ephemeral keypair (devnet only)');
      return Keypair.generate();
    }
    return Keypair.fromSecretKey(Buffer.from(envKey, 'base64'));
  }

  // ── IBlockchainProvider ──────────────────────────────────────────────────

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    try {
      const pubkey = new PublicKey(address);
      const lamports = await this.connection.getBalance(pubkey);
      return {
        address,
        network: BlockchainNetwork.SOLANA_DEVNET,
        balance: (lamports / LAMPORTS_PER_SOL).toString(),
        symbol: 'SOL',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error getting Solana balance: ${address}`, error);
      throw error;
    }
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

      if (!tx) return this.buildNotFound(txHash);

      const meta = tx.meta;
      const failed = meta?.err !== null;
      const message = tx.transaction.message;
      const accountKeys =
        'staticAccountKeys' in message
          ? (message as any).staticAccountKeys
          : (message as any).accountKeys;

      return {
        txHash,
        network: BlockchainNetwork.SOLANA_DEVNET,
        status: failed ? 'FAILED' : 'CONFIRMED',
        confirmations: 1,
        from: accountKeys?.[0]?.toBase58?.() ?? '',
        to: accountKeys?.[1]?.toBase58?.() ?? '',
        value: meta
          ? (
              Math.abs(
                (meta.preBalances?.[1] ?? 0) - (meta.postBalances?.[1] ?? 0),
              ) / LAMPORTS_PER_SOL
            ).toString()
          : '0',
        blockNumber: tx.slot,
        timestamp: tx.blockTime ? new Date(tx.blockTime * 1000) : undefined,
      };
    } catch (error) {
      this.logger.error(`Error getting Solana tx: ${txHash}`, error);
      return this.buildNotFound(txHash);
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

  private buildNotFound(txHash: string): BlockchainTxStatusDto {
    return {
      txHash,
      network: BlockchainNetwork.SOLANA_DEVNET,
      status: 'NOT_FOUND',
      confirmations: 0,
      from: '',
      to: '',
      value: '0',
    };
  }
}
