/**
 * Re-export payment types for the Razorpay integration.
 */
export type {
  PaymentMethod,
  PaymentOrder,
  PaymentResult,
  PaymentStatus,
  PaymentVerification,
  PaymentFailure,
  PaymentPreflight,
} from "@/features/payments/models";

export type { RazorpayOrderIntent, RazorpayPaymentResult, RazorpayAdapter } from "./index";
