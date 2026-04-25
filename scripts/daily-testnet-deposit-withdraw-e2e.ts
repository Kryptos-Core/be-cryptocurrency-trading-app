import 'reflect-metadata';

type ResultItem = {
  step: string;
  status: 'passed' | 'failed' | 'skipped';
  detail?: unknown;
};

type JsonObject = Record<string, unknown>;
type ApiRequestBody = Record<string, unknown>;

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

async function main() {
  const allowSkip = (process.env.TREASURY_E2E_ALLOW_SKIP || '').toLowerCase() === 'true';
  const results: ResultItem[] = [];

  let baseUrl = '';
  let traderToken = '';
  let riskToken = '';
  let chain = '';
  let linkedWalletId = '';
  let autoAmount = '';
  let manualAmount = '';

  try {
    baseUrl = required('E2E_API_BASE_URL').replace(/\/$/, '');
    traderToken = required('E2E_BEARER_TOKEN_TRADER');
    riskToken = required('E2E_BEARER_TOKEN_RISK');
    chain = required('E2E_CHAIN');
    linkedWalletId = required('E2E_LINKED_WALLET_ID');
    autoAmount = required('E2E_WITHDRAW_AMOUNT_AUTO');
    manualAmount = required('E2E_WITHDRAW_AMOUNT_MANUAL');
  } catch (error: unknown) {
    if (!allowSkip) throw error;
    results.push({ step: 'bootstrap', status: 'skipped', detail: errorMessage(error) });
    console.log(JSON.stringify({ reportAt: new Date().toISOString(), results }, null, 2));
    return;
  }

  let manualTxId: string | null = null;

  try {
    const autoRes = await apiRequest(baseUrl, traderToken, '/api/v1/blockchain/withdraw/request', 'POST', {
      chain,
      linkedWalletId,
      amount: autoAmount,
      idempotencyKey: `daily-auto-${Date.now()}`,
    });
    results.push({ step: 'withdraw_auto_request', status: 'passed', detail: autoRes });
  } catch (error: unknown) {
    results.push({ step: 'withdraw_auto_request', status: 'failed', detail: errorMessage(error) });
  }

  try {
    const manualRes = await apiRequest(baseUrl, traderToken, '/api/v1/blockchain/withdraw/request', 'POST', {
      chain,
      linkedWalletId,
      amount: manualAmount,
      idempotencyKey: `daily-manual-${Date.now()}`,
    });
    const manualPayload = asRecord(manualRes);
    manualTxId = typeof manualPayload.txId === 'string' ? manualPayload.txId : null;
    results.push({ step: 'withdraw_manual_request', status: 'passed', detail: manualRes });
  } catch (error: unknown) {
    results.push({ step: 'withdraw_manual_request', status: 'failed', detail: errorMessage(error) });
  }

  if (manualTxId) {
    try {
      const approveRes = await apiRequest(
        baseUrl,
        riskToken,
        `/api/v1/blockchain/withdraw/manual/${manualTxId}/approve`,
        'POST',
        { reason: 'Daily treasury E2E approve' },
      );
      results.push({ step: 'withdraw_manual_approve', status: 'passed', detail: approveRes });
    } catch (error: unknown) {
      results.push({ step: 'withdraw_manual_approve', status: 'failed', detail: errorMessage(error) });
    }
  } else {
    results.push({
      step: 'withdraw_manual_approve',
      status: 'skipped',
      detail: 'manual txId not available from previous step',
    });
  }

  const depositTxHash = process.env.E2E_DEPOSIT_TX_HASH?.trim();
  const depositAmount = process.env.E2E_DEPOSIT_AMOUNT?.trim();

  if (depositTxHash && depositAmount) {
    let depositTxId: string | null = null;

    try {
      const submitRes = await apiRequest(baseUrl, traderToken, '/api/v1/blockchain/deposit/submit', 'POST', {
        chain,
        txHash: depositTxHash,
        amount: depositAmount,
      });
      const submitPayload = asRecord(submitRes);
      depositTxId = typeof submitPayload.txId === 'string' ? submitPayload.txId : null;
      results.push({ step: 'deposit_submit', status: 'passed', detail: submitRes });
    } catch (error: unknown) {
      results.push({ step: 'deposit_submit', status: 'failed', detail: errorMessage(error) });
    }

    if (depositTxId) {
      try {
        const settleRes = await apiRequest(
          baseUrl,
          traderToken,
          `/api/v1/blockchain/deposit/${depositTxId}/settle`,
          'POST',
        );
        results.push({ step: 'deposit_settle', status: 'passed', detail: settleRes });
      } catch (error: unknown) {
        results.push({ step: 'deposit_settle', status: 'failed', detail: errorMessage(error) });
      }
    }
  } else {
    results.push({
      step: 'deposit_submit_settle',
      status: 'skipped',
      detail: 'Set E2E_DEPOSIT_TX_HASH and E2E_DEPOSIT_AMOUNT to run deposit E2E',
    });
  }

  try {
    const txRes = await apiRequest(baseUrl, traderToken, '/api/v1/blockchain/transactions?limit=20', 'GET');
    results.push({ step: 'transactions_check', status: 'passed', detail: txRes });
  } catch (error: unknown) {
    results.push({ step: 'transactions_check', status: 'failed', detail: errorMessage(error) });
  }

  const report = {
    reportAt: new Date().toISOString(),
    baseUrl,
    summary: {
      passed: results.filter((r) => r.status === 'passed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
    },
    results,
  };

  console.log(JSON.stringify(report, null, 2));
  if (report.summary.failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
