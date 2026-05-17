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

  /** OTP gửi tới email mới khi user ví gắn email liên hệ (khác mã 2FA đăng nhập). */
  async sendContactEmailVerificationOtp(toEmail: string, otpCode: string): Promise<void> {
    const subject = 'Ma xac minh email lien he / Contact email verification';
    const text =
      `Ma xac minh email lien he cua ban la: ${otpCode}. Ma co hieu luc trong 5 phut.\n\n` +
      `Your contact email verification code is: ${otpCode}. Valid for 5 minutes.`;

    await this.sendEmailWithDevFallback(toEmail, subject, text, 'Contact-email OTP');
  }

  async sendOtp(toEmail: string, otpCode: string): Promise<void> {
    const subject = 'Ma OTP xac thuc 2 buoc';
    const text = `Ma OTP cua ban la: ${otpCode}. Ma co hieu luc trong 5 phut.`;

    await this.sendEmailWithDevFallback(toEmail, subject, text, 'OTP');
  }

  /**
   * Gui thong bao toi email cu khi nguoi dung thay doi email thanh cong.
   * Tien trinh bao mat: nguoi dung biet ngay lap tuc neu co ai do dang thay doi tai khoan.
   */
  async sendEmailChangeNotification(
    oldEmail: string,
    newEmail: string,
    userId: string,
  ): Promise<void> {
    const subject = 'Thong bao thay doi email / Email Change Notification';
    const text =
      `Email tai khoan Crypto Trading Platform cua ban da duoc thay doi.\n\n` +
      `Email cu: ${oldEmail}\n` +
      `Email moi: ${newEmail}\n\n` +
      `Neu ban khong thuc hien thay doi nay, vui long lien he ho tro ngay lap tuc de bao mat tai khoan.\n\n` +
      `--\n` +
      `Crypto Trading Platform`;

    await this.sendEmailWithDevFallback(oldEmail, subject, text, 'Email-change notification');
  }
}
