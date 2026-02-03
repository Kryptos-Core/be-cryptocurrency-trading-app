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

  /**
   * Sync wallet balance with Binance exchange
   * POST /wallets/sync?currencyId=1
   */
  @Post('sync')
  @ApiOperation({
    summary: 'Sync balance with Binance',
    description: 'Fetch and sync wallet balance from Binance testnet',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: Number, example: 1 })
  @ApiSuccessResponse('Balance synced successfully')
  @ApiBadRequestResponse('Sync failed')
  @ApiUnauthorizedResponse('Unauthorized')
  async syncBalanceWithExchange(
    @CurrentUser('userId') userId: number,
    @Query('currencyId', ParseIntPipe) currencyId: number,
  ) {
    return this.walletsService.syncBalanceWithExchange(userId, currencyId);
  }

  /**
   * Get exchange balance
   * GET /wallets/exchange-balance?currencyId=1
   */
  @Get('exchange-balance')
  @ApiOperation({
    summary: 'Get exchange balance',
    description: 'Get current balance directly from Binance exchange',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: Number, example: 1 })
  @ApiSuccessResponse('Exchange balance retrieved successfully')
  @ApiBadRequestResponse('Failed to get balance from exchange')
  @ApiUnauthorizedResponse('Unauthorized')
  async getExchangeBalance(
    @CurrentUser('userId') userId: number,
    @Query('currencyId', ParseIntPipe) currencyId: number,
  ) {
    return this.walletsService.syncBalanceWithExchange(userId, currencyId);
  }

  /**
   * Get reconciliation status
   * GET /wallets/reconciliation-status
   */
  @Get('reconciliation-status')
  @ApiOperation({
    summary: 'Check reconciliation status',
    description: 'Check balance discrepancy between internal wallet and Binance',
  })
  @ApiQuery({ name: 'currencyId', required: true, type: Number, example: 1 })
  @ApiSuccessResponse('Reconciliation status retrieved')
  @ApiBadRequestResponse('Reconciliation check failed')
  @ApiUnauthorizedResponse('Unauthorized')
  async getReconciliationStatus(
    @CurrentUser('userId') userId: number,
    @Query('currencyId', ParseIntPipe) currencyId: number,
  ) {
    return this.walletsService.reconcileBalance(userId, currencyId);
  }

  /**
   * Process external deposit from Binance
   * POST /wallets/process-deposit
   */
  @Post('process-deposit')
  @ApiOperation({
    summary: 'Process external deposit',
    description: 'Record a deposit received from Binance testnet',
  })
  @ApiBody({
    schema: {
      properties: {
        currencyId: { type: 'number', example: 1 },
        txId: { type: 'string', example: 'tx_123456789' },
        amount: { type: 'string', example: '10.5' },
      },
    },
  })
  @ApiSuccessResponse('Deposit processed successfully')
  @ApiBadRequestResponse('Invalid deposit data')
  @ApiUnauthorizedResponse('Unauthorized')
  async processExternalDeposit(
    @CurrentUser('userId') userId: number,
    @Body()
    body: {
      currencyId: number;
      txId: string;
      amount: string;
    },
  ) {
    await this.walletsService.processExternalDeposit(
      userId,
      body.currencyId,
      body.txId,
      body.amount,
    );
    return { success: true, message: 'Deposit processed' };
  }

  /**
   * Create withdrawal request to Binance
   * POST /wallets/create-withdrawal
   */
  @Post('create-withdrawal')
  @ApiOperation({
    summary: 'Create withdrawal request',
    description: 'Create a withdrawal request to send funds to Binance testnet',
  })
  @ApiBody({
    schema: {
      properties: {
        currencyId: { type: 'number', example: 1 },
        amount: { type: 'string', example: '5.25' },
      },
    },
  })
  @ApiSuccessResponse('Withdrawal request created')
  @ApiBadRequestResponse('Invalid withdrawal request')
  @ApiUnauthorizedResponse('Unauthorized')
  async createWithdrawalRequest(
    @CurrentUser('userId') userId: number,
    @Body() body: { currencyId: number; amount: string },
  ) {
    return this.walletsService.createWithdrawalRequest(
      userId,
      body.currencyId,
      body.amount,
    );
  }
}
