import { Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  CurrentUser,
  Public,
} from '@/common/decorators';
import { UserRole } from '@/common/enums';
import { FiatWithdrawalsService } from './fiat-withdrawals.service';
import {
  CasCompleteLinkDto,
  CasGrantTokenDto,
  CreateBankAccountDto,
  CreateFiatWithdrawalRequestDto,
  ResolveBankAccountHolderDto,
} from './dto';

@ApiTags('fiat-withdrawals')
@ApiBearerAuth('JWT-auth')
@Controller('fiat-withdrawals')
@UseGuards(JwtAuthGuard)
export class FiatWithdrawalsController {
  constructor(private readonly fiatWithdrawalsService: FiatWithdrawalsService) {}

  @Public()
  @Get('banks')
  @ApiOperation({ summary: 'Danh sách mã ngân hàng VN (dropdown)' })
  @ApiSuccessResponse('OK')
  listBanks() {
    return this.fiatWithdrawalsService.listVietnamBanks();
  }

  @Public()
  @Get('integration-settings')
  @ApiOperation({
    summary: 'Cấu hình tích hợp ngân hàng (Cas/BankHub vs HTTP chain)',
    description: 'FE dùng để hiển thị luồng liên kết Cas hoặc form STK + lookup.',
  })
  @ApiSuccessResponse('OK')
  integrationSettings() {
    return this.fiatWithdrawalsService.getIntegrationSettings();
  }

  @Public()
  @Get('providers/health')
  @ApiOperation({
    summary: 'Health-check Cas/BankHub (monitoring / load balancer)',
    description: 'POST /grant/token probe — không gọi lookup STK.',
  })
  @ApiSuccessResponse('OK')
  bankProvidersHealth() {
    return this.fiatWithdrawalsService.healthCheckBankProviders();
  }

  @Public()
  @Post('webhooks/cas')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Webhook Cas.so / BankHub (Console)',
    description:
      'POST JSON từ Cas. Balance Hook (biến động số dư): cấu hình loại TRANSACTIONS trên Console — ' +
      'https://cas.so/product/balance-hook . Trả 200 nhanh (<10s) để tránh retry 17 lần/24h.',
  })
  @ApiSuccessResponse('OK')
  casConsoleWebhook(@Req() req: Request, @Body() body: unknown) {
    const forwarded = req.headers['x-forwarded-for'];
    const fromForwarded =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0]?.trim()
        : Array.isArray(forwarded)
          ? forwarded[0]?.trim()
          : '';
    const clientIp = fromForwarded || req.socket?.remoteAddress || '';
    return this.fiatWithdrawalsService.handleCasConsoleWebhook(body, { clientIp });
  }

  @Post('bank-accounts')
  @ApiOperation({ summary: 'Đăng ký tài khoản ngân hàng (chờ admin xác minh)' })
  @ApiSuccessResponse('Đã tạo')
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  createBankAccount(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateBankAccountDto,
  ) {
    return this.fiatWithdrawalsService.createBankAccount(userId, dto);
  }

  @Post('cas/grant-token')
  @ApiOperation({ summary: 'Cas/BankHub: tạo grant token (mở Cas Link)' })
  @ApiSuccessResponse('OK')
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  casGrantToken(@CurrentUser('userId') _userId: string, @Body() dto: CasGrantTokenDto) {
    return this.fiatWithdrawalsService.createCasGrantToken(dto);
  }

  @Post('cas/complete-link')
  @ApiOperation({
    summary: 'Cas/BankHub: đổi publicToken → lưu STK (PENDING) từ identity',
  })
  @ApiSuccessResponse('Đã tạo')
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  casCompleteLink(@CurrentUser('userId') userId: string, @Body() dto: CasCompleteLinkDto) {
    return this.fiatWithdrawalsService.completeCasBankLink(userId, dto.publicToken);
  }

  @Get('bank-accounts/resolve-holder')
  @ApiOperation({ summary: 'Tự động truy xuất tên chủ tài khoản từ STK + mã ngân hàng' })
  @ApiQuery({ name: 'bankCode', required: true, type: String })
  @ApiQuery({ name: 'accountNumber', required: true, type: String })
  @ApiSuccessResponse('OK')
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  resolveBankAccountHolder(
    @CurrentUser('userId') userId: string,
    @Query() query: ResolveBankAccountHolderDto,
  ) {
    return this.fiatWithdrawalsService.resolveBankAccountHolder(userId, query);
  }

  @Get('bank-accounts')
  @ApiOperation({ summary: 'Danh sách tài khoản ngân hàng của tôi' })
  @ApiSuccessResponse('OK')
  @ApiUnauthorizedResponse()
  listMyBankAccounts(@CurrentUser('userId') userId: string) {
    return this.fiatWithdrawalsService.listMyBankAccounts(userId);
  }

  @Post('requests')
  @ApiOperation({
    summary: 'Tạo yêu cầu rút USDT về ngân hàng (manual payout)',
    description:
      'Cần identity_verified (trader/MM) hoặc nhân sự admin/risk/finance. Số dư sẽ bị freeze chờ duyệt.',
  })
  @ApiSuccessResponse('Đã tạo yêu cầu')
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  createRequest(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @CurrentUser('identityVerified') identityVerified: boolean,
    @Body() dto: CreateFiatWithdrawalRequestDto,
  ) {
    return this.fiatWithdrawalsService.createWithdrawalRequest(
      userId,
      role,
      dto,
      identityVerified,
    );
  }

  @Get('requests')
  @ApiOperation({ summary: 'Lịch sử yêu cầu rút ngân hàng của tôi' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiSuccessResponse('OK')
  @ApiUnauthorizedResponse()
  listMyRequests(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 50;
    return this.fiatWithdrawalsService.listMyRequests(userId, n);
  }
}
