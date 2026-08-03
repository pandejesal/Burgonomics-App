import { PETPOOJA_CALLBACK_STATUS } from '../constants';
import type { OrderCallbackWebhook } from '../dto/petpooja.dto';
import type { OrderState } from '@modules/orders/state-machine/order-state';

export interface OrderCallbackTranslation {
  targetState: OrderState;
  reason?: string;
  patch: Partial<{
    acceptedAt: Date;
    readyAt: Date;
    dispatchedAt: Date;
    deliveredAt: Date;
    cancelledAt: Date;
    cancellationReason: string;
  }>;
  prepEtaMinutes?: number;
  deliveryEtaMinutes?: number;
  rider?: { name: string; phone: string } | null;
}

/**
 * Translates a PETPOOJA order-callback into a domain-side state
 * transition intent. Idempotent: repeated callbacks for the same
 * status resolve to the same target state.
 */
export function translateOrderCallback(cb: OrderCallbackWebhook): OrderCallbackTranslation {
  const now = new Date();
  const rider =
    cb.rider_name || cb.rider_phone_number
      ? {
          name: cb.rider_name ?? '',
          phone: cb.rider_phone_number ?? '',
        }
      : null;

  const prepEta = cb.minimum_prep_time ? parseIntSafe(cb.minimum_prep_time) : undefined;
  const deliveryEta = cb.minimum_delivery_time ? parseIntSafe(cb.minimum_delivery_time) : undefined;

  switch (cb.status) {
    case PETPOOJA_CALLBACK_STATUS.CANCELLED:
      return {
        targetState: 'CANCELLED',
        reason: cb.cancel_reason ?? 'PETPOOJA cancelled',
        patch: {
          cancelledAt: now,
          cancellationReason: cb.cancel_reason ?? 'PETPOOJA cancelled',
        },
        rider,
      };
    case PETPOOJA_CALLBACK_STATUS.ACCEPTED_1:
    case PETPOOJA_CALLBACK_STATUS.ACCEPTED_2:
    case PETPOOJA_CALLBACK_STATUS.ACCEPTED_3:
      return {
        targetState: 'ORDER_ACCEPTED',
        patch: { acceptedAt: now },
        prepEtaMinutes: prepEta,
        deliveryEtaMinutes: deliveryEta,
        rider,
      };
    case PETPOOJA_CALLBACK_STATUS.FOOD_READY:
      return {
        targetState: 'READY',
        patch: { readyAt: now },
        prepEtaMinutes: prepEta,
        rider,
      };
    case PETPOOJA_CALLBACK_STATUS.DISPATCHED:
      return {
        targetState: 'OUT_FOR_DELIVERY',
        patch: { dispatchedAt: now },
        deliveryEtaMinutes: deliveryEta,
        rider,
      };
    case PETPOOJA_CALLBACK_STATUS.DELIVERED:
      return {
        targetState: 'DELIVERED',
        patch: { deliveredAt: now },
        rider,
      };
    default: {
      // Should never happen — Zod schema restricts the union — but
      // typescript needs an exhaustive default.
      const exhaustiveCheck: never = cb.status;
      throw new Error(`Unhandled PETPOOJA status: ${exhaustiveCheck as string}`);
    }
  }
}

function parseIntSafe(v: string): number | undefined {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}
