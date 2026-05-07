import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import Decimal from 'decimal.js';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SystemConfigService } from '../src/modules/system-config/system-config.service';
import { TreasuryE2EConfigService } from '../src/modules/treasury-e2e-config/treasury-e2e-config.service';
import { WalletsService } from '../src/modules/wallets/wallets.service';

type Severity = 'critical' | 'warning';

interface AlertItem {
  severity: Severity;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

interface TxIdRow {
  tx_id: string;
}

interface CountRow {
  total: string | number;
}

interface WalletPairRow {
  user_id: string;
  currency_id: string;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = app.get(DataSource);
  const walletsService = app.get(WalletsService);
  const systemConfig = app.get(SystemConfigService);
  const treasuryE2EConfig = app.get(TreasuryE2EConfigService);

  const reportAt = new Date().toISOString();
  const alerts: AlertItem[] = [];
  const envName = (process.env.TREASURY_E2E_CONFIG_ENV || process.env.NODE_ENV || 'development')
    .trim()
    .toLowerCase();
  const activeConfig = await treasuryE2EConfig.getRunnerConfigForEnvironment(envName);

  const staleManualMinutes =
    activeConfig?.staleManualMinutes ?? envNumber('TREASURY_ALERT_STALE_MANUAL_MINUTES', 15);
  const staleConfirmingMinutes =
    activeConfig?.staleConfirmingMinutes ??
    envNumber('TREASURY_ALERT_STALE_CONFIRMING_MINUTES', 30);
  const failedWithdrawLimit =
    activeConfig?.failedWithdrawals24h ?? envNumber('TREASURY_ALERT_FAILED_WITHDRAWALS_24H', 10);
  const reconcileLimit =
    activeConfig?.reconcilePairLimit ?? envNumber('TREASURY_RECONCILE_PAIR_LIMIT', 100);
  const discrepancyThreshold =
    activeConfig?.reconciliationThreshold ??
    (await systemConfig.getEffectiveString('WALLET_RECONCILIATION_THRESHOLD'));
  const failOnCritical =
    activeConfig?.healthFailOnCritical ??
    (process.env.TREASURY_HEALTH_FAIL_ON_CRITICAL || 'false').toLowerCase() === 'true';

  try {
    const staleManualRows = (await dataSource.query(
      `SELECT tx_id, user_id, chain, amount, created_at
       FROM onchain_transactions
       WHERE type = 'WITHDRAWAL'
         AND status = 'PENDING'
         AND tx_hash IS NULL
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
       ORDER BY created_at ASC`,
      [staleManualMinutes],
    )) as TxIdRow[];

    if (staleManualRows.length > 0) {
      alerts.push({
        severity: 'critical',
        code: 'STALE_MANUAL_WITHDRAWALS',
        message: `Found ${staleManualRows.length} pending manual withdrawals older than ${staleManualMinutes} minutes`,
        context: { sampleTxIds: staleManualRows.slice(0, 5).map((row) => row.tx_id) },
      });
    }

    const staleConfirmingRows = (await dataSource.query(
      `SELECT tx_id, user_id, chain, type, tx_hash, confirmations, created_at
       FROM onchain_transactions
       WHERE status = 'CONFIRMING'
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
       ORDER BY created_at ASC`,
      [staleConfirmingMinutes],
    )) as TxIdRow[];

    if (staleConfirmingRows.length > 0) {
      alerts.push({
        severity: 'warning',
        code: 'STALE_CONFIRMING_TX',
        message: `Found ${staleConfirmingRows.length} confirming tx older than ${staleConfirmingMinutes} minutes`,
        context: { sampleTxIds: staleConfirmingRows.slice(0, 5).map((row) => row.tx_id) },
      });
    }

    const failedWithdrawRows = (await dataSource.query(
      `SELECT COUNT(*) AS total
       FROM onchain_transactions
       WHERE type = 'WITHDRAWAL'
         AND status = 'FAILED'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    )) as CountRow[];

    const failed24h = Number(failedWithdrawRows[0]?.total || 0);
    if (failed24h >= failedWithdrawLimit) {
      alerts.push({
        severity: 'critical',
        code: 'FAILED_WITHDRAWAL_SPIKE',
        message: `Failed withdrawals in last 24h (${failed24h}) reached threshold ${failedWithdrawLimit}`,
      });
    }

    const walletPairs = (await dataSource.query(
      `SELECT user_id, currency_id
       FROM wallets
       GROUP BY user_id, currency_id
       ORDER BY MAX(updated_at) DESC
       LIMIT ?`,
      [reconcileLimit],
    )) as WalletPairRow[];

    for (const pair of walletPairs) {
      const report = await walletsService.getWalletLedgerComparison(pair.user_id, pair.currency_id);
      const delta = new Decimal(report.discrepancy || '0').abs();
      if (delta.gt(discrepancyThreshold)) {
        alerts.push({
          severity: 'critical',
          code: 'RECONCILIATION_MISMATCH',
          message: `Wallet reconciliation mismatch exceeds threshold for user=${pair.user_id}, currency=${pair.currency_id}`,
          context: {
            discrepancy: report.discrepancy,
            threshold: discrepancyThreshold,
          },
        });
      }
    }
  } catch (error: unknown) {
    alerts.push({
      severity: 'critical',
      code: 'HEALTH_CHECK_EXECUTION_FAILED',
      message: errorMessage(error),
    });
  } finally {
    await app.close();
  }

  const criticalAlerts = alerts.filter((item) => item.severity === 'critical').length;
  const warningAlerts = alerts.filter((item) => item.severity === 'warning').length;

  const report = {
    reportAt,
    configSource: activeConfig ? 'db' : 'env',
    thresholds: {
      staleManualMinutes,
      staleConfirmingMinutes,
      failedWithdrawLimit,
      reconcileLimit,
      discrepancyThreshold,
      failOnCritical,
    },
    criticalAlerts,
    warningAlerts,
    alerts,
  };

  console.log(JSON.stringify(report, null, 2));

  if (criticalAlerts > 0 && failOnCritical) {
    process.exitCode = 1;
  }
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
