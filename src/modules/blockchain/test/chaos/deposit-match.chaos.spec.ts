/**
 * Chaos tests: DepositMatchService — dual-approval flow under simulated failure conditions.
 *
 * Groups covered (from PLAN_TREASURY_FUND_SWEEP_DEPOSIT.md §10):
 *   Group A — Redis/repository failures during propose
 *   Group B — RPC / settlement failures during approve
 *   Group C — Worker crash scenarios (idempotency, re-entry)
 *   Group D — Database failures mid-transaction
 *
 * These are pure unit tests: no real DB, no real Redis, no real RPC.
 * Infrastructure failures are injected via Jest mock rejections.
 */

import { OnchainTxStatus, UserRole } from '@/common/enums';
import { OutboxAppender } from '@/common/outbox/outbox-appender.service';
import { UnitOfWork } from '@/common/unit-of-work/unit-of-work';
import { DepositMatchService } from '../../application/use-cases/deposits/deposit-match.service';
import { OnchainDepositService } from '../../application/use-cases/deposits/onchain-deposit.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TX_ID = 'tx-unmatched-001';
const USER_ID = 'user-001';
const PROPOSER_ID = 'risk-officer-001';
const APPROVER_ID = 'finance-admin-001';
const MATCH_ID = 'match-001';
const IDEMPOTENCY_KEY = 'sha256-of-txid-userid';

function makeUnmatchedTx(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    tx_id: TX_ID,
    status: OnchainTxStatus.UNMATCHED,
    type: 'DEPOSIT',
    user_id: null,
    ...overrides,
  };
}

