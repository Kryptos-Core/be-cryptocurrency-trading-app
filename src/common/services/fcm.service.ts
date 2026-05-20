import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

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
      this.logFcmDisabled(
        'Firebase service account path not set (FIREBASE_SERVICE_ACCOUNT_PATH or GOOGLE_APPLICATION_CREDENTIALS)',
      );
      return;
    }

    const trimmed = rawPath.trim().replace(/^["']|["']$/g, '');
    const accountPath = isAbsolute(trimmed) ? resolve(trimmed) : resolve(process.cwd(), trimmed);

    if (!existsSync(accountPath)) {
      this.logFcmDisabled(`Firebase credentials file not found: ${accountPath}`);
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
   *
   * @param notificationType  Maps to a custom sound asset:
   *                          'withdrawal_request' | 'withdrawal_approved' | 'withdrawal_rejected'
   *                          | 'alert' | 'promo' | 'system' (default system sound).
   */
  async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
    notificationType?: string,
  ): Promise<void> {
    if (!this.initialized || tokens.length === 0) return;

    const iosSound = this._resolveIosSound(notificationType);
    const androidSound = this._resolveAndroidSound(notificationType);

    const chunks = this.chunkArray(tokens, 500); // FCM max 500 per multicast

    for (const chunk of chunks) {
      try {
        const message: admin.messaging.MulticastMessage = {
          tokens: chunk,
          notification: { title, body },
          data,
          android: {
            priority: 'high',
            notification: androidSound
              ? { channelId: 'crypto_notifications', sound: androidSound }
              : undefined,
          },
          apns: {
            payload: {
              aps: { sound: iosSound, badge: 1 },
            },
          },
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

  private _resolveIosSound(notificationType?: string): string {
    switch (notificationType) {
      case 'withdrawal_request':
        return 'withdrawal_request.wav';
      case 'withdrawal_approved':
        return 'withdrawal_approved.wav';
      case 'withdrawal_rejected':
        return 'withdrawal_rejected.wav';
      case 'alert':
        return 'alert.wav';
      case 'promo':
        return 'promo.wav';
      default:
        return 'default';
    }
  }

  private _resolveAndroidSound(notificationType?: string): string | undefined {
    switch (notificationType) {
      case 'withdrawal_request':
        return 'withdrawal_request';
      case 'withdrawal_approved':
        return 'withdrawal_approved';
      case 'withdrawal_rejected':
        return 'withdrawal_rejected';
      case 'alert':
        return 'alert';
      case 'promo':
        return 'promo';
      default:
        return undefined; // use channel default
    }
  }

  /** Optional FCM: info in dev/staging, warn in production (possible misconfiguration). */
  private logFcmDisabled(reason: string): void {
    const suffix = ' — FCM push notifications disabled';
    const msg = reason + suffix;
    const nodeEnv = this.configService.get<string>('NODE_ENV') ?? 'development';
    if (nodeEnv === 'production') {
      this.logger.warn(msg);
    } else {
      this.logger.log(msg);
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
