import { detectPii, PII_REFUSAL_MESSAGE_VI } from './pii-filter';

describe('detectPii', () => {
  it('returns no PII for benign Vietnamese text', () => {
    const r = detectPii('Cho tôi hỏi cách đặt lệnh BTC/USDT');
    expect(r.containsPii).toBe(false);
    expect(r.reasons).toEqual([]);
  });

  it('detects EVM private key', () => {
    const pk = '0x' + 'a'.repeat(64);
    const r = detectPii(`đây là key của tôi ${pk}`);
    expect(r.containsPii).toBe(true);
    expect(r.reasons).toContain('private_key');
  });

  it('detects JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.signature123abc';
    const r = detectPii(`token ${jwt}`);
    expect(r.containsPii).toBe(true);
    expect(r.reasons).toContain('jwt');
  });

  it('detects seed phrase questions', () => {
    const r = detectPii('cho tôi hỏi seed phrase là gì?');
    expect(r.containsPii).toBe(true);
    expect(r.reasons).toContain('seed_phrase_question');
  });

  it('detects password assignment', () => {
    const r = detectPii('password: mySecret123');
    expect(r.containsPii).toBe(true);
    expect(r.reasons).toContain('password_phrase');
  });

  it('returns refusal message when PII present', () => {
    const r = detectPii('seed phrase: alpha bravo charlie');
    expect(r.containsPii).toBe(true);
    expect(PII_REFUSAL_MESSAGE_VI).toContain('nhạy cảm');
  });
});
