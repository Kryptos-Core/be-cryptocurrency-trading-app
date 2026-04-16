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
import { GetCurrenciesQuery, GetCurrencyByIdQuery } from './application/queries';
import {
  CreateCurrencyUseCase,
  DeleteCurrencyUseCase,
  UpdateCurrencyUseCase,
} from './application/use-cases';
import { CreateCurrencyDto, UpdateCurrencyDto } from './dto';

/**
 * Currencies Controller — Clean Architecture presentation layer.
 *
 * Pattern: Thin controller — delegates all business logic to use-cases and queries.
 * Does NOT call the service directly; service is reserved for cross-module use.
 */
@ApiTags('currencies')
@ApiBearerAuth('JWT-auth')
@Controller('currencies')
@UseGuards(JwtAuthGuard)
export class CurrenciesController {
  constructor(
    private readonly createCurrency: CreateCurrencyUseCase,
    private readonly updateCurrency: UpdateCurrencyUseCase,
    private readonly deleteCurrency: DeleteCurrencyUseCase,
    private readonly getCurrencies: GetCurrenciesQuery,
    private readonly getCurrencyById: GetCurrencyByIdQuery,
  ) {}

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
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'isTradable', required: false, type: Boolean })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiSuccessResponse('Currencies retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findAll(
    @Query('page', new ParseIntPipe({ optional: true })) page: number = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit: number = 10,
    @Query('includeInactive', new ParseBoolPipe({ optional: true })) includeInactive = false,
    @Query('includeMarketData', new ParseBoolPipe({ optional: true })) includeMarketData = false,
    @Query('search') search?: string,
    @Query('isTradable', new ParseBoolPipe({ optional: true })) isTradable?: boolean,
    @Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean,
  ) {
    return this.getCurrencies.execute({
      page,
      limit,
      includeInactive,
      includeMarketData,
      search,
      isTradable,
      isActive,
    });
  }

  @Get('active')
  @Public()
  @ApiOperation({ summary: 'Get all active currencies' })
  @ApiSuccessResponse('Active currencies retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findActive() {
    return this.getCurrencies.getActive();
  }

  @Get('tradable')
  @Public()
  @ApiOperation({ summary: 'Get all tradable currencies' })
  @ApiSuccessResponse('Tradable currencies retrieved successfully')
  @ApiUnauthorizedResponse('Unauthorized')
  async findTradable() {
    return this.getCurrencies.getTradable();
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get currency by ID' })
  @ApiParam({ name: 'id', type: String })
  @ApiSuccessResponse('Currency retrieved successfully')
  @ApiNotFoundResponse('Currency not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findOne(@Param('id') id: string) {
    return this.getCurrencyById.execute(id);
  }

  @Get('symbol/:symbol')
  @Public()
  @ApiOperation({ summary: 'Get currency by symbol' })
  @ApiParam({ name: 'symbol', type: String })
  @ApiSuccessResponse('Currency retrieved successfully')
  @ApiNotFoundResponse('Currency not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async findBySymbol(@Param('symbol') symbol: string) {
    return this.getCurrencyById.executeBySymbol(symbol);
  }

  @Post()
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create new currency' })
  @ApiBody({ type: CreateCurrencyDto })
  @RequirePermissions(Permission.CURRENCIES_MANAGE)
  @ApiCreatedResponse('Currency created successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiConflictResponse('Currency symbol already exists')
  @ApiUnauthorizedResponse('Unauthorized')
  async create(@Body() dto: CreateCurrencyDto) {
    return this.createCurrency.execute(dto);
  }

  @Patch(':id')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Update currency' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: UpdateCurrencyDto })
  @RequirePermissions(Permission.CURRENCIES_MANAGE)
  @ApiSuccessResponse('Currency updated successfully')
  @ApiBadRequestResponse('Invalid input data')
  @ApiNotFoundResponse('Currency not found')
  @ApiConflictResponse('Currency symbol already exists')
  @ApiUnauthorizedResponse('Unauthorized')
  async update(@Param('id') id: string, @Body() dto: UpdateCurrencyDto) {
    return this.updateCurrency.execute(id, dto);
  }

  @Delete(':id')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a currency' })
  @ApiParam({ name: 'id', type: String })
  @RequirePermissions(Permission.CURRENCIES_MANAGE)
  @ApiSuccessResponse('Currency deleted successfully', { schema: { example: null } })
  @ApiNotFoundResponse('Currency not found')
  @ApiUnauthorizedResponse('Unauthorized')
  async remove(@Param('id') id: string) {
    await this.deleteCurrency.execute(id);
  }
}
