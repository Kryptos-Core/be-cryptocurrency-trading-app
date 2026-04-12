import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions, RequireRoles } from '@/common/decorators';
import { Permission, UserRole } from '@/common/enums';
import { JwtAuthGuard, PermissionGuard, RoleGuard } from '@/common/guards';
import type {
  CancelBatchOrderDto,
  CancelOrderDto,
  CreateBatchOrderDto,
  CreateOrderDto,
} from './dto';
import { OrdersService } from './orders.service';

/**
 * Orders Controller
 * REST API for order management (create, cancel, order book, my orders).
 */
@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create order',
    description: 'Create a new buy/sell order (idempotent by idempotencyKey).',
  })
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreateOrderDto) {
    return this.ordersService.create({
      userId,
      dto,
    });
  }

  @Post('batch')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequirePermissions(Permission.ORDERS_BATCH_PLACE)
  @ApiOperation({
    summary: 'Market Maker: Place multiple orders at once',
    description: 'Place a bounded batch of orders in one request.',
  })
  async createBatch(@CurrentUser('userId') userId: string, @Body() dto: CreateBatchOrderDto) {
    return this.ordersService.createBatch({ userId, dto });
  }

  @Get('admin/all')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER, UserRole.SUPPORT_AGENT)
  /** Read-only surveillance; use orders:read (orders:manage is not granted to these roles in RBAC). */
  @RequirePermissions(Permission.ORDERS_READ)
  @ApiOperation({
    summary: 'Admin: List all orders',
    description: 'Paginated list of all orders with optional filters (userId, pairId, status).',
  })
  @ApiQuery({ name: 'userId', required: false, type: String })
  @ApiQuery({ name: 'pairId', required: false, type: String })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'],
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllAdmin(
    @Query('userId') userId?: string,
    @Query('pairId') pairId?: string,
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return this.ordersService.findAllForAdmin({ userId, pairId, status, page, limit });
  }

  @Post('admin/reconcile-matching/:pairId')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequireRoles(UserRole.ADMIN, UserRole.RISK_OFFICER)
  @RequirePermissions(Permission.MATCHING_RECONCILE)
  @ApiOperation({
    summary: 'Admin/Ops: Re-run matching for a pair (manual)',
    description:
      'Retries matching for all OPEN/PARTIAL orders on the given pair until no further trades execute or a safety cap is hit. Use for operational recovery (stale book, missed matches); audited via application logs.',
  })
  @ApiParam({
    name: 'pairId',
    type: String,
    description: 'Market pair_id (UUID) or trading symbol BASE/QUOTE (e.g. OG/USDT, URL-encoded)',
  })
  async reconcileMatchingForPair(@Param('pairId') pairId: string) {
    return this.ordersService.reconcileMatchingForPair(pairId);
  }

  @Get('book/:pairId')
  @ApiOperation({ summary: 'Order book', description: 'Get order book for a pair and side.' })
  @ApiParam({ name: 'pairId', type: String, description: 'Pair UUID' })
  @ApiQuery({ name: 'side', required: true, enum: ['BUY', 'SELL'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOrderBook(
    @Param('pairId') pairId: string,
    @Query('side') side: 'BUY' | 'SELL',
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.ordersService.getOrderBook(pairId, side, limit);
  }

  @Get('my')
  @ApiOperation({
    summary: 'My orders',
    description: 'List current user orders with optional status filter.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'],
  })
  async findMyOrders(
    @CurrentUser('userId') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findMyOrders(userId, page, limit, status);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order', description: 'Get one order by ID (own orders only).' })
  @ApiParam({ name: 'orderId', type: String, description: 'Order UUID' })
  async findOne(@CurrentUser('userId') userId: string, @Param('orderId') orderId: string) {
    return this.ordersService.findOne(orderId, userId);
  }

  @Post(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel order', description: 'Cancel an open/partial order.' })
  @ApiParam({ name: 'orderId', type: String, description: 'Order UUID' })
  async cancel(
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel({
      userId,
      orderId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Post('batch-cancel')
  @UseGuards(RoleGuard, PermissionGuard)
  @RequirePermissions(Permission.ORDERS_CANCEL)
  @ApiOperation({
    summary: 'Cancel multiple orders at once',
    description: 'Cancel a bounded list of open/partial orders owned by current user.',
  })
  async cancelBatch(@CurrentUser('userId') userId: string, @Body() dto: CancelBatchOrderDto) {
    return this.ordersService.cancelBatch({ userId, dto });
  }
}
