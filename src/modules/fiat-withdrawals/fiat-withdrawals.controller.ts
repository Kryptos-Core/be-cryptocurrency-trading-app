import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
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
  @Get('providers/health')
  @ApiOperation({
    summary: 'Health-check provider ngân hàng (monitoring / load balancer)',
    description:
      'Kiểm tra từng provider theo thứ tự chain: healthUrl hoặc banksUrl. Không gọi lookup STK để tránh quota.',
  })
  @ApiSuccessResponse('OK')
  bankProvidersHealth() {
    return this.fiatWithdrawalsService.healthCheckBankProviders();
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
    description: 'Cần role VERIFIED_USER (hoặc admin). Số dư sẽ bị freeze chờ duyệt.',
  })
  @ApiSuccessResponse('Đã tạo yêu cầu')
  @ApiBadRequestResponse()
  @ApiUnauthorizedResponse()
  createRequest(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: UserRole,
    @Body() dto: CreateFiatWithdrawalRequestDto,
  ) {
    return this.fiatWithdrawalsService.createWithdrawalRequest(userId, role, dto);
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
