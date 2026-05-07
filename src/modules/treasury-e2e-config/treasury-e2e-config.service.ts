import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from 'uuidv7';
import { Permission, UserRole } from '@/common/enums';
import { WalletEncryptionService } from '@/common/services';
import { newUuid } from '@/common/utils/uuid.util';
import { IntegrationOutbox } from '@/entities/integration-outbox.entity';
import { TreasuryE2EConfig } from '@/entities/treasury-e2e-config.entity';
import type { TokenIssuerPort } from '@/modules/auth/application/ports/token-issuer.port';
import { TOKEN_ISSUER } from '@/modules/auth/application/ports/token-issuer.token';
import { buildAuthAccessTokenPayload } from '@/modules/auth/application/use-cases/shared/auth-response.util';
import {
  LINKED_WALLET_REPOSITORY,
  type LinkedWalletRepositoryPort,
} from '@/modules/blockchain/domain/ports';
import { UsersService } from '@/modules/users/users.service';
import {
  TREASURY_E2E_CONFIG_REPOSITORY,
  type TreasuryE2EConfigRepositoryPort,
} from './domain/ports';
import type { CreateTreasuryE2EConfigDto, UpdateTreasuryE2EConfigDto } from './dto';

export interface TreasuryE2ERunnerConfig {
  source: 'db';
  environment: string;
  configId: string;
  apiBaseUrl: string;
  traderBearerToken: string | null;
  riskBearerToken: string | null;
  chain: string;
  linkedWalletId: string | null;
  withdrawAmountAuto: string;
  withdrawAmountManual: string;
  depositTxHash: string | null;
  depositAmount: string | null;
  allowSkip: boolean;
  healthFailOnCritical: boolean;
  staleManualMinutes: number;
  staleConfirmingMinutes: number;
  failedWithdrawals24h: number;
  reconcilePairLimit: number;
  reconciliationThreshold: string;
}

interface TreasuryE2ESecretPayload {
  traderBearerToken?: string | null;
  riskBearerToken?: string | null;
}

@Injectable()
export class TreasuryE2EConfigService {
  constructor(
    @Inject(TREASURY_E2E_CONFIG_REPOSITORY)
    private readonly repo: TreasuryE2EConfigRepositoryPort,
    @Inject(LINKED_WALLET_REPOSITORY)
    private readonly linkedWalletRepo: LinkedWalletRepositoryPort,
    private readonly usersService: UsersService,
    @Inject(TOKEN_ISSUER)
    private readonly tokenIssuer: TokenIssuerPort,
    private readonly dataSource: DataSource,
    private readonly encryptionService: WalletEncryptionService,
  ) {}

  async listConfigs() {
    return this.repo.findAll();
  }

  async getFormOptions(params: {
    environment?: string;
    chain?: string;
    actorUserId?: string;
    traderUserId?: string;
    traderSearch?: string;
  }) {
    const chain = params.chain?.trim();
    const testTraders = await this.usersService.findTestUsersByRole(
      UserRole.TRADER,
      params.traderSearch,
      20,
    );
    const riskUsers = await this.usersService.findTestUsersByRole(
      UserRole.RISK_OFFICER,
      undefined,
      20,
    );
    const adminUsers = await this.usersService.findTestUsersByRole(UserRole.ADMIN, undefined, 20);
    const riskActors = [...riskUsers, ...adminUsers];

    const verifiedLinkedWallets = chain
      ? await this.linkedWalletRepo.findVerifiedByChain(chain)
      : [];
    const filteredLinkedWallets = params.traderUserId
      ? verifiedLinkedWallets.filter((wallet) => wallet.user_id === params.traderUserId)
      : verifiedLinkedWallets;

    return {
      environments: ['development', 'staging', 'test', 'production'],
      chains: [
        'BSC_CHAPEL',
        'ETH_SEPOLIA',
        'SOLANA_DEVNET',
        'TRON_NILE',
        'TRON_SHASTA',
        'BASE_SEPOLIA',
        'ARBITRUM_SEPOLIA',
        'OPTIMISM_SEPOLIA',
        'POLYGON_AMOY',
        'AVALANCHE_FUJI',
      ],
      traders: testTraders.map((user) => ({
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
      })),
      riskActors: riskActors.map((user) => ({
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
      })),
      linkedWallets: filteredLinkedWallets.map((wallet) => {
        const found = testTraders.find((u) => u.user_id === wallet.user_id);
        return {
          link_id: wallet.link_id,
          user_id: wallet.user_id,
          chain: wallet.chain,
          address: wallet.address,
          label: wallet.label,
          status: wallet.status,
          linked_at: wallet.linked_at ? wallet.linked_at.toISOString() : null,
          user: found
            ? {
                user_id: found.user_id,
                email: found.email,
                first_name: found.first_name,
                last_name: found.last_name,
              }
            : null,
        };
      }),
      defaults: {
        environment: params.environment ?? 'development',
        chain: chain ?? 'BSC_CHAPEL',
        api_base_url: 'http://127.0.0.1:3000',
      },
    };
  }

