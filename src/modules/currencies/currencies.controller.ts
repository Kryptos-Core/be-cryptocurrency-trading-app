import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiSuccessResponse,
  ApiUnauthorizedResponse,
  Public,
} from '@/common/decorators';
import { RequirePermissions } from '@/common/decorators/require-permissions.decorator';
import { RequireRoles } from '@/common/decorators/require-roles.decorator';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import { CurrenciesService } from './currencies.service';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto';

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
   * Get all currencies with pagination + optional smart search and filters.
   * GET /currencies?page=1&limit=10&includeInactive=false&search=BTC&isTradable=true&isActive=true
   *
   * When `search`, `isTradable`, or `isActive` are provided the request is
   * forwarded to the QueryBuilder-based search path (no Redis cache).
   * Without extra filters the cached stored-procedure path is used.
   */
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get all currencies',
    description:
      'Paginated currency list. Supply `search`, `isTradable` or `isActive` for smart filtering; ' +
      'those requests bypass the Redis cache and use a full-text QueryBuilder query instead.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean, example: false })
  @ApiQuery({
    name: 'includeMarketData',
    required: false,
    type: Boolean,
    example: false,
    description: 'Include enriched market ticker fields (may increase response time).',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Text search on symbol or name (case-insensitive, partial match).',
  })
  @ApiQuery({
    name: 'isTradable',
    required: false,
    type: Boolean,
    description: 'Filter by tradable status.',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    description: 'Filter by active status.',
  })
  @ApiSuccessResponse('Currencies retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('includeInactive', new ParseBoolPipe({ optional: true }))
    includeInactive: boolean = false,
    @Query('includeMarketData', new ParseBoolPipe({ optional: true }))
    includeMarketData: boolean = false,
    @Query('search') search?: string,
    @Query('isTradable', new ParseBoolPipe({ optional: true })) isTradable?: boolean,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.currenciesService.findAll(
      page,
      limit,
      includeInactive,
      includeMarketData,
      search,
      isTradable,
      isActive,
    );
  }

  /**
   * Get all active currencies
   * GET /currencies/active
   */
  @Get('active')
  @Public()
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
  @Public()
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
  @Public()
  @ApiOperation({
    summary: 'Get currency by ID',
    description: 'Retrieve a specific currency by its ID',
  })
  @ApiParam({ name: 'id', type: String, example: '018e9a7b-1234-7abc-8000-000000000002' })
  @ApiSuccessResponse('Currency retrieved successfully')
  @ApiNotFoundResponse('Currency not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findOne(@Param('id') id: string) {
    return this.currenciesService.findOne(id);
  }

  /**
   * Get currency by symbol
   * GET /currencies/symbol/:symbol
   */
  @Get('symbol/:symbol')
  @Public()
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
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Create new currency',
    description: 'Create a new cryptocurrency entry',
  })
  @ApiBody({ type: CreateCurrencyDto })
  @RequirePermissions(Permission.CURRENCIES_MANAGE)
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
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update currency',
    description: 'Update a specific currency by its ID',
  })
  @ApiParam({ name: 'id', type: String, example: '018e9a7b-1234-7abc-8000-000000000002' })
  @ApiBody({ type: UpdateCurrencyDto })
  @RequirePermissions(Permission.CURRENCIES_MANAGE)
  @ApiSuccessResponse('Currency updated successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiNotFoundResponse('Currency not found')
  @ApiConflictResponse('Currency symbol already exists')
  @ApiUnauthorizedResponse('Unauthorized')
  async update(@Param('id') id: string, @Body() updateCurrencyDto: UpdateCurrencyDto) {
    return this.currenciesService.update(id, updateCurrencyDto);
  }

  /**
   * Delete currency (soft delete)
   * DELETE /currencies/:id
   */
  @Delete(':id')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete currency',
    description: 'Soft delete a currency by setting is_active to false',
  })
  @ApiParam({ name: 'id', type: String, example: '018e9a7b-1234-7abc-8000-000000000002' })
  @RequirePermissions(Permission.CURRENCIES_MANAGE)
  @ApiSuccessResponse('Currency deleted successfully', {
    schema: { example: null },
  })
  @ApiNotFoundResponse('Currency not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async remove(@Param('id') id: string) {
    await this.currenciesService.remove(id);
  }
}
