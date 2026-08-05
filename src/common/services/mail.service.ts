import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { DEFAULT_LOCALE, I18nService, Locale } from '../i18n';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) {
      return this.transporter;
    }

    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT') || 587);
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      throw new Error('SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });

    return this.transporter;
  }

  private async sendEmailWithDevFallback(
    toEmail: string,
    subject: string,
    text: string,
    logLabel: string,
  ): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      'Crypto Trading App <no-reply@crypto-trading.local>';

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({ from, to: toEmail, subject, text });
      this.logger.log(`${logLabel} sent to ${toEmail}`);
    } catch (err) {
      const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
      if (isDev) {
        this.logger.warn(
          `SMTP unavailable (${err instanceof Error ? err.message : String(err)}). ` +
            `[DEV ONLY] ${logLabel} for ${toEmail}: ${text}`,
        );
      } else {
        throw err;
      }
    }
  }

  /**
   * OTP gửi tới email mới khi user ví gắn email liên hệ (khác mã 2FA đăng nhập).
   *
   * Locale is resolved from the request context (set by `I18nService.localeMiddleware`).
   * Falls back to `DEFAULT_LOCALE` when called outside an HTTP request (e.g.
   * background workers).
   */
  async sendContactEmailVerificationOtp(toEmail: string, otpCode: string): Promise<void> {
    const locale = this.i18n.currentLocale() ?? DEFAULT_LOCALE;
    const subject = this.i18n.translate('contactEmailOtpSubject', locale);
    const text =
      this.i18n.translate('contactEmailOtpBody', locale, { code: otpCode, minutes: 5 }) +
      '\n\n' +
      this.i18n.translate('contactEmailOtpBodyEn', locale, { code: otpCode, minutes: 5 });

    await this.sendEmailWithDevFallback(toEmail, subject, text, 'Contact-email OTP');
  }

  /** Two-factor OTP (login / sensitive actions). */
  async sendOtp(toEmail: string, otpCode: string): Promise<void> {
    const locale: Locale = this.i18n.currentLocale() ?? DEFAULT_LOCALE;
    const subject = this.i18n.translate('twoFactorOtpSubject', locale);
    const text = this.i18n.translate('twoFactorOtpBody', locale, {
      code: otpCode,
      minutes: 5,
    });
    await this.sendEmailWithDevFallback(toEmail, subject, text, 'OTP');
  }

  /**
   * Notification to old email after a successful email change. Bilingual
   * subject so admins reading the inbox see both copies. Body uses the
   * caller's locale (resolved from the request that triggered the change).
   */
  async sendEmailChangeNotification(
    oldEmail: string,
    newEmail: string,
    userId: string,
  ): Promise<void> {
    const locale: Locale = this.i18n.currentLocale() ?? DEFAULT_LOCALE;
    const subject =
      this.i18n.translate('emailChangeSubject', locale) +
      ' / ' +
      this.i18n.translate('emailChangeSubjectEn', locale);

    const bodyVi = this.i18n.translate('emailChangeBody', locale, {
      oldEmail,
      newEmail,
    });
    const bodyEn = this.i18n.translate('emailChangeBodyEn', locale, {
      oldEmail,
      newEmail,
    });
    const text = `${bodyVi}\n\n---\n\n${bodyEn}\n\n--\nCrypto Trading Platform`;

    await this.sendEmailWithDevFallback(oldEmail, subject, text, 'Email-change notification');
  }
}