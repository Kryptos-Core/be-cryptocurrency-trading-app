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
import type { CasWebhookEnvelope } from './types/cas-webhook.types';
import { UserRole, WalletReferenceType, WalletTransactionAction } from '@/common/enums';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { WalletTransactionDto } from '@/modules/wallets/dto/wallet-transaction.dto';
import { CurrencyRepository } from '@/modules/currencies/repositories';
import { UserBankAccount } from '@/entities/user-bank-account.entity';
import { FiatWithdrawalRequest } from '@/entities/fiat-withdrawal-request.entity';
import { resolveVietnamBankName, VIETNAM_BANKS } from './constants/vietnam-banks';
import {
  CreateBankAccountDto,
  CreateFiatWithdrawalRequestDto,
  CompleteFiatWithdrawalDto,
  RejectWithReasonDto,
  ResolveBankAccountHolderDto,
} from './dto';
import { CasBankHubService } from './cas-bankhub.service';

const LOCK_TTL_SEC = 60;
const IDEMPOTENCY_TTL_SEC = 24 * 60 * 60;
/** Cas gửi lại webhook tới 17 lần / 24h — TTL Redis > 24h để idempotent. */
const CAS_WEBHOOK_IDEMPOTENCY_TTL_SEC = 48 * 60 * 60;

