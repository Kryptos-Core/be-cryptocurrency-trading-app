import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequireFinanceAccess, RequirePermissions } from '@/common/decorators';
import { Permission } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { GetDepositPreviewQuery, GetDepositsQuery } from './application/queries';
import {
  CreateDepositLinkUseCase,
  HandleDepositWebhookUseCase,
  SyncDepositStatusUseCase,
} from './application/use-cases';
import type { CreateFiatDepositDto } from './dto/create-deposit.dto';

type AuthenticatedRequest = Request & { user: { userId: string } };

@ApiTags('Deposits')
@Controller('deposits')
export class DepositsController {
  constructor(
    private readonly createDepositLink: CreateDepositLinkUseCase,
    private readonly handleWebhookUseCase: HandleDepositWebhookUseCase,
    private readonly syncDepositStatus: SyncDepositStatusUseCase,
    private readonly getDeposits: GetDepositsQuery,
    private readonly getDepositPreview: GetDepositPreviewQuery,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new deposit link using PayOS' })
  async createDepositLinkEndpoint(@Req() req: AuthenticatedRequest, @Body() dto: CreateFiatDepositDto) {
    return this.createDepositLink.execute(req.user.userId, dto.amount);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user deposits' })
  async getMyDeposits(@Req() req: AuthenticatedRequest) {
    return this.getDeposits.getMyDeposits(req.user.userId);
  }

  @Get('checkout-meta')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'PayOS fiat deposit limits for checkout (min/max from active config)' })
  async getCheckoutMeta() {
    return this.getDepositPreview.getCheckoutMeta();
  }

  @Get(':orderCode/sync-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sync payment status directly from PayOS (useful for local/dev when webhook is unreachable)' })
  async syncStatus(@Req() req: AuthenticatedRequest, @Param('orderCode', ParseIntPipe) orderCode: number) {
    return this.syncDepositStatus.execute(req.user.userId, orderCode);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
  @RequireFinanceAccess()
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Admin: List all deposits',
    description: 'Paginated list of all fiat deposits with optional filters.',
  })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'PAID', 'CANCELLED'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllAdmin(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return this.getDeposits.getAllForAdmin({ userId, status, page, limit });
  }

  @Post('payos-webhook')
  @ApiOperation({ summary: 'Receive PayOS payment webhook notification' })
  async handlePayOSWebhook(@Body() payload: unknown) {
    const result = await this.handleWebhookUseCase.execute(payload);
    return { error: 0, message: 'Ok', data: result };
  }
}
