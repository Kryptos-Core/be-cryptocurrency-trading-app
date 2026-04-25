import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { WALLET_REPOSITORY, type WalletRepositoryPort } from '@/modules/wallets/domain/ports';
import { ReconcileBalanceUseCase } from './reconcile-balance.use-case';

export interface ReconciliationReportResult {
  reportDate: string;
  reportAt: string;
  outputFile: string;
  summary: {
    actorUserId: string;
    checked: number;
    balanced: number;
    discrepancyDetected: number;
    failed: number;
  };
}

@Injectable()
export class ExportReconciliationReportUseCase {
  private readonly logger = new Logger(ExportReconciliationReportUseCase.name);

  constructor(
    @Inject(WALLET_REPOSITORY) private readonly walletRepo: WalletRepositoryPort,
    private readonly reconcileBalanceUseCase: ReconcileBalanceUseCase,
  ) {}

  async execute(actorUserId: string, limit: number = 100): Promise<ReconciliationReportResult> {
    const reportAt = new Date();
    const reportDate = reportAt.toISOString().slice(0, 10);
    const safeLimit = Math.min(Math.max(limit, 1), 1000);

    const pairs = await this.walletRepo.findWalletPairs(safeLimit);
    const items: Array<{
      userId: string;
      currencyId: string;
      status: string;
      internalBalance?: string;
      externalBalance?: string;
      discrepancy?: string;
      error?: string;
    }> = [];

    for (const pair of pairs) {
      try {
        const result = await this.reconcileBalanceUseCase.execute(pair.userId, pair.currencyId);
        items.push({
          userId: pair.userId,
          currencyId: pair.currencyId,
          status: result.status,
          internalBalance: result.internalBalance,
          externalBalance: result.externalBalance,
          discrepancy: result.discrepancy,
        });
      } catch (error: unknown) {
        items.push({
          userId: pair.userId,
          currencyId: pair.currencyId,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const balanced = items.filter((i) => i.status === 'BALANCED').length;
    const discrepancyDetected = items.filter((i) => i.status === 'DISCREPANCY_DETECTED').length;
    const failed = items.filter((i) => i.status === 'FAILED').length;

    const entry = {
      reportAt: reportAt.toISOString(),
      actorUserId,
      limit: safeLimit,
      summary: { checked: items.length, balanced, discrepancyDetected, failed },
      items,
    };

    const outputDir = path.join(process.cwd(), 'reports', 'reconciliation');
    const outputFile = path.join(outputDir, `${reportDate}.json`);
    await fs.mkdir(outputDir, { recursive: true });

    let history: unknown[] = [];
    try {
      const existing = await fs.readFile(outputFile, 'utf8');
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed)) history = parsed;
    } catch {
      history = [];
    }

    history.push(entry);
    await fs.writeFile(outputFile, JSON.stringify(history, null, 2), 'utf8');

    this.logger.log(
      `[ReconciliationExport] actor=${actorUserId}, checked=${items.length}, discrepancies=${discrepancyDetected}, failed=${failed}, file=${outputFile}`,
    );

    return {
      reportDate,
      reportAt: entry.reportAt,
      outputFile,
      summary: { actorUserId, checked: items.length, balanced, discrepancyDetected, failed },
    };
  }
}
