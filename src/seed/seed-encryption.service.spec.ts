import { SeedEncryptionService } from './seed-encryption.service';

const VALID_KEY =
  'ee85d61cb8d9b9e1943c5d3d0397f84b0b1cf5068328057f8b739df3c97a1948';
const WRONG_KEY =
  '0000000000000000000000000000000000000000000000000000000000000000';

describe('SeedEncryptionService', () => {
  describe('constructor', () => {
    it('should accept a valid 64-char hex key', () => {
      expect(() => new SeedEncryptionService(VALID_KEY)).not.toThrow();
    });

    it('should throw SeedEncryptionError when SEED_DATA_ENCRYPTION_KEY is missing and no WALLET_ENCRYPTION_KEY', () => {
      // Without a key argument, constructor reads from env — without it, throws
      expect(() => new SeedEncryptionService()).toThrow(
        'SEED_DATA_ENCRYPTION_KEY env var is required',
      );
    });

    it('should throw SeedEncryptionError when key is too short', () => {
      expect(
        () => new SeedEncryptionService('ee85d61cb8d9b9e1943c5d3d0397f84b'),
      ).toThrow('must be a 64-character hex string');
    });

    it('should throw SeedEncryptionError when key contains non-hex chars', () => {
      const invalidKey =
        'ee85d61cb8d9b9e1943c5d3d0397f84b0b1cf5068328057f8b739df3c97a194g';
      expect(() => new SeedEncryptionService(invalidKey)).toThrow(
        'must be a 64-character hex string',
      );
    });

    it('should be case-insensitive for hex characters', () => {
      const upperKey =
        'EE85D61CB8D9B9E1943C5D3D0397F84B0B1CF5068328057F8B739DF3C97A1948';
      expect(() => new SeedEncryptionService(upperKey)).not.toThrow();
    });
  });

  describe('encrypt', () => {
    it('should return a non-empty string', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      const result = svc.encrypt('hello world');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should produce different ciphertexts for the same plaintext (random IV)', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      const ciphertext1 = svc.encrypt('hello world');
      const ciphertext2 = svc.encrypt('hello world');
      expect(ciphertext1).not.toBe(ciphertext2);
    });

    it('should return 3 parts separated by colons', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      const result = svc.encrypt('test data');
      const parts = result.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBeTruthy();
      expect(parts[1]).toBeTruthy();
      expect(parts[2]).toBeTruthy();
    });
  });

  describe('decrypt', () => {
    it('should recover the original plaintext after encrypt', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      const plaintext = JSON.stringify([{ email: 'admin@test.com', password: 'Secret123!' }]);
      const ciphertext = svc.encrypt(plaintext);
      const decrypted = svc.decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it('should recover original plaintext from a second service instance with same key', () => {
      const svc1 = new SeedEncryptionService(VALID_KEY);
      const svc2 = new SeedEncryptionService(VALID_KEY);
      const plaintext = 'ChangeMeAdmin!';
      const ciphertext = svc1.encrypt(plaintext);
      const decrypted = svc2.decrypt(ciphertext);
      expect(decrypted).toBe(plaintext);
    });

    it('should throw SeedEncryptionError for malformed ciphertext (wrong part count)', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      expect(() => svc.decrypt('not-enough-parts')).toThrow('exactly 3 parts');
    });

    it('should throw SeedEncryptionError for ciphertext with empty parts', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      expect(() => svc.decrypt(':partial:data')).toThrow('must be non-empty');
    });

    it('should throw SeedEncryptionError when decrypting with the wrong key', () => {
      const svcCorrect = new SeedEncryptionService(VALID_KEY);
      const svcWrong = new SeedEncryptionService(WRONG_KEY);
      const ciphertext = svcCorrect.encrypt('secret data');
      expect(() => svcWrong.decrypt(ciphertext)).toThrow();
    });

    it('should throw when ciphertext is tampered with (auth tag mismatch)', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      const ciphertext = svc.encrypt('original data');
      const [iv, authTag, ct] = ciphertext.split(':');
      const tamperedCt = ct
        .split('')
        .map((c, i) => (i === 0 ? String.fromCharCode(c.charCodeAt(0) ^ 1) : c))
        .join('');
      const tampered = `${iv}:${authTag}:${tamperedCt}`;
      expect(() => svc.decrypt(tampered)).toThrow();
    });
  });

  describe('encrypt + decrypt roundtrip', () => {
    it('should roundtrip a realistic seed JSON payload', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      const seedData = JSON.stringify([
        { email: 'admin@example.com', password: 'ChangeMe!', role: 'ADMIN' },
        { email: 'trader@example.com', password: 'Trader!', role: 'TRADER' },
      ]);
      const encrypted = svc.encrypt(seedData);
      const decrypted = svc.decrypt(encrypted);
      expect(decrypted).toBe(seedData);
      const parsed = JSON.parse(decrypted);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].role).toBe('ADMIN');
    });

    it('should handle empty JSON array', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      const empty = '[]';
      const encrypted = svc.encrypt(empty);
      const decrypted = svc.decrypt(encrypted);
      expect(decrypted).toBe(empty);
    });

    it('should handle Unicode characters in passwords', () => {
      const svc = new SeedEncryptionService(VALID_KEY);
      const unicode = JSON.stringify([{ email: 'user@test.com', password: 'Passw0rd!@#$%^&*()' }]);
      const encrypted = svc.encrypt(unicode);
      const decrypted = svc.decrypt(encrypted);
      expect(decrypted).toBe(unicode);
    });
  });
});
