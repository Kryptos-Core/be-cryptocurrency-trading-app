import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalServerException } from '@/common/exceptions';

export interface BinanceRawCredentials {
  apiKey: string;
  apiSecret: string;
}

@Injectable()
export class BinanceCredentialsEncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const rawKey = this.configService.get<string>('app.trading.binance.credentialsEncryptionKey')?.trim();

    if (!rawKey) {
      throw new InternalServerException(
        'Missing BINANCE_CREDENTIALS_ENCRYPTION_KEY configuration',
        { envVar: 'app.trading.binance.credentialsEncryptionKey' },
      );
    }

    if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
      throw new InternalServerException(
        'BINANCE_CREDENTIALS_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars)',
        { envVar: 'app.trading.binance.credentialsEncryptionKey' },
      );
    }

    this.encryptionKey = Buffer.from(rawKey, 'hex');
  }

  encrypt(plaintext: BinanceRawCredentials): string {
    const json = JSON.stringify(plaintext);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(encrypted: string): BinanceRawCredentials {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new InternalServerException('Encrypted Binance credentials payload is malformed');
    }
    const [ivBase64, authTagBase64, ciphertextBase64] = parts;

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

    const parsed = JSON.parse(plaintext.toString('utf8')) as BinanceRawCredentials;
    if (!parsed.apiKey || !parsed.apiSecret) {
      throw new InternalServerException('Decrypted Binance credentials are invalid');
    }
    return parsed;
  }
}
