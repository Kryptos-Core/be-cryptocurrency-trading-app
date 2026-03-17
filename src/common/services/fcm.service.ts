import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
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
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase credentials not set — FCM push notifications disabled');
      return;
    }

    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
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
