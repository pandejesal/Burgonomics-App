import { Phone, MapPin, Utensils, Package, Bike, Copy } from "lucide-react";
import { Text } from "@/shared/components/common/Text";
import { AppButton } from "@/shared/components/common/AppButton";
import type { Order } from "@/features/orders/models";

interface Props {
  order: Order;
  etaMinutes?: number;
}

/**
 * FulfillmentPanel — adapts to Delivery / Takeaway / Dine-in. All copy
 * is data-driven from the order + repository. No hardcoded status.
 */
export function FulfillmentPanel({ order, etaMinutes }: Props) {
  if (order.fulfillment === "delivery") {
    return (
      <div className="space-y-4">
        <EtaRow etaMinutes={etaMinutes} label="Estimated delivery" />
        {order.address && (
          <Section icon={<MapPin className="h-4 w-4" aria-hidden />} title="Delivery address">
            <Text variant="titleMedium" className="mt-0.5">
              {order.address.label}
            </Text>
            <Text variant="bodyMedium" tone="secondary">
              {[order.address.line1, order.address.line2].filter(Boolean).join(", ")}
            </Text>
            <Text variant="caption" tone="secondary">
              {order.address.city}, {order.address.state} {order.address.pincode}
            </Text>
            <Text variant="caption" tone="secondary">
              {order.address.contactName} · {order.address.contactPhone}
            </Text>
          </Section>
        )}
        <Section icon={<Bike className="h-4 w-4" aria-hidden />} title="Delivery partner">
          {order.deliveryPartner?.name ? (
            <>
              <Text variant="titleMedium">{order.deliveryPartner.name}</Text>
              {order.deliveryPartner.vehicleNumber && (
                <Text variant="caption" tone="secondary">
                  {order.deliveryPartner.vehicleNumber}
                </Text>
              )}
              {order.deliveryPartner.phone && (
                <AppButton
                  size="sm"
                  variant="outlined"
                  className="mt-2"
                  iconLeft={<Phone className="h-4 w-4" aria-hidden />}
                  onClick={() => callPhone(order.deliveryPartner?.phone)}
                >
                  Call partner
                </AppButton>
              )}
            </>
          ) : (
            <Text variant="bodyMedium" tone="secondary">
              Partner will be assigned once your order is ready.
            </Text>
          )}
        </Section>
        <StoreContact order={order} />
      </div>
    );
  }

  if (order.fulfillment === "takeaway") {
    return (
      <div className="space-y-4">
        <EtaRow etaMinutes={etaMinutes} label="Ready in" />
        <PickupCode order={order} />
        <StoreContact order={order} address />
        <Section icon={<Package className="h-4 w-4" aria-hidden />} title="Pickup instructions">
          <Text variant="bodyMedium" tone="secondary">
            {order.fulfillmentInstructions?.trim() ||
              "Show your pickup code at the counter to collect your order."}
          </Text>
        </Section>
      </div>
    );
  }

  // dinein
  return (
    <div className="space-y-4">
      <EtaRow etaMinutes={etaMinutes} label="Prep time" />
      {order.tableNumber && (
        <div className="rounded-[var(--radius-large)] border border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
          <div>
            <Text variant="caption" tone="secondary">
              Dine-In Table
            </Text>
            <Text variant="headlineMedium" className="font-bold text-primary">
              Table {order.tableNumber}
            </Text>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              KOT Dispatched
            </span>
          </div>
        </div>
      )}
      <Section icon={<Utensils className="h-4 w-4" aria-hidden />} title="Restaurant">
        <Text variant="titleMedium">{order.store.name}</Text>
        <Text variant="caption" tone="secondary">
          {order.store.address}
        </Text>
      </Section>
      <StoreContact order={order} address />
      <Section icon={<Package className="h-4 w-4" aria-hidden />} title="Dining instructions">
        <Text variant="bodyMedium" tone="secondary">
          {order.fulfillmentInstructions?.trim() ||
            (order.tableNumber
              ? `Your meal will be served directly at Table ${order.tableNumber}. Please relax and enjoy!`
              : "Please share your order code with the server when they arrive at your table.")}
        </Text>
      </Section>
    </div>
  );
}

function StoreContact({ order, address }: { order: Order; address?: boolean }) {
  return (
    <Section icon={<MapPin className="h-4 w-4" aria-hidden />} title="Store contact">
      <Text variant="titleMedium">{order.store.name}</Text>
      {address && (
        <Text variant="caption" tone="secondary">
          {order.store.address}
        </Text>
      )}
      {order.store.phone && (
        <AppButton
          size="sm"
          variant="outlined"
          className="mt-2"
          iconLeft={<Phone className="h-4 w-4" aria-hidden />}
          onClick={() => callPhone(order.store.phone)}
        >
          Call store
        </AppButton>
      )}
    </Section>
  );
}

function PickupCode({ order }: { order: Order }) {
  const code = order.shortCode.split("-").pop() ?? order.shortCode;
  return (
    <Section icon={<Package className="h-4 w-4" aria-hidden />} title="Pickup code">
      <div className="mt-1 flex items-center gap-2">
        <span
          className="inline-flex items-center rounded-[var(--radius-medium)] border border-dashed border-primary/50 bg-primary/5 px-3 py-1.5 type-title-large tracking-widest text-primary tabular-nums"
          aria-label={`Pickup code ${code}`}
        >
          {code}
        </span>
        <AppButton
          size="sm"
          variant="ghost"
          iconLeft={<Copy className="h-4 w-4" aria-hidden />}
          onClick={() => {
            if (typeof navigator !== "undefined" && navigator.clipboard) {
              void navigator.clipboard.writeText(code);
            }
          }}
        >
          Copy
        </AppButton>
      </div>
    </Section>
  );
}

function EtaRow({ etaMinutes, label }: { etaMinutes?: number; label: string }) {
  if (etaMinutes == null) return null;
  return (
    <div className="rounded-[var(--radius-large)] border border-primary/20 bg-primary/5 p-4">
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text variant="headlineMedium" className="mt-0.5 tabular-nums">
        {etaMinutes <= 0 ? "Any moment" : `~${etaMinutes} min`}
      </Text>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <div className="mb-1.5 flex items-center gap-1.5 text-text-secondary">
        {icon}
        <Text variant="caption" tone="secondary">
          {title}
        </Text>
      </div>
      <div>{children}</div>
    </section>
  );
}

function callPhone(phone?: string | null) {
  if (!phone) return;
  if (typeof window !== "undefined") {
    window.open(`tel:${phone}`, "_blank");
  }
}
