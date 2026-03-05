import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
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
import { CreateMarketPairDto, UpdateMarketPairDto } from './dto';
import { JwtAuthGuard } from '@/common/guards';
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
  ) {
    return this.marketsService.findAll(
      page,
      limit,
      includeInactive,
      includeTickers,
      search,
      baseSymbol,
      quoteSymbol,
    );
  }

  /**
   * Get all active market pairs
   * GET /markets/active
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get('active')
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
   * Get market ticker by pair ID
   * GET /markets/:id/ticker
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/ticker')
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
   * GET /markets/:id/ohlcv?interval=1h&limit=100&range=1d
   * range: 1d | 1M | 3M | 1y | 5y (filter by last 1 day, 1 month, 3 months, 1 year, 5 years)
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/ohlcv')
  @ApiOperation({
    summary: 'Get OHLCV data',
    description: 'Get candlestick data for a market pair. Use range to filter by time: 1d, 1M, 3M, 1y, 5y',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiQuery({ name: 'interval', required: false, type: String, example: '1h' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiQuery({
    name: 'range',
    required: false,
    type: String,
    description: 'Time range: 1d, 1M, 3M, 1y, 5y',
    example: '1d',
  })
  @ApiSuccessResponse('OHLCV retrieved successfully')
  @ApiNotFoundResponse('Market pair not found')
  @ApiBadRequestResponse('Invalid interval')
  @ApiUnauthorizedResponse('Unauthorized')
  async getOHLCV(
    @Param('id') id: string,
    @Query('interval') interval: string = '1h',
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 100,
    @Query('range') range?: string,
  ) {
    return this.marketsService.getOHLCV(id, interval, limit, range);
  }

  /**
   * Get recent trades by pair ID
   * GET /markets/:id/trades?limit=50
   * IMPORTANT: Must be before @Get(':id') to avoid route conflict
   */
  @Get(':id/trades')
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
   * Get market pair by ID
   * GET /markets/:id
   * IMPORTANT: Must be LAST to avoid route conflicts with specific routes
   */
  @Get(':id')
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
  @ApiOperation({
    summary: 'Create new market pair',
    description: 'Create a new trading pair (e.g., BTC/USDT)',
  })
  @ApiBody({ type: CreateMarketPairDto })
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
  @ApiOperation({
    summary: 'Update market pair',
    description: 'Update a specific market pair by its ID',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateMarketPairDto })
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
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete market pair',
    description: 'Soft delete a market pair by setting is_active to false',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiSuccessResponse('Market pair deleted successfully', {
    schema: { example: null },
  })
  @ApiNotFoundResponse('Market pair not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async remove(@Param('id') id: string) {
    await this.marketsService.remove(id);
  }
}