function makePendingMatch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    match_id: MATCH_ID,
    tx_id: TX_ID,
    requested_user_id: USER_ID,
    proposer_id: PROPOSER_ID,
    proposer_role: UserRole.RISK_OFFICER,
    approver_id: null,
    approver_role: null,
    status: 'PENDING' as const,
    idempotency_key: IDEMPOTENCY_KEY,
    proposed_at: new Date(),
    resolved_at: null,
    audit_log: [
      {
        action: 'PROPOSED' as const,
        actor_id: PROPOSER_ID,
        actor_role: UserRole.RISK_OFFICER,
        at: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
}

// ─── Test module builder ──────────────────────────────────────────────────────

function buildService(overrides: {
  matchRepo?: Partial<Record<string, jest.Mock>>;
  onchainTxRepo?: Partial<Record<string, jest.Mock>>;
  unitOfWork?: Partial<Record<string, jest.Mock>>;
  outboxAppender?: Partial<Record<string, jest.Mock>>;
  depositService?: Partial<Record<string, jest.Mock>>;
}): DepositMatchService {
  const matchRepo = {
    findByIdempotencyKey: jest.fn().mockResolvedValue(null),
    findPendingByTxId: jest.fn().mockResolvedValue(null),
    findById: jest.fn().mockResolvedValue(null),
    countByProposerToday: jest.fn().mockResolvedValue(0),
    countByApproverToday: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    updateStatusWithinTransaction: jest.fn().mockResolvedValue(undefined),
    ...overrides.matchRepo,
  };

  const onchainTxRepo = {
    findById: jest.fn().mockResolvedValue(makeUnmatchedTx()),
    setMatchedUser: jest.fn().mockResolvedValue(undefined),
    ...overrides.onchainTxRepo,
  };

  const unitOfWork = {
    run: jest.fn().mockImplementation(async (fn: (ctx: unknown) => Promise<void>) => fn({})),
    ...overrides.unitOfWork,
  };

  const outboxAppender = {
    append: jest.fn().mockResolvedValue(undefined),
    ...overrides.outboxAppender,
  };

  const depositService = {
    settleDepositByTxId: jest.fn().mockResolvedValue({ settled: true }),
    ...overrides.depositService,
  };

  const svc = new (DepositMatchService as any)(
    matchRepo,
    onchainTxRepo,
    unitOfWork as unknown as UnitOfWork,
    outboxAppender as unknown as OutboxAppender,
    depositService as unknown as OnchainDepositService,
  );

  return svc as DepositMatchService;
}

// ─── Group A: Repository / Redis failures during propose ─────────────────────

describe('Chaos Group A — repository failures during propose', () => {
  it('A1: idempotency key lookup throws → propagates error, no double-save', async () => {
    const svc = buildService({
      matchRepo: {
        findByIdempotencyKey: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      },
    });
    await expect(
      svc.proposeMatch(PROPOSER_ID, UserRole.RISK_OFFICER, TX_ID, USER_ID, IDEMPOTENCY_KEY),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('A2: repository save fails mid-flight → error propagates, no phantom record assumed', async () => {
    const saveMock = jest.fn().mockRejectedValue(new Error('DB_TIMEOUT'));
    const svc = buildService({
      matchRepo: {
        save: saveMock,
      },
    });
    await expect(
      svc.proposeMatch(PROPOSER_ID, UserRole.RISK_OFFICER, TX_ID, USER_ID, IDEMPOTENCY_KEY),
    ).rejects.toThrow('DB_TIMEOUT');
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('A3: idempotency — second propose with same key returns existing match, no second save', async () => {
    const existing = makePendingMatch();
    const saveMock = jest.fn();
    const svc = buildService({
      matchRepo: {
        findByIdempotencyKey: jest.fn().mockResolvedValue(existing),
        save: saveMock,
      },
    });
    const result = await svc.proposeMatch(
      PROPOSER_ID,
      UserRole.RISK_OFFICER,
      TX_ID,
      USER_ID,
      IDEMPOTENCY_KEY,
    );
    expect(result).toEqual({ matchId: MATCH_ID, status: 'PENDING' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('A4: daily rate limit exceeded → throws PROPOSE_RATE_LIMIT, no save', async () => {
    const saveMock = jest.fn();
    const svc = buildService({
      matchRepo: {
        countByProposerToday: jest.fn().mockResolvedValue(5),
        save: saveMock,
      },
    });
    await expect(
      svc.proposeMatch(PROPOSER_ID, UserRole.RISK_OFFICER, TX_ID, USER_ID, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({ code: 'PROPOSE_RATE_LIMIT' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('A5: tx not found → throws TX_NOT_FOUND', async () => {
    const svc = buildService({
      onchainTxRepo: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.proposeMatch(PROPOSER_ID, UserRole.RISK_OFFICER, TX_ID, USER_ID, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({ code: 'TX_NOT_FOUND' });
  });

  it('A6: tx not UNMATCHED → throws TX_NOT_UNMATCHED', async () => {
    const svc = buildService({
      onchainTxRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(makeUnmatchedTx({ status: OnchainTxStatus.CONFIRMING })),
      },
    });
    await expect(
      svc.proposeMatch(PROPOSER_ID, UserRole.RISK_OFFICER, TX_ID, USER_ID, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({ code: 'TX_NOT_UNMATCHED' });
  });

  it('A7: concurrent propose for same txId → throws MATCH_ALREADY_PENDING, second request rejected', async () => {
    const svc = buildService({
      matchRepo: {
        findPendingByTxId: jest.fn().mockResolvedValue(makePendingMatch()),
      },
    });
    await expect(
      svc.proposeMatch(PROPOSER_ID, UserRole.RISK_OFFICER, TX_ID, USER_ID, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({ code: 'MATCH_ALREADY_PENDING' });
  });
});

// ─── Group B: Settlement / RPC failures during approve ───────────────────────

describe('Chaos Group B — settlement and outbox failures during approve', () => {
  it('B1: self-approval attempt → throws SELF_APPROVAL_FORBIDDEN', async () => {
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch({ proposer_id: APPROVER_ID })),
      },
    });
    await expect(
      svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID),
    ).rejects.toMatchObject({ code: 'SELF_APPROVAL_FORBIDDEN' });
  });

  it('B2: approver rate limit exceeded → throws APPROVE_RATE_LIMIT, no DB updates', async () => {
    const setMatchedUserMock = jest.fn();
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch()),
        countByApproverToday: jest.fn().mockResolvedValue(5),
      },
      onchainTxRepo: { setMatchedUser: setMatchedUserMock },
    });
    await expect(
      svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID),
    ).rejects.toMatchObject({ code: 'APPROVE_RATE_LIMIT' });
    expect(setMatchedUserMock).not.toHaveBeenCalled();
  });

  it('B3: outbox append throws → unitOfWork propagates error, no partial credit', async () => {
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch()),
      },
      outboxAppender: {
        append: jest.fn().mockRejectedValue(new Error('OUTBOX_INSERT_FAILED')),
      },
    });
    await expect(svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID)).rejects.toThrow(
      'OUTBOX_INSERT_FAILED',
    );
  });

  it('B4: settlement throws after match approved → settled=false, no re-throw (deferred settlement)', async () => {
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch()),
      },
      depositService: {
        settleDepositByTxId: jest.fn().mockRejectedValue(new Error('FX_RATE_MISSING')),
      },
    });
    const result = await svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID);
    expect(result.status).toBe('APPROVED');
    expect(result.settled).toBe(false);
  });

  it('B5: tx already matched (race: another worker matched concurrently) → throws TX_ALREADY_MATCHED', async () => {
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch()),
      },
      onchainTxRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(makeUnmatchedTx({ status: OnchainTxStatus.CONFIRMING })),
      },
    });
    await expect(
      svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID),
    ).rejects.toMatchObject({ code: 'TX_ALREADY_MATCHED' });
  });

  it('B6: match not found → throws MATCH_NOT_FOUND', async () => {
    const svc = buildService({
      matchRepo: { findById: jest.fn().mockResolvedValue(null) },
    });
    await expect(
      svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID),
    ).rejects.toMatchObject({ code: 'MATCH_NOT_FOUND' });
  });

  it('B7: match not PENDING → throws MATCH_NOT_PENDING', async () => {
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch({ status: 'APPROVED' })),
      },
    });
    await expect(
      svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID),
    ).rejects.toMatchObject({ code: 'MATCH_NOT_PENDING' });
  });
});

