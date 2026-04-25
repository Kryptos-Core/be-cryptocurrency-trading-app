import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ReadMarketTrade } from '@/entities/read-market-trade.entity';

@Injectable()
export class MarketReadModelReconciliationService {
  private readonly logger = new Logger(MarketReadModelReconciliationService.name);

  constructor(private readonly dataSource: DataSource) {}

  async reconcileTrades(windowHours = 24): Promise<{
    coreCount: number;
    readModelCount: number;
    missingTrades: string[];
    drift: number;
    windowHours: number;
  }> {
    const coreRows = (await this.dataSource.query(
      `SELECT trade_id
         FROM trades
        WHERE created_at >= NOW() - ($1::text || ' hours')::interval
        ORDER BY created_at DESC`,
      [String(windowHours)],
    )) as Array<{ trade_id: string }>;

    const readRows = await this.dataSource
      .getRepository(ReadMarketTrade)
      .createQueryBuilder('t')
      .where(`t.executed_at >= NOW() - (:hours || ' hours')::interval`, { hours: String(windowHours) })
      .orderBy('t.executed_at', 'DESC')
      .getMany();

    const coreIds = new Set<string>((coreRows ?? []).map((row) => row.trade_id));
    const readIds = new Set<string>(readRows.map((row) => row.trade_id));
    const missingTrades = Array.from(coreIds)
      .filter((id: string) => !readIds.has(id))
      .slice(0, 100);

    return {
      coreCount: coreIds.size,
      readModelCount: readIds.size,
      missingTrades,
      drift: coreIds.size - readIds.size,
      windowHours,
    };
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async logScheduledTradeReconciliation(): Promise<void> {
    try {
      const report = await this.reconcileTrades(24);
      if (report.drift !== 0 || report.missingTrades.length > 0) {
        this.logger.warn(
          `Market trade reconciliation drift=${report.drift} core=${report.coreCount} read=${report.readModelCount} missing=${report.missingTrades.length}`,
        );
      } else {
        this.logger.debug(
          `Market trade reconciliation ok core=${report.coreCount} read=${report.readModelCount}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Market trade reconciliation failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
