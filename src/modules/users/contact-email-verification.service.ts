import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BadRequestException, ConflictException, NotFoundException } from '@/common/exceptions';
import { CacheService, MailService } from '@/common/services';
import { isWalletPlaceholderEmail } from '@/common/utils/wallet-placeholder-email.util';
import type { UserRecord } from '@/modules/users';
import { USERS_REPOSITORY, type UsersRepositoryPort } from './domain/ports';

/**
 * OTP gửi thẳng tới email mới để gắn email liên hệ cho tài khoản đăng nhập ví (email @*.wallet).
 */
@Injectable()
export class ContactEmailVerificationService {
  private readonly logger = new Logger(ContactEmailVerificationService.name);
  private readonly otpTtlSeconds = 300;
  private readonly cooldownSeconds = 30;

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    private readonly cacheService: CacheService,
    private readonly mailService: MailService,
  ) {}

  private otpKey(userId: string, emailNormalized: string): string {
    return `contact-email:otp:${userId}:${emailNormalized}`;
  }

  private cooldownKey(userId: string, emailNormalized: string): string {
    return `contact-email:cooldown:${userId}:${emailNormalized}`;
  }

  private createOtpCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  async sendOtp(userId: string, newEmailRaw: string): Promise<{ expiresIn: number }> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User', userId);
    }
    if (!isWalletPlaceholderEmail(user.email)) {
      throw new BadRequestException(
        'Chỉ tài khoản đăng nhập ví (email tạm) mới dùng được bước này. Hãy dùng đổi email có xét duyệt trong Cài đặt.',
        'NOT_WALLET_PLACEHOLDER',
      );
    }

    const newEmail = newEmailRaw.toLowerCase().trim();
    if (isWalletPlaceholderEmail(newEmail)) {
      throw new BadRequestException('Email không hợp lệ', 'INVALID_EMAIL');
    }
    const exists = await this.usersRepository.emailExists(newEmail, userId);
    if (exists) {
      throw new ConflictException('Email already in use', 'EMAIL_EXISTS');
    }

    const otpKey = this.otpKey(userId, newEmail);

    const existingOtp = await this.cacheService.get<string | number>(otpKey);
    if (existingOtp != null) {
      const ttl = await this.cacheService.getTtl(otpKey);
      if (ttl > 0) {
        return { expiresIn: ttl };
      }
    }

    const cdKey = this.cooldownKey(userId, newEmail);
    const cooldown = await this.cacheService.get<string>(cdKey);
    if (cooldown) {
      const cooldownTtl = await this.cacheService.getTtl(cdKey);
      throw new BadRequestException(
        `Vui lòng đợi ${cooldownTtl > 0 ? cooldownTtl : this.cooldownSeconds} giây trước khi gửi lại OTP.`,
        'OTP_COOLDOWN',
      );
    }

    const code = this.createOtpCode();
    await this.cacheService.set(otpKey, code, this.otpTtlSeconds);
    await this.mailService.sendContactEmailVerificationOtp(newEmail, code);

    await this.cacheService.set(cdKey, '1', this.cooldownSeconds);

    this.logger.log(`Contact email OTP sent for user=${userId} to=${newEmail}`);
    return { expiresIn: this.otpTtlSeconds };
  }

  async verifyAndUpdateEmail(
    userId: string,
    newEmailRaw: string,
    otpCode: string,
  ): Promise<UserRecord> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User', userId);
    }
    if (!isWalletPlaceholderEmail(user.email)) {
      throw new BadRequestException(
        'Chỉ tài khoản đăng nhập ví (email tạm) mới dùng được bước này.',
        'NOT_WALLET_PLACEHOLDER',
      );
    }

    const newEmail = newEmailRaw.toLowerCase().trim();
    if (isWalletPlaceholderEmail(newEmail)) {
      throw new BadRequestException('Email không hợp lệ', 'INVALID_EMAIL');
    }

    const otpKey = this.otpKey(userId, newEmail);
    const cached = await this.cacheService.get<string | number>(otpKey);
    if (cached == null) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn', 'INVALID_OTP');
    }
    const cachedStr = String(cached).trim();
    const codeStr = String(otpCode).trim();
    if (cachedStr !== codeStr) {
      throw new BadRequestException('Mã OTP không hợp lệ hoặc đã hết hạn', 'INVALID_OTP');
    }

    const exists = await this.usersRepository.emailExists(newEmail, userId);
    if (exists) {
      throw new ConflictException('Email already in use', 'EMAIL_EXISTS');
    }

    await this.cacheService.delete(otpKey);
    await this.cacheService.delete(this.cooldownKey(userId, newEmail));

    await this.usersRepository.update(userId, { email: newEmail });
    await this.usersRepository.setEmailVerified(userId, true);
    const updated = await this.usersRepository.findById(userId);
    if (!updated) {
      throw new NotFoundException('User', userId);
    }
    return updated;
  }
}
