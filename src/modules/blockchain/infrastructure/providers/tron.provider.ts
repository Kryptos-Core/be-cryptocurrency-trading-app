import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { TronWeb, Trx } from 'tronweb';
import { BlockchainNetwork } from '@/common/enums';
import type { TreasuryMainWalletChain } from '@/entities/treasury-main-wallet.entity';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import { TreasuryMainWalletService } from '@/modules/treasury/treasury-main-wallet.service';
import type {
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
  IBlockchainProvider,
} from '../../interfaces';
import { buildNotFoundTxStatus } from '../../utils/build-not-found-tx.util';
import {
  extractTronFirstContractOwnerBase58,
  extractTronNativeTransferMeta,
} from '../../utils/tron-native-transfer.util';

export interface TronProviderBindings {
  network: BlockchainNetwork;
  /** Runtime system_config / env key for full node HTTP API */
  rpcRuntimeKey: string;
  treasuryChain: TreasuryMainWalletChain;
}

/**
 * Tron (TRC-20) — one Nest instance per Tron network (mainnet / Nile / Shasta).
 */
@Injectable()
export class TronProvider implements IBlockchainProvider, OnModuleInit {
  private readonly logger = new Logger(TronProvider.name);
  private tronWeb: any;

  constructor(
    private readonly configService: ConfigService,
    private readonly treasuryMainWalletService: TreasuryMainWalletService,
    private readonly systemConfigService: SystemConfigService,
    private readonly bindings: TronProviderBindings,
  ) {
    const fullHost = this.defaultBootstrapHost();
    this.tronWeb = new TronWeb({ fullHost });
    this.logger.log(`TronProvider initialized: ${bindings.network} → ${fullHost}`);
  }

  private defaultBootstrapHost(): string {
    const path =
      this.bindings.network === BlockchainNetwork.TRON_MAINNET
        ? 'app.blockchain.tron.mainnetFullHost'
        : this.bindings.network === BlockchainNetwork.TRON_NILE
          ? 'app.blockchain.tron.nileFullHost'
          : 'app.blockchain.tron.shastaFullHost';
    return this.configService.get<string>(path) ?? 'https://api.trongrid.io';
  }

  async onModuleInit() {
    const fromDb = await this.systemConfigService.get<string>(this.bindings.rpcRuntimeKey);
    const fullHost = fromDb?.trim() || this.defaultBootstrapHost();
    this.tronWeb = new TronWeb({ fullHost });
    this.logger.log(`TronProvider runtime RPC: ${this.bindings.network} → ${fullHost}`);
  }

  getNetwork(): BlockchainNetwork {
    return this.bindings.network;
  }

  @OnEvent('system_config_updated')
  async handleConfigChanged(payload: { key: string; value: string }) {
    if (payload.key !== this.bindings.rpcRuntimeKey) return;
    this.logger.log(`[Dynamic Config] ${this.bindings.rpcRuntimeKey} → ${payload.value}`);
    this.tronWeb = new TronWeb({ fullHost: payload.value });
  }

  private async resolveHotWalletKey(): Promise<string> {
    return this.treasuryMainWalletService.resolveMainWalletPrivateKey(this.bindings.treasuryChain);
  }

  private async buildTronWebWithKey(privateKey: string): Promise<any> {
    const fullHost =
      (await this.systemConfigService.get<string>(this.bindings.rpcRuntimeKey)) ??
      this.defaultBootstrapHost();
    return new TronWeb({ fullHost, privateKey });
  }

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    const balanceSun = await this.tronWeb.trx.getBalance(address);
    const balanceTrx = this.tronWeb.fromSun(balanceSun);
    return {
      address,
      network: this.bindings.network,
      balance: String(balanceTrx),
      symbol: 'TRX',
      timestamp: new Date(),
    };
  }

  async verifySignature(address: string, message: string, signature: string): Promise<boolean> {
    try {
      const recovered = Trx.verifyMessageV2(message, signature);
      return recovered === address;
    } catch (error) {
      this.logger.warn(`TRON signature verification failed: ${address}`, error);
      return false;
    }
  }

  async getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto> {
    try {
      const tx = await this.tronWeb.trx.getTransaction(txHash);
      if (!tx?.txID) {
        return buildNotFoundTxStatus(txHash, this.bindings.network);
      }
      const receipt = await this.tronWeb.trx.getTransactionInfo(txHash);
      const confirmed = receipt?.blockNumber != null;

      const transfer = extractTronNativeTransferMeta(this.tronWeb, tx);
      const fallbackFrom = extractTronFirstContractOwnerBase58(this.tronWeb, tx);
      const from = transfer?.from ?? fallbackFrom;
      const to = transfer?.to ?? '';
      const value = transfer?.value ?? '0';

      let status: 'PENDING' | 'CONFIRMED' | 'FAILED' = 'PENDING';
      if (confirmed) {
        const rawResult = receipt?.result as string | undefined;
        const ok = rawResult == null || String(rawResult).toUpperCase() === 'SUCCESS';
        status = ok ? 'CONFIRMED' : 'FAILED';
      }

      return {
        txHash,
        network: this.bindings.network,
        status,
        confirmations: confirmed ? 1 : 0,
        from,
        to,
        value,
        blockNumber: receipt?.blockNumber,
      };
    } catch (error) {
      this.logger.error(`Error getting TRON tx: ${txHash}`, error);
      return buildNotFoundTxStatus(txHash, this.bindings.network);
    }
  }

  isValidAddress(address: string): boolean {
    return this.tronWeb.isAddress(address);
  }

  async sendTransaction(to: string, amount: string): Promise<string> {
    const privateKey = await this.resolveHotWalletKey();
    const tw = await this.buildTronWebWithKey(privateKey);
    this.logger.log(`Sending ${amount} TRX to ${to}...`);
    const tx = await tw.trx.sendTransaction(to, tw.toSun(amount));
    const id = tx.txid ?? tx.transaction?.txID;
    if (!id) throw new Error('Tron sendTransaction returned no tx id');
    this.logger.log(`TRON transaction sent: ${id}`);
    return id;
  }

  async getHotWalletAddress(): Promise<string> {
    const privateKey = await this.resolveHotWalletKey();
    const tw = await this.buildTronWebWithKey(privateKey);
    return tw.defaultAddress.base58;
  }
}

