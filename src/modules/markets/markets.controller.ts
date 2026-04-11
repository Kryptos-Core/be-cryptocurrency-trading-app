import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
  ParseIntPipe,
  ParseBoolPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { MarketsService } from './markets.service';
import { resolveOhlcvLocale } from './ohlcv-locale.util';
import { CreateMarketPairDto, UpdateMarketPairDto } from './dto';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { Public } from '@/common/decorators';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import {
  ApiSuccessResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
} from '@/common/decorators';

/**
 * Markets Controller
 * Controller Pattern: Handle HTTP requests
 * Single Responsibility: Only handle HTTP layer
 */
@ApiTags('markets')
@ApiBearerAuth('JWT-auth')
@Controller('markets')
@UseGuards(JwtAuthGuard) // All routes require authentication
export class MarketsController {
  constructor(private readonly marketsService: MarketsService) {}

  /**
   * Get all market pairs with pagination, search and filter
   * GET /markets?page=1&limit=10&includeInactive=false&search=BTC&baseSymbol=BTC&quoteSymbol=USDT
   */
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get all market pairs',
    description:
      'Retrieve a paginated list of market pairs. Use search for partial symbol match (e.g. "BTC"); baseSymbol/quoteSymbol filter by base/quote currency.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, example: false })
  @ApiQuery({
    name: 'includeTickers',
    required: false,
    type: Boolean,
    example: false,
    description: 'Include 24h tickers for the returned pairs (one request instead of GET /markets + GET /markets/tickers/all)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by symbol (partial match, e.g. "BTC" matches BTC/USDT, ETH/BTC)',
  })
  @ApiQuery({
    name: 'baseSymbol',
    required: false,
    type: String,
    description: 'Filter by base currency symbol (e.g. BTC)',
  })
  @ApiQuery({
    name: 'quoteSymbol',
    required: false,
    type: String,
    description: 'Filter by quote currency symbol (e.g. USDT)',
  })
  @ApiQuery({
    name: 'quoteSymbols',
    required: false,
    type: String,
    description: 'Filter by multiple quote symbols (comma-separated, e.g. USDT,USDC)',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    enum: ['symbol', 'base', 'quote', 'createdAt'],
    description: 'Sort field for market list',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort direction',
  })
  @ApiQuery({
    name: 'fuzzySearch',
    required: false,
    type: Boolean,
    example: false,
    description: 'When true, search also matches base/quote currency names',
  })
  @ApiSuccessResponse('Market pairs retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive: boolean = false,
    @Query('includeTickers', new ParseBoolPipe({ optional: true }))
    includeTickers: boolean = false,
    @Query('search') search?: string,
    @Query('baseSymbol') baseSymbol?: string,
    @Query('quoteSymbol') quoteSymbol?: string,
    @Query('quoteSymbols') quoteSymbols?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: string,
    @Query('fuzzySearch', new ParseBoolPipe({ optional: true })) fuzzySearch: boolean = false,
  ) {
    return this.marketsService.findAll(
      page,
      limit,
      includeInactive,
      includeTickers,
      search,
      baseSymbol,
      quoteSymbol,
      quoteSymbols,
      sortBy,
      sortOrder,
      fuzzySearch,
    );
  }