const FIAT_WITHDRAW_ROLES: ReadonlySet<UserRole> = new Set([
  UserRole.VERIFIED_USER,
  UserRole.ADMIN,
  UserRole.RISK_OFFICER,
  UserRole.FINANCE_MANAGER,
]);

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
    private readonly casBankHub: CasBankHubService,
  ) {}

  async listVietnamBanks() {
    return [...VIETNAM_BANKS];
  }

  getIntegrationSettings() {
    try {
      return {
        bankAdapter: 'cas' as const,
        casRedirectUri: this.casBankHub.redirectUri(),
      };
    } catch {
      return {
        bankAdapter: 'cas' as const,
        casRedirectUri: null as string | null,
        casConfigIncomplete: true as const,
      };
    }
  }

  async createCasGrantToken(dto?: { language?: string }) {
    const raw = await this.casBankHub.createGrantToken({
      scopes: this.casBankHub.defaultScopes(),
      language: (dto?.language ?? 'vi').trim() || 'vi',
      redirectUri: this.casBankHub.redirectUri(),
    });
    const linkUrl = this.casBankHub.extractLinkUrl(raw);
    return {
      linkUrl,
      payload: this.casBankHub.unwrapData(raw),
    };
  }

  async completeCasBankLink(userId: string, publicToken: string) {
    const exchanged = await this.casBankHub.exchangePublicToken(publicToken);
    const accessToken = this.casBankHub.extractAccessToken(exchanged);
    if (!accessToken) {
      throw new BadRequestException(
        'BankHub không trả accessToken sau exchange.',
        'CAS_EXCHANGE_NO_TOKEN',
      );
    }
    const identityRaw = await this.casBankHub.fetchIdentity(accessToken);
    const id = this.casBankHub.parseIdentity(identityRaw);

    let bankCode = id.bankCode ?? 'CAS';
    let bankName = id.bankName;
    if (id.bankCode) {
      const resolved = resolveVietnamBankName(id.bankCode);
      if (resolved) bankName = resolved;
    }
    bankName = bankName ?? resolveVietnamBankName(bankCode) ?? 'Cas/BankHub';

    return this.persistUserBankAccount(userId, {
      bankCode,
      bankName,
      accountNumber: id.accountNumber,
      accountHolderName: id.accountHolderName,
    });
  }

  async resolveBankAccountHolder(userId: string, dto: ResolveBankAccountHolderDto) {
    void userId;
    void dto;
    throw new BadRequestException(
      'Vui lòng liên kết tài khoản qua Cas.so / BankHub (Balance Hook), không tra cứu STK thủ công.',
      'USE_CAS_LINK_FLOW',
    );
  }

  /**
   * Nhận webhook từ Cas Console (Balance Hook: loại TRANSACTIONS; Grant: GRANT, …).
   * Idempotent qua Redis SET NX theo transaction.id (hoặc fallback transactionCode).
   * Nghiệp vụ ghi có ví / đối soát: mở rộng tại đây sau khi có bảng map grantId ↔ user.
   */
  async handleCasConsoleWebhook(
    body: unknown,
    meta?: { clientIp?: string },
  ): Promise<{ received: true; duplicate?: boolean; webhookType?: string }> {
    if (body === null || typeof body !== 'object') {
      throw new BadRequestException('Webhook body phải là JSON object.', 'CAS_WEBHOOK_INVALID_BODY');
    }

    const trusted = this.configService.get<string>('CAS_WEBHOOK_TRUSTED_IPS')?.trim();
    if (trusted) {
      const allowed = trusted
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const ip = (meta?.clientIp ?? '').trim();
      if (allowed.length > 0 && (!ip || !allowed.includes(ip))) {
        this.logger.warn(`Cas webhook rejected: IP not in CAS_WEBHOOK_TRUSTED_IPS (ip=${ip || 'empty'})`);
        throw new ForbiddenException('Webhook source not allowed');
      }
    }

    const env = body as CasWebhookEnvelope;
    const webhookType = String(env.webhookType ?? '').trim().toUpperCase();

    if (webhookType === 'TRANSACTIONS') {
      const tx = env.transaction;
      const tid =
        tx?.id != null && String(tx.id).trim() !== ''
          ? String(tx.id).trim()
          : tx?.transactionCode != null && String(tx.transactionCode).trim() !== ''
            ? `code:${String(tx.transactionCode).trim()}`
            : null;

      if (!tid) {
        this.logger.warn('Cas TRANSACTIONS webhook: missing transaction.id and transactionCode');
        return { received: true, webhookType };
      }

      const key = `cas:wh:txn:${tid}`;
      const first = await this.cacheService.setIfNotExists(
        key,
        { at: new Date().toISOString() },
        CAS_WEBHOOK_IDEMPOTENCY_TTL_SEC,
      );

      if (!first) {
        return { received: true, duplicate: true, webhookType };
      }

      this.logger.log(
        JSON.stringify({
          event: 'cas_webhook_transactions',
          grantId: env.grantId,
          webhookCode: env.webhookCode,
          transactionId: tx?.id,
          transactionCode: tx?.transactionCode,
          amount: tx?.amount,
          currency: tx?.currency,
          accountNumber: tx?.accountNumber,
        }),
      );

      return { received: true, webhookType };
    }

    this.logger.log(
      JSON.stringify({
        event: 'cas_webhook',
        webhookType: webhookType || 'UNKNOWN',
        webhookCode: env.webhookCode,
        grantId: env.grantId,
        hasError: env.error != null,
      }),
    );

    return { received: true, webhookType: webhookType || undefined };
  }

  /** Cas/BankHub: probe POST grant/token — không gọi lookup. */
  async healthCheckBankProviders(options?: { includeDetails?: boolean }) {
    const ping = await this.casBankHub.healthPing();
    return {
      ok: ping.ok,
      checkedAt: new Date().toISOString(),
      mode: 'cas_bankhub',
      providers: [
        {
          id: 'cas_bankhub',
          ok: ping.ok,
          httpStatus: ping.httpStatus,
          latencyMs: ping.latencyMs,
          checkedVia: 'POST /grant/token (empty probe)',
          ...(options?.includeDetails && ping.error ? { error: ping.error } : {}),
        },
      ],
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

  private async persistUserBankAccount(
    userId: string,
    opts: {
      bankCode: string;
      bankName: string;
      accountNumber: string;
      accountHolderName: string;
    },
  ) {
    const code = opts.bankCode.trim().toUpperCase();
    const bankName = opts.bankName.trim();
    const acct = opts.accountNumber.replace(/\s/g, '');
    const last4 = acct.slice(-4);
    const encrypted = this.walletEncryptionService.encrypt(acct);
    const holder = opts.accountHolderName.replace(/\s+/g, ' ').trim();

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

  async createBankAccount(userId: string, dto: CreateBankAccountDto) {
    const code = dto.bankCode.trim().toUpperCase();
    const resolved = resolveVietnamBankName(code);
    if (!resolved) {
      throw new BadRequestException('Mã ngân hàng không hợp lệ.', 'INVALID_BANK_CODE');
    }
    const bankName = resolved;

    return this.persistUserBankAccount(userId, {
      bankCode: code,
      bankName,
      accountNumber: dto.accountNumber,
      accountHolderName: dto.accountHolderName,
    });
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
