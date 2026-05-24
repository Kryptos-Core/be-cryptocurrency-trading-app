import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Throws a descriptive error for seed encryption failures.
 */
class SeedEncryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedEncryptionError';
  }
}

/**
 * Encrypts and decrypts seed data using AES-256-GCM (AEAD).
 * Output format: iv_base64:authTag_base64:ciphertext_base64
 * Compatible with WalletEncryptionService and BinanceCredentialsEncryptionService.
 *
 * Requires SEED_DATA_ENCRYPTION_KEY env var (64 hex characters = 32 bytes).
 */
export class SeedEncryptionService {
  private readonly key: Buffer;
  private readonly ALGORITHM = 'aes-256-gcm';
  private readonly IV_LENGTH = 12;

  constructor(keyHex?: string) {
    const rawKey = keyHex ?? process.env.SEED_DATA_ENCRYPTION_KEY;
    if (!rawKey) {
      throw new SeedEncryptionError(
        'SEED_DATA_ENCRYPTION_KEY env var is required. ' +
          'Generate one with: openssl rand -hex 32',
      );
    }

    if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      throw new SeedEncryptionError(
        'SEED_DATA_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
          'Generate one with: openssl rand -hex 32',
      );
    }

    this.key = Buffer.from(rawKey, 'hex');
  }

  /**
   * Decrypt a ciphertext produced by encrypt().
   * Throws SeedEncryptionError if the format is invalid or authentication fails.
   */
  decrypt(encrypted: string): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new SeedEncryptionError(
        'Encrypted payload must have exactly 3 parts (iv:authTag:ciphertext)',
      );
    }

    const [ivBase64, authTagBase64, ciphertextBase64] = parts;
    if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
      throw new SeedEncryptionError('All three parts of the encrypted payload must be non-empty');
    }

    const decipher = createDecipheriv(
      this.ALGORITHM,
      this.key,
      Buffer.from(ivBase64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }

  /**
   * Encrypt plaintext using AES-256-GCM with a random IV.
   * Returns iv_base64:authTag_base64:ciphertext_base64
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(this.IV_LENGTH);
    const cipher = createCipheriv(this.ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      ciphertext.toString('base64'),
    ].join(':');
  }
}
