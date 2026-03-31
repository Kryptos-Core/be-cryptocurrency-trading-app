import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

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

  /** OTP gửi tới email mới khi user ví gắn email liên hệ (khác mã 2FA đăng nhập). */
  async sendContactEmailVerificationOtp(toEmail: string, otpCode: string): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      'Crypto Trading App <no-reply@crypto-trading.local>';

    const subject = 'Ma xac minh email lien he / Contact email verification';
    const text =
      `Ma xac minh email lien he cua ban la: ${otpCode}. Ma co hieu luc trong 5 phut.\n\n` +
      `Your contact email verification code is: ${otpCode}. Valid for 5 minutes.`;

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({ from, to: toEmail, subject, text });
      this.logger.log(`Contact-email OTP sent to ${toEmail}`);
    } catch (err) {
      const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
      if (isDev) {
        this.logger.warn(
          `SMTP unavailable (${err instanceof Error ? err.message : String(err)}). ` +
            `[DEV ONLY] Contact-email OTP for ${toEmail}: ${otpCode}`,
        );
      } else {
        throw err;
      }
    }
  }

  async sendOtp(toEmail: string, otpCode: string): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      'Crypto Trading App <no-reply@crypto-trading.local>';

    const subject = 'Ma OTP xac thuc 2 buoc';
    const text = `Ma OTP cua ban la: ${otpCode}. Ma co hieu luc trong 5 phut.`;

    try {
      const transporter = this.getTransporter();
      await transporter.sendMail({ from, to: toEmail, subject, text });
      this.logger.log(`OTP sent to ${toEmail}`);
    } catch (err) {
      const isDev = this.configService.get<string>('NODE_ENV') !== 'production';
      if (isDev) {
        // SMTP unavailable in dev → print OTP to console so manual testing works.
        this.logger.warn(
          `SMTP unavailable (${err instanceof Error ? err.message : String(err)}). ` +
            `[DEV ONLY] OTP for ${toEmail}: ${otpCode}`,
        );
      } else {
        // Production must have a working SMTP — propagate the error.
        throw err;
      }
    }
  }
}
