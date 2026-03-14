import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlockchainNetwork } from '@/common/enums';
import {
  IBlockchainProvider,
  BlockchainBalanceDto,
  BlockchainTxStatusDto,
} from '../interfaces';

// Import theo chuẩn commonjs mới nhất của tronweb
import { TronWeb } from 'tronweb';

/**
 * Tron Blockchain Provider
 * Kết nối Nile hoặc Shasta testnet qua TronWeb SDK
 */
@Injectable()
export class TronProvider implements IBlockchainProvider {
  private readonly logger = new Logger(TronProvider.name);
  private readonly tronWeb: any;
  private readonly network: BlockchainNetwork;

  constructor(private readonly configService: ConfigService) {
    const defaultNetwork =

      this.configService.get<string>('app.blockchain.tron.defaultNetwork') ??
      'TRON_NILE';

    this.network =
      defaultNetwork === 'TRON_SHASTA'
        ? BlockchainNetwork.TRON_SHASTA
        : BlockchainNetwork.TRON_NILE;

    const fullHost =
      this.network === BlockchainNetwork.TRON_SHASTA
        ? this.configService.get<string>(
            'app.blockchain.tron.shastaFullHost',
          ) ?? 'https://api.shasta.trongrid.io'
        : this.configService.get<string>('app.blockchain.tron.nileFullHost') ??
          'https://nile.trongrid.io';

    const privateKey = this.configService.get<string>(
      'app.blockchain.tron.hotWalletPrivateKey',
    );

    this.tronWeb = new TronWeb({
      fullHost,
      privateKey: privateKey || undefined,
    });

    if (privateKey) {
      this.logger.log(
        `TronProvider khởi tạo: ${this.network} → ${fullHost}, HotWallet: ${this.tronWeb.defaultAddress.base58}`,
      );
    } else {
      this.logger.warn(
        `TronProvider khởi tạo: ${this.network} → ${fullHost} (không có Private Key)`,
      );
    }
  }

  getNetwork(): BlockchainNetwork {
    return this.network;
  }

  async getBalance(address: string): Promise<BlockchainBalanceDto> {
    try {
      const sunBalance = await this.tronWeb.trx.getBalance(address);
      const trxBalance = (sunBalance / 1_000_000).toString();

      return {
        address,
        network: this.network,
        balance: trxBalance,
        symbol: 'TRX',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Lỗi lấy balance Tron: ${address}`, error);
      throw error;
    }
  }

  async verifySignature(
    address: string,
    message: string,
    signature: string,
  ): Promise<boolean> {
    try {
      const hexMsg = this.tronWeb.toHex(message);
      const recovered = await this.tronWeb.trx.verifyMessageV2(
        hexMsg,
        signature,
      );
      return (
        recovered.toLowerCase() ===
        this.tronWeb.address.toHex(address).toLowerCase()
      );
    } catch (error) {
      this.logger.warn(`Xác minh chữ ký Tron thất bại: ${address}`, error);
      return false;
    }
  }

  async getTransactionStatus(txHash: string): Promise<BlockchainTxStatusDto> {
    try {
      const tx = await this.tronWeb.trx.getTransaction(txHash);
      if (!tx || !tx.txID) {
        return this.buildNotFound(txHash);
      }

      const info = await this.tronWeb.trx.getTransactionInfo(txHash);
      const contract = tx.raw_data?.contract?.[0];
      const value = contract?.parameter?.value;

      const confirmed = info?.receipt?.result === 'SUCCESS' || !!info?.blockNumber;

      return {
        txHash,
        network: this.network,
        status: confirmed ? 'CONFIRMED' : 'PENDING',
        confirmations: confirmed ? 1 : 0,
        from: value?.owner_address
          ? this.tronWeb.address.fromHex(value.owner_address)
          : '',
        to: value?.to_address
          ? this.tronWeb.address.fromHex(value.to_address)
          : '',
        value: value?.amount
          ? (value.amount / 1_000_000).toString()
          : '0',
        blockNumber: info?.blockNumber,
        timestamp: info?.blockTimeStamp
          ? new Date(info.blockTimeStamp)
          : undefined,
      };
    } catch (error) {
      this.logger.error(`Lỗi lấy tx Tron: ${txHash}`, error);
      return this.buildNotFound(txHash);
    }
  }

  isValidAddress(address: string): boolean {
    try {
      return this.tronWeb.isAddress(address);
    } catch {
      return false;
    }
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

  async sendTransaction(to: string, amount: string): Promise<string> {
    if (!this.tronWeb.defaultPrivateKey) {
      throw new Error('TRON hot wallet not configured (missing private key)');
    }

    try {
      this.logger.log(`Gửi ${amount} TRX tới ${to}...`);
      const sunAmount = Math.floor(parseFloat(amount) * 1_000_000);
      const tx = await this.tronWeb.trx.sendTransaction(to, sunAmount);

      if (tx.result) {
        this.logger.log(`Giao dịch TRX đã gửi: ${tx.txid}`);
        return tx.txid;
      } else {
        throw new Error(`TRON sendTransaction failed: ${JSON.stringify(tx)}`);
      }
    } catch (error) {
      this.logger.error(`Lỗi gửi TRX tới ${to}:`, error);
      throw error;
    }
  }

  getHotWalletAddress(): string {
    if (!this.tronWeb.defaultAddress.base58) {
      throw new Error('TRON hot wallet not configured');
    }
    return this.tronWeb.defaultAddress.base58;
  }
}
