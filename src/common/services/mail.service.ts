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

  async sendOtp(toEmail: string, otpCode: string): Promise<void> {
    const from =
      this.configService.get<string>('SMTP_FROM') ||
      'Crypto Trading App <no-reply@crypto-trading.local>';

    const subject = 'Ma OTP xac thuc 2 buoc';
    const text = `Ma OTP cua ban la: ${otpCode}. Ma co hieu luc trong 5 phut.`;

    const transporter = this.getTransporter();
    await transporter.sendMail({
      from,
      to: toEmail,
      subject,
      text,
    });

    this.logger.log(`OTP sent to ${toEmail}`);
  }
}
