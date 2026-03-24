import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import Decimal from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import { CacheService, WalletEncryptionService } from '@/common/services';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@/common/exceptions';
import { UserRole, WalletReferenceType, WalletTransactionAction } from '@/common/enums';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { WalletTransactionDto } from '@/modules/wallets/dto/wallet-transaction.dto';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { UserBankAccount } from '@/entities/user-bank-account.entity';
import { FiatWithdrawalRequest } from '@/entities/fiat-withdrawal-request.entity';
import {
  CreateBankAccountDto,
  CreateFiatWithdrawalRequestDto,
  CompleteFiatWithdrawalDto,
  RejectWithReasonDto,
  ResolveBankAccountHolderDto,
} from './dto';
import { buildFiatBankProviderChain } from './fiat-bank-provider-chain';
import type { FiatBankProviderConfig } from './fiat-bank-provider.types';

const LOCK_TTL_SEC = 60;
const IDEMPOTENCY_TTL_SEC = 24 * 60 * 60;
const BANKS_CACHE_TTL_SEC = 6 * 60 * 60;

const FIAT_WITHDRAW_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.VERIFIED_USER,
  UserRole.ADMIN,
  UserRole.RISK_OFFICER,
  UserRole.FINANCE_MANAGER,
]);

type ThirdPartyBank = {
  code: string;
  name: string;
  shortName?: string;
  bin?: string;
};

@Injectable()
export class FiatWithdrawalsService {
  private readonly logger = new Logger(FiatWithdrawalsService.name);

  constructor(
    @InjectRepository(UserBankAccount)
    private readonly bankRepo: Repository<UserBankAccount>,
    @InjectRepository(FiatWithdrawalRequest)
    private readonly requestRepo: Repository<FiatWithdrawalRequest>,
    private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
    private readonly currencyRepository: CurrencyRepository,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly walletEncryptionService: WalletEncryptionService,
  ) {}

  private requestTimeoutMs(): number {
    return this.configService.get<number>('FIAT_BANK_PROVIDER_TIMEOUT_MS') ?? 8000;
  }

  private getProviderChain(): FiatBankProviderConfig[] {
    return buildFiatBankProviderChain({
      chainJson: this.configService.get<string>('FIAT_BANK_PROVIDER_CHAIN_JSON'),
      banksUrl: this.configService.get<string>('FIAT_BANK_PROVIDER_BANKS_URL'),
      lookupUrl: this.configService.get<string>('FIAT_BANK_PROVIDER_LOOKUP_URL'),
      healthUrl: this.configService.get<string>('FIAT_BANK_PROVIDER_HEALTH_URL'),
      clientId: this.configService.get<string>('FIAT_BANK_PROVIDER_CLIENT_ID'),
      apiKey: this.configService.get<string>('FIAT_BANK_PROVIDER_API_KEY'),
    });
  }

