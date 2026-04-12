import { Controller, Get, Query, Res } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

/**
 * Handles PayOS redirect URLs (success/cancel) — excluded from /api/v1 prefix.
 * PayOS redirects here after checkout. Returns HTML so user sees a proper page
 * instead of 404.
 */
@Controller()
export class PayosRedirectController {
  constructor(private readonly configService: ConfigService) {}

  @Get('success')
  success(@Res() res: Response, @Query('orderCode') orderCode?: string) {
    const appUrl = this.configService.get<string>('APP_URL')?.trim();
    const html = this.buildSuccessHtml(orderCode, appUrl);
    res.type('html').send(html);
  }

  @Get('cancel')
  cancel(@Res() res: Response) {
    const appUrl = this.configService.get<string>('APP_URL')?.trim();
    const html = this.buildCancelHtml(appUrl);
    res.type('html').send(html);
  }

  private buildSuccessHtml(orderCode?: string, appUrl?: string): string {
    const backLink = appUrl
      ? `<p><a href="${appUrl}" style="color:#0d6efd;">← Quay lại ứng dụng</a></p>`
      : '<p>Bạn có thể đóng trang này và quay lại ứng dụng.</p>';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Thanh toán thành công</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 360px; }
    .icon { font-size: 48px; color: #22c55e; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; color: #166534; margin: 0 0 0.5rem; }
    p { color: #666; margin: 0.5rem 0; font-size: 0.9rem; }
    a { text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h1>Thanh toán thành công</h1>
    <p>Số tiền đã được ghi nhận và sẽ được cộng vào ví của bạn.</p>
    ${orderCode ? `<p><small>Mã đơn: ${orderCode}</small></p>` : ''}
    ${backLink}
  </div>
</body>
</html>`;
  }

  private buildCancelHtml(appUrl?: string): string {
    const backLink = appUrl
      ? `<p><a href="${appUrl}" style="color:#0d6efd;">← Quay lại ứng dụng</a></p>`
      : '<p>Bạn có thể đóng trang này và quay lại ứng dụng.</p>';
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Đã hủy thanh toán</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); text-align: center; max-width: 360px; }
    .icon { font-size: 48px; color: #94a3b8; margin-bottom: 1rem; }
    h1 { font-size: 1.25rem; color: #475569; margin: 0 0 0.5rem; }
    p { color: #666; margin: 0.5rem 0; font-size: 0.9rem; }
    a { text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✕</div>
    <h1>Đã hủy thanh toán</h1>
    <p>Giao dịch đã được hủy. Bạn có thể tạo đơn nạp tiền mới khi cần.</p>
    ${backLink}
  </div>
</body>
</html>`;
  }
}
