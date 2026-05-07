import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Injectable } from '@nestjs/common';
import { newUuid } from '@/common/utils/uuid.util';

export type OutboxReplayAuditAction = 'requeue_one' | 'requeue_bulk' | 'purge_abandoned';

export type OutboxReplayAuditRowSnapshot = {
  id: string;
  eventType: string;
  kafkaTopic: string | null;
  publishAttempts: number;
  lastPublishError: string | null;
  deadLetteredAt: string | null;
};

export type OutboxReplayAuditRecord = {
  auditId: string;
  recordedAt: string;
  action: OutboxReplayAuditAction;
  actorUserId: string;
  actorRole: string;
  reason: string | null;
  targetRowId: string | null;
  requestedLimit: number | null;
  selectedRowCount: number;
  requeuedRowCount: number;
  rowSnapshots: OutboxReplayAuditRowSnapshot[];
};

type RecordReplayAuditInput = Omit<OutboxReplayAuditRecord, 'auditId' | 'recordedAt'>;

@Injectable()
export class OutboxReplayAuditService {
  async record(input: RecordReplayAuditInput): Promise<{ auditId: string; outputFile: string }> {
    const auditId = newUuid();
    const recordedAt = new Date().toISOString();
    const reportDate = recordedAt.slice(0, 10);
    const outputDir = path.join(process.cwd(), 'reports', 'outbox-replay');
    const outputFile = path.join(outputDir, `${reportDate}.json`);

    await fs.mkdir(outputDir, { recursive: true });

    let history: OutboxReplayAuditRecord[] = [];
    try {
      const existing = await fs.readFile(outputFile, 'utf8');
      const parsed = JSON.parse(existing);
      if (Array.isArray(parsed)) {
        history = parsed as OutboxReplayAuditRecord[];
      }
    } catch {
      history = [];
    }

    history.push({
      auditId,
      recordedAt,
      ...input,
    });

    await fs.writeFile(outputFile, JSON.stringify(history, null, 2), 'utf8');

    return {
      auditId,
      outputFile: path.join('reports', 'outbox-replay', `${reportDate}.json`).replace(/\\/g, '/'),
    };
  }

  async list(limit = 20): Promise<OutboxReplayAuditRecord[]> {
    const outputDir = path.join(process.cwd(), 'reports', 'outbox-replay');

    let files: string[] = [];
    try {
      files = await fs.readdir(outputDir);
    } catch {
      return [];
    }

    const records: OutboxReplayAuditRecord[] = [];

    for (const file of files.filter((value) => value.endsWith('.json'))) {
      try {
        const fullPath = path.join(outputDir, file);
        const raw = await fs.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          continue;
        }

        for (const item of parsed) {
          if (!item || typeof item !== 'object') {
            continue;
          }

          const auditId = String((item as { auditId?: unknown }).auditId ?? '').trim();
          const recordedAt = String((item as { recordedAt?: unknown }).recordedAt ?? '').trim();
          const action = String((item as { action?: unknown }).action ?? '').trim();

          const VALID_ACTIONS = ['requeue_one', 'requeue_bulk', 'purge_abandoned'];
          if (!auditId || !recordedAt || !VALID_ACTIONS.includes(action)) {
            continue;
          }

          records.push(item as OutboxReplayAuditRecord);
        }
      } catch {}
    }

    return records
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
      .slice(0, Math.max(1, Math.min(limit, 500)));
  }
}
