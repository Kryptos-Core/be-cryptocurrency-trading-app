/* eslint-disable no-console */
import 'reflect-metadata';

type ResultItem = {
  step: string;
  status: 'passed' | 'failed' | 'skipped';
  detail?: unknown;
};

async function apiRequest(
  baseUrl: string,
  token: string,
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<any> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let payload: any = text;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = text;
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${path} -> ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
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
  } catch (error: any) {
    if (!allowSkip) {
      throw error;
    }
    results.push({
      step: 'bootstrap',
      status: 'skipped',
      detail: error?.message || String(error),
    });
    console.log(JSON.stringify({ reportAt: new Date().toISOString(), results }, null, 2));
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
  } catch (error: any) {
    results.push({ step: 'withdraw_auto_request', status: 'failed', detail: error?.message || String(error) });
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
    manualTxId = manualRes?.txId || null;
    results.push({ step: 'withdraw_manual_request', status: 'passed', detail: manualRes });
  } catch (error: any) {
    results.push({ step: 'withdraw_manual_request', status: 'failed', detail: error?.message || String(error) });
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
    } catch (error: any) {
      results.push({ step: 'withdraw_manual_approve', status: 'failed', detail: error?.message || String(error) });
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
      const submitRes = await apiRequest(
        baseUrl,
        traderToken,
        '/api/v1/blockchain/deposit/submit',
        'POST',
        {
          chain,
          txHash: depositTxHash,
          amount: depositAmount,
        },
      );
      depositTxId = submitRes?.txId || null;
      results.push({ step: 'deposit_submit', status: 'passed', detail: submitRes });
    } catch (error: any) {
      results.push({ step: 'deposit_submit', status: 'failed', detail: error?.message || String(error) });
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
      } catch (error: any) {
        results.push({ step: 'deposit_settle', status: 'failed', detail: error?.message || String(error) });
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
  } catch (error: any) {
    results.push({ step: 'transactions_check', status: 'failed', detail: error?.message || String(error) });
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

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
