import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import * as nacl from 'tweetnacl';
import { BlockchainNetwork } from '@/common/enums';
import {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '../interfaces';

/**
 * Solana Blockchain Provider
 * Kết nối Solana devnet qua @solana/web3.js
 */
@Injectable()
export class SolanaProvider implements IBlockchainProvider {
  private readonly logger = new Logger(SolanaProvider.name);
  private readonly connection: Connection;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl =
      this.configService.get<string>('app.blockchain.solana.devnetUrl') ??
      'https://api.devnet.solana.com';

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.logger.log(`SolanaProvider khởi tạo: devnet → ${rpcUrl}`);
  }

  getNetwork(): BlockchainNetwork {
    return BlockchainNetwork.SOLANA_DEVNET;
  }

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    try {
      const pubkey = new PublicKey(address);
      const lamports = await this.connection.getBalance(pubkey);
      const solBalance = (lamports / LAMPORTS_PER_SOL).toString();

      return {
        address,
        network: BlockchainNetwork.SOLANA_DEVNET,
        balance: solBalance,
        symbol: 'SOL',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Lỗi lấy balance Solana: ${address}`, error);
      throw error;
    }
  }

  async verifySignature(
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      const pubkey = new PublicKey(address);
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = Buffer.from(signature, 'base64');

      return nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        pubkey.toBytes(),
      );
    } catch (error) {
      this.logger.warn(`Xác minh chữ ký Solana thất bại: ${address}`, error);
      return false;
    }
  }

  async getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto> {
    try {
      const tx = await this.connection.getTransaction(txHash, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        return this.buildNotFound(txHash);
      }

      const meta = tx.meta;
      const failed = meta?.err !== null;
      const message = tx.transaction.message;

      // Lấy account keys tùy version
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
      this.logger.error(`Lỗi lấy tx Solana: ${txHash}`, error);
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
