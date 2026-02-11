/**
 * Cancel Order Command (Command Pattern)
 */
export class CancelOrderCommand {
  constructor(
    public readonly userId: number,
    public readonly orderId: number,
    public readonly idempotencyKey?: string,
  ) {}
}
