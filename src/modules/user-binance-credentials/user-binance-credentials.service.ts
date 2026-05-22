import { Injectable, Logger } from '@nestjs/common';
import { BinanceRestClient } from '@/modules/binance-rest/binance-rest-client.service';
import {
  SaveBinanceCredentialsDto,
  BinanceCredentialsSummaryDto,
  SaveBinanceCredentialsResponseDto,
  TestConnectionResponseDto,
} from './dto';
import { BinanceCredentialsEncryptionService, BinanceRawCredentials } from './infrastructure/binance-credentials-encryption.service';
import { UserBinanceCredentialsRepository } from './infrastructure/user-binance-credentials.repository';

@Injectable()
export class UserBinanceCredentialsService {
  private readonly logger = new Logger(UserBinanceCredentialsService.name);

  constructor(
    private readonly encryptionService: BinanceCredentialsEncryptionService,
    private readonly repository: UserBinanceCredentialsRepository,
    private readonly binanceRestClient: BinanceRestClient,
  ) {}

  async saveCredentials(
    userId: string,
    dto: SaveBinanceCredentialsDto,
  ): Promise<SaveBinanceCredentialsResponseDto> {
    const encrypted = this.encryptionService.encrypt({
      apiKey: dto.apiKey,
      apiSecret: dto.apiSecret,
    });

    const baseUrl = dto.testnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';

    let accountId: string | undefined;
    let accountType: string | undefined;

    try {
      const accountInfo = await this.binanceRestClient.signedRequest<{
        makerCommission: number;
        takerCommission: number;
        accountType: string;
      }>({
        baseUrl,
        endpoint: '/api/v3/account',
        method: 'GET',
        apiKey: dto.apiKey,
        apiSecret: dto.apiSecret,
        params: {},
        timestamp: Date.now(),
        recvWindow: 60000,
        timeoutMs: 10000,
      });
      accountId = 'verified';
      accountType = accountInfo.accountType;
    } catch (err) {
      this.logger.warn(
        `Binance credential verification failed for user=${userId}: ${(err as Error).message}`,
      );
      throw new Error(
        `Binance API credentials are invalid or lack permissions: ${(err as Error).message}`,
      );
    }

    const entity = await this.repository.create({
      userId,
      credentialsEncrypted: encrypted,
      label: dto.label ?? null,
      permissions: dto.permissions ?? ['SPOT'],
      testnet: dto.testnet ?? false,
    });

    return {
      id: entity.id,
      accountId: accountId ?? 'verified',
      accountType: accountType ?? 'SPOT',
    };
  }

  async listCredentials(userId: string): Promise<BinanceCredentialsSummaryDto[]> {
    const entities = await this.repository.findByUserId(userId);
    return entities.map((e) => ({
      id: e.id,
      label: e.label,
      permissions: e.permissions as string[] as BinanceCredentialsSummaryDto['permissions'],
      testnet: e.testnet,
      is_active: e.is_active,
      last_used_at: e.last_used_at?.toISOString() ?? null,
      created_at: e.created_at.toISOString(),
    }));
  }

  async deleteCredential(userId: string, credentialId: string): Promise<void> {
    await this.repository.softDelete(credentialId, userId);
  }

  async testConnection(
    userId: string,
    credentialId: string,
  ): Promise<TestConnectionResponseDto> {
    const entity = await this.repository.findActiveByIdAndUserId(credentialId, userId);
    if (!entity) {
      return { success: false, accountId: null, accountType: null, error: 'Credential not found' };
    }

    const raw: BinanceRawCredentials = this.encryptionService.decrypt(entity.credentials_encrypted);
    const baseUrl = entity.testnet
      ? 'https://testnet.binance.vision'
      : 'https://api.binance.com';

    try {
      const accountInfo = await this.binanceRestClient.signedRequest<{
        accountType: string;
      }>({
        baseUrl,
        endpoint: '/api/v3/account',
        method: 'GET',
        apiKey: raw.apiKey,
        apiSecret: raw.apiSecret,
        params: {},
        timestamp: Date.now(),
        recvWindow: 60000,
        timeoutMs: 10000,
      });
      await this.repository.updateLastUsed(entity.id);
      return {
        success: true,
        accountId: 'verified',
        accountType: accountInfo.accountType,
        error: null,
      };
    } catch (err) {
      this.logger.warn(`Connection test failed for credential=${credentialId}: ${(err as Error).message}`);
      return {
        success: false,
        accountId: null,
        accountType: null,
        error: (err as Error).message,
      };
    }
  }

  async getDecryptedCredentials(
    userId: string,
    credentialId: string,
  ): Promise<BinanceRawCredentials & { testnet: boolean; permissions: string[] }> {
    const entity = await this.repository.findActiveByIdAndUserId(credentialId, userId);
    if (!entity) {
      throw new Error('Credential not found or inactive');
    }
    const raw = this.encryptionService.decrypt(entity.credentials_encrypted);
    await this.repository.updateLastUsed(entity.id);
    return {
      ...raw,
      testnet: entity.testnet,
      permissions: entity.permissions as unknown as string[],
    };
  }
}
