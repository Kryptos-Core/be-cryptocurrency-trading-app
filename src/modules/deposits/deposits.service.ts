import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import Decimal from 'decimal.js';
import { uuidv7 } from 'uuidv7';
import { WalletReferenceType, WalletTransactionAction } from '@/common/enums';
import { calcSkip } from '@/common/utils/pagination.util';
import type { FiatDeposit } from '@/entities/fiat-deposit.entity';
import {
  CURRENCY_REPOSITORY,
  type CurrencyRepositoryPort,
} from '@/modules/currencies/domain/ports';
import type { PayosGatewayConfig } from '@/modules/payment-config/interfaces/payment-gateway-config.interface';
import { PaymentConfigService } from '@/modules/payment-config/payment-config.service';
import { WalletsService } from '@/modules/wallets/wallets.service';
import { FIAT_DEPOSIT_REPOSITORY, type FiatDepositRepositoryPort } from './domain/ports';
import { resolvePayosFiatDepositLimits } from './payos-fiat-limits.util';

interface PayOSInstanceEntry {
  instance: PayOS;
  version: number;
  config: PayosGatewayConfig;
}

/**
 * DepositsService
 * Handles PayOS fiat deposit lifecycle (create link, webhook, manual sync).
 *
 * Config loading strategy (Cache-Aside via PaymentConfigService):
 *  1. Try PaymentConfigService.getActiveConfig('PAYOS', 'MAINNET') — DB/Redis
 *  2. Fallback to .env values (backward compatible during migration)
 * The resolved PayOS SDK instance is cached in-process per config_version.
 */
