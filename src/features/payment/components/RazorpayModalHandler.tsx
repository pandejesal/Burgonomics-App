import * as React from "react";
import { ShoppingBag, RefreshCw, ArrowLeft, ShieldAlert, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { HapticService } from "@/core/services/haptics";

interface RazorpayModalHandlerProps {
  isAbandonmentOpen: boolean;
  onCloseAbandonment: () => void;
  onRetryPayment: () => void;
  onChangePaymentMethod: () => void;
  className?: string;
}

export function RazorpayModalHandler({
  isAbandonmentOpen,
  onCloseAbandonment,
  onRetryPayment,
  onChangePaymentMethod,
  className,
}: RazorpayModalHandlerProps) {
  return (
    <AnimatePresence>
      {isAbandonmentOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs">
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className={cn(
              "w-full max-w-md bg-surface border-t sm:border border-divider rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4",
              className
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-black text-text uppercase tracking-wider">
                  Payment Incomplete
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  onCloseAbandonment();
                }}
                className="w-8 h-8 rounded-full bg-bg-secondary flex items-center justify-center text-text-secondary hover:text-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <p className="font-bold">Don't miss out on your fresh hot burgers!</p>
              <p className="text-[11px] opacity-90">
                No amount was charged to your account. Your cart items and discounts have been preserved.
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  void HapticService.impact("medium");
                  onRetryPayment();
                }}
                className="w-full py-3.5 px-4 min-h-[44px] rounded-2xl bg-[#FF6600] hover:bg-[#e05a00] text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-4 h-4 stroke-[2.5px]" />
                <span>Retry Payment</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  void HapticService.selection();
                  onChangePaymentMethod();
                }}
                className="w-full py-3 px-4 min-h-[44px] rounded-2xl bg-surface border border-divider hover:border-primary text-text font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Change Payment Method / Review Cart</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export default RazorpayModalHandler;
