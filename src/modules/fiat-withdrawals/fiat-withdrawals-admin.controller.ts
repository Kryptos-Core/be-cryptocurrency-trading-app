import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  CurrentUser,
  RequirePermissions,
  RequireRoles,
} from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { FiatWithdrawalsService } from './fiat-withdrawals.service';
import { CompleteFiatWithdrawalDto, RejectWithReasonDto } from './dto';

@ApiTags('fiat-withdrawals-admin')
@ApiBearerAuth('JWT-auth')
@Controller('fiat-withdrawals/admin')
@UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
@RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
export class FiatWithdrawalsAdminController {
  constructor(private readonly fiatWithdrawalsService: FiatWithdrawalsService) {}

  @Get('bank-accounts')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({ summary: 'Admin: danh sách tài khoản ngân hàng user' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiSuccessResponse('OK')
  @ApiUnauthorizedResponse()
  listBankAccounts(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '20', 10) || 20));
    return this.fiatWithdrawalsService.adminListBankAccounts({
      status,
      userId,
      page,
      limit,
    });
  }

  @Get('bank-accounts/:bankAccountId')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({ summary: 'Admin: chi tiết STK (decrypt) cho bộ phận tài chính' })
  @ApiParam({ name: 'bankAccountId' })
  @ApiSuccessResponse('OK')
  bankAccountDetail(@Param('bankAccountId') bankAccountId: string) {
    return this.fiatWithdrawalsService.adminBankAccountDetailForFinance(bankAccountId);
  }

  @Get('bank-providers/health')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({
    summary: 'Admin: health-check provider ngân hàng (có thông tin lỗi chi tiết)',
    description:
      'Giống GET /fiat-withdrawals/providers/health nhưng trả thêm message lỗi từng provider cho vận hành.',
  })
  @ApiSuccessResponse('OK')
  bankProvidersHealthDetailed() {
    return this.fiatWithdrawalsService.healthCheckBankProviders({ includeDetails: true });
  }

  @Post('bank-accounts/:bankAccountId/verify')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({ summary: 'Admin: xác minh tài khoản ngân hàng' })
  @ApiParam({ name: 'bankAccountId' })
  @ApiSuccessResponse('OK')
  @ApiBadRequestResponse()
  verifyBankAccount(
    @CurrentUser('userId') actorUserId: string,
    @Param('bankAccountId') bankAccountId: string,
  ) {
    return this.fiatWithdrawalsService.adminVerifyBankAccount(actorUserId, bankAccountId);
  }

  @Post('bank-accounts/:bankAccountId/reject')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({ summary: 'Admin: từ chối tài khoản ngân hàng' })
  @ApiParam({ name: 'bankAccountId' })
  @ApiSuccessResponse('OK')
  rejectBankAccount(
    @CurrentUser('userId') actorUserId: string,
    @Param('bankAccountId') bankAccountId: string,
    @Body() dto: RejectWithReasonDto,
  ) {
    return this.fiatWithdrawalsService.adminRejectBankAccount(actorUserId, bankAccountId, dto);
  }

  @Get('requests')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({ summary: 'Admin: danh sách yêu cầu rút ngân hàng' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiSuccessResponse('OK')
  listRequests(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('page') pageStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(limitStr ?? '20', 10) || 20));
    return this.fiatWithdrawalsService.adminListRequests({ status, userId, page, limit });
  }

  @Get('requests/:requestId')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({ summary: 'Admin: chi tiết yêu cầu + STK đầy đủ' })
  @ApiParam({ name: 'requestId' })
  @ApiSuccessResponse('OK')
  getRequest(@Param('requestId') requestId: string) {
    return this.fiatWithdrawalsService.adminGetRequest(requestId);
  }

  @Post('requests/:requestId/complete')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({
    summary: 'Admin: hoàn tất sau khi đã chuyển khoản thủ công',
    description: 'Unfreeze + debit USDT, ghi transfer reference.',
  })
  @ApiParam({ name: 'requestId' })
  @ApiSuccessResponse('OK')
  @ApiBadRequestResponse()
  completeRequest(
    @CurrentUser('userId') actorUserId: string,
    @Param('requestId') requestId: string,
    @Body() dto: CompleteFiatWithdrawalDto,
  ) {
    return this.fiatWithdrawalsService.adminCompleteRequest(actorUserId, requestId, dto);
  }

  @Post('requests/:requestId/reject')
  @RequirePermissions(Permission.WITHDRAWALS_APPROVE)
  @ApiOperation({ summary: 'Admin: từ chối yêu cầu rút — hoàn freeze' })
  @ApiParam({ name: 'requestId' })
  @ApiSuccessResponse('OK')
  rejectRequest(
    @CurrentUser('userId') actorUserId: string,
    @Param('requestId') requestId: string,
    @Body() dto: RejectWithReasonDto,
  ) {
    return this.fiatWithdrawalsService.adminRejectRequest(actorUserId, requestId, dto);
  }
}
