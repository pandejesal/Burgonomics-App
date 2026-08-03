import type { CartItemEntity } from '@modules/cart/entities/cart-item.entity';
import type { FulfillmentType } from '@modules/cart/entities/cart.entity';

/**
 * A pricing rule is a pure function contributing to the total. Rules are
 * currently orchestrated by `PricingEngineService`; when the ruleset
 * grows, the engine can iterate over registered rules and combine
 * their outputs deterministically.
 */
export interface PricingContext {
  items: CartItemEntity[];
  fulfillment: FulfillmentType;
  currency: string;
  subtotal: number;
  taxable: number;
}

export interface PricingContribution {
  key: string;
  amount: number; // positive = charge, negative = discount
}

export interface IPricingRule {
  readonly key: string;
  apply(ctx: PricingContext): PricingContribution;
}
