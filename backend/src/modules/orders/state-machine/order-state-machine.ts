import { ValidationError } from '@common/errors';
import { TERMINAL_STATES, type OrderState } from './order-state';

/**
 * Legal forward transitions. Cancellation and failure paths are
 * intentionally allowed from many non-terminal states.
 */
const TRANSITIONS: Readonly<Record<OrderState, readonly OrderState[]>> = {
  CART: ['CHECKOUT', 'CANCELLED'],
  CHECKOUT: ['PAYMENT_PENDING', 'CANCELLED', 'FAILED'],
  PAYMENT_PENDING: ['PAYMENT_VERIFIED', 'FAILED', 'CANCELLED'],
  PAYMENT_VERIFIED: ['ORDER_CREATED', 'FAILED'],
  ORDER_CREATED: ['ORDER_SENT_TO_PETPOOJA', 'CANCELLED', 'FAILED'],
  ORDER_SENT_TO_PETPOOJA: ['ORDER_ACCEPTED', 'CANCELLED', 'FAILED'],
  ORDER_ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED', 'CANCELLED'],
  DELIVERED: ['COMPLETED', 'REFUNDED'],
  COMPLETED: ['REFUNDED'],
  CANCELLED: ['REFUNDED'],
  FAILED: ['REFUNDED'],
  REFUNDED: [],
};

export class OrderStateMachine {
  static canTransition(from: OrderState, to: OrderState): boolean {
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransition(from: OrderState, to: OrderState): void {
    if (!OrderStateMachine.canTransition(from, to)) {
      throw new ValidationError(`Illegal order transition: ${from} -> ${to}`);
    }
  }

  static isTerminal(state: OrderState): boolean {
    return TERMINAL_STATES.includes(state);
  }

  static nextAllowed(from: OrderState): readonly OrderState[] {
    return TRANSITIONS[from] ?? [];
  }
}
