import * as React from "react";
import { CreditCard, Coins, CheckCircle2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Text } from "@/shared/components/common/Text";
import type { PaymentMethod } from "@/features/payments/models";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useAppConfig } from "@/core/state/appConfigStore";
import { motion } from "motion/react";
import { toast } from "sonner";

interface Props {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
  disabled?: boolean;
}

export function PaymentMethodList({ value, onChange, disabled }: Props) {
  const fulfillment = useStoreSelection((s) => s.fulfillment);
  const isOnline = useAppConfig((s) => s.isOnline);

  const isDelivery = fulfillment === "delivery";
  const cashTitle = isDelivery ? "Cash on Delivery" : "Pay at Store / Counter";
  const cashDesc = isDelivery
    ? "Pay with cash at your doorstep when food is delivered"
    : "Pay with cash, card, or UPI at the counter when you collect";

  // Force cash if offline
  React.useEffect(() => {
    if (!isOnline && value === "online") {
      onChange("cash");
      toast.warning("Offline Mode Active", {
        description: "Payment switched to Cash on Delivery / Counter payment.",
      });
    }
  }, [isOnline, value, onChange]);

  const options = [
    {
      id: "online" as const,
      title: "Pay Online",
      description: isOnline
        ? "Fast & secure payment via UPI, Cards, NetBanking or Wallets"
        : "Requires internet connection. Please select Pay on Delivery / Counter.",
      Icon: CreditCard,
      accentClass: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    },
    {
      id: "cash" as const,
      title: cashTitle,
      description: cashDesc,
      Icon: Coins,
      accentClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    },
  ];

  return (
    <div role="radiogroup" aria-label="How would you like to pay?" className="flex flex-col gap-3">
      {options.map(({ id, title, description, Icon, accentClass }) => {
        const selected = value === id;
        const isDisabledOption = id === "online" && !isOnline;

        return (
          <motion.button
            key={id}
            id={`payment-option-${id}`}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled || isDisabledOption}
            onClick={() => {
              if (isDisabledOption) {
                toast.error("Offline Mode", {
                  description: "Please connect to the internet to use online payments.",
                });
                return;
              }
              onChange(id);
            }}
            whileTap={{ scale: isDisabledOption ? 1 : 0.98 }}
            className={cn(
              "relative flex w-full items-start gap-4 rounded-2xl border bg-surface p-4 text-left transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
                : "border-divider hover:border-primary/40 hover:bg-bg-secondary/40",
              (disabled || isDisabledOption) && "opacity-55 cursor-not-allowed",
            )}
          >
            <div
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center rounded-xl border transition-colors duration-200",
                selected
                  ? "bg-primary text-white border-primary"
                  : cn("bg-surface-variant text-text-secondary", accentClass),
              )}
            >
              {id === "online" && !isOnline ? (
                <WifiOff className="h-6 w-6 text-warning" aria-hidden />
              ) : (
                <Icon className="h-6 w-6" aria-hidden />
              )}
            </div>

            <div className="min-w-0 flex-1 pr-6 pt-0.5">
              <div className="flex items-center gap-2">
                <Text
                  variant="titleMedium"
                  className={cn(
                    "font-semibold leading-snug",
                    selected ? "text-primary" : "text-text",
                  )}
                >
                  {title}
                </Text>
                {id === "online" && !isOnline && (
                  <span className="inline-flex items-center gap-1 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground uppercase tracking-wider">
                    Offline
                  </span>
                )}
              </div>
              <Text variant="bodyMedium" tone="secondary" className="mt-1 leading-normal text-xs">
                {description}
              </Text>
            </div>

            {selected && (
              <motion.div
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="absolute right-4 top-4 text-primary"
              >
                <CheckCircle2 className="h-5 w-5 fill-current text-primary" strokeWidth={2.5} />
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
