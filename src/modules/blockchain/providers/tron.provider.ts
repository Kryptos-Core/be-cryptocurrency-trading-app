import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainNetwork } from '@/common/enums';
import {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '../interfaces';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';

import { TronWeb } from 'tronweb';
import { OnEvent } from '@nestjs/event-emitter';
import { SystemConfigService } from '@/modules/system-config/system-config.service';

/**
 * Tron Blockchain Provider
 * Strategy Pattern: implements IBlockchainProvider for TRON_NILE / TRON_SHASTA / TRON_MAINNET.
 *
 * Hot wallet key resolution (Single Source of Truth):
 *  treasury_main_wallets table (via TreasuryMainWalletService) — DB/Redis
 *  No .env fallback. Import via POST /treasury/main-wallets.
 */
@Injectable()
export class TronProvider implements IBlockchainProvider, OnModuleInit {
  private readonly logger = new Logger(TronProvider.name);

  /** Read-only TronWeb instance — no private key, used for balance/signature/tx queries */
  private tronWeb: any;
  private readonly network: BlockchainNetwork;
  private readonly networkKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    private readonly systemConfigService: SystemConfigService,
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

  async onModuleInit() {
    const fullHost =
      this.network === BlockchainNetwork.TRON_SHASTA
        ? await this.systemConfigService.getEffectiveString('TRON_SHASTA_FULL_HOST')
        : await this.systemConfigService.getEffectiveString('TRON_NILE_FULL_HOST');
    this.tronWeb = new TronWeb({ fullHost });
    this.logger.log(`TronProvider runtime RPC: ${this.network} → ${fullHost}`);
  }

  getNetwork(): BlockchainNetwork {
    return this.network;
  }

  @OnEvent('system_config_updated')
  async handleConfigChanged(payload: { key: string; value: string }) {
    if (this.network === BlockchainNetwork.TRON_NILE && payload.key === 'TRON_NILE_FULL_HOST') {
      this.logger.log(`[Dynamic Config] Re-initializing TRON_NILE provider with new RPC: ${payload.value}`);
      this.tronWeb = new TronWeb({ fullHost: payload.value });
    } else if (this.network === BlockchainNetwork.TRON_SHASTA && payload.key === 'TRON_SHASTA_FULL_HOST') {
      this.logger.log(`[Dynamic Config] Re-initializing TRON_SHASTA provider with new RPC: ${payload.value}`);
      this.tronWeb = new TronWeb({ fullHost: payload.value });
    }
  }

  // ── Hot wallet key resolution ────────────────────────────────────────────

  private async resolveHotWalletKey(): Promise<string> {
    const networkEnum = this.network === BlockchainNetwork.TRON_SHASTA ? 'TRON_SHASTA' : 'TRON_NILE';
    return this.treasuryMainWalletService.resolveMainWalletPrivateKey(networkEnum);
  }

  private async buildTronWebWithKey(privateKey: string): Promise<any> {
    const fullHost =
      this.network === BlockchainNetwork.TRON_SHASTA
        ? await this.systemConfigService.get<string>('TRON_SHASTA_FULL_HOST') ??
          'https://api.shasta.trongrid.io'
        : await this.systemConfigService.get<string>('TRON_NILE_FULL_HOST') ??
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
    const tw = await this.buildTronWebWithKey(privateKey);

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
    const tw = await this.buildTronWebWithKey(privateKey);
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
