import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@/common/exceptions';
import { CacheInvalidationHelper, CacheService, MailService } from '@/common/services';
import { USERS_REPOSITORY, type UsersRepositoryPort } from '@/modules/users/domain/ports';
import { AUTH_REPOSITORY, type AuthRepositoryPort } from './domain/ports';

@Injectable()
export class TwoFaService {
  private readonly logger = new Logger(TwoFaService.name);
  private readonly otpTtlSeconds = 300; // OTP valid for 5 minutes
  private readonly cooldownSeconds = 30; // Minimum gap between consecutive sends

  constructor(
    private readonly cacheService: CacheService,
    private readonly mailService: MailService,
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepositoryPort,
    private readonly cacheInvalidator: CacheInvalidationHelper,
  ) {}

  private otpKey(userId: string): string {
    return `2fa:otp:${userId}`;
  }

  private cooldownKey(userId: string): string {
    return `2fa:cooldown:${userId}`;
  }

  private createOtpCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  async sendOtp(userId: string, email: string): Promise<{ expiresIn: number }> {
    const otpKey = this.otpKey(userId);

    // Nếu OTP trước đó còn hạn → không gửi lại, cho nhập tiếp với mã cũ
    const existingOtp = await this.cacheService.get<string | number>(otpKey);
    if (existingOtp != null) {
      const ttl = await this.cacheService.getTtl(otpKey);
      if (ttl > 0) {
        this.logger.log(`2FA OTP still valid for user=${userId}, expiresIn=${ttl}s`);
        return { expiresIn: ttl };
      }
    }

    // OTP hết hạn hoặc chưa có → kiểm tra cooldown rồi gửi OTP mới
    const cooldown = await this.cacheService.get<string>(this.cooldownKey(userId));
    if (cooldown) {
      const cooldownTtl = await this.cacheService.getTtl(this.cooldownKey(userId));
      throw new BadRequestException(
        `Vui lòng đợi ${cooldownTtl > 0 ? cooldownTtl : this.cooldownSeconds} giây trước khi gửi lại OTP.`,
        'OTP_COOLDOWN',
      );
    }

    const code = this.createOtpCode();
    await this.cacheService.set(otpKey, code, this.otpTtlSeconds);
    await this.mailService.sendOtp(email, code);

    await this.cacheService.set(this.cooldownKey(userId), '1', this.cooldownSeconds);

    this.logger.log(`2FA OTP sent for user=${userId}`);
    return { expiresIn: this.otpTtlSeconds };
  }

  /**
   * Check OTP matches Redis value without consuming it.
   * Use before sensitive UI steps; final action still calls verifyOtp() to consume.
   */
  async validateOtpOnly(userId: string, code: string): Promise<boolean> {
    const key = this.otpKey(userId);
    const cached = await this.cacheService.get<string | number>(key);
    if (cached == null) {
      return false;
    }
    const cachedStr = String(cached).trim();
    const codeStr = String(code).trim();
    return cachedStr === codeStr;
  }

  async verifyOtp(userId: string, code: string): Promise<boolean> {
    const key = this.otpKey(userId);
    const cached = await this.cacheService.get<string | number>(key);
    if (cached == null) {
      return false;
    }
    // Normalize to string: cache may return number (JSON.parse parses "123456" as number)
    const cachedStr = String(cached).trim();
    const codeStr = String(code).trim();
    if (cachedStr !== codeStr) {
      return false;
    }
    await this.cacheService.delete(key);
    return true;
  }

  async enable(userId: string, code: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User', userId);
    }

    const valid = await this.verifyOtp(userId, code);
    if (!valid) {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn', 'INVALID_OTP');
    }

    await this.authRepository.setTwoFaEnabled(userId, true);
    await this.cacheInvalidator.invalidateUserCaches(['users'], userId);
    this.logger.log(`2FA enabled for user=${userId}`);
  }

  async disable(userId: string, code: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User', userId);
    }

    const valid = await this.verifyOtp(userId, code);
    if (!valid) {
      throw new BadRequestException('OTP không hợp lệ hoặc đã hết hạn', 'INVALID_OTP');
    }

    await this.authRepository.setTwoFaEnabled(userId, false);
    await this.cacheInvalidator.invalidateUserCaches(['users'], userId);
    this.logger.log(`2FA disabled for user=${userId}`);
  }
}
