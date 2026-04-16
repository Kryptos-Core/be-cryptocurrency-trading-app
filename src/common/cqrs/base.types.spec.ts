import { BaseCommand, BaseQuery } from './base.types';

// Concrete command for testing
class CreateOrderCommand extends BaseCommand {
  constructor(
    public readonly userId: string,
    public readonly amount: string,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

// Concrete query for testing
class GetOrdersByUserQuery extends BaseQuery {
  constructor(
    public readonly userId: string,
    public readonly page: number,
    correlationId?: string,
  ) {
    super(correlationId);
  }
}

describe('CQS Base Types', () => {
  // ─── BaseCommand ──────────────────────────────────────────────────────────

  it('should create a command with a generated correlationId', () => {
    const cmd = new CreateOrderCommand('user-1', '0.5');
    expect(cmd.correlationId).toBeDefined();
    expect(cmd.correlationId).toMatch(/^cmd-/);
    expect(cmd.userId).toBe('user-1');
    expect(cmd.amount).toBe('0.5');
  });

  it('should accept a custom correlationId', () => {
    const cmd = new CreateOrderCommand('user-1', '0.5', 'trace-abc-123');
    expect(cmd.correlationId).toBe('trace-abc-123');
  });

  it('should generate unique correlationIds for separate commands', () => {
    const cmd1 = new CreateOrderCommand('u1', '1');
    const cmd2 = new CreateOrderCommand('u2', '2');
    expect(cmd1.correlationId).not.toBe(cmd2.correlationId);
  });

  // ─── BaseQuery ────────────────────────────────────────────────────────────

  it('should create a query with a generated correlationId', () => {
    const qry = new GetOrdersByUserQuery('user-1', 1);
    expect(qry.correlationId).toBeDefined();
    expect(qry.correlationId).toMatch(/^qry-/);
    expect(qry.userId).toBe('user-1');
    expect(qry.page).toBe(1);
  });

  it('should accept a custom correlationId for query', () => {
    const qry = new GetOrdersByUserQuery('user-1', 1, 'req-xyz');
    expect(qry.correlationId).toBe('req-xyz');
  });

  it('should generate unique correlationIds for separate queries', () => {
    const q1 = new GetOrdersByUserQuery('u1', 1);
    const q2 = new GetOrdersByUserQuery('u2', 2);
    expect(q1.correlationId).not.toBe(q2.correlationId);
  });

  // ─── Commands distinct from Queries ───────────────────────────────────────

  it('command correlationId should start with cmd- prefix', () => {
    const cmd = new CreateOrderCommand('u1', '1');
    expect(cmd.correlationId.startsWith('cmd-')).toBe(true);
  });

  it('query correlationId should start with qry- prefix', () => {
    const qry = new GetOrdersByUserQuery('u1', 1);
    expect(qry.correlationId.startsWith('qry-')).toBe(true);
  });
});
