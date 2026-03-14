import { Controller, Post, Body, Req, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DepositsService } from './deposits.service';
import { CreateFiatDepositDto } from './dto/create-deposit.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { Request } from 'express';

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