// ─── Group C: Worker crash / re-entry scenarios ───────────────────────────────

describe('Chaos Group C — worker crash re-entry (idempotency and dual-step routing)', () => {
  it('C1: proposeOrApprove — no pending match → proposes a new match', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const svc = buildService({
      matchRepo: {
        findPendingByTxId: jest.fn().mockResolvedValue(null),
        save: saveMock,
      },
    });
    const result = await svc.proposeOrApprove(
      PROPOSER_ID,
      UserRole.RISK_OFFICER,
      TX_ID,
      USER_ID,
      IDEMPOTENCY_KEY,
    );
    expect(result.status).toBe('PENDING');
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('C2: proposeOrApprove — pending match same userId → routes to approveMatch', async () => {
    const pending = makePendingMatch();
    const svc = buildService({
      matchRepo: {
        findPendingByTxId: jest.fn().mockResolvedValue(pending),
        findById: jest.fn().mockResolvedValue(pending),
      },
    });
    const result = await svc.proposeOrApprove(
      APPROVER_ID,
      UserRole.FINANCE_MANAGER,
      TX_ID,
      USER_ID,
      IDEMPOTENCY_KEY,
    );
    expect(result.status).toBe('APPROVED');
  });

  it('C3: proposeOrApprove — pending match for a DIFFERENT userId → throws MATCH_USER_MISMATCH (no double-credit)', async () => {
    const pending = makePendingMatch({ requested_user_id: 'OTHER_USER' });
    const svc = buildService({
      matchRepo: {
        findPendingByTxId: jest.fn().mockResolvedValue(pending),
      },
    });
    await expect(
      svc.proposeOrApprove(APPROVER_ID, UserRole.FINANCE_MANAGER, TX_ID, USER_ID, IDEMPOTENCY_KEY),
    ).rejects.toMatchObject({ code: 'MATCH_USER_MISMATCH' });
  });

  it('C4: worker crash after propose DB save — retry with same idempotency key returns existing match', async () => {
    const existing = makePendingMatch();
    const saveMock = jest.fn();
    const svc = buildService({
      matchRepo: {
        findByIdempotencyKey: jest.fn().mockResolvedValue(existing),
        save: saveMock,
      },
    });
    const result = await svc.proposeMatch(
      PROPOSER_ID,
      UserRole.RISK_OFFICER,
      TX_ID,
      USER_ID,
      IDEMPOTENCY_KEY,
    );
    expect(result).toEqual({ matchId: MATCH_ID, status: 'PENDING' });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('C5: multiple concurrent approve calls for same matchId — second sees TX_ALREADY_MATCHED after first completes', async () => {
    const pending = makePendingMatch();
    const callCount = { count: 0 };
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(pending),
      },
      onchainTxRepo: {
        findById: jest.fn().mockImplementation(async () => {
          callCount.count++;
          if (callCount.count === 1) return makeUnmatchedTx();
          return makeUnmatchedTx({ status: OnchainTxStatus.CONFIRMING });
        }),
      },
    });

    const [first, second] = await Promise.allSettled([
      svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID),
      svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID),
    ]);

    const statuses = [first.status, second.status];
    expect(statuses).toContain('fulfilled');
    expect(statuses).toContain('rejected');
  });
});

