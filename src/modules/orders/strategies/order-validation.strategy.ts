import { BusinessException, ValidationException } from '@/common/exceptions';

/**
 * Context for order validation (Strategy Pattern)
 */
export interface OrderValidationContext {
  pairId: string;
  side: 'BUY' | 'SELL';
  type: 'LIMIT' | 'MARKET';
  amount: string;
  price?: string;
  timeInForce?: string;
  minOrderAmount: string;
  availableBalance: string;
  /** MARKET BUY: max quote to reserve (must match DB freeze) */
  requiredQuoteForBuy?: string;
  amountScale?: number;
  priceScale?: number;
}

/**
 * Order Validation Strategy (Strategy Pattern)
 * Single Responsibility: validate order input (amount, price, balance).
 */
export interface IOrderValidationStrategy {
  validate(context: OrderValidationContext): void;
}

export class OrderValidationStrategy implements IOrderValidationStrategy {
  validate(context: OrderValidationContext): void {
    this.validateAmount(context);
    this.validatePrice(context);
    this.validatePrecision(context);
    this.validateBalance(context);
  }

  private validatePrecision(context: OrderValidationContext): void {
    const amountScale = Number.isInteger(context.amountScale)
      ? (context.amountScale as number)
      : 18;
    const amountDecimals = this.countDecimals(context.amount);
    if (amountDecimals > amountScale) {
      throw new ValidationException(`Amount supports up to ${amountScale} decimal places`, {
        amount: context.amount,
        amountScale,
      });
    }

    if (context.type === 'MARKET') return;

    const priceScale = Number.isInteger(context.priceScale) ? (context.priceScale as number) : 18;
    const priceDecimals = this.countDecimals(context.price ?? '0');
    if (priceDecimals > priceScale) {
      throw new ValidationException(`Price supports up to ${priceScale} decimal places`, {
        price: context.price,
        priceScale,
      });
    }
  }

  private countDecimals(value: string): number {
    const normalized = value.trim();
    if (!normalized.includes('.')) return 0;
    return normalized.split('.')[1]?.length ?? 0;
  }

  private validateAmount(context: OrderValidationContext): void {
    const amount = parseFloat(context.amount);
    const min = parseFloat(context.minOrderAmount);

    if (Number.isNaN(amount) || amount <= 0) {
      throw new ValidationException('Order amount must be a positive number', {
        amount: context.amount,
      });
    }

    if (amount < min) {
      throw new ValidationException(
        `Amount must be at least ${context.minOrderAmount} (min order amount)`,
        { amount: context.amount, minOrderAmount: context.minOrderAmount },
      );
    }
  }

  private validatePrice(context: OrderValidationContext): void {
    if (context.type === 'MARKET') return;

    if (!context.price || context.price.trim() === '') {
      throw new ValidationException('Limit order requires a price', {
        type: context.type,
      });
    }

    const price = parseFloat(context.price);
    if (Number.isNaN(price) || price <= 0) {
      throw new ValidationException('Price must be a positive number', {
        price: context.price,
      });
    }
  }

  private validateBalance(context: OrderValidationContext): void {
    const available = parseFloat(context.availableBalance);
    if (Number.isNaN(available) || available < 0) {
      throw new BusinessException('Unable to resolve wallet balance', 'BALANCE_ERROR');
    }

    const amount = parseFloat(context.amount);
    const price = context.price ? parseFloat(context.price) : 0;

    if (context.side === 'BUY') {
      let required: number;
      if (context.requiredQuoteForBuy !== undefined) {
        required = parseFloat(context.requiredQuoteForBuy);
        if (Number.isNaN(required) || required <= 0) {
          throw new ValidationException('Invalid required quote for buy order', {
            requiredQuoteForBuy: context.requiredQuoteForBuy,
          });
        }
      } else {
        required = amount * price;
      }
      if (available < required) {
        throw new BusinessException(
          'Insufficient quote balance for this order',
          'INSUFFICIENT_BALANCE',
          { required: String(required), available: context.availableBalance },
        );
      }
    } else {
      if (available < amount) {
        throw new BusinessException(
          'Insufficient base balance for this order',
          'INSUFFICIENT_BALANCE',
          { required: context.amount, available: context.availableBalance },
        );
      }
    }
  }
}
