import * as React from "react";
import { Bike, Check, Clock, MapPin, ShoppingBag, Utensils } from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { AppButton } from "@/shared/components/common/AppButton";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { Text } from "@/shared/components/common/Text";
import { formatINR } from "@/core/utils/format";
import type { Fulfillment, Store } from "@/features/stores/models/Store";
import { storeSupportsFulfillment } from "@/features/stores/state/storeStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store | null;
  value: Fulfillment | null;
  onConfirm: (f: Fulfillment) => void;
  /** Optional custom title. */
  title?: string;
}

interface OptionMeta {
  key: Fulfillment;
  title: string;
  Icon: typeof Bike;
  description: string;
  supported: boolean;
  detail: React.ReactNode;
}

/**
 * FulfillmentSheet — the primary Order Fulfillment Selection surface.
 * Rendered as a Bottom Sheet. Options rendered are strictly driven by
 * `store.supports` — unsupported methods are visibly disabled with a
 * reason chip so the user understands why.
 */
export function FulfillmentSheet({
  open,
  onOpenChange,
  store,
  value,
  onConfirm,
  title = "How would you like your order?",
}: Props) {
  const [selected, setSelected] = React.useState<Fulfillment | null>(value);

  React.useEffect(() => {
    if (open) setSelected(value);
  }, [open, value]);

  const options: OptionMeta[] = React.useMemo(() => {
    const s = store;
    return [
      {
        key: "delivery",
        title: "Delivery",
        Icon: Bike,
        description: "We'll deliver your order to your selected address.",
        supported: !!s?.supports.delivery,
        detail: (
          <div className="flex flex-wrap items-center gap-2">
            <AppBadge tone="neutral">
              <Clock className="mr-1 inline h-3 w-3" aria-hidden />
              {s?.etaMinutes ?? "—"} min ETA
            </AppBadge>
            {typeof s?.deliveryFee === "number" && (
              <AppBadge tone="neutral">Fee {formatINR(s.deliveryFee)}</AppBadge>
            )}
            {s?.supports.delivery && (
              <Text variant="caption" tone="secondary">
                Available in your area
              </Text>
            )}
          </div>
        ),
      },
      {
        key: "takeaway",
        title: "Takeaway",
        Icon: ShoppingBag,
        description: "Pick up your order directly from the restaurant.",
        supported: !!s?.supports.takeaway,
        detail: (
          <div className="flex flex-wrap items-center gap-2">
            <AppBadge tone="neutral">
              <Clock className="mr-1 inline h-3 w-3" aria-hidden />
              Ready in {s?.pickupEtaMinutes ??
                Math.max(8, Math.floor((s?.etaMinutes ?? 20) / 2))}{" "}
              min
            </AppBadge>
            {s?.address && (
              <Text variant="caption" tone="secondary" className="line-clamp-1">
                <MapPin className="mr-1 inline h-3 w-3" aria-hidden />
                {s.address}
              </Text>
            )}
          </div>
        ),
      },
      {
        key: "dinein",
        title: "Dine-In",
        Icon: Utensils,
        description: "Enjoy your meal at the restaurant.",
        supported: !!s?.supports.dineIn,
        detail: (
          <div className="flex flex-wrap items-center gap-2">
            <Text variant="caption" tone="secondary" className="line-clamp-1">
              {s?.name ?? ""}
            </Text>
            <AppBadge tone={s?.isOpen ? "success" : "error"}>
              {s?.isOpen ? "Open now" : "Closed"}
            </AppBadge>
          </div>
        ),
      },
    ];
  }, [store]);

  const canConfirm = selected != null && storeSupportsFulfillment(store, selected);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={store ? `Choose how you'd like your order from ${store.name}.` : undefined}
    >
      <div role="radiogroup" aria-label="Fulfillment method" className="flex flex-col gap-2">
        {options.map(({ key, title: t, Icon, description, supported, detail }) => {
          const active = selected === key;
          const disabled = !supported;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => !disabled && setSelected(key)}
              className={cn(
                "group flex min-h-[88px] w-full items-start gap-3 rounded-[var(--radius-large)] border-[1.5px] p-4 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                disabled && "cursor-not-allowed opacity-50",
                !disabled && active
                  ? "border-primary bg-primary/5 shadow-sm scale-[1.01]"
                  : "border-divider bg-surface hover:border-primary/40",
              )}
            >
              <div
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-bg-secondary text-text-secondary",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Text variant="titleMedium">{t}</Text>
                  {!supported && <AppBadge tone="neutral">Unavailable</AppBadge>}
                  {active && supported && (
                    <span
                      className="ml-auto inline-flex items-center gap-1 text-primary animate-in fade-in zoom-in duration-200"
                      aria-hidden
                    >
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </div>
                <Text variant="bodyMedium" tone="secondary" className="mt-0.5">
                  {description}
                </Text>
                <div className="mt-2">{detail}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <AppButton
          variant="primary"
          size="lg"
          disabled={!canConfirm}
          onClick={() => selected && onConfirm(selected)}
        >
          Continue
        </AppButton>
      </div>
    </BottomSheet>
  );
}
