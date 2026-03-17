import { Readable } from 'stream';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

/**
 * Cloudinary service for image upload (e.g. user avatars).
 * Requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET in env.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly folder: string;
  private configured = false;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    this.folder =
      this.configService.get<string>('CLOUDINARY_AVATAR_FOLDER') ?? 'avatars';

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.configured = true;
      this.logger.log(`Cloudinary configured, folder=${this.folder}`);
    } else {
      this.logger.warn(
        'Cloudinary not configured (missing CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET). Avatar upload will fail.',
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * Upload image buffer to Cloudinary (avatar folder).
   * @param buffer - image file buffer
   * @param publicIdPrefix - optional prefix for public_id (e.g. user id) to avoid collisions
   */
  async upload(
    buffer: Buffer,
    publicIdPrefix?: string,
  ): Promise<CloudinaryUploadResult> {
    if (!this.configured) {
      throw new Error(
        'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
      );
    }

    const baseId = publicIdPrefix
      ? `${this.folder}/${publicIdPrefix}_${Date.now()}`
      : `${this.folder}/${Date.now()}`;

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: this.folder,
          public_id: baseId.split('/').pop(),
          overwrite: true,
        },
        (err: Error | undefined, result: UploadApiResponse | undefined) => {
          if (err) {
            this.logger.error('Cloudinary upload failed', err);
            return reject(err);
          }
          if (!result?.secure_url || !result?.public_id) {
            return reject(new Error('Cloudinary returned invalid result'));
          }
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        },
      );
      Readable.from(buffer).pipe(uploadStream);
    });
  }

  /**
   * Delete asset by public_id (e.g. when user changes avatar to free quota).
   */
  async destroy(publicId: string): Promise<void> {
    if (!this.configured) return;

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result !== 'ok') {
        this.logger.warn(`Cloudinary destroy result: ${result.result}`);
      }
    } catch (err) {
      this.logger.warn(`Cloudinary destroy failed: ${publicId}`, err);
    }
  }
}
