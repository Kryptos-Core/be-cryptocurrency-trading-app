/**
 * Cancel Order Command (Command Pattern)
 */
export class CancelOrderCommand {
  constructor(
    public readonly userId: string,
    public readonly orderId: string,
    public readonly idempotencyKey?: string,
  ) {}
}
