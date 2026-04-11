import { existsSync } from 'fs';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { isAbsolute, resolve } from 'path';

/**
 * FCM Service
 * Singleton Pattern: Single Firebase Admin App instance.
 * Graceful degradation: if Firebase credentials are absent, push is silently skipped.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private initialized = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const rawPath =
      this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH') ??
      this.configService.get<string>('GOOGLE_APPLICATION_CREDENTIALS');

    if (!rawPath?.trim()) {
      this.logger.warn(
        'Firebase service account path not set (FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS) — FCM push notifications disabled',
      );
      return;
    }

    const trimmed = rawPath.trim().replace(/^["']|["']$/g, '');
    const accountPath = isAbsolute(trimmed)
      ? resolve(trimmed)
      : resolve(process.cwd(), trimmed);

    if (!existsSync(accountPath)) {
      this.logger.warn(
        `Firebase credentials file not found: ${accountPath} — FCM push notifications disabled`,
      );
      return;
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert(accountPath),
      });
    }

    this.initialized = true;
    this.logger.log('Firebase Admin SDK initialized');
  }

  /**
   * Send a multicast push notification to a list of FCM device tokens.
   * Silently skips if Firebase is not initialized or tokens list is empty.
   */
  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.initialized || tokens.length === 0) return;

    const chunks = this.chunkArray(tokens, 500); // FCM max 500 per multicast

    for (const chunk of chunks) {
      try {
        const message: admin.messaging.MulticastMessage = {
          tokens: chunk,
          notification: { title, body },
          data,
          android: { priority: 'high' },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        };
        const response = await admin.messaging().sendEachForMulticast(message);
        this.logger.log(
          `FCM multicast: ${response.successCount} success, ${response.failureCount} failed`,
        );
      } catch (error) {
        this.logger.error('FCM multicast error', error);
      }
    }
  }

  private chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
}
