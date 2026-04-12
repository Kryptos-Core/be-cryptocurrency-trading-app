import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { InternalServerException } from '@/common/exceptions';

/**
 * Encrypts sensitive wallet secrets before they are persisted.
 */
@Injectable()
export class WalletEncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('WALLET_ENCRYPTION_KEY')?.trim();

    if (!rawKey) {
      throw new InternalServerException('Missing WALLET_ENCRYPTION_KEY configuration', {
        envVar: 'WALLET_ENCRYPTION_KEY',
      });
    }

    if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      throw new InternalServerException('WALLET_ENCRYPTION_KEY must be a 32-byte hex string', {
        envVar: 'WALLET_ENCRYPTION_KEY',
      });
    }

    this.encryptionKey = Buffer.from(rawKey, 'hex');
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
      ':',
    );
  }

  decrypt(encrypted: string): string {
    const [ivBase64, authTagBase64, ciphertextBase64] = encrypted.split(':');
    if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
      throw new InternalServerException('Encrypted wallet payload is malformed');
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivBase64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, 'base64')),
      decipher.final(),
    ]);

    return plaintext.toString('utf8');
  }
}