@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  /** In-process cache of the PayOS SDK instance, busted when config_version changes */
  private payOSCache: PayOSInstanceEntry | null = null;

  constructor(
    @Inject(FIAT_DEPOSIT_REPOSITORY)
    private readonly fiatDepositRepo: FiatDepositRepositoryPort,
    private readonly walletsService: WalletsService,
    private readonly configService: ConfigService,
    @Inject(CURRENCY_REPOSITORY)
    private readonly currencyRepository: CurrencyRepositoryPort,
    private readonly paymentConfigService: PaymentConfigService,
  ) {}

  // ── PayOS instance (dynamic, cache-aside) ────────────────────────────────

  /**
   * Resolve the active PayOS config and return a cached SDK instance.
   * Priority: DB (via PaymentConfigService) → .env fallback
   */
  private async resolvePayOSConfig(): Promise<PayosGatewayConfig> {
    const dbConfig = await this.paymentConfigService.getActiveConfig('PAYOS', 'MAINNET');
    if (dbConfig) return dbConfig as PayosGatewayConfig;

    // .env fallback — supports legacy deployments
    const clientId = this.configService.get<string>('PAYOS_CLIENT_ID');
    const apiKey = this.configService.get<string>('PAYOS_API_KEY');
    const checksumKey = this.configService.get<string>('PAYOS_CHECKSUM_KEY');

    if (!clientId || !apiKey || !checksumKey) {
      throw new Error(
        'PayOS is not configured. Add credentials via /payment-configs UI or set PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY in .env',
      );
    }

    return {
      clientId,
      apiKey,
      checksumKey,
      returnUrl: this.configService.get<string>('PAYOS_RETURN_URL') ?? '',
      cancelUrl: this.configService.get<string>('PAYOS_CANCEL_URL') ?? '',
      fiatSymbol:
        this.configService.get<string>('PAYOS_FIAT_SYMBOL')?.trim().toUpperCase() ?? 'VND',
      quoteCurrencySymbol:
        this.configService.get<string>('PAYOS_DEPOSIT_CURRENCY_SYMBOL')?.trim().toUpperCase() ??
        'USDT',
      fiatToQuoteRate: this.configService.get<string>('PAYOS_FIAT_TO_QUOTE_RATE') ?? '1',
      fxSpreadBps: this.configService.get<string>('PAYOS_FX_SPREAD_BPS') ?? '0',
      minDepositAmountFiat: this.configService.get<string>('PAYOS_MIN_DEPOSIT_AMOUNT'),
      maxDepositAmountFiat: this.configService.get<string>('PAYOS_MAX_DEPOSIT_AMOUNT'),
    };
  }

  private async getPayOSInstance(): Promise<{ payOS: PayOS; config: PayosGatewayConfig }> {
    const config = await this.resolvePayOSConfig();

    // Use cached SDK instance if config hasn't changed (compare key fields)
    if (
      this.payOSCache &&
      this.payOSCache.config.clientId === config.clientId &&
      this.payOSCache.config.apiKey === config.apiKey &&
      this.payOSCache.config.checksumKey === config.checksumKey
    ) {
      return { payOS: this.payOSCache.instance, config: this.payOSCache.config };
    }

    const instance = new PayOS({
      clientId: config.clientId,
      apiKey: config.apiKey,
      checksumKey: config.checksumKey,
    });

    this.payOSCache = { instance, version: Date.now(), config };
    this.logger.log('PayOS SDK re-initialized with new config');

    return { payOS: instance, config };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async resolveCurrencyIdBySymbol(symbol: string): Promise<string> {
    const currency = await this.currencyRepository.findBySymbol(symbol);
    if (!currency?.currency_id) {
      throw new Error(
        `Currency symbol ${symbol} not found. Configure symbols to valid currencies.`,
      );
    }
    return String(currency.currency_id);
  }

  private async resolveConvertedCredit(
    amount: string,
    config: PayosGatewayConfig,
  ): Promise<{
    currencyId: string;
    creditAmount: string;
    effectiveRate: string;
  }> {
    const fiatToQuoteRate = new Decimal(config.fiatToQuoteRate);
    const fxSpreadBps = new Decimal(config.fxSpreadBps);

    if (config.quoteCurrencySymbol === config.fiatSymbol) {
      const currencyId = await this.resolveCurrencyIdBySymbol(config.quoteCurrencySymbol);
      return { currencyId, creditAmount: amount, effectiveRate: '1' };
    }

    if (!fiatToQuoteRate.isFinite() || fiatToQuoteRate.lte(0)) {
      throw new Error('fiatToQuoteRate must be a positive number');
    }
    if (!fxSpreadBps.isFinite() || fxSpreadBps.lt(0)) {
      throw new Error('fxSpreadBps must be >= 0');
    }
    if (fxSpreadBps.gt(10000)) {
      throw new Error('fxSpreadBps must be <= 10000');
    }

    const fiatAmount = new Decimal(amount);
    const grossQuote = fiatAmount.mul(fiatToQuoteRate);
    const spreadFactor = new Decimal(1).minus(fxSpreadBps.div(10000));
    const netQuote = grossQuote.mul(spreadFactor);

    if (!netQuote.isFinite() || netQuote.lte(0)) {
      throw new Error('Converted quote amount must be > 0');
    }

    const currencyId = await this.resolveCurrencyIdBySymbol(config.quoteCurrencySymbol);

    return {
      currencyId,
      creditAmount: netQuote.toFixed(8, Decimal.ROUND_DOWN),
      effectiveRate: fiatToQuoteRate.mul(spreadFactor).toString(),
    };
  }

  async getDepositPreview(amount: string, fiatSymbol = 'VND') {
    const { config } = await this.getPayOSInstance();
    const normalizedFiat = fiatSymbol.trim().toUpperCase();
    if (config.fiatSymbol !== normalizedFiat) {
      throw new BadRequestException(`Unsupported fiat symbol ${normalizedFiat}`);
    }

    const fiatAmount = new Decimal(amount);
    if (!fiatAmount.isFinite() || fiatAmount.lte(0)) {
      throw new BadRequestException('fiatAmount must be a positive number');
    }

    const fiatToQuoteRate = new Decimal(config.fiatToQuoteRate);
    const fxSpreadBps = new Decimal(config.fxSpreadBps);
    const grossAmount = fiatAmount.mul(fiatToQuoteRate);
    const spreadAmount = grossAmount.mul(fxSpreadBps.div(10000));
    const conversion = await this.resolveConvertedCredit(amount, config);

    return {
      fiatAmount: fiatAmount.toString(),
      fiatSymbol: normalizedFiat,
      quoteCurrency: config.quoteCurrencySymbol,
      grossAmount: grossAmount.toFixed(8, Decimal.ROUND_DOWN),
      spreadBps: fxSpreadBps.toString(),
      spreadAmount: spreadAmount.toFixed(8, Decimal.ROUND_DOWN),
      netAmount: conversion.creditAmount,
      effectiveRate: conversion.effectiveRate,
      validUntil: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  private async markDepositPaid(
    deposit: FiatDeposit,
    source: 'webhook' | 'manual_sync',
  ): Promise<void> {
    const { config } = await this.getPayOSInstance();
    const conversion = await this.resolveConvertedCredit(deposit.amount, config);

    await this.fiatDepositRepo.transaction(async (manager) => {
      const updatedDeposit = await this.fiatDepositRepo.updateStatus(
        deposit.order_code,
        'PAID',
        manager,
      );

      await this.walletsService.applyTransaction(deposit.user_id, {
        currencyId: conversion.currencyId,
        action: WalletTransactionAction.CREDIT,
        amount: conversion.creditAmount,
        refType: WalletReferenceType.EXTERNAL_DEPOSIT,
        refId: Number(updatedDeposit.order_code),
      });
    });

    this.logger.log(
      `Deposit ${deposit.deposit_id} marked PAID via ${source}; credited ${conversion.creditAmount} ${config.quoteCurrencySymbol} (fiat=${config.fiatSymbol}, rate=${conversion.effectiveRate})`,
    );
  }

  // ── Public API ───────────────────────────────────────────────────────────

  private payosLimits(config: PayosGatewayConfig) {
    return resolvePayosFiatDepositLimits(config, {
      min: this.configService.get<string>('PAYOS_MIN_DEPOSIT_AMOUNT'),
      max: this.configService.get<string>('PAYOS_MAX_DEPOSIT_AMOUNT'),
    });
  }

  /**
   * Fiat deposit bounds for the active PayOS config (for client validation UX).
   */
  async getCheckoutMeta() {
    const { config } = await this.getPayOSInstance();
    const { minAmount, maxAmount } = this.payosLimits(config);
    return {
      minAmount,
      maxAmount,
      fiatSymbol: config.fiatSymbol,
    };
  }

  async createPaymentLink(userId: string, amount: number) {
    const { payOS, config } = await this.getPayOSInstance();

    if (!config.returnUrl || !config.cancelUrl) {
      throw new Error('PayOS callback URLs not configured (returnUrl / cancelUrl)');
    }

    const { minAmount, maxAmount } = this.payosLimits(config);
    if (!Number.isFinite(amount) || amount < minAmount) {
      throw new BadRequestException({
        message: `Amount must be at least ${minAmount} ${config.fiatSymbol}`,
        minAmount,
        maxAmount,
        fiatSymbol: config.fiatSymbol,
      });
    }
    if (maxAmount != null && amount > maxAmount) {
      throw new BadRequestException({
        message: `Amount must not exceed ${maxAmount} ${config.fiatSymbol}`,
        minAmount,
        maxAmount,
        fiatSymbol: config.fiatSymbol,
      });
    }

    const orderCode = Number(String(Date.now()).slice(-6) + Math.floor(Math.random() * 10000));
    const depositId = uuidv7();

    const body = {
      orderCode,
      amount,
      description: 'Nap tien vao vi',
      returnUrl: config.returnUrl,
      cancelUrl: config.cancelUrl,
    };

    try {
      const paymentLinkRes = await payOS.paymentRequests.create(body);

      const deposit = await this.fiatDepositRepo.createDeposit(
        depositId,
        userId,
        String(amount),
        orderCode,
        paymentLinkRes.checkoutUrl,
      );

      return {
        depositId: deposit.deposit_id,
        checkoutUrl: paymentLinkRes.checkoutUrl,
        orderCode: deposit.order_code,
        minAmount,
        maxAmount,
        fiatSymbol: config.fiatSymbol,
      };
    } catch (error) {
      this.logger.error('Failed to create payment link using PayOS', error);
      throw new Error('Could not create deposit checkout context');
    }
  }

  async handleWebhook(webhookData: unknown) {
    const { payOS } = await this.getPayOSInstance();

    try {
      const verifiedData = (await payOS.webhooks.verify(
        webhookData as Parameters<typeof payOS.webhooks.verify>[0],
      )) as {
        orderCode?: string | number;
        code?: string;
        desc?: string;
        success?: boolean;
      };

      this.logger.log(
        `Received valid webhook data for Order ${verifiedData.orderCode} with status ${verifiedData.code}`,
      );

      if (
        verifiedData.code === '00' ||
        verifiedData.desc === 'success' ||
        verifiedData.success === true
      ) {
        const deposit = await this.fiatDepositRepo.findByOrderCode(Number(verifiedData.orderCode));
        if (!deposit || deposit.status === 'PAID') {
          return { message: 'Order already paid or not found' };
        }

        await this.markDepositPaid(deposit, 'webhook');
        return { success: true, message: 'Deposit successfully paid' };
      }

      return { success: true, message: 'Ignored due to code or status.' };
    } catch (e: unknown) {
      this.logger.error('Webhook signature failed or invalid handler logic', e);
      throw new ConflictException('Invalid webhook payload');
    }
  }

  async getMyDeposits(userId: string) {
    return this.fiatDepositRepo.findByUser(userId);
  }

  async getAllDepositsForAdmin(params: {
    userId?: string;
    status?: string;
    page: number;
    limit: number;
  }) {
    const skip = calcSkip(params.page, params.limit);
    const { items, total } = await this.fiatDepositRepo.findAllForAdmin({
      userId: params.userId,
      status: params.status,
      skip,
      limit: params.limit,
    });
    return { data: items, total, page: params.page, limit: params.limit };
  }

  async syncPaymentStatusForUser(userId: string, orderCode: number) {
    const { payOS } = await this.getPayOSInstance();

    const deposit = await this.fiatDepositRepo.findByOrderCode(orderCode);
    if (!deposit || deposit.user_id !== userId) {
      throw new NotFoundException('Deposit not found for this order code');
    }

    if (deposit.status === 'PAID') {
      return {
        orderCode,
        localStatus: deposit.status,
        payosStatus: 'PAID',
        updated: false,
      };
    }

    const paymentLink = await payOS.paymentRequests.get(orderCode);
    const payosStatus = String(paymentLink?.status || 'PENDING').toUpperCase();

    if (payosStatus === 'PAID') {
      await this.markDepositPaid(deposit, 'manual_sync');
      return { orderCode, localStatus: 'PAID', payosStatus, updated: true };
    }

    if (['CANCELLED', 'EXPIRED', 'FAILED'].includes(payosStatus)) {
      await this.fiatDepositRepo.updateStatus(orderCode, 'CANCELLED');
      return { orderCode, localStatus: 'CANCELLED', payosStatus, updated: true };
    }

    return { orderCode, localStatus: deposit.status, payosStatus, updated: false };
  }
}
