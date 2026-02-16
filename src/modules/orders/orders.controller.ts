import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
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
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.create({
      userId,
      dto,
    });
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
  @ApiOperation({ summary: 'My orders', description: 'List current user orders with optional status filter.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: ['OPEN', 'PARTIAL', 'FILLED', 'CANCELLED', 'REJECTED'] })
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
  async findOne(
    @CurrentUser('userId') userId: string,
    @Param('orderId') orderId: string,
  ) {
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
}
