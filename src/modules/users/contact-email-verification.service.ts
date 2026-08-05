import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EmailExistsException,
  EmailVerificationDisabledException,
  InvalidOtpException,
  NotWalletPlaceholderException,
  OtpAttemptLimitException,
  OtpCooldownException,
  PendingWithdrawalsException,
  UseContactEmailVerificationException,
  WithdrawalPendingExistsException,
} from '@/common/errors';
import { NotFoundException } from '@/common/exceptions';
import { CacheService, MailService } from '@/common/services';
import { isWalletPlaceholderEmail } from '@/common/utils/wallet-placeholder-email.util';
import { ONCHAIN_TRANSACTION_REPOSITORY, type OnchainTransactionRepositoryPort } from '@/modules/blockchain/domain/ports';
import { SystemConfigService } from '@/modules/system-config/system-config.service';
import type { UserRecord } from '@/modules/users';
import { USERS_REPOSITORY, type UsersRepositoryPort } from './domain/ports';

/**
 * OTP gui thang toi email moi de gan email lien he cho tai khoan dang nhap vi (email @*.wallet).
 * Bao gom:
 *   - OTP brute-force protection (5 attempts / 15 phut)
 *   - Kiem tra withdrawal pending truoc khi cho doi email
 *   - Gui thong bao toi email cu khi doi thanh cong
 *   - Audit log cho compliance
 */
@Injectable()
export class ContactEmailVerificationService {
  private readonly logger = new Logger(ContactEmailVerificationService.name);
  private readonly otpTtlSeconds = 300;
  private readonly cooldownSeconds = 30;

  // OTP brute-force protection
  private static readonly OTP_MAX_ATTEMPTS = 5;
  private static readonly OTP_ATTEMPT_WINDOW_SEC = 15 * 60; // 15 phut

