import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto, CancelOrderDto } from './dto';
import { JwtAuthGuard } from '@/common/guards';
import { CurrentUser } from '@/common/decorators';

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
  @ApiOperation({ summary: 'Create order', description: 'Create a new buy/sell order (idempotent by idempotencyKey).' })
  async create(
    @CurrentUser('userId') userId: number,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create({
      userId,
      dto,
    });
  }

  @Get('book/:pairId')
  @ApiOperation({ summary: 'Order book', description: 'Get order book for a pair and side.' })
  @ApiParam({ name: 'pairId', type: Number })
  @ApiQuery({ name: 'side', required: true, enum: ['BUY', 'SELL'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getOrderBook(
    @Param('pairId', ParseIntPipe) pairId: number,
    @Query('side') side: 'BUY' | 'SELL',
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.ordersService.getOrderBook(pairId, side, limit);
  }

  @Get('my')
  @ApiOperation({ summary: 'My orders', description: 'List current user orders with optional status filter.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'] })
  async findMyOrders(
    @CurrentUser('userId') userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
  ) {
    return this.ordersService.findMyOrders(userId, page, limit, status);
  }

  @Get(':orderId')
  @ApiOperation({ summary: 'Get order', description: 'Get one order by ID (own orders only).' })
  @ApiParam({ name: 'orderId', type: Number })
  async findOne(
    @CurrentUser('userId') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.ordersService.findOne(orderId, userId);
  }

  @Post(':orderId/cancel')
  @ApiOperation({ summary: 'Cancel order', description: 'Cancel an open/partial order.' })
  @ApiParam({ name: 'orderId', type: Number })
  async cancel(
    @CurrentUser('userId') userId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: CancelOrderDto,
  ) {
    return this.ordersService.cancel({
      userId,
      orderId,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