  /**
   * Get all active market pairs
   * GET /markets/active
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get('active')
  @Public()
  @ApiOperation({
    summary: 'Get all active market pairs',
    description: 'Retrieve all active market pairs (cached)',
  })
  @ApiSuccessResponse('Active market pairs retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findActive() {
    return this.marketsService.findActive();
  }

  /**
   * Get all tickers
   * GET /markets/tickers/all
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get('tickers/all')
  @Public()
  @ApiOperation({
    summary: 'Get all market tickers',
    description: 'Get 24h statistics for all active market pairs',
  })
  @ApiSuccessResponse('All market tickers retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async getAllTickers() {
    return this.marketsService.getAllTickers();
  }

  /**
   * Get market pair by symbol
   * GET /markets/symbol/:symbol
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get('symbol/:symbol')
  @Public()
  @ApiOperation({
    summary: 'Get market pair by symbol',
    description: 'Retrieve a specific market pair by its symbol (e.g., BTC/USDT)',
  })
  @ApiParam({ name: 'symbol', type: String, example: 'BTC/USDT' })
  @ApiSuccessResponse('Market pair retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findBySymbol(@Param('symbol') symbol: string) {
    return this.marketsService.findBySymbol(symbol);
  }

  /**
   * Get market ticker by symbol
   * GET /markets/symbol/:symbol/ticker
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get('symbol/:symbol/ticker')
  @Public()
  @ApiOperation({
    summary: 'Get market ticker by symbol',
    description: 'Get 24h market statistics for a trading pair by symbol',
  })
  @ApiParam({ name: 'symbol', type: String, example: 'BTC/USDT' })
  @ApiSuccessResponse('Market ticker retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getTickerBySymbol(@Param('symbol') symbol: string) {
    return this.marketsService.getTickerBySymbol(symbol);
  }

  /**
   * Get order book by symbol
   * GET /markets/symbol/:symbol/orderbook?limit=20
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get('symbol/:symbol/orderbook')
  @Public()
  @ApiOperation({
    summary: 'Get order book by symbol',
    description: 'Get order book (bids and asks) for a market pair by symbol',
  })
  @ApiParam({ name: 'symbol', type: String, example: 'BTC/USDT' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiSuccessResponse('Order book retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getOrderBookBySymbol(
    @Param('symbol') symbol: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
  ) {
    return this.marketsService.getOrderBookBySymbol(symbol, limit);
  }

  /**
   * Get recent trades by symbol
   * GET /markets/symbol/:symbol/trades?limit=50
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get('symbol/:symbol/trades')
  @Public()
  @ApiOperation({
    summary: 'Get recent trades by symbol',
    description: 'Get recent trades for a market pair by symbol',
  })
  @ApiParam({ name: 'symbol', type: String, example: 'BTC/USDT' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiSuccessResponse('Recent trades retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getRecentTradesBySymbol(
    @Param('symbol') symbol: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 50,
  ) {
    return this.marketsService.getRecentTradesBySymbol(symbol, limit);
  }

  /**
   * Get real-time depth snapshot by symbol
   * GET /markets/symbol/:symbol/depth?limit=10
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get('symbol/:symbol/depth')
  @Public()
  @ApiOperation({
    summary: 'Get real-time order book depth by symbol',
    description: 'Get aggregated depth levels from in-memory matching engine, by pair symbol',
  })
  @ApiParam({ name: 'symbol', type: String, example: 'BTC/USDT' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    enum: [5, 10, 20],
    description: 'Number of price levels per side (default 10)',
  })
  @ApiSuccessResponse('Depth snapshot retrieved successfully')
  @ApiBadRequestResponse('Depth limit must be 5, 10, or 20')
  async getDepthBySymbol(
    @Param('symbol') symbol: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    return this.marketsService.getDepthSnapshotBySymbol(symbol, limit);
  }

  /**
   * Get market ticker by pair ID
   * GET /markets/:id/ticker
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/ticker')
  @Public()
  @ApiOperation({
    summary: 'Get market ticker',
    description: 'Get 24h market statistics for a trading pair',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiSuccessResponse('Market ticker retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getTicker(@Param('id') id: string) {
    return this.marketsService.getTicker(id);
  }

  /**
   * Get order book by pair ID
   * GET /markets/:id/orderbook?limit=20
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/orderbook')
  @Public()
  @ApiOperation({
    summary: 'Get order book',
    description: 'Get order book (bids and asks) for a market pair',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiSuccessResponse('Order book retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getOrderBook(
    @Param('id') id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 20,
  ) {
    return this.marketsService.getOrderBook(id, limit);
  }

  /**
   * Get OHLCV by pair ID
    * GET /markets/:id/ohlcv?limit=100&range=1d
   * range: 1d | 1M | 3M | 1y | 5y (filter by last 1 day, 1 month, 3 months, 1 year, 5 years)
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/ohlcv')
  @Public()
  @ApiOperation({
    summary: 'Get OHLCV data',
    description: 'Get candlestick data for a market pair. Use range to filter by time: 1d, 1M, 3M, 1y, 5y',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiQuery({
    name: 'range',
    required: false,
    type: String,
    description: 'Time range: 1d, 1M, 3M, 1y, 5y',
    example: '1d',
  })
  @ApiQuery({
    name: 'locale',
    required: false,
    type: String,
    description: 'Optional BCP 47 locale (e.g. vi-VN). Overrides Accept-Language for response metadata.',
    example: 'vi-VN',
  })
  @ApiSuccessResponse('OHLCV retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiBadRequestResponse('Invalid range')
  @ApiUnauthorizedResponse('Unauthorized')
  async getOHLCV(
    @Param('id') id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 100,
    @Query('range') range?: string,
    @Query('locale') locale?: string,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const resolved = resolveOhlcvLocale(locale, acceptLanguage);
    return this.marketsService.getOHLCV(id, limit, range, resolved);
  }

  /**
   * Get recent trades by pair ID
   * GET /markets/:id/trades?limit=50
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/trades')
  @Public()
  @ApiOperation({
    summary: 'Get recent trades',
    description: 'Get recent trades for a market pair',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiSuccessResponse('Recent trades retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async getRecentTrades(
    @Param('id') id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 50,
  ) {
    return this.marketsService.getRecentTrades(id, limit);
  }

  /**
   * Get real-time depth snapshot from in-memory matching engine
   * GET /markets/:id/depth?limit=10
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/depth')
  @Public()
  @ApiOperation({
    summary: 'Get real-time order book depth',
    description:
      'Get aggregated depth levels (price → total amount + order count) from the in-memory matching engine order book. Faster and more current than /orderbook (which queries DB stored procedures).',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    enum: [5, 10, 20],
    description: 'Number of price levels per side (default 10)',
  })
  @ApiSuccessResponse('Depth snapshot retrieved successfully')
  @ApiBadRequestResponse('Depth limit must be 5, 10, or 20')
  async getDepth(
    @Param('id') id: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
  ) {
    return this.marketsService.getDepthSnapshot(id, limit);
  }

  /**
   * Get market pair by ID
   * GET /markets/:id
   * IMPORTANT: Must be LAST to avoid route conflicts with specific routes
   */
  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Get market pair by ID',
    description: 'Retrieve a specific market pair by its ID',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiSuccessResponse('Market pair retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findOne(@Param('id') id: string) {
    return this.marketsService.findOne(id);
  }

