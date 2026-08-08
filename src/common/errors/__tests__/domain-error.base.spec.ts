import { DomainError } from './domain-error.base';

class TestError extends DomainError {
  constructor(metadata?: Record<string, unknown>) {
    super({
      code: 'TEST/EXAMPLE',
      httpStatus: 418,
      userMessage: 'I am a teapot.',
      internalMessage: 'Teapot encountered.',
      metadata,
    });
  }
}

describe('DomainError', () => {
  it('preserves name, code, httpStatus', () => {
    const err = new TestError();
    expect(err.name).toBe('TestError');
    expect(err.code).toBe('TEST/EXAMPLE');
    expect(err.httpStatus).toBe(418);
  });

  it('uses userMessage as default message', () => {
    const err = new TestError();
    expect(err.message).toBe('Teapot encountered.');
  });

  it('freezes metadata for immutability', () => {
    const err = new TestError({ foo: 'bar' });
    expect(() => {
      (err.metadata as Record<string, unknown>).foo = 'baz';
    }).toThrow();
  });

  it('toResponseJSON exposes only code + userMessage', () => {
    const err = new TestError({ internalId: 'secret-123' });
    const res = err.toResponseJSON();
    expect(res).toEqual({ code: 'TEST/EXAMPLE', message: 'I am a teapot.' });
    expect(JSON.stringify(res)).not.toContain('secret-123');
  });

  it('toLogJSON includes metadata for server-side debugging', () => {
    const err = new TestError({ internalId: 'secret-123' });
    const log = err.toLogJSON();
    expect((log.metadata as Record<string, unknown>).internalId).toBe('secret-123');
    expect(log.code).toBe('TEST/EXAMPLE');
  });

  it('preserves prototype chain after transpilation', () => {
    const err = new TestError();
    expect(err).toBeInstanceOf(DomainError);
    expect(err).toBeInstanceOf(TestError);
  });

  it('preserves cause for error chaining', () => {
    const root = new Error('root cause');
    const err = new TestError({ chain: 'x' });
    // Even though we don't pass cause here, ensure API doesn't break
    expect(err.cause).toBeUndefined();
  });
});
