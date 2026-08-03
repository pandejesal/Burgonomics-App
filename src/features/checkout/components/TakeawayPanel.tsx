import * as React from "react";
import { MapPin, Phone, Clock } from "lucide-react";
import { CheckoutSection } from "./CheckoutSection";
import { NotesEditor } from "./NotesEditor";
import { Text } from "@/shared/components/common/Text";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { checkoutRepository } from "@/features/checkout/repositories/CheckoutRepository";
import type { Store } from "@/features/stores/models/Store";

interface Props {
  store: Store | null;
}

export function TakeawayPanel({ store }: Props) {
  const [presets, setPresets] = React.useState<string[]>([]);
  const value = useCheckoutStore((s) => s.pickupInstructions);
  const setValue = useCheckoutStore((s) => s.setPickupInstructions);

  React.useEffect(() => {
    let mounted = true;
    void checkoutRepository.pickupInstructionPresets().then((r) => {
      if (mounted && r.success) setPresets(r.data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const eta = store?.pickupEtaMinutes ?? store?.etaMinutes;

  return (
    <>
      <CheckoutSection title="Pickup from">
        {store ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
              <div className="min-w-0">
                <Text variant="titleMedium">{store.name}</Text>
                <Text variant="bodyMedium" tone="secondary">
                  {store.address}
                </Text>
                <Text variant="caption" tone="secondary" className="mt-0.5 block">
                  {store.area}, {store.city}
                </Text>
              </div>
            </div>
            {store.phone && (
              <a
                href={`tel:${store.phone}`}
                aria-label={`Call ${store.name}`}
                className="mt-1 inline-flex items-center gap-2 rounded-full border border-divider px-3 py-1.5 type-label-large text-primary hover:bg-primary/5"
              >
                <Phone className="h-4 w-4" aria-hidden /> {store.phone}
              </a>
            )}
            {eta ? (
              <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-medium)] bg-bg-secondary p-3">
                <Clock className="h-4 w-4 text-primary" aria-hidden />
                <Text variant="titleMedium">Ready in about {eta} min</Text>
              </div>
            ) : null}
          </div>
        ) : (
          <Text variant="bodyMedium" tone="secondary">
            No store selected. Head back and pick a store to continue.
          </Text>
        )}
      </CheckoutSection>

      <CheckoutSection title="Pickup instructions">
        <NotesEditor
          label="Pickup instructions"
          value={value}
          presets={presets}
          maxLength={160}
          placeholder="e.g. I'll pick up at the counter"
          onChange={setValue}
          helperText="Shared with the store team."
        />
      </CheckoutSection>
    </>
  );
}
