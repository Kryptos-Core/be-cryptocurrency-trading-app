import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for a single market entry on the Dashboard (pair + ticker merged).
 */
export class DashboardMarketDto {
  @ApiProperty({ example: '018e9a7b-1234-7abc-8000-000000000001' })
  pairId!: string;

  @ApiProperty({ example: 'BTC/USDT' })
  symbol!: string;

  @ApiProperty({ example: 2 })
  priceScale!: number;

  @ApiProperty({ example: 6 })
  amountScale!: number;

  @ApiProperty({ example: '50000.00' })
  lastPrice!: string;

  @ApiProperty({ example: '51000.00' })
  high24h!: string;

  @ApiProperty({ example: '49000.00' })
  low24h!: string;

  @ApiProperty({ example: '1200.5' })
  volume24h!: string;

  @ApiProperty({ example: '60250000.00' })
  quoteVolume24h!: string;

  @ApiProperty({ example: '2.50' })
  change24h!: string;

  @ApiProperty({ example: '1250.00' })
  changeAmount24h!: string;

  @ApiProperty({ example: '49990.00' })
  bestBid!: string;

  @ApiProperty({ example: '50010.00' })
  bestAsk!: string;

  @ApiProperty({ example: '48750.00' })
  open24h!: string;

  @ApiProperty({ example: '2024-01-22T10:30:00.000Z' })
  timestamp!: string;
}

/**
 * DTO for a single wallet entry on the Dashboard.
 */
export class DashboardWalletDto {
  @ApiProperty({ example: '018e9a7b-aaaa-7abc-8000-000000000001' })
  walletId!: string;

  @ApiProperty({ example: '018e9a7b-bbbb-7abc-8000-000000000001' })
  currencyId!: string;

  @ApiProperty({ example: 'BTC' })
  currencySymbol!: string;

  @ApiProperty({ example: 'Bitcoin' })
  currencyName!: string;

  @ApiProperty({ example: '0.05000000' })
  available!: string;

  @ApiProperty({ example: '0.01000000' })
  frozen!: string;

  @ApiProperty({ example: '0.06000000' })
  total!: string;

  @ApiProperty({ example: '3000.00', description: 'Estimated USDT value from Redis price cache' })
  usdValue!: string;
}

/**
 * Dashboard aggregated response DTO.
 * Single REST call replaces 3 separate calls (markets + tickers + wallets).
 */
export class DashboardResponseDto {
  @ApiProperty({ example: '12345.67', description: 'Total portfolio value in USDT' })
  portfolioTotal!: string;

  @ApiProperty({ example: 5, description: 'Total number of wallets' })
  walletCount!: number;

  @ApiProperty({ example: 3, description: 'Wallets with non-zero balance' })
  activeWalletCount!: number;

  @ApiProperty({ type: [DashboardMarketDto], description: 'Top markets sorted by 24h quote volume' })
  topMarkets!: DashboardMarketDto[];

  @ApiProperty({ type: [DashboardWalletDto], description: 'User wallets with USD value estimation' })
  wallets!: DashboardWalletDto[];
}
