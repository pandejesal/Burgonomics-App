import type { Payment, PaymentStatus } from '@prisma/client';

/**
 * Payment domain entity. Mirrors the Prisma row but is used as the
 * exchange currency across the module — repositories/services never
 * expose Prisma types to controllers.
 */
export type PaymentEntity = Payment;
export type { PaymentStatus };