  private providerHeadersFor(p: FiatBankProviderConfig): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(p.clientId ? { 'x-client-id': p.clientId } : {}),
      ...(p.apiKey ? { 'x-api-key': p.apiKey } : {}),
    };
  }

  private async fetchJson(url: string, init: RequestInit, provider: FiatBankProviderConfig): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs());
    try {
      const baseHeaders = this.providerHeadersFor(provider);
      const extra = init.headers as Record<string, string> | undefined;
      const res = await fetch(url, {
        ...init,
        headers: { ...baseHeaders, ...extra },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new BadRequestException(
          `Bank provider error: ${res.status}`,
          'BANK_PROVIDER_HTTP_ERROR',
        );
      }
      return await res.json();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Failed to call bank provider', error as Error);
      throw new BadRequestException(
        'Không thể kết nối dịch vụ ngân hàng bên thứ 3.',
        'BANK_PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeBanksResponse(payload: any): ThirdPartyBank[] {
    const rows = Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];
    return rows
      .map((row: any) => ({
        code: String(row?.code ?? '').trim().toUpperCase(),
        name: String(row?.name ?? row?.shortName ?? '').trim(),
        shortName: String(row?.shortName ?? '').trim(),
        bin: String(row?.bin ?? '').trim(),
      }))
      .filter((row: ThirdPartyBank) => row.code && row.name);
  }

  private async getThirdPartyBanks(): Promise<ThirdPartyBank[]> {
    const cacheKey = 'fiat_withdraw:third_party_banks';
    const cached = await this.cacheService.get<ThirdPartyBank[]>(cacheKey);
    if (cached && cached.length > 0) return cached;

    const chain = this.getProviderChain();
    if (chain.length === 0) {
      throw new BadRequestException(
        'Thiếu cấu hình provider ngân hàng (FIAT_BANK_PROVIDER_CHAIN_JSON hoặc FIAT_BANK_PROVIDER_BANKS_URL + LOOKUP_URL).',
        'BANK_PROVIDER_CONFIG_MISSING',
      );
    }

    let lastError: unknown;
    for (const p of chain) {
      try {
        const payload = await this.fetchJson(
          p.banksUrl,
          {
            method: 'GET',
          },
          p,
        );
        const banks = this.normalizeBanksResponse(payload);
        if (banks.length === 0) {
          throw new BadRequestException(
            'Danh sách ngân hàng từ bên thứ 3 không hợp lệ.',
            'BANK_PROVIDER_INVALID_BANKS',
          );
        }
        await this.cacheService.set(cacheKey, banks, BANKS_CACHE_TTL_SEC);
        await this.cacheService.set('fiat_withdraw:third_party_banks_source', p.id, BANKS_CACHE_TTL_SEC);
        return banks;
      } catch (e) {
        lastError = e;
        this.logger.warn(`Bank list provider "${p.id}" failed, trying fallback if any: ${e}`);
      }
    }

    if (lastError instanceof BadRequestException) throw lastError;
    throw new BadRequestException(
      'Tất cả provider danh sách ngân hàng đều thất bại.',
      'BANK_PROVIDER_ALL_FAILED',
    );
  }

  private async resolveBankByCode(code: string): Promise<ThirdPartyBank> {
    const normalized = code.trim().toUpperCase();
    const banks = await this.getThirdPartyBanks();
    const bank = banks.find(
      (b) => b.code === normalized || b.shortName?.trim().toUpperCase() === normalized,
    );
    if (!bank) {
      throw new BadRequestException('Mã ngân hàng không hợp lệ.', 'INVALID_BANK_CODE');
    }
    return bank;
  }

  async listVietnamBanks() {
    const banks = await this.getThirdPartyBanks();
    return banks.map((b) => ({ code: b.code, name: b.name }));
  }

  async resolveBankAccountHolder(userId: string, dto: ResolveBankAccountHolderDto) {
    void userId;
    const bank = await this.resolveBankByCode(dto.bankCode);
    const acct = dto.accountNumber.replace(/\s/g, '');
    if (!/^\d{6,19}$/.test(acct)) {
      throw new BadRequestException('Số tài khoản không hợp lệ.', 'INVALID_ACCOUNT_NUMBER');
    }
    if (!bank.bin) {
      throw new BadRequestException(
        'Ngân hàng chưa có mã BIN để tra cứu bên thứ 3.',
        'BANK_PROVIDER_BIN_MISSING',
      );
    }

    const chain = this.getProviderChain();
    if (chain.length === 0) {
      throw new BadRequestException(
        'Thiếu cấu hình provider ngân hàng.',
        'BANK_PROVIDER_CONFIG_MISSING',
      );
    }

    let lastError: unknown;
    for (const p of chain) {
      try {
        const payload = await this.fetchJson(
          p.lookupUrl,
          {
            method: 'POST',
            body: JSON.stringify({
              bin: bank.bin,
              accountNumber: acct,
            }),
          },
          p,
        );

        const accountName = String(payload?.data?.accountName ?? '').trim();
        if (!accountName) {
          throw new BadRequestException(
            'Không truy xuất được tên chủ tài khoản từ bên thứ 3.',
            'BANK_PROVIDER_LOOKUP_FAILED',
          );
        }

        return {
          bankCode: bank.code,
          bankName: bank.name,
          accountNumberLast4: acct.slice(-4),
          accountHolderName: accountName,
          source: `THIRD_PARTY:${p.id}`,
        };
      } catch (e) {
        lastError = e;
        this.logger.warn(`Lookup provider "${p.id}" failed, trying fallback if any: ${e}`);
      }
    }

    if (lastError instanceof BadRequestException) throw lastError;
    throw new BadRequestException(
      'Tất cả provider tra cứu STK đều thất bại.',
      'BANK_PROVIDER_LOOKUP_ALL_FAILED',
    );
  }

  /**
   * Kiểm tra từng provider: GET `healthUrl` (nếu có) hoặc GET `banksUrl` và kiểm tra body có danh sách.
   * Không gọi lookup để tránh tốn quota.
   */
  async healthCheckBankProviders(options?: { includeDetails?: boolean }) {
    const chain = this.getProviderChain();
    const checkedAt = new Date().toISOString();
    if (chain.length === 0) {
      return {
        ok: false,
        checkedAt,
        message: 'No bank providers configured',
        providers: [] as Array<Record<string, unknown>>,
      };
    }

    const providers: Array<Record<string, unknown>> = [];
    for (const p of chain) {
      const url = p.healthUrl ?? p.banksUrl;
      const checkedVia = p.healthUrl ? 'healthUrl' : 'banksUrl';
      const started = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs());
        const res = await fetch(url, {
          method: 'GET',
          headers: this.providerHeadersFor(p),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const latencyMs = Date.now() - started;

        if (!res.ok) {
          providers.push({
            id: p.id,
            ok: false,
            httpStatus: res.status,
            latencyMs,
            checkedVia,
            ...(options?.includeDetails ? { error: `HTTP ${res.status}` } : {}),
          });
          continue;
        }

        if (p.healthUrl) {
          providers.push({ id: p.id, ok: true, httpStatus: res.status, latencyMs, checkedVia });
          continue;
        }

        const payload = await res.json();
        const banks = this.normalizeBanksResponse(payload);
        providers.push({
          id: p.id,
          ok: banks.length > 0,
          httpStatus: res.status,
          latencyMs,
          checkedVia,
          bankCount: banks.length,
          ...(options?.includeDetails && banks.length === 0
            ? { error: 'Empty or invalid banks payload' }
            : {}),
        });
      } catch (e) {
        const latencyMs = Date.now() - started;
        const msg = e instanceof Error ? e.message : String(e);
        providers.push({
          id: p.id,
          ok: false,
          latencyMs,
          checkedVia,
          ...(options?.includeDetails ? { error: msg } : {}),
        });
      }
    }

    const ok = providers.some((r) => r.ok === true);

    return {
      ok,
      checkedAt,
      providers,
    };
  }

  private assertFiatWithdrawRole(role?: UserRole): void {
    if (!role || !FIAT_WITHDRAW_ROLES.has(role)) {
      throw new ForbiddenException(
        'Chỉ tài khoản đã xác minh (VERIFIED_USER) hoặc nhân sự được phép mới tạo yêu cầu rút ngân hàng.',
      );
    }
  }

  private toLedgerRefId(seed: string): number {
    const compact = seed.replace(/[^a-fA-F0-9]/g, '').slice(0, 12);
    if (compact.length === 0) {
      return Date.now();
    }
    const n = parseInt(compact, 16);
    return Number.isFinite(n) && n > 0 ? n : Date.now();
  }

  private getLimits(): { min: Decimal; max: Decimal; dailyLimit: Decimal } {
    const minS = this.configService.get<string>('FIAT_WITHDRAW_MIN') ?? '10';
    const maxS = this.configService.get<string>('FIAT_WITHDRAW_MAX') ?? '100000';
    const dailyS = this.configService.get<string>('FIAT_WITHDRAW_DAILY_LIMIT_USER') ?? '0';
    return {
      min: new Decimal(minS),
      max: new Decimal(maxS),
      dailyLimit: new Decimal(dailyS),
    };
  }

  private async resolveCashCurrencyId(): Promise<string> {
    const symbol =
      this.configService.get<string>('PLATFORM_CASH_CURRENCY_SYMBOL')?.trim().toUpperCase() ||
      this.configService.get<string>('PAYOS_DEPOSIT_CURRENCY_SYMBOL')?.trim().toUpperCase() ||
      'USDT';
    const currency = await this.currencyRepository.findBySymbol(symbol);
    if (!currency?.currency_id) {
      throw new BadRequestException(
        `Không tìm thấy currency ${symbol} cho rút tiền.`,
        'FIAT_WITHDRAW_CURRENCY_NOT_FOUND',
      );
    }
    return String(currency.currency_id);
  }

  private async sumDailyWithdrawalsUtc(userId: string): Promise<Decimal> {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const rows = await this.dataSource.query(
      `SELECT COALESCE(SUM(CAST(amount AS DECIMAL(36,18))), 0) AS total
       FROM fiat_withdrawal_requests
       WHERE user_id = ?
         AND status IN ('PENDING_REVIEW', 'COMPLETED')
         AND created_at >= ?`,
      [userId, start],
    );
    const raw = rows?.[0]?.total ?? '0';
    return new Decimal(String(raw));
  }

  async createBankAccount(userId: string, dto: CreateBankAccountDto) {
    const code = dto.bankCode.trim().toUpperCase();
    const bank = await this.resolveBankByCode(code);
    const bankName = bank.name;

    const acct = dto.accountNumber.replace(/\s/g, '');
    const last4 = acct.slice(-4);
    const encrypted = this.walletEncryptionService.encrypt(acct);
    const holder = dto.accountHolderName.replace(/\s+/g, ' ').trim();

    const id = uuidv7();
    await this.bankRepo.insert({
      bank_account_id: id,
      user_id: userId,
      bank_code: code,
      bank_name: bankName,
      account_number_encrypted: encrypted,
      account_number_last4: last4,
      account_holder_name: holder,
      status: 'PENDING',
      verified_at: null,
      verified_by_user_id: null,
      rejection_reason: null,
    });

    this.logger.log(`Bank account created (PENDING) userId=${userId} bank=${code} ***${last4}`);

    return {
      bankAccountId: id,
      bankCode: code,
      bankName,
      accountNumberLast4: last4,
      accountHolderName: holder,
      status: 'PENDING',
    };
  }

  async listMyBankAccounts(userId: string) {
    const rows = await this.bankRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
    return rows.map((r) => ({
      bankAccountId: r.bank_account_id,
      bankCode: r.bank_code,
      bankName: r.bank_name,
      accountNumberLast4: r.account_number_last4,
      accountHolderName: r.account_holder_name,
      status: r.status,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
  }

  async createWithdrawalRequest(
    userId: string,
    role: UserRole | undefined,
    dto: CreateFiatWithdrawalRequestDto,
  ) {
    this.assertFiatWithdrawRole(role);

    const idemKey = `fiat_withdraw:idem:${userId}:${dto.idempotencyKey.trim()}`;
    const cached = await this.cacheService.get<Record<string, unknown>>(idemKey);
    if (cached) {
      return cached;
    }

    const lockKey = `fiat_withdraw:lock:${userId}`;
    if (await this.cacheService.exists(lockKey)) {
      throw new ConflictException(
        'Bạn đã có thao tác rút tiền đang xử lý. Vui lòng chờ.',
        'FIAT_WITHDRAW_LOCKED',
      );
    }
    await this.cacheService.set(lockKey, '1', LOCK_TTL_SEC);

    try {
      const bank = await this.bankRepo.findOne({
        where: { bank_account_id: dto.bankAccountId, user_id: userId },
      });
      if (!bank) {
        throw new NotFoundException('Bank account', dto.bankAccountId);
      }
      if (bank.status !== 'VERIFIED') {
        throw new BadRequestException(
          'Tài khoản ngân hàng chưa được xác minh.',
          'BANK_NOT_VERIFIED',
        );
      }

      const amount = new Decimal(dto.amount);
      if (amount.lte(0)) {
        throw new BadRequestException('Số tiền không hợp lệ.', 'INVALID_AMOUNT');
      }

      const { min, max, dailyLimit } = this.getLimits();
      if (amount.lt(min)) {
        throw new BadRequestException(`Số tiền tối thiểu là ${min.toString()}.`, 'BELOW_MIN');
      }
      if (amount.gt(max)) {
        throw new BadRequestException(`Số tiền tối đa mỗi lần là ${max.toString()}.`, 'ABOVE_MAX');
      }

      if (dailyLimit.gt(0)) {
        const used = await this.sumDailyWithdrawalsUtc(userId);
        if (used.plus(amount).gt(dailyLimit)) {
          throw new BadRequestException(
            `Vượt hạn mức rút trong ngày (UTC). Còn lại: ${dailyLimit.minus(used).toString()}.`,
            'DAILY_LIMIT_EXCEEDED',
          );
        }
      }

      const currencyId = await this.resolveCashCurrencyId();
      const balance = await this.walletsService.getBalance(userId, currencyId);
      const available = new Decimal(balance.available ?? '0');
      if (available.lt(amount)) {
        throw new BadRequestException('Số dư khả dụng không đủ.', 'INSUFFICIENT_BALANCE');
      }

      const existing = await this.requestRepo.findOne({
        where: { user_id: userId, idempotency_key: dto.idempotencyKey.trim() },
      });
      if (existing) {
        const payload = this.mapRequestResponse(existing, bank);
        await this.cacheService.set(idemKey, payload, IDEMPOTENCY_TTL_SEC);
        return payload;
      }

      const requestId = uuidv7();
      const freezeRefId = this.toLedgerRefId(`${requestId}-freeze`);

      await this.walletsService.applyTransaction(userId, {
        currencyId,
        action: WalletTransactionAction.FREEZE,
        amount: amount.toString(),
        refType: WalletReferenceType.FIAT_WITHDRAWAL,
        refId: freezeRefId,
      } as WalletTransactionDto);

      try {
        await this.requestRepo.insert({
          request_id: requestId,
          user_id: userId,
          bank_account_id: bank.bank_account_id,
          currency_id: currencyId,
          amount: amount.toString(),
          fee: '0',
          status: 'PENDING_REVIEW',
          idempotency_key: dto.idempotencyKey.trim(),
          admin_note: null,
          transfer_reference: null,
          processed_by_user_id: null,
          processed_at: null,
          rejection_reason: null,
        });
      } catch (e) {
        const unfreezeRefId = this.toLedgerRefId(`${requestId}-unfreeze-fail`);
        try {
          await this.walletsService.applyTransaction(userId, {
            currencyId,
            action: WalletTransactionAction.UNFREEZE,
            amount: amount.toString(),
            refType: WalletReferenceType.FIAT_WITHDRAWAL,
            refId: unfreezeRefId,
          } as WalletTransactionDto);
        } catch (compErr) {
          this.logger.error(
            `Failed to compensate unfreeze after fiat withdraw insert error requestId=${requestId}`,
            compErr,
          );
        }
        throw e;
      }

      const saved = await this.requestRepo.findOne({ where: { request_id: requestId } });
      if (!saved) {
        throw new Error('Failed to load fiat withdrawal request after insert');
      }

      const payload = this.mapRequestResponse(saved, bank);
      await this.cacheService.set(idemKey, payload, IDEMPOTENCY_TTL_SEC);

      this.logger.log(
        `Fiat withdraw request ${requestId} userId=${userId} amount=${amount.toString()} ${currencyId}`,
      );

      return payload;
    } finally {
      await this.cacheService.delete(lockKey);
    }
  }

  private mapRequestResponse(req: FiatWithdrawalRequest, bank: UserBankAccount) {
    return {
      requestId: req.request_id,
      status: req.status,
      amount: req.amount,
      fee: req.fee,
      currencyId: req.currency_id,
      bankAccountId: bank.bank_account_id,
      bankCode: bank.bank_code,
      bankName: bank.bank_name,
      accountNumberLast4: bank.account_number_last4,
      accountHolderName: bank.account_holder_name,
      idempotencyKey: req.idempotency_key,
      createdAt: req.created_at instanceof Date ? req.created_at.toISOString() : String(req.created_at),
      transferReference: req.transfer_reference,
      rejectionReason: req.rejection_reason,
    };
  }

  async listMyRequests(userId: string, limit = 50) {
    const safe = Math.min(Math.max(limit, 1), 100);
    const rows = await this.requestRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
      take: safe,
      relations: ['bankAccount'],
    });
    return rows.map((r) => this.mapRequestResponse(r, r.bankAccount));
  }

  // ── Admin: bank verification ───────────────────────────────────────────

  async adminListBankAccounts(params: {
    status?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const skip = (page - 1) * limit;

    const qb = this.bankRepo.createQueryBuilder('b').orderBy('b.created_at', 'DESC');
    if (params.status) qb.andWhere('b.status = :status', { status: params.status });
    if (params.userId) qb.andWhere('b.user_id = :userId', { userId: params.userId });

    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return {
      data: items.map((r) => ({
        bankAccountId: r.bank_account_id,
        userId: r.user_id,
        bankCode: r.bank_code,
        bankName: r.bank_name,
        accountNumberLast4: r.account_number_last4,
        accountHolderName: r.account_holder_name,
        status: r.status,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
      total,
      page,
      limit,
    };
  }

  async adminBankAccountDetailForFinance(bankAccountId: string) {
    const r = await this.bankRepo.findOne({ where: { bank_account_id: bankAccountId } });
    if (!r) {
      throw new NotFoundException('Bank account', bankAccountId);
    }
    let fullNumber: string | null = null;
    try {
      fullNumber = this.walletEncryptionService.decrypt(r.account_number_encrypted);
    } catch {
      fullNumber = null;
    }
    return {
      bankAccountId: r.bank_account_id,
      userId: r.user_id,
      bankCode: r.bank_code,
      bankName: r.bank_name,
      accountNumber: fullNumber,
      accountNumberLast4: r.account_number_last4,
      accountHolderName: r.account_holder_name,
      status: r.status,
      verifiedAt: r.verified_at,
      rejectionReason: r.rejection_reason,
    };
  }

  async adminVerifyBankAccount(actorUserId: string, bankAccountId: string) {
    const r = await this.bankRepo.findOne({ where: { bank_account_id: bankAccountId } });
    if (!r) {
      throw new NotFoundException('Bank account', bankAccountId);
    }
    if (r.status !== 'PENDING') {
      throw new BadRequestException('Trạng thái không cho phép xác minh.', 'INVALID_STATUS');
    }
    await this.bankRepo.update(
      { bank_account_id: bankAccountId },
      {
        status: 'VERIFIED',
        verified_at: new Date(),
        verified_by_user_id: actorUserId,
        rejection_reason: null,
      },
    );
    return { ok: true, bankAccountId, status: 'VERIFIED' };
  }

  async adminRejectBankAccount(actorUserId: string, bankAccountId: string, dto: RejectWithReasonDto) {
    void actorUserId;
    const r = await this.bankRepo.findOne({ where: { bank_account_id: bankAccountId } });
    if (!r) {
      throw new NotFoundException('Bank account', bankAccountId);
    }
    if (r.status !== 'PENDING') {
      throw new BadRequestException('Trạng thái không cho phép từ chối.', 'INVALID_STATUS');
    }
    await this.bankRepo.update(
      { bank_account_id: bankAccountId },
      {
        status: 'REJECTED',
        verified_at: null,
        verified_by_user_id: null,
        rejection_reason: dto.reason?.trim() || null,
      },
    );
    return { ok: true, bankAccountId, status: 'REJECTED' };
  }

  // ── Admin: fiat withdrawal requests ─────────────────────────────────────

  async adminListRequests(params: {
    status?: string;
    userId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
    const skip = (page - 1) * limit;

    const qb = this.requestRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.bankAccount', 'b')
      .orderBy('r.created_at', 'DESC');
    if (params.status) qb.andWhere('r.status = :status', { status: params.status });
    if (params.userId) qb.andWhere('r.user_id = :userId', { userId: params.userId });

    const [rows, total] = await qb.skip(skip).take(limit).getManyAndCount();
    return {
      data: rows.map((r) => this.mapRequestResponse(r, r.bankAccount)),
      total,
      page,
      limit,
    };
  }

  async adminGetRequest(requestId: string) {
    const r = await this.requestRepo.findOne({
      where: { request_id: requestId },
      relations: ['bankAccount'],
    });
    if (!r) {
      throw new NotFoundException('Fiat withdrawal request', requestId);
    }
    const base = this.mapRequestResponse(r, r.bankAccount);
    const finance = await this.adminBankAccountDetailForFinance(r.bank_account_id);
    return { ...base, bank: finance };
  }

  async adminCompleteRequest(actorUserId: string, requestId: string, dto: CompleteFiatWithdrawalDto) {
    const r = await this.requestRepo.findOne({
      where: { request_id: requestId },
      relations: ['bankAccount'],
    });
    if (!r) {
      throw new NotFoundException('Fiat withdrawal request', requestId);
    }
    if (r.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('Yêu cầu không còn chờ duyệt.', 'INVALID_STATUS');
    }

    const amount = new Decimal(r.amount);
    const unfreezeRefId = this.toLedgerRefId(`${requestId}-unfreeze`);
    const debitRefId = this.toLedgerRefId(`${requestId}-debit`);

    await this.walletsService.applyTransaction(r.user_id, {
      currencyId: r.currency_id,
      action: WalletTransactionAction.UNFREEZE,
      amount: amount.toString(),
      refType: WalletReferenceType.FIAT_WITHDRAWAL,
      refId: unfreezeRefId,
    } as WalletTransactionDto);

    await this.walletsService.applyTransaction(r.user_id, {
      currencyId: r.currency_id,
      action: WalletTransactionAction.DEBIT,
      amount: amount.toString(),
      refType: WalletReferenceType.FIAT_WITHDRAWAL,
      refId: debitRefId,
    } as WalletTransactionDto);

    await this.requestRepo.update(
      { request_id: requestId },
      {
        status: 'COMPLETED',
        transfer_reference: dto.transferReference.trim(),
        admin_note: dto.adminNote?.trim() || null,
        processed_by_user_id: actorUserId,
        processed_at: new Date(),
        rejection_reason: null,
      },
    );

    const updated = await this.requestRepo.findOne({
      where: { request_id: requestId },
      relations: ['bankAccount'],
    });
    if (!updated) throw new Error('Request missing after complete');

    this.logger.log(`Fiat withdraw COMPLETED ${requestId} by ${actorUserId}`);

    return this.mapRequestResponse(updated, updated.bankAccount);
  }

  async adminRejectRequest(actorUserId: string, requestId: string, dto: RejectWithReasonDto) {
    void actorUserId;
    const r = await this.requestRepo.findOne({
      where: { request_id: requestId },
      relations: ['bankAccount'],
    });
    if (!r) {
      throw new NotFoundException('Fiat withdrawal request', requestId);
    }
    if (r.status !== 'PENDING_REVIEW') {
      throw new BadRequestException('Yêu cầu không còn chờ duyệt.', 'INVALID_STATUS');
    }

    const amount = new Decimal(r.amount);
    const unfreezeRefId = this.toLedgerRefId(`${requestId}-reject-unfreeze`);

    await this.walletsService.applyTransaction(r.user_id, {
      currencyId: r.currency_id,
      action: WalletTransactionAction.UNFREEZE,
      amount: amount.toString(),
      refType: WalletReferenceType.FIAT_WITHDRAWAL,
      refId: unfreezeRefId,
    } as WalletTransactionDto);

    await this.requestRepo.update(
      { request_id: requestId },
      {
        status: 'REJECTED',
        processed_at: new Date(),
        rejection_reason: dto.reason?.trim() || null,
      },
    );

    const updated = await this.requestRepo.findOne({
      where: { request_id: requestId },
      relations: ['bankAccount'],
    });
    if (!updated) throw new Error('Request missing after reject');

    this.logger.log(`Fiat withdraw REJECTED ${requestId}`);

    return this.mapRequestResponse(updated, updated.bankAccount);
  }
}
