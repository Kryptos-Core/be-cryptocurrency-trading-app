import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export enum BinanceOrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum BinanceOrderType {
  LIMIT = 'LIMIT',
  MARKET = 'MARKET',
  STOP_LOSS = 'STOP_LOSS',
  STOP_LOSS_LIMIT = 'STOP_LOSS_LIMIT',
  TAKE_PROFIT = 'TAKE_PROFIT',
  TAKE_PROFIT_LIMIT = 'TAKE_PROFIT_LIMIT',
  LIMIT_MAKER = 'LIMIT_MAKER',
}

export enum BinanceTimeInForce {
  GTC = 'GTC',
  IOC = 'IOC',
  FOK = 'FOK',
}

export class PlaceSpotOrderDto {
  @ApiProperty({ description: 'Credential UUID', example: '...' })
  @IsUUID()
  @IsNotEmpty()
  credentialId!: string;

  @ApiProperty({ description: 'Trading pair symbol', example: 'BNBUSDT' })
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @ApiProperty({ enum: BinanceOrderSide })
  @IsEnum(BinanceOrderSide)
  side!: BinanceOrderSide;

  @ApiProperty({ enum: BinanceOrderType })
  @IsEnum(BinanceOrderType)
  type!: BinanceOrderType;

  @ApiProperty({ description: 'Price for LIMIT orders', required: false })
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiProperty({ description: 'Order quantity', example: '1.5' })
  @IsString()
  @IsNotEmpty()
  quantity!: string;

  @ApiProperty({ enum: BinanceTimeInForce, required: false, default: BinanceTimeInForce.GTC })
  @IsOptional()
  @IsEnum(BinanceTimeInForce)
  timeInForce?: BinanceTimeInForce;

  @ApiProperty({ description: 'Stop price for STOP_LOSS/TAKE_PROFIT orders', required: false })
  @IsOptional()
  @IsNumber()
  stopPrice?: number;
}

export class CancelSpotOrderDto {
  @ApiProperty({ description: 'Credential UUID' })
  @IsUUID()
  @IsNotEmpty()
  credentialId!: string;

  @ApiProperty({ description: 'Trading pair symbol', example: 'BNBUSDT' })
  @IsString()
  @IsNotEmpty()
  symbol!: string;

  @ApiProperty({ description: 'Order ID from Binance' })
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}

export class GetSpotBalanceDto {
  @ApiProperty({ description: 'Credential UUID' })
  @IsUUID()
  @IsNotEmpty()
  credentialId!: string;
}

export class GetOpenOrdersDto {
  @ApiProperty({ description: 'Credential UUID' })
  @IsUUID()
  @IsNotEmpty()
  credentialId!: string;

  @ApiProperty({ description: 'Trading pair symbol', example: 'BNBUSDT', required: false })
  @IsOptional()
  @IsString()
  symbol?: string;
}

export class GetOrderHistoryDto {
  @ApiProperty({ description: 'Credential UUID' })
  @IsUUID()
  @IsNotEmpty()
  credentialId!: string;

  @ApiProperty({ description: 'Trading pair symbol', example: 'BNBUSDT', required: false })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiProperty({ description: 'Number of orders to return', default: 50 })
  @IsOptional()
  @IsNumber()
  limit?: number;
}

// Response DTOs

export class BinanceBalanceDto {
  @ApiProperty()
  asset!: string;
  @ApiProperty()
  free!: string;
  @ApiProperty()
  locked!: string;
}

export class BinanceOrderDto {
  @ApiProperty()
  orderId!: string;
  @ApiProperty()
  symbol!: string;
  @ApiProperty()
  side!: string;
  @ApiProperty()
  type!: string;
  @ApiProperty()
  price!: string;
  @ApiProperty()
  origQty!: string;
  @ApiProperty()
  executedQty!: string;
  @ApiProperty()
  status!: string;
  @ApiProperty()
  time!: number;
  @ApiProperty()
  updateTime!: number;
  @ApiProperty()
  isIsolated!: boolean;
}

export class BinanceSpotOrderResultDto {
  @ApiProperty()
  orderId!: string;
  @ApiProperty()
  symbol!: string;
  @ApiProperty()
  side!: string;
  @ApiProperty()
  type!: string;
  @ApiProperty()
  price!: string;
  @ApiProperty()
  origQty!: string;
  @ApiProperty()
  executedQty!: string;
  @ApiProperty()
  status!: string;
  @ApiProperty()
  transactTime!: number;
}

export class BinanceFuturesPositionDto {
  @ApiProperty()
  symbol!: string;
  @ApiProperty()
  positionSide!: string;
  @ApiProperty()
  positionAmt!: string;
  @ApiProperty()
  entryPrice!: string;
  @ApiProperty()
  markPrice!: string;
  @ApiProperty()
  unrealizedPnL!: string;
  @ApiProperty()
  marginType!: string;
  @ApiProperty()
  isolatedMargin!: string;
  @ApiProperty()
  leverage!: string;
}

export class BinanceFuturesBalanceDto {
  @ApiProperty()
  asset!: string;
  @ApiProperty()
  walletBalance!: string;
  @ApiProperty()
  unrealizedProfit!: string;
  @ApiProperty()
  availableBalance!: string;
}

export class BinanceOrderResultDto {
  @ApiProperty()
  orderId!: string;
  @ApiProperty()
  symbol!: string;
  @ApiProperty()
  side!: string;
  @ApiProperty()
  positionSide!: string;
  @ApiProperty()
  type!: string;
  @ApiProperty()
  price!: string;
  @ApiProperty()
  origQty!: string;
  @ApiProperty()
  executedQty!: string;
  @ApiProperty()
  status!: string;
  @ApiProperty()
  avgPrice!: string;
}
