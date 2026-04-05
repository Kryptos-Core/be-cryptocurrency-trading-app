import {
 Controller,
 Post,
 Body,
 Req,
 UseGuards,
 Get,
 Param,
 Query,
 ParseIntPipe,
 DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DepositsService } from './deposits.service';
import { CreateFiatDepositDto } from './dto/create-deposit.dto';
import { JwtAuthGuard, RoleGuard, PermissionGuard } from '@/common/guards';
import { Request } from 'express';
import { RequireRoles, RequirePermissions } from '@/common/decorators';
import { UserRole, Permission } from '@/common/enums';

@ApiTags('Deposits')
@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new deposit link using PayOS' })
  async createDepositLink(
    @Req() req: Request,
    @Body() dto: CreateFiatDepositDto,
  ) {
    const user = req.user as any;
    return this.depositsService.createPaymentLink(user.userId, dto.amount);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user deposits' })
  async getMyDeposits(@Req() req: Request) {
    const user = req.user as any;
    return this.depositsService.getMyDeposits(user.userId);
  }

  @Get(':orderCode/sync-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Sync payment status directly from PayOS (useful for local/dev when webhook is unreachable)',
  })
  async syncDepositStatus(
    @Req() req: Request,
    @Param('orderCode', ParseIntPipe) orderCode: number,
  ) {
    const user = req.user as any;
    return this.depositsService.syncPaymentStatusForUser(user.userId, orderCode);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.FINANCE_MANAGER)
  @RequirePermissions(Permission.WALLETS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: List all deposits', description: 'Paginated list of all fiat deposits with optional filters.' })
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
    return this.depositsService.getAllDepositsForAdmin({ userId, status, page, limit });
  }

  @Post('payos-webhook')
  @ApiOperation({ summary: 'Receive PayOS payment webhook notification' })
  async handlePayOSWebhook(@Body() payload: any) {
    const result = await this.depositsService.handleWebhook(payload);
    // Respond exact JSON to satisfy PayOS requirements
    return {
      error: 0,
      message: 'Ok',
      data: result,
    };
  }
}
