import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { OutboxReplayAuditService } from './outbox-replay-audit.service';

describe('OutboxReplayAuditService', () => {
  let service: OutboxReplayAuditService;
  let tempRoot: string;

  beforeEach(async () => {
    service = new OutboxReplayAuditService();
    tempRoot = path.join(process.cwd(), '.tmp', `outbox-replay-${Date.now()}-${Math.random()}`);
    await fs.mkdir(tempRoot, { recursive: true });
    jest.spyOn(process, 'cwd').mockReturnValue(tempRoot);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('records replay audit into date-partitioned report file', async () => {
    const result = await service.record({
      action: 'requeue_one',
      actorUserId: 'admin-1',
      actorRole: 'ADMIN',
      reason: 'manual replay',
      targetRowId: 'outbox-1',
      requestedLimit: null,
      selectedRowCount: 1,
      requeuedRowCount: 1,
      rowSnapshots: [
        {
          id: 'outbox-1',
          eventType: 'trade.executed',
          kafkaTopic: 'trades.executed',
          publishAttempts: 2,
          lastPublishError: 'boom',
          deadLetteredAt: '2026-04-26T09:00:00.000Z',
        },
      ],
    });

    expect(result.auditId).toEqual(expect.any(String));
    expect(result.outputFile).toMatch(/^reports\/outbox-replay\/\d{4}-\d{2}-\d{2}\.json$/);

    const reportPath = path.join(tempRoot, result.outputFile);
    const raw = await fs.readFile(reportPath, 'utf8');
    const parsed = JSON.parse(raw);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(
      expect.objectContaining({
        auditId: result.auditId,
        action: 'requeue_one',
        actorUserId: 'admin-1',
        selectedRowCount: 1,
        requeuedRowCount: 1,
      }),
    );
  });

  it('lists latest replay audit records sorted by recordedAt descending', async () => {
    const reportDir = path.join(tempRoot, 'reports', 'outbox-replay');
    await fs.mkdir(reportDir, { recursive: true });
    await fs.writeFile(
      path.join(reportDir, '2026-04-25.json'),
      JSON.stringify([
        {
          auditId: 'a-old',
          recordedAt: '2026-04-25T08:00:00.000Z',
          action: 'requeue_bulk',
          actorUserId: 'risk-1',
          actorRole: 'RISK_OFFICER',
          reason: null,
          targetRowId: null,
          requestedLimit: 10,
          selectedRowCount: 3,
          requeuedRowCount: 3,
          rowSnapshots: [],
        },
      ]),
      'utf8',
    );
    await fs.writeFile(
      path.join(reportDir, '2026-04-26.json'),
      JSON.stringify([
        {
          auditId: 'a-new',
          recordedAt: '2026-04-26T08:00:00.000Z',
          action: 'requeue_one',
          actorUserId: 'admin-1',
          actorRole: 'ADMIN',
          reason: 'retry',
          targetRowId: 'x',
          requestedLimit: null,
          selectedRowCount: 1,
          requeuedRowCount: 1,
          rowSnapshots: [],
        },
      ]),
      'utf8',
    );

    const items = await service.list(10);

    expect(items.map((item) => item.auditId)).toEqual(['a-new', 'a-old']);
  });
});
