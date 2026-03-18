import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainNetwork } from '@/common/enums';
import {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '../interfaces';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { BlockchainGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';

import { TronWeb } from 'tronweb';

/**
 * Tron Blockchain Provider
 * Strategy Pattern: implements IBlockchainProvider for TRON_NILE / TRON_SHASTA / TRON_MAINNET.
 *
 * Hot wallet key resolution (Cache-Aside):
 *  1. PaymentConfigService.getActiveConfig('TRON', network) — DB/Redis
 *  2. Fallback: TRON_HOT_WALLET_PRIVATE_KEY from .env
 */
@Injectable()
export class TronProvider implements IBlockchainProvider {
  private readonly logger = new Logger(TronProvider.name);

  /** Read-only TronWeb instance — no private key, used for balance/signature/tx queries */
  private readonly tronWeb: any;
  private readonly network: BlockchainNetwork;
  private readonly networkKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly paymentConfigService: PaymentConfigService,
  ) {
    const defaultNetwork =
      this.configService.get<string>('app.blockchain.tron.defaultNetwork') ?? 'TRON_NILE';

    this.network =
      defaultNetwork === 'TRON_SHASTA'
        ? BlockchainNetwork.TRON_SHASTA
        : BlockchainNetwork.TRON_NILE;

    this.networkKey = this.network === BlockchainNetwork.TRON_SHASTA ? 'SHASTA' : 'NILE';

    const fullHost =
      this.network === BlockchainNetwork.TRON_SHASTA
        ? this.configService.get<string>('app.blockchain.tron.shastaFullHost') ??
          'https://api.shasta.trongrid.io'
        : this.configService.get<string>('app.blockchain.tron.nileFullHost') ??
          'https://nile.trongrid.io';

    // Read-only TronWeb (no private key) for balance/signature/tx queries
    this.tronWeb = new TronWeb({ fullHost });

    this.logger.log(`TronProvider initialized: ${this.network} → ${fullHost}`);
  }

  getNetwork(): BlockchainNetwork {
    return this.network;
  }

  // ── Hot wallet key resolution ────────────────────────────────────────────

  private async resolveHotWalletKey(): Promise<string> {
    const dbConfig = await this.paymentConfigService.getActiveConfig('TRON', this.networkKey);
    if (dbConfig) {
      const blockchainConfig = dbConfig as BlockchainGatewayConfig;
      if (blockchainConfig.hotWalletPrivateKey) return blockchainConfig.hotWalletPrivateKey;
    }

    // .env fallback
    const envKey = this.configService.get<string>('app.blockchain.tron.hotWalletPrivateKey');
    if (!envKey) {
      throw new Error('TRON hot wallet private key not configured (DB or TRON_HOT_WALLET_PRIVATE_KEY)');
    }
    return envKey;
  }

  private buildTronWebWithKey(privateKey: string): any {
    const fullHost =
      this.network === BlockchainNetwork.TRON_SHASTA
        ? this.configService.get<string>('app.blockchain.tron.shastaFullHost') ??
          'https://api.shasta.trongrid.io'
        : this.configService.get<string>('app.blockchain.tron.nileFullHost') ??
          'https://nile.trongrid.io';

    return new TronWeb({ fullHost, privateKey });
  }

  // ── IBlockchainProvider ──────────────────────────────────────────────────

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    try {
      const sunBalance = await this.tronWeb.trx.getBalance(address);
      return {
        address,
        network: this.network,
        balance: (sunBalance / 1_000_000).toString(),
        symbol: 'TRX',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Error getting Tron balance: ${address}`, error);
      throw error;
    }
  }

  async verifySignature(address: string, message: string, signature: string): Promise<boolean> {
    const normalizedAddress = this.tronWeb.address.toHex(address).toLowerCase();

    try {
      const recoveredV2 = await this.tronWeb.trx.verifyMessageV2(message, signature);
      if (recoveredV2 && this.tronWeb.address.toHex(recoveredV2).toLowerCase() === normalizedAddress) {
        return true;
      }
    } catch {
      // Not V2 — try V1
    }

    try {
      const hexMsg = this.tronWeb.toHex(message);
      const recoveredV1 = await this.tronWeb.trx.verifyMessageV2(hexMsg, signature);
      if (recoveredV1 && this.tronWeb.address.toHex(recoveredV1).toLowerCase() === normalizedAddress) {
        return true;
      }
    } catch {
      // No match
    }

    this.logger.warn(`TRON signature verification failed: ${address}`);
    return false;
  }

  async getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto> {
    try {
      const tx = await this.tronWeb.trx.getTransaction(txHash);
      if (!tx || !tx.txID) return this.buildNotFound(txHash);

      const info = await this.tronWeb.trx.getTransactionInfo(txHash);
      const contract = tx.raw_data?.contract?.[0];
      const value = contract?.parameter?.value;
      const confirmed = info?.receipt?.result === 'SUCCESS' || !!info?.blockNumber;

      return {
        txHash,
        network: this.network,
        status: confirmed ? 'CONFIRMED' : 'PENDING',
        confirmations: confirmed ? 1 : 0,
        from: value?.owner_address ? this.tronWeb.address.fromHex(value.owner_address) : '',
        to: value?.to_address ? this.tronWeb.address.fromHex(value.to_address) : '',
        value: value?.amount ? (value.amount / 1_000_000).toString() : '0',
        blockNumber: info?.blockNumber,
        timestamp: info?.blockTimeStamp ? new Date(info.blockTimeStamp) : undefined,
      };
    } catch (error) {
      this.logger.error(`Error getting TRON tx: ${txHash}`, error);
      return this.buildNotFound(txHash);
    }
  }

  isValidAddress(address: string): boolean {
    if (!address || typeof address !== 'string') return false;
    try {
      if (this.tronWeb.isAddress(address)) return true;
    } catch {
      // fall through
    }
    if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) return true;
    if (/^41[0-9a-fA-F]{40}$/.test(address)) return true;
    return false;
  }

  async sendTransaction(to: string, amount: string): Promise<string> {
    const privateKey = await this.resolveHotWalletKey();
    const tw = this.buildTronWebWithKey(privateKey);

    this.logger.log(`Sending ${amount} TRX to ${to}...`);
    const sunAmount = Math.floor(parseFloat(amount) * 1_000_000);
    const tx = await tw.trx.sendTransaction(to, sunAmount);

    if (tx.result) {
      this.logger.log(`TRX transaction sent: ${tx.txid}`);
      return tx.txid;
    }
    throw new Error(`TRON sendTransaction failed: ${JSON.stringify(tx)}`);
  }

  async getHotWalletAddress(): Promise<string> {
    const privateKey = await this.resolveHotWalletKey();
    const tw = this.buildTronWebWithKey(privateKey);
    const address = tw.defaultAddress.base58;
    if (!address) throw new Error('TRON hot wallet not configured');
    return address;
  }

  private buildNotFound(txHash: string): BlockchainTxStatusDto {
    return {
      txHash,
      network: this.network,
      status: 'NOT_FOUND',
      confirmations: 0,
      from: '',
      to: '',
      value: '0',
    };
  }
}