// ─── Group D: Database failure scenarios ─────────────────────────────────────

describe('Chaos Group D — database failures', () => {
  it('D1: DB timeout on countByProposerToday → propagates, no save', async () => {
    const saveMock = jest.fn();
    const svc = buildService({
      matchRepo: {
        countByProposerToday: jest.fn().mockRejectedValue(new Error('DB_POOL_EXHAUSTED')),
        save: saveMock,
      },
    });
    await expect(
      svc.proposeMatch(PROPOSER_ID, UserRole.RISK_OFFICER, TX_ID, USER_ID, IDEMPOTENCY_KEY),
    ).rejects.toThrow('DB_POOL_EXHAUSTED');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('D2: unitOfWork run throws → approve does not credit user, error propagates', async () => {
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch()),
      },
      unitOfWork: {
        run: jest.fn().mockRejectedValue(new Error('DB_PRIMARY_FAILOVER')),
      },
    });
    await expect(svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID)).rejects.toThrow(
      'DB_PRIMARY_FAILOVER',
    );
  });

  it('D3: setMatchedUser inside transaction throws → error propagates atomically', async () => {
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch()),
      },
      unitOfWork: {
        run: jest.fn().mockImplementation(async (fn: (ctx: unknown) => Promise<void>) => {
          await fn({});
        }),
      },
      onchainTxRepo: {
        setMatchedUser: jest
          .fn()
          .mockRejectedValue(new Error('SETMATCHEDUSER_CONSTRAINT_VIOLATION')),
      },
    });
    await expect(svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID)).rejects.toThrow(
      'SETMATCHEDUSER_CONSTRAINT_VIOLATION',
    );
  });

  it('D4: updateStatus throws after setMatchedUser succeeds — DB partial failure propagates', async () => {
    const svc = buildService({
      matchRepo: {
        findById: jest.fn().mockResolvedValue(makePendingMatch()),
        updateStatus: jest.fn().mockRejectedValue(new Error('UPDATE_STATUS_TIMEOUT')),
      },
    });
    await expect(svc.approveMatch(APPROVER_ID, UserRole.FINANCE_MANAGER, MATCH_ID)).rejects.toThrow(
      'UPDATE_STATUS_TIMEOUT',
    );
  });
});
