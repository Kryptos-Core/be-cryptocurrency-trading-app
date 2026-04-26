import { Test } from '@nestjs/testing';
import { TradingOpsController } from './trading-ops.controller';
import { GoRolloutReadinessService } from './services/go-rollout-readiness.service';
import { PublicWsPayloadParityService } from './services/public-ws-payload-parity.service';

describe('TradingOpsController', () => {
  it('returns public ws parity report', async () => {
    const report = {
      source: 'nestjs',
      checkedAt: '2026-04-26T00:00:00.000Z',
      ticker: { hasSample: true, contractValid: true, missingFields: [] },
      ohlc: { hasSample: true, contractValid: true, missingFields: [] },
      goAggregatorParity: { comparedPairs: 1, driftPairs: 0, topDrifts: [] },
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TradingOpsController],
      providers: [
        {
          provide: PublicWsPayloadParityService,
          useValue: {
            getReport: jest.fn().mockReturnValue(report),
          },
        },
        {
          provide: GoRolloutReadinessService,
          useValue: {
            getReadiness: jest.fn(),
            snapshotReadiness: jest.fn(),
            listSnapshots: jest.fn(),
            getLatestSnapshot: jest.fn(),
            listRollbackDrills: jest.fn(),
            getLatestRollbackDrill: jest.fn(),
            recordRollbackDrill: jest.fn(),
          },
        },
      ],
    }).compile();

    const controller = moduleRef.get(TradingOpsController);
    expect(controller.getPublicWsParity()).toEqual(report);
  });

  it('returns go rollout readiness report', async () => {
    const readiness = { ready: true, blockers: [] };

    const goRolloutReadinessService = {
      getReadiness: jest.fn().mockResolvedValue(readiness),
      snapshotReadiness: jest.fn(),
      listSnapshots: jest.fn(),
      getLatestSnapshot: jest.fn(),
      listRollbackDrills: jest.fn(),
      getLatestRollbackDrill: jest.fn(),
      recordRollbackDrill: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TradingOpsController],
      providers: [
        { provide: PublicWsPayloadParityService, useValue: { getReport: jest.fn() } },
        { provide: GoRolloutReadinessService, useValue: goRolloutReadinessService },
      ],
    }).compile();

    const controller = moduleRef.get(TradingOpsController);
    await expect(controller.getGoRolloutReadiness()).resolves.toEqual(readiness);
  });

  it('creates go rollout readiness snapshot', async () => {
    const goRolloutReadinessService = {
      getReadiness: jest.fn(),
      snapshotReadiness: jest.fn().mockResolvedValue({
        outputFile: 'reports/go-rollout/2026-04-26.json',
        reportAt: '2026-04-26T00:00:00.000Z',
      }),
      listSnapshots: jest.fn(),
      getLatestSnapshot: jest.fn(),
      listRollbackDrills: jest.fn(),
      getLatestRollbackDrill: jest.fn(),
      recordRollbackDrill: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TradingOpsController],
      providers: [
        { provide: PublicWsPayloadParityService, useValue: { getReport: jest.fn() } },
        { provide: GoRolloutReadinessService, useValue: goRolloutReadinessService },
      ],
    }).compile();

    const controller = moduleRef.get(TradingOpsController);
    await expect(controller.snapshotGoRolloutReadiness('admin-user')).resolves.toEqual({
      outputFile: 'reports/go-rollout/2026-04-26.json',
      reportAt: '2026-04-26T00:00:00.000Z',
    });
    expect(goRolloutReadinessService.snapshotReadiness).toHaveBeenCalledWith('admin-user');
  });

  it('returns go rollout readiness snapshots', async () => {
    const snapshots = [{ reportAt: '2026-04-26T00:00:00.000Z' }];

    const goRolloutReadinessService = {
      getReadiness: jest.fn(),
      snapshotReadiness: jest.fn(),
      listSnapshots: jest.fn().mockResolvedValue(snapshots),
      getLatestSnapshot: jest.fn(),
      listRollbackDrills: jest.fn(),
      getLatestRollbackDrill: jest.fn(),
      recordRollbackDrill: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TradingOpsController],
      providers: [
        { provide: PublicWsPayloadParityService, useValue: { getReport: jest.fn() } },
        { provide: GoRolloutReadinessService, useValue: goRolloutReadinessService },
      ],
    }).compile();

    const controller = moduleRef.get(TradingOpsController);
    await expect(controller.getGoRolloutReadinessSnapshots(10)).resolves.toEqual(snapshots);
    expect(goRolloutReadinessService.listSnapshots).toHaveBeenCalledWith(10);
  });

  it('returns latest go rollout readiness snapshot', async () => {
    const latest = { reportAt: '2026-04-26T00:00:00.000Z' };

    const goRolloutReadinessService = {
      getReadiness: jest.fn(),
      snapshotReadiness: jest.fn(),
      listSnapshots: jest.fn(),
      getLatestSnapshot: jest.fn().mockResolvedValue(latest),
      listRollbackDrills: jest.fn(),
      getLatestRollbackDrill: jest.fn(),
      recordRollbackDrill: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TradingOpsController],
      providers: [
        { provide: PublicWsPayloadParityService, useValue: { getReport: jest.fn() } },
        { provide: GoRolloutReadinessService, useValue: goRolloutReadinessService },
      ],
    }).compile();

    const controller = moduleRef.get(TradingOpsController);
    await expect(controller.getLatestGoRolloutReadinessSnapshot()).resolves.toEqual(latest);
  });

  it('records and reads rollback drill evidence', async () => {
    const latest = {
      drilledAt: '2026-04-26T00:00:00.000Z',
      actorUserId: 'admin-user',
      fromSource: 'go_aggregator',
      toSource: 'nestjs',
      success: true,
    };

    const goRolloutReadinessService = {
      getReadiness: jest.fn(),
      snapshotReadiness: jest.fn(),
      listSnapshots: jest.fn(),
      getLatestSnapshot: jest.fn(),
      listRollbackDrills: jest.fn().mockResolvedValue([latest]),
      getLatestRollbackDrill: jest.fn().mockResolvedValue(latest),
      recordRollbackDrill: jest.fn().mockResolvedValue(latest),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TradingOpsController],
      providers: [
        { provide: PublicWsPayloadParityService, useValue: { getReport: jest.fn() } },
        { provide: GoRolloutReadinessService, useValue: goRolloutReadinessService },
      ],
    }).compile();

    const controller = moduleRef.get(TradingOpsController);

    await expect(controller.getRollbackDrills(5)).resolves.toEqual([latest]);
    await expect(controller.getLatestRollbackDrill()).resolves.toEqual(latest);
    await expect(
      controller.recordRollbackDrill('admin-user', 'go_aggregator', 'nestjs', true, 'drill ok'),
    ).resolves.toEqual(latest);

    expect(goRolloutReadinessService.listRollbackDrills).toHaveBeenCalledWith(5);
    expect(goRolloutReadinessService.recordRollbackDrill).toHaveBeenCalledWith({
      actorUserId: 'admin-user',
      fromSource: 'go_aggregator',
      toSource: 'nestjs',
      success: true,
      notes: 'drill ok',
    });
  });
});
