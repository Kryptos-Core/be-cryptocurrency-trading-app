import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators';
import { JwtAuthGuard } from '@/common/guards';
import {
  PlaceSpotOrderDto,
  CancelSpotOrderDto,
  GetOpenOrdersDto,
  GetOrderHistoryDto,
  BinanceBalanceDto,
  BinanceOrderDto,
  BinanceSpotOrderResultDto,
  BinanceFuturesPositionDto,
  BinanceFuturesBalanceDto,
  BinanceOrderResultDto,
} from './dto';
import { BinanceProxyService } from './binance-proxy.service';

@ApiTags('binance-proxy')
@ApiBearerAuth('JWT-auth')
@Controller('binance-proxy')
@UseGuards(JwtAuthGuard)
export class BinanceProxyController {
  constructor(private readonly service: BinanceProxyService) {}

  // ── SPOT ──────────────────────────────────────────────────────────────

  @Get('spot/balance')
  @ApiOperation({ summary: 'Get Spot wallet balances from user\'s Binance account' })
  async getSpotBalance(
    @CurrentUser('userId') userId: string,
    @Query('credentialId') credentialId: string,
  ): Promise<BinanceBalanceDto[]> {
    return this.service.getSpotBalance(userId, credentialId);
  }

  @Post('spot/order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place a Spot order on Binance using user\'s credentials' })
  async placeSpotOrder(
    @CurrentUser('userId') userId: string,
    @Body() dto: PlaceSpotOrderDto,
  ): Promise<BinanceSpotOrderResultDto> {
    return this.service.placeSpotOrder(userId, dto);
  }

  @Delete('spot/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a Spot order on Binance' })
  async cancelSpotOrder(
    @CurrentUser('userId') userId: string,
    @Body() dto: CancelSpotOrderDto,
  ): Promise<void> {
    await this.service.cancelSpotOrder(userId, dto);
  }

  @Get('spot/orders')
  @ApiOperation({ summary: 'Get open Spot orders from Binance' })
  async getOpenOrders(
    @CurrentUser('userId') userId: string,
    @Query('credentialId') credentialId: string,
    @Query('symbol') symbol?: string,
  ): Promise<BinanceOrderDto[]> {
    return this.service.getOpenOrders(userId, credentialId, symbol);
  }

  @Get('spot/order-history')
  @ApiOperation({ summary: 'Get Spot order history from Binance' })
  async getOrderHistory(
    @CurrentUser('userId') userId: string,
    @Query('credentialId') credentialId: string,
    @Query('symbol') symbol?: string,
    @Query('limit') limit?: number,
  ): Promise<BinanceOrderDto[]> {
    return this.service.getOrderHistory(userId, credentialId, symbol, limit);
  }

  // ── FUTURES ───────────────────────────────────────────────────────────

  @Get('futures/balance')
  @ApiOperation({ summary: 'Get USD-M Futures account balances from user\'s Binance account' })
  async getFuturesBalance(
    @CurrentUser('userId') userId: string,
    @Query('credentialId') credentialId: string,
  ): Promise<BinanceFuturesBalanceDto[]> {
    return this.service.getFuturesBalance(userId, credentialId);
  }

  @Get('futures/positions')
  @ApiOperation({ summary: 'Get USD-M Futures positions from user\'s Binance account' })
  async getFuturesPositions(
    @CurrentUser('userId') userId: string,
    @Query('credentialId') credentialId: string,
  ): Promise<BinanceFuturesPositionDto[]> {
    return this.service.getFuturesPositions(userId, credentialId);
  }

  @Post('futures/order')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place a USD-M Futures order on Binance using user\'s credentials' })
  async placeFuturesOrder(
    @CurrentUser('userId') userId: string,
    @Body()
    dto: {
      credentialId: string;
      symbol: string;
      side: string;
      positionSide?: string;
      type: string;
      quantity: string;
      price?: number;
      timeInForce?: string;
      stopPrice?: number;
      leverage?: number;
    },
  ): Promise<BinanceOrderResultDto> {
    return this.service.placeFuturesOrder(userId, dto.credentialId, dto);
  }

  @Delete('futures/order')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a USD-M Futures order on Binance' })
  async cancelFuturesOrder(
    @CurrentUser('userId') userId: string,
    @Body()
    dto: {
      credentialId: string;
      symbol: string;
      orderId: string;
    },
  ): Promise<void> {
    await this.service.cancelFuturesOrder(userId, dto.credentialId, dto.symbol, dto.orderId);
  }
}