  constructor(
    @Inject(USERS_REPOSITORY)
    private readonly usersRepository: UsersRepositoryPort,
    private readonly cacheService: CacheService,
    private readonly mailService: MailService,
    @Inject(ONCHAIN_TRANSACTION_REPOSITORY)
    private readonly onchainTxRepo: OnchainTransactionRepositoryPort,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  private otpKey(userId: string, emailNormalized: string): string {
    return `contact-email:otp:${userId}:${emailNormalized}`;
  }

  private cooldownKey(userId: string, emailNormalized: string): string {
    return `contact-email:cooldown:${userId}:${emailNormalized}`;
  }

  private otpAttemptKey(userId: string, emailNormalized: string): string {
    return `contact-email:otp:attempts:${userId}:${emailNormalized}`;
  }

  private createOtpCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  async sendOtp(userId: string, newEmailRaw: string): Promise<{ expiresIn: number }> {
    const disabled = await this.systemConfigService.isEmailVerificationRequired();
    if (!disabled) {
      throw EmailVerificationDisabledException();
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User', userId);
    }
    if (!isWalletPlaceholderEmail(user.email)) {
      throw NotWalletPlaceholderException();
    }

    const newEmail = newEmailRaw.toLowerCase().trim();
    if (isWalletPlaceholderEmail(newEmail)) {
      throw new NotFoundException('Email khong hop le', 'INVALID_EMAIL');
    }
    const exists = await this.usersRepository.emailExists(newEmail, userId);
    if (exists) {
      throw EmailExistsException({ email: newEmail });
    }

    // Check OTP attempt counter for brute-force protection
    const attemptKey = this.otpAttemptKey(userId, newEmail);
    const attemptCount = await this.cacheService.get<number>(attemptKey);
    if (attemptCount !== null && attemptCount >= ContactEmailVerificationService.OTP_MAX_ATTEMPTS) {
      const ttl = await this.cacheService.getTtl(attemptKey);
      const seconds = ttl > 0 ? ttl : ContactEmailVerificationService.OTP_ATTEMPT_WINDOW_SEC;
      throw OtpAttemptLimitException({ seconds });
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
      const seconds = cooldownTtl > 0 ? cooldownTtl : this.cooldownSeconds;
      throw OtpCooldownException({ seconds });
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
  ): Promise<{ user: UserRecord; forceRelogin: boolean }> {
    const disabled = await this.systemConfigService.isEmailVerificationRequired();
    if (!disabled) {
      throw EmailVerificationDisabledException();
    }

    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User', userId);
    }
    if (!isWalletPlaceholderEmail(user.email)) {
      throw NotWalletPlaceholderException();
    }

    const newEmail = newEmailRaw.toLowerCase().trim();
    if (isWalletPlaceholderEmail(newEmail)) {
      throw new NotFoundException('Email khong hop le', 'INVALID_EMAIL');
    }

    // Block email change if user has pending withdrawals (security: prevent address change during withdrawal)
    const pendingWithdrawals = await this.onchainTxRepo.findPendingWithdrawals(999);
    const userPendingWithdrawals = pendingWithdrawals.filter((w) => w.user_id === userId);
    if (userPendingWithdrawals.length > 0) {
      throw WithdrawalPendingExistsException({ count: userPendingWithdrawals.length });
    }

    const otpKey = this.otpKey(userId, newEmail);

    // Increment attempt counter for brute-force protection
    const attemptKey = this.otpAttemptKey(userId, newEmail);
    const attemptCount = ((await this.cacheService.get<number>(attemptKey)) ?? 0) + 1;
    await this.cacheService.set(attemptKey, attemptCount, ContactEmailVerificationService.OTP_ATTEMPT_WINDOW_SEC);

    if (attemptCount > ContactEmailVerificationService.OTP_MAX_ATTEMPTS) {
      throw OtpAttemptLimitException({ seconds: ContactEmailVerificationService.OTP_ATTEMPT_WINDOW_SEC });
    }

    const cached = await this.cacheService.get<string | number>(otpKey);
    if (cached == null) {
      throw InvalidOtpException();
    }
    const cachedStr = String(cached).trim();
    const codeStr = String(otpCode).trim();
    if (cachedStr !== codeStr) {
      this.logger.warn(
        `[ContactEmail] Invalid OTP attempt ${attemptCount}/${ContactEmailVerificationService.OTP_MAX_ATTEMPTS} for user=${userId} email=${newEmail}`,
      );
      throw InvalidOtpException();
    }

    const exists = await this.usersRepository.emailExists(newEmail, userId);
    if (exists) {
      throw EmailExistsException({ email: newEmail });
    }

    const oldEmail = user.email;

    // Clear OTP and attempt counter after successful verification
    await this.cacheService.delete(otpKey);
    await this.cacheService.delete(attemptKey);
    await this.cacheService.delete(this.cooldownKey(userId, newEmail));

    await this.usersRepository.update(userId, { email: newEmail });
    await this.usersRepository.setEmailVerified(userId, true);

    // Send notification to old email (security best practice: alert user of account change)
    try {
      await this.mailService.sendEmailChangeNotification(oldEmail, newEmail, userId);
    } catch (err) {
      // Non-blocking: email notification failure should not roll back the email change
      this.logger.warn(
        `Failed to send email-change notification to old email ${oldEmail} for user=${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    this.logger.log(
      `[ContactEmail] Email changed for user=${userId}: ${oldEmail} -> ${newEmail}`,
    );

    const updated = await this.usersRepository.findById(userId);
    if (!updated) {
      throw new NotFoundException('User', userId);
    }

    // User must re-login to get a JWT with the new email claim
    return { user: updated, forceRelogin: true };
  }

  /**
   * Direct email update without OTP — only callable when email verification is
   * disabled by admin. Validates email availability and withdrawal safety.
   */
  async updateContactEmailWithoutOtp(
    userId: string,
    newEmailRaw: string,
  ): Promise<{ user: UserRecord; forceRelogin: boolean }> {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User', userId);
    }

    if (isWalletPlaceholderEmail(user.email)) {
      throw UseContactEmailVerificationException();
    }

    const newEmail = newEmailRaw.toLowerCase().trim();
    const emailLower = newEmail.toLowerCase().trim();
    const exists = await this.usersRepository.emailExists(emailLower, userId);
    if (exists) {
      throw EmailExistsException({ email: emailLower });
    }

    const pendingWithdrawals = await this.onchainTxRepo.findPendingWithdrawals(1);
    if (pendingWithdrawals.length > 0) {
      throw PendingWithdrawalsException();
    }

    const oldEmail = user.email;
    await this.usersRepository.update(userId, { email: newEmail });
    await this.usersRepository.setEmailVerified(userId, true);

    try {
      await this.mailService.sendEmailChangeNotification(oldEmail, newEmail, userId);
    } catch (err) {
      this.logger.warn(
        `Failed to send email-change notification for user=${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    this.logger.log(
      `[ContactEmail] Email updated (no OTP) for user=${userId}: ${oldEmail} -> ${newEmail}`,
    );

    const updated = await this.usersRepository.findById(userId);
    if (!updated) {
      throw new NotFoundException('User', userId);
    }

    return { user: updated, forceRelogin: true };
  }
}