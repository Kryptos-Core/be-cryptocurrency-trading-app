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
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto';
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
 * Currencies Controller
 * Controller Pattern: Handle HTTP requests
 * Single Responsibility: Only handle HTTP layer
 */
@ApiTags('currencies')
@ApiBearerAuth('JWT-auth')
@Controller('currencies')
@UseGuards(JwtAuthGuard) // All routes require authentication
export class CurrenciesController {
  constructor(private readonly currenciesService: CurrenciesService) {}

  /**
   * Get all currencies with pagination
   * GET /currencies?page=1&limit=10&includeInactive=false
   */
  @Get()
  @ApiOperation({
    summary: 'Get all currencies',
    description: 'Retrieve a paginated list of all currencies',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, example: false })
  @ApiSuccessResponse('Currencies retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive: boolean = false,
  ) {
    return this.currenciesService.findAll(page, limit, includeInactive);
  }

  /**
   * Get all active currencies
   * GET /currencies/active
   */
  @Get('active')
  @ApiOperation({
    summary: 'Get all active currencies',
    description: 'Retrieve all active currencies (cached)',
  })
  @ApiSuccessResponse('Active currencies retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findActive() {
    return this.currenciesService.findActive();
  }

  /**
   * Get all tradable currencies
   * GET /currencies/tradable
   */
  @Get('tradable')
  @ApiOperation({
    summary: 'Get all tradable currencies',
    description: 'Retrieve all tradable and active currencies (cached)',
  })
  @ApiSuccessResponse('Tradable currencies retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findTradable() {
    return this.currenciesService.findTradable();
  }

  /**
   * Get currency by ID
   * GET /currencies/:id
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get currency by ID',
    description: 'Retrieve a specific currency by its ID',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiSuccessResponse('Currency retrieved successfully')
  @ApiNotFoundResponse('Currency not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.currenciesService.findOne(id);
  }

  /**
   * Get currency by symbol
   * GET /currencies/symbol/:symbol
   */
  @Get('symbol/:symbol')
  @ApiOperation({
    summary: 'Get currency by symbol',
    description: 'Retrieve a specific currency by its symbol (e.g., BTC, ETH)',
  })
  @ApiParam({ name: 'symbol', type: String, example: 'BTC' })
  @ApiSuccessResponse('Currency retrieved successfully')
  @ApiNotFoundResponse('Currency not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findBySymbol(@Param('symbol') symbol: string) {
    return this.currenciesService.findBySymbol(symbol);
  }

  /**
   * Create new currency
   * POST /currencies
   */
  @Post()
  @ApiOperation({
    summary: 'Create new currency',
    description: 'Create a new cryptocurrency entry',
  })
  @ApiBody({ type: CreateCurrencyDto })
  @ApiCreatedResponse('Currency created successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiConflictResponse('Currency symbol already exists')
  @ApiUnauthorizedResponse('Unauthorized')
  async create(@Body() createCurrencyDto: CreateCurrencyDto) {
    return this.currenciesService.create(createCurrencyDto);
  }

  /**
   * Update currency
   * PATCH /currencies/:id
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update currency',
    description: 'Update a specific currency by its ID',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiBody({ type: UpdateCurrencyDto })
  @ApiSuccessResponse('Currency updated successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiNotFoundResponse('Currency not found')
  @ApiConflictResponse('Currency symbol already exists')
  @ApiUnauthorizedResponse('Unauthorized')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCurrencyDto: UpdateCurrencyDto,
  ) {
    return this.currenciesService.update(id, updateCurrencyDto);
  }

  /**
   * Delete currency (soft delete)
   * DELETE /currencies/:id
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete currency',
    description: 'Soft delete a currency by setting is_active to false',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiSuccessResponse('Currency deleted successfully', {
    schema: { example: null },
  })
  @ApiNotFoundResponse('Currency not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.currenciesService.remove(id);
  }
}