  /**
   * Create new market pair
   * POST /markets
   */
  @Post()
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create new market pair',
    description: 'Create a new trading pair (e.g., BTC/USDT)',
  })
  @ApiBody({ type: CreateMarketPairDto })
  @RequirePermissions(Permission.MARKETS_MANAGE)
  @ApiCreatedResponse('Market pair created successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiConflictResponse('Market pair already exists')
  @ApiUnauthorizedResponse('Unauthorized')
  async create(@Body() createMarketPairDto: CreateMarketPairDto) {
    return this.marketsService.create(createMarketPairDto);
  }

  /**
   * Update market pair
   * PATCH /markets/:id
   */
  @Patch(':id')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update market pair',
    description: 'Update a specific market pair by its ID',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateMarketPairDto })
  @RequirePermissions(Permission.MARKETS_MANAGE)
  @ApiSuccessResponse('Market pair updated successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiNotFoundResponse('Market pair not found')
  @ApiConflictResponse('Market pair already exists')
  @ApiUnauthorizedResponse('Unauthorized')
  async update(
    @Param('id') id: string,
    @Body() updateMarketPairDto: UpdateMarketPairDto,
  ) {
    return this.marketsService.update(id, updateMarketPairDto);
  }

  /**
   * Delete market pair (soft delete)
   * DELETE /markets/:id
   */
  @Delete(':id')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete market pair',
    description: 'Soft delete a market pair by setting is_active to false',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @RequirePermissions(Permission.MARKETS_MANAGE)
  @ApiSuccessResponse('Market pair deleted successfully', {
    schema: { example: null },
  })
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async remove(@Param('id') id: string) {
    await this.marketsService.remove(id);
  }
}
