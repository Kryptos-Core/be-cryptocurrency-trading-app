import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { WalletTransactionDto } from './dto/wallet-transaction.dto';
import { JwtAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';
import {
  ApiSuccessResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@/common/decorators';

/**
 * Wallets Controller
 * API endpoints for wallet operations
 */
@ApiTags('wallets')
@ApiBearerAuth('JWT-auth')
@Controller('wallets')
@UseGuards(JwtAuthGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  /**
   * Get current user's wallet balance by currency
   * GET /wallets/balance?currencyId=1
   */
  @Get('balance')
  @ApiOperation({
    summary: 'Get wallet balance',
    description: 'Retrieve wallet balance for a specific currency',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: Number, example: 1 })
  @ApiSuccessResponse('Wallet balance retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async getBalance(
    @CurrentUser('userId') userId: number,
    @Query('currencyId', ParseIntPipe) currencyId: number,
  ) {
    return this.walletsService.getBalance(userId, currencyId);
  }

  /**
   * Apply wallet transaction
   * POST /wallets/transactions
   */
  @Post('transactions')
  @ApiOperation({
    summary: 'Apply wallet transaction',
    description: 'Credit, debit, freeze, unfreeze, or transfer wallet balance',
  })
  @ApiBody({ type: WalletTransactionDto })
  @ApiSuccessResponse('Wallet transaction applied successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiUnauthorizedResponse('Unauthorized')
  async applyTransaction(
    @CurrentUser('userId') userId: number,
    @Body() dto: WalletTransactionDto,
  ) {
    return this.walletsService.applyTransaction(userId, dto);
  }
}
