import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import Decimal from 'decimal.js';
import { AppModule } from '../src/app.module';
import { WalletsService } from '../src/modules/wallets/wallets.service';
import { SystemConfigService } from '../src/modules/system-config/system-config.service';

type Severity = 'critical' | 'warning';

interface AlertItem {
  severity: Severity;
  code: string;
  message: string;
  context?: Record<string, unknown>;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dataSource = app.get(DataSource);
  const walletsService = app.get(WalletsService);
  const systemConfig = app.get(SystemConfigService);

  const reportAt = new Date().toISOString();
  const alerts: AlertItem[] = [];

  const staleManualMinutes = envNumber('TREASURY_ALERT_STALE_MANUAL_MINUTES', 15);
  const staleConfirmingMinutes = envNumber('TREASURY_ALERT_STALE_CONFIRMING_MINUTES', 30);
  const failedWithdrawLimit = envNumber('TREASURY_ALERT_FAILED_WITHDRAWALS_24H', 10);
  const reconcileLimit = envNumber('TREASURY_RECONCILE_PAIR_LIMIT', 100);
  const discrepancyThreshold = await systemConfig.getEffectiveString('WALLET_RECONCILIATION_THRESHOLD');
  const failOnCritical = (process.env.TREASURY_HEALTH_FAIL_ON_CRITICAL || 'false').toLowerCase() === 'true';

  try {
    const staleManualRows = await dataSource.query(
      `SELECT tx_id, user_id, chain, amount, created_at
       FROM onchain_transactions
       WHERE type = 'WITHDRAWAL'
         AND status = 'PENDING'
         AND tx_hash IS NULL
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
       ORDER BY created_at ASC`,
      [staleManualMinutes],
    );

    if ((staleManualRows || []).length > 0) {
      alerts.push({
        severity: 'critical',
        code: 'STALE_MANUAL_WITHDRAWALS',
        message: `Found ${(staleManualRows || []).length} pending manual withdrawals older than ${staleManualMinutes} minutes`,
        context: { sampleTxIds: (staleManualRows || []).slice(0, 5).map((r: any) => r.tx_id) },
      });
    }

    const staleConfirmingRows = await dataSource.query(
      `SELECT tx_id, user_id, chain, type, tx_hash, confirmations, created_at
       FROM onchain_transactions
       WHERE status = 'CONFIRMING'
         AND created_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
       ORDER BY created_at ASC`,
      [staleConfirmingMinutes],
    );

    if ((staleConfirmingRows || []).length > 0) {
      alerts.push({
        severity: 'warning',
        code: 'STALE_CONFIRMING_TX',
        message: `Found ${(staleConfirmingRows || []).length} confirming tx older than ${staleConfirmingMinutes} minutes`,
        context: { sampleTxIds: (staleConfirmingRows || []).slice(0, 5).map((r: any) => r.tx_id) },
      });
    }

    const failedWithdrawRows = await dataSource.query(
      `SELECT COUNT(*) AS total
       FROM onchain_transactions
       WHERE type = 'WITHDRAWAL'
         AND status = 'FAILED'
         AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
    );

    const failed24h = Number(failedWithdrawRows?.[0]?.total || 0);
    if (failed24h >= failedWithdrawLimit) {
      alerts.push({
        severity: 'critical',
        code: 'FAILED_WITHDRAWAL_SPIKE',
        message: `Failed withdrawals in last 24h (${failed24h}) reached threshold ${failedWithdrawLimit}`,
      });
    }

    const walletPairs = await dataSource.query(
      `SELECT user_id, currency_id
       FROM wallets
       GROUP BY user_id, currency_id
       ORDER BY MAX(updated_at) DESC
       LIMIT ?`,
      [reconcileLimit],
    );

    const reconcileResults: Array<{
      userId: string;
      currencyId: string;
      internalBalance: string;
      externalBalance: string;
      discrepancy: string;
      status: string;
    }> = [];

    for (const pair of walletPairs || []) {
      try {
        const result = await walletsService.reconcileBalance(String(pair.user_id), String(pair.currency_id));
        reconcileResults.push({
          userId: String(pair.user_id),
          currencyId: String(pair.currency_id),
          ...result,
        });
      } catch (error: any) {
        alerts.push({
          severity: 'warning',
          code: 'RECONCILE_CALL_FAILED',
          message: `Reconcile failed for user=${pair.user_id}, currency=${pair.currency_id}`,
          context: { error: error?.message || String(error) },
        });
      }
    }

    const highDiscrepancy = reconcileResults.filter((item) =>
      new Decimal(item.discrepancy || '0').abs().greaterThan(discrepancyThreshold),
    );

    if (highDiscrepancy.length > 0) {
      alerts.push({
        severity: 'critical',
        code: 'RECONCILE_MISMATCH',
        message: `Found ${highDiscrepancy.length} wallet discrepancies > ${discrepancyThreshold}`,
        context: {
          samples: highDiscrepancy.slice(0, 5).map((x) => ({
            userId: x.userId,
            currencyId: x.currencyId,
            discrepancy: x.discrepancy,
          })),
        },
      });
    }

    const report = {
      reportAt,
      staleManualMinutes,
      staleConfirmingMinutes,
      failedWithdrawLimit,
      reconcileLimit,
      discrepancyThreshold,
      failOnCritical,
      summary: {
        walletPairsChecked: reconcileResults.length,
        alertsTotal: alerts.length,
        criticalAlerts: alerts.filter((a) => a.severity === 'critical').length,
      },
      alerts,
    };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));

    if (failOnCritical && alerts.some((x) => x.severity === 'critical')) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