  async testConnectionDraft(dto: CreateTreasuryE2EConfigDto) {
    const steps: Array<Record<string, unknown>> = [];
    await this.validateConfigDraft(dto);
    steps.push({ step: 'validate_payload', ok: true, detail: 'Payload validation passed' });

    const baseUrl = dto.api_base_url.replace(/\/$/, '');

    try {
      const healthRes = await fetch(`${baseUrl}/api/v1/health`);
      steps.push({
        step: 'api_health',
        ok: healthRes.ok,
        detail: healthRes.ok
          ? 'Health endpoint reachable'
          : `Health endpoint failed: HTTP ${healthRes.status}`,
      });
    } catch (error) {
      steps.push({
        step: 'api_health',
        ok: false,
        detail: `Health endpoint error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    const traderToken = await this.resolveRuntimeToken({
      bearerToken: dto.trader_bearer_token,
      userId: dto.trader_user_id,
    });
    const riskToken = await this.resolveRuntimeToken({
      bearerToken: dto.risk_bearer_token,
      userId: dto.risk_user_id,
    });

    await this.testAuthenticatedStep(
      steps,
      'trader_token',
      traderToken,
      `${baseUrl}/api/v1/users/me`,
    );
    await this.testAuthenticatedStep(
      steps,
      'risk_token',
      riskToken,
      `${baseUrl}/api/v1/blockchain/admin/withdrawals/stats`,
    );

    if (dto.linked_wallet_id?.trim()) {
      const wallets = await this.linkedWalletRepo.findVerifiedByChain(dto.chain);
      const wallet = wallets.find((item) => item.link_id === dto.linked_wallet_id);
      steps.push({
        step: 'linked_wallet_match',
        ok: !!wallet,
        detail: wallet
          ? 'Selected linked wallet matches selected chain'
          : 'Selected linked wallet not found in verified wallets for chain',
      });
    }

    return {
      ok: steps.every((step) => step.ok === true),
      steps,
    };
  }

  async validateConfigDraft(dto: CreateTreasuryE2EConfigDto) {
    this.validateDto(dto);

    const warnings: string[] = [];
    if (dto.allow_skip) {
      if (!dto.trader_user_id?.trim() && !dto.trader_bearer_token?.trim()) {
        warnings.push('Trader identity/token is empty; E2E withdraw request may be skipped/fail.');
      }
      if (!dto.risk_user_id?.trim() && !dto.risk_bearer_token?.trim()) {
        warnings.push('Risk identity/token is empty; manual approval step may be skipped/fail.');
      }
      if (!dto.linked_wallet_id?.trim()) {
        warnings.push('Linked wallet is not selected; withdraw scenarios may be skipped/fail.');
      }
    }

    let linkedWalletMatched = false;
    if (dto.linked_wallet_id?.trim()) {
      const wallets = await this.linkedWalletRepo.findVerifiedByChain(dto.chain);
      linkedWalletMatched = wallets.some((wallet) => wallet.link_id === dto.linked_wallet_id);
      if (!linkedWalletMatched) {
        throw new BadRequestException(
          'linked_wallet_id is not a verified wallet for the selected chain',
        );
      }
    }

    return {
      ok: true,
      warnings,
      checks: {
        linkedWalletMatched,
        depositPairComplete: !!dto.deposit_tx_hash === !!dto.deposit_amount,
        manualAboveAuto: Number(dto.withdraw_amount_manual) >= Number(dto.withdraw_amount_auto),
      },
    };
  }

  async getConfigByIdForEdit(configId: string) {
    const existing = await this.repo.findById(configId);
    if (!existing) throw new NotFoundException('TreasuryE2EConfig', configId);
    const secrets = this.decryptSecrets(existing.encrypted_secrets);
    return {
      ...existing,
      trader_bearer_token_masked: this.maskSecret(secrets.traderBearerToken),
      risk_bearer_token_masked: this.maskSecret(secrets.riskBearerToken),
      has_trader_bearer_token: !!secrets.traderBearerToken,
      has_risk_bearer_token: !!secrets.riskBearerToken,
      trader_user_id: existing.trader_user_id,
      risk_user_id: existing.risk_user_id,
    };
  }

  async createConfig(dto: CreateTreasuryE2EConfigDto, userId: string) {
    await this.validateConfigDraft(dto);
    const created = await this.repo.upsert({
      configId: uuidv7(),
      environment: dto.environment,
      displayName: dto.display_name,
      apiBaseUrl: dto.api_base_url.replace(/\/$/, ''),
      chain: dto.chain,
      linkedWalletId: dto.linked_wallet_id?.trim() || null,
      withdrawAmountAuto: dto.withdraw_amount_auto,
      withdrawAmountManual: dto.withdraw_amount_manual,
      depositTxHash: dto.deposit_tx_hash?.trim() || null,
      depositAmount: dto.deposit_amount?.trim() || null,
      allowSkip: dto.allow_skip,
      healthFailOnCritical: dto.health_fail_on_critical,
      staleManualMinutes: dto.stale_manual_minutes,
      staleConfirmingMinutes: dto.stale_confirming_minutes,
      failedWithdrawals24h: dto.failed_withdrawals_24h,
      reconcilePairLimit: dto.reconcile_pair_limit,
      reconciliationThreshold: dto.reconciliation_threshold,
      encryptedSecrets: this.encryptSecrets({
        traderBearerToken: dto.trader_bearer_token?.trim() || null,
        riskBearerToken: dto.risk_bearer_token?.trim() || null,
      }),
      traderUserId: dto.trader_user_id?.trim() || null,
      riskUserId: dto.risk_user_id?.trim() || null,
      userId,
    });
    await this.appendAuditOutbox('created', created, userId);
    return created;
  }

  async updateConfig(configId: string, dto: UpdateTreasuryE2EConfigDto, userId: string) {
    const existing = await this.repo.findById(configId);
    if (!existing) throw new NotFoundException('TreasuryE2EConfig', configId);

    const existingSecrets = this.decryptSecrets(existing.encrypted_secrets);
    const traderToken =
      dto.trader_bearer_token !== undefined
        ? dto.trader_bearer_token.trim() || null
        : (existingSecrets.traderBearerToken ?? null);
    const riskToken =
      dto.risk_bearer_token !== undefined
        ? dto.risk_bearer_token.trim() || null
        : (existingSecrets.riskBearerToken ?? null);

    const merged = {
      environment: dto.environment ?? existing.environment,
      display_name: dto.display_name ?? existing.display_name,
      api_base_url: (dto.api_base_url ?? existing.api_base_url).replace(/\/$/, ''),
      chain: dto.chain ?? existing.chain,
      linked_wallet_id:
        dto.linked_wallet_id !== undefined
          ? dto.linked_wallet_id?.trim() || null
          : existing.linked_wallet_id,
      withdraw_amount_auto: dto.withdraw_amount_auto ?? existing.withdraw_amount_auto,
      withdraw_amount_manual: dto.withdraw_amount_manual ?? existing.withdraw_amount_manual,
      deposit_tx_hash:
        dto.deposit_tx_hash !== undefined
          ? dto.deposit_tx_hash?.trim() || null
          : existing.deposit_tx_hash,
      deposit_amount:
        dto.deposit_amount !== undefined
          ? dto.deposit_amount?.trim() || null
          : existing.deposit_amount,
      allow_skip: dto.allow_skip ?? existing.allow_skip,
      health_fail_on_critical: dto.health_fail_on_critical ?? existing.health_fail_on_critical,
      stale_manual_minutes: dto.stale_manual_minutes ?? existing.stale_manual_minutes,
      stale_confirming_minutes: dto.stale_confirming_minutes ?? existing.stale_confirming_minutes,
      failed_withdrawals_24h: dto.failed_withdrawals_24h ?? existing.failed_withdrawals_24h,
      reconcile_pair_limit: dto.reconcile_pair_limit ?? existing.reconcile_pair_limit,
      reconciliation_threshold: dto.reconciliation_threshold ?? existing.reconciliation_threshold,
      trader_user_id:
        dto.trader_user_id !== undefined
          ? dto.trader_user_id?.trim() || null
          : existing.trader_user_id,
      risk_user_id:
        dto.risk_user_id !== undefined ? dto.risk_user_id?.trim() || null : existing.risk_user_id,
    };

    await this.validateConfigDraft({
      ...merged,
      trader_bearer_token: traderToken ?? undefined,
      risk_bearer_token: riskToken ?? undefined,
    } as CreateTreasuryE2EConfigDto);

    const updated = await this.repo.upsert({
      configId,
      environment: merged.environment,
      displayName: merged.display_name,
      apiBaseUrl: merged.api_base_url,
      chain: merged.chain,
      linkedWalletId: merged.linked_wallet_id,
      withdrawAmountAuto: merged.withdraw_amount_auto,
      withdrawAmountManual: merged.withdraw_amount_manual,
      depositTxHash: merged.deposit_tx_hash,
      depositAmount: merged.deposit_amount,
      allowSkip: merged.allow_skip,
      healthFailOnCritical: merged.health_fail_on_critical,
      staleManualMinutes: merged.stale_manual_minutes,
      staleConfirmingMinutes: merged.stale_confirming_minutes,
      failedWithdrawals24h: merged.failed_withdrawals_24h,
      reconcilePairLimit: merged.reconcile_pair_limit,
      reconciliationThreshold: merged.reconciliation_threshold,
      encryptedSecrets: this.encryptSecrets({
        traderBearerToken: traderToken,
        riskBearerToken: riskToken,
      }),
      traderUserId: merged.trader_user_id,
      riskUserId: merged.risk_user_id,
      userId,
    });
    await this.appendAuditOutbox('updated', updated, userId);
    return updated;
  }

  async activateConfig(configId: string, userId: string) {
    const existing = await this.repo.findById(configId);
    if (!existing) throw new NotFoundException('TreasuryE2EConfig', configId);
    const updated = await this.repo.activate(configId, existing.environment, userId);
    await this.appendAuditOutbox('activated', updated, userId);
    return updated;
  }

  async deactivateConfig(configId: string, userId: string) {
    const existing = await this.repo.findById(configId);
    if (!existing) throw new NotFoundException('TreasuryE2EConfig', configId);
    const updated = await this.repo.deactivate(configId, userId);
    await this.appendAuditOutbox('deactivated', updated, userId);
    return updated;
  }

  async archiveConfig(configId: string, userId: string) {
    const existing = await this.repo.findById(configId);
    if (!existing) throw new NotFoundException('TreasuryE2EConfig', configId);
    const updated = await this.repo.archive(configId, userId);
    await this.appendAuditOutbox('archived', updated, userId);
    return updated;
  }

  async getRunnerConfigForEnvironment(
    environment: string,
  ): Promise<TreasuryE2ERunnerConfig | null> {
    const active = await this.repo.findActiveByEnvironment(environment);
    if (!active) return null;
    const secrets = this.decryptSecrets(active.encrypted_secrets);
    const traderBearerToken = await this.resolveRuntimeToken({
      bearerToken: secrets.traderBearerToken ?? null,
      userId: active.trader_user_id,
    });
    const riskBearerToken = await this.resolveRuntimeToken({
      bearerToken: secrets.riskBearerToken ?? null,
      userId: active.risk_user_id,
    });

    return {
      source: 'db',
      environment: active.environment,
      configId: active.treasury_e2e_config_id,
      apiBaseUrl: active.api_base_url,
      traderBearerToken,
      riskBearerToken,
      chain: active.chain,
      linkedWalletId: active.linked_wallet_id,
      withdrawAmountAuto: active.withdraw_amount_auto,
      withdrawAmountManual: active.withdraw_amount_manual,
      depositTxHash: active.deposit_tx_hash,
      depositAmount: active.deposit_amount,
      allowSkip: active.allow_skip,
      healthFailOnCritical: active.health_fail_on_critical,
      staleManualMinutes: active.stale_manual_minutes,
      staleConfirmingMinutes: active.stale_confirming_minutes,
      failedWithdrawals24h: active.failed_withdrawals_24h,
      reconcilePairLimit: active.reconcile_pair_limit,
      reconciliationThreshold: active.reconciliation_threshold,
    };
  }

  private validateDto(dto: CreateTreasuryE2EConfigDto) {
    if (!!dto.deposit_tx_hash !== !!dto.deposit_amount) {
      throw new BadRequestException('deposit_tx_hash and deposit_amount must be provided together');
    }
    if (Number(dto.withdraw_amount_manual) < Number(dto.withdraw_amount_auto)) {
      throw new BadRequestException(
        'withdraw_amount_manual must be greater than or equal to withdraw_amount_auto',
      );
    }
    if (!dto.allow_skip) {
      if (!dto.linked_wallet_id?.trim()) {
        throw new BadRequestException('linked_wallet_id is required when allow_skip=false');
      }
      if (!dto.trader_user_id?.trim() && !dto.trader_bearer_token?.trim()) {
        throw new BadRequestException('trader identity or token is required when allow_skip=false');
      }
      if (!dto.risk_user_id?.trim() && !dto.risk_bearer_token?.trim()) {
        throw new BadRequestException('risk identity or token is required when allow_skip=false');
      }
    }
  }

  private async resolveRuntimeToken(params: {
    bearerToken?: string | null;
    userId?: string | null;
  }): Promise<string | null> {
    if (params.userId?.trim()) {
      const user = await this.usersService.findOne(params.userId.trim());
      return this.tokenIssuer.sign(buildAuthAccessTokenPayload(user));
    }
    return params.bearerToken?.trim() || null;
  }

  private async testAuthenticatedStep(
    steps: Array<Record<string, unknown>>,
    step: string,
    token: string | null,
    url: string,
  ) {
    if (!token) {
      steps.push({ step, ok: false, detail: 'Token missing' });
      return;
    }
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      steps.push({
        step,
        ok: res.ok,
        detail: res.ok
          ? 'Authenticated request succeeded'
          : `Authenticated request failed: HTTP ${res.status}`,
      });
    } catch (error) {
      steps.push({
        step,
        ok: false,
        detail: `Authenticated request error: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  private async appendAuditOutbox(action: string, config: TreasuryE2EConfig, actorUserId: string) {
    const repo = this.dataSource.getRepository(IntegrationOutbox);
    const row = repo.create({
      id: newUuid(),
      aggregate_type: 'treasury_e2e_config',
      aggregate_id: config.treasury_e2e_config_id,
      event_type: `treasury.e2e_config.${action}`,
      payload: {
        actorUserId,
        environment: config.environment,
        displayName: config.display_name,
        chain: config.chain,
        status: config.status,
        updatedAt: config.updated_at,
      },
      dedupe_key: `treasury-e2e-config:${action}:${config.treasury_e2e_config_id}:${config.config_version}`,
      schema_version: 1,
      correlation_id: null,
      causation_id: null,
      partition_key: config.environment,
      kafka_topic: 'ops.audit.treasury-config',
      published_at: null,
      kafka_partition: null,
      kafka_offset: null,
      kafka_published_at: null,
      publish_attempts: 0,
      last_publish_error: null,
      next_retry_at: null,
      dead_lettered_at: null,
    });
    await repo.save(row);
  }

  private encryptSecrets(payload: TreasuryE2ESecretPayload): string | null {
    const normalized = {
      traderBearerToken: payload.traderBearerToken?.trim() || null,
      riskBearerToken: payload.riskBearerToken?.trim() || null,
    };
    if (!normalized.traderBearerToken && !normalized.riskBearerToken) {
      return null;
    }
    return this.encryptionService.encrypt(JSON.stringify(normalized));
  }

  private decryptSecrets(encrypted: string | null | undefined): TreasuryE2ESecretPayload {
    if (!encrypted) return {};
    try {
      const decrypted = this.encryptionService.decrypt(encrypted);
      const parsed = JSON.parse(decrypted) as TreasuryE2ESecretPayload;
      return {
        traderBearerToken: parsed.traderBearerToken?.trim() || null,
        riskBearerToken: parsed.riskBearerToken?.trim() || null,
      };
    } catch {
      return {};
    }
  }

  private maskSecret(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length <= 8) return '********';
    return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
  }
}
