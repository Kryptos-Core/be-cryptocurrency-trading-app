import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { TreasuryE2EConfigService } from '../src/modules/treasury-e2e-config/treasury-e2e-config.service';

type ResultItem = {
  step: string;
  status: 'passed' | 'failed' | 'skipped';
  detail?: unknown;
};

type JsonObject = Record<string, unknown>;
type ApiRequestBody = Record<string, unknown>;

type ResolvedConfig = {
  source: 'db' | 'env';
  allowSkip: boolean;
  baseUrl: string;
  traderToken: string;
  riskToken: string;
  chain: string;
  linkedWalletId: string;
  autoAmount: string;
  manualAmount: string;
  depositTxHash: string | null;
  depositAmount: string | null;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

async function apiRequest(
  baseUrl: string,
  token: string,
  path: string,
  method: 'GET' | 'POST',
  body?: ApiRequestBody,
): Promise<unknown> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${path} -> ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`,
    );
  }

  return payload;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function resolveConfig(): Promise<ResolvedConfig> {
  const sourcePref = (process.env.TREASURY_E2E_CONFIG_SOURCE || 'db').trim().toLowerCase();
  const environment = (process.env.TREASURY_E2E_CONFIG_ENV || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase();

  if (sourcePref !== 'env') {
    let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
    try {
      app = await NestFactory.createApplicationContext(AppModule, { logger: false });
      const configService = app.get(TreasuryE2EConfigService);
      const dbConfig = await configService.getRunnerConfigForEnvironment(environment);
      if (dbConfig) {
        return {
          source: 'db',
          allowSkip: dbConfig.allowSkip,
          baseUrl: dbConfig.apiBaseUrl,
          traderToken: dbConfig.traderBearerToken || '',
          riskToken: dbConfig.riskBearerToken || '',
          chain: dbConfig.chain,
          linkedWalletId: dbConfig.linkedWalletId || '',
          autoAmount: dbConfig.withdrawAmountAuto,
          manualAmount: dbConfig.withdrawAmountManual,
          depositTxHash: dbConfig.depositTxHash,
          depositAmount: dbConfig.depositAmount,
        };
      }
    } catch {
      // Fall back to env below.
    } finally {
      if (app) {
        await app.close();
      }
    }
  }

  return {
    source: 'env',
    allowSkip: (process.env.TREASURY_E2E_ALLOW_SKIP || '').toLowerCase() === 'true',
    baseUrl: required('E2E_API_BASE_URL').replace(/\/$/, ''),
    traderToken: required('E2E_BEARER_TOKEN_TRADER'),
    riskToken: required('E2E_BEARER_TOKEN_RISK'),
    chain: required('E2E_CHAIN'),
    linkedWalletId: required('E2E_LINKED_WALLET_ID'),
    autoAmount: required('E2E_WITHDRAW_AMOUNT_AUTO'),
    manualAmount: required('E2E_WITHDRAW_AMOUNT_MANUAL'),
    depositTxHash: process.env.E2E_DEPOSIT_TX_HASH?.trim() || null,
    depositAmount: process.env.E2E_DEPOSIT_AMOUNT?.trim() || null,
  };
}

async function main() {
  const results: ResultItem[] = [];

  let resolved: ResolvedConfig;
  try {
    resolved = await resolveConfig();
  } catch (error: unknown) {
    const allowSkip = (process.env.TREASURY_E2E_ALLOW_SKIP || '').toLowerCase() === 'true';
    if (!allowSkip) throw error;
    results.push({ step: 'bootstrap', status: 'skipped', detail: errorMessage(error) });
    console.log(JSON.stringify({ reportAt: new Date().toISOString(), results }, null, 2));
    return;
  }

  const allowSkip = resolved.allowSkip;
  const baseUrl = resolved.baseUrl;
  const traderToken = resolved.traderToken;
  const riskToken = resolved.riskToken;
  const chain = resolved.chain;
  const linkedWalletId = resolved.linkedWalletId;
  const autoAmount = resolved.autoAmount;
  const manualAmount = resolved.manualAmount;

  if (
    !baseUrl ||
    !chain ||
    !autoAmount ||
    !manualAmount ||
    !linkedWalletId ||
    !traderToken ||
    !riskToken
  ) {
    const missing = 'Resolved treasury E2E config is incomplete';
    if (!allowSkip) {
      throw new Error(missing);
    }
    results.push({
      step: 'bootstrap',
      status: 'skipped',
      detail: `${missing}; source=${resolved.source}`,
    });
    console.log(
      JSON.stringify(
        { reportAt: new Date().toISOString(), configSource: resolved.source, results },
        null,
        2,
      ),
    );
    return;
  }

  let manualTxId: string | null = null;

  try {
    const autoRes = await apiRequest(
      baseUrl,
      traderToken,
      '/api/v1/blockchain/withdraw/request',
      'POST',
      {
        chain,
        linkedWalletId,
        amount: autoAmount,
        idempotencyKey: `daily-auto-${Date.now()}`,
      },
    );
    results.push({ step: 'withdraw_auto_request', status: 'passed', detail: autoRes });
  } catch (error: unknown) {
    results.push({ step: 'withdraw_auto_request', status: 'failed', detail: errorMessage(error) });
  }

  try {
    const manualRes = await apiRequest(
      baseUrl,
      traderToken,
      '/api/v1/blockchain/withdraw/request',
      'POST',
      {
        chain,
        linkedWalletId,
        amount: manualAmount,
        idempotencyKey: `daily-manual-${Date.now()}`,
      },
    );
    const manualPayload = asRecord(manualRes);
    manualTxId = typeof manualPayload.txId === 'string' ? manualPayload.txId : null;
    results.push({ step: 'withdraw_manual_request', status: 'passed', detail: manualRes });
  } catch (error: unknown) {
    results.push({
      step: 'withdraw_manual_request',
      status: 'failed',
      detail: errorMessage(error),
    });
  }

  if (manualTxId) {
    try {
      const approveRes = await apiRequest(
        baseUrl,
        riskToken,
        `/api/v1/blockchain/withdraw/manual/${manualTxId}/approve`,
        'POST',
      );
      results.push({ step: 'withdraw_manual_approve', status: 'passed', detail: approveRes });
    } catch (error: unknown) {
      results.push({
        step: 'withdraw_manual_approve',
        status: 'failed',
        detail: errorMessage(error),
      });
    }
  } else {
    results.push({
      step: 'withdraw_manual_approve',
      status: 'skipped',
      detail: 'manual tx id unavailable',
    });
  }

  const depositTxHash = resolved.depositTxHash;
  const depositAmount = resolved.depositAmount;
  if (depositTxHash && depositAmount) {
    try {
      const submitRes = await apiRequest(
        baseUrl,
        traderToken,
        '/api/v1/blockchain/deposit/submit',
        'POST',
        {
          txHash: depositTxHash,
          amount: depositAmount,
          chain,
        },
      );
      results.push({ step: 'deposit_submit', status: 'passed', detail: submitRes });
    } catch (error: unknown) {
      results.push({ step: 'deposit_submit', status: 'failed', detail: errorMessage(error) });
    }
  } else {
    results.push({
      step: 'deposit_submit',
      status: 'skipped',
      detail: 'Set deposit fields in active treasury E2E config or env to run deposit E2E',
    });
  }

  console.log(
    JSON.stringify(
      { reportAt: new Date().toISOString(), configSource: resolved.source, results },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        reportAt: new Date().toISOString(),
        fatal: true,
        error: errorMessage(error),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
