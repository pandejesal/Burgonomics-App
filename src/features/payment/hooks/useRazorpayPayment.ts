import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  paymentRepository,
  usePaymentStore,
  razorpayAdapter,
} from "@/features/payments";
import type { PaymentMethod, PaymentResult } from "@/features/payments/models";
import { orderRepository } from "@/features/orders";
import { cartRepository } from "@/features/cart";
import { AudioService } from "@/core/services/audio";
import { HapticService } from "@/core/services/haptics";
import { useAuthStore } from "@/features/auth/state/authStore";

export interface UseRazorpayPaymentOptions {
  onSuccess?: (orderId: string) => void;
  onFailure?: (error: { code: string; message: string }) => void;
  onDismiss?: () => void;
}

export function useRazorpayPayment(options?: UseRazorpayPaymentOptions) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const status = usePaymentStore((s) => s.status);
  const method = usePaymentStore((s) => s.method);
  const failure = usePaymentStore((s) => s.failure);
  const setStatus = usePaymentStore((s) => s.setStatus);
  const setMethod = usePaymentStore((s) => s.setMethod);
  const setOrder = usePaymentStore((s) => s.setOrder);
  const setFailure = usePaymentStore((s) => s.setFailure);
  const setVerification = usePaymentStore((s) => s.setVerification);
  const resetPayment = usePaymentStore((s) => s.reset);

  const [abandonmentOpen, setAbandonmentOpen] = React.useState(false);

  const initiatePayment = async (preferredMethod: PaymentMethod = method) => {
    setFailure(null);
    setStatus("preparing");
    setAbandonmentOpen(false);

    try {
      // 1. Create payment order via backend
      const orderRes = await paymentRepository.createPaymentOrder();
      if (!orderRes.success) {
        setStatus("failed");
        setFailure({
          code: orderRes.error.code,
          message: orderRes.error.message,
          retryable: true,
        });
        toast.error("Could not initiate payment", { description: orderRes.error.message });
        options?.onFailure?.({ code: orderRes.error.code, message: orderRes.error.message });
        return;
      }

      setOrder(orderRes.data);
      setStatus("waiting");

      // 2. Initialize Razorpay SDK with #0E4825 brand palette & user prefill
      await razorpayAdapter.initialize({
        order: orderRes.data,
        prefill: {
          name: user?.name,
          email: (user as { email?: string } | null)?.email,
          contact: user?.phone,
        },
        theme: {
          color: "#0E4825",
        },
      });

      // 3. Open Checkout Sheet
      await razorpayAdapter.openCheckout(
        {
          onSuccess: async (result: PaymentResult) => {
            try {
              const verify = await paymentRepository.verifyPayment(result);
              if (!verify.success || !verify.data.verified) {
                setStatus("failed");
                const message = verify.success ? "Signature verification failed" : verify.error.message;
                setFailure({
                  code: verify.success ? "VERIFICATION_FAILED" : verify.error.code,
                  message,
                  retryable: true,
                });
                toast.error("Payment verification failed", { description: message });
                options?.onFailure?.({ code: "VERIFICATION_FAILED", message });
                return;
              }

              setVerification(verify.data);
              const created = await orderRepository.createFromCurrentContext({
                confirmedOrderId: verify.data.confirmedOrderId,
                paymentMethod: result.method,
                transactionId: result.paymentId,
              });

              setStatus("success");
              AudioService.playSuccess();
              void HapticService.notification("success");
              void cartRepository.clear();
              const orderId = created.success ? created.data.id : verify.data.confirmedOrderId;
              
              if (options?.onSuccess) {
                options.onSuccess(orderId);
              } else {
                void navigate({
                  to: "/order-confirmation/$orderId",
                  params: { orderId },
                  replace: true,
                });
              }
            } catch (err) {
              setStatus("failed");
              const message = err instanceof Error ? err.message : "Error finishing order.";
              setFailure({ code: "POST_PAYMENT_ERROR", message, retryable: true });
              toast.error("Order processing error", { description: message });
            }
          },
          onFailure: (err) => {
            setStatus("failed");
            const message = err.description || "Payment was declined by your bank.";
            setFailure({ code: err.code, message, retryable: true });
            toast.error("Payment failed", { description: message });
            options?.onFailure?.({ code: err.code, message });
          },
          onCancel: () => {
            setStatus("cancelled");
            setFailure({
              code: "USER_CANCELLED",
              message: "Payment modal was dismissed.",
              retryable: true,
            });
            setAbandonmentOpen(true);
            options?.onDismiss?.();
          },
        },
        preferredMethod,
      );
    } catch (err) {
      setStatus("failed");
      const message = err instanceof Error ? err.message : "Unexpected payment error.";
      setFailure({ code: "PAYMENT_EXCEPTION", message, retryable: true });
      toast.error("Payment gateway error", { description: message });
    }
  };

  const retry = async () => {
    setStatus("retrying");
    await initiatePayment(method);
  };

  return {
    status,
    method,
    failure,
    abandonmentOpen,
    isBusy: status === "preparing" || status === "waiting" || status === "retrying",
    setMethod,
    setAbandonmentOpen,
    initiatePayment,
    retry,
    resetPayment,
  };
}

export default useRazorpayPayment;
