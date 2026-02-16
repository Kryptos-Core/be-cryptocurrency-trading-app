import { CreateOrderDto } from '../dto';

/**
 * Create Order Command (Command Pattern)
 */
export class CreateOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly dto: CreateOrderDto,
  ) {}
}
