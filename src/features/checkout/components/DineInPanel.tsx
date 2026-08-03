import * as React from "react";
import { MapPin, Clock } from "lucide-react";
import { CheckoutSection } from "./CheckoutSection";
import { NotesEditor } from "./NotesEditor";
import { Text } from "@/shared/components/common/Text";
import { AppBadge } from "@/shared/components/common/AppBadge";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { checkoutRepository } from "@/features/checkout/repositories/CheckoutRepository";
import type { Store } from "@/features/stores/models/Store";

interface Props {
  store: Store | null;
}

export function DineInPanel({ store }: Props) {
  const [presets, setPresets] = React.useState<string[]>([]);
  const value = useCheckoutStore((s) => s.diningNotes);
  const setValue = useCheckoutStore((s) => s.setDiningNotes);

  React.useEffect(() => {
    let mounted = true;
    void checkoutRepository.diningNotePresets().then((r) => {
      if (mounted && r.success) setPresets(r.data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const eta = store?.pickupEtaMinutes ?? store?.etaMinutes;

  return (
    <>
      <CheckoutSection
        title="Dine-in at"
        action={
          store && (
            <AppBadge tone={store.isOpen ? "success" : "warning"}>
              {store.isOpen ? "Open" : "Closed"}
            </AppBadge>
          )
        }
      >
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
                  Today · {store.hours.open}–{store.hours.close}
                </Text>
              </div>
            </div>
            {eta ? (
              <div className="mt-2 flex items-center gap-2 rounded-[var(--radius-medium)] bg-bg-secondary p-3">
                <Clock className="h-4 w-4 text-primary" aria-hidden />
                <Text variant="titleMedium">Prep time ~{eta} min after you arrive</Text>
              </div>
            ) : null}
          </div>
        ) : (
          <Text variant="bodyMedium" tone="secondary">
            No store selected.
          </Text>
        )}
      </CheckoutSection>

      <CheckoutSection title="Dining notes (optional)">
        <NotesEditor
          label="Dining notes"
          value={value}
          presets={presets}
          maxLength={160}
          placeholder="e.g. High chair needed, celebrating a birthday"
          onChange={setValue}
          helperText="Shared with the dine-in team."
        />
      </CheckoutSection>
    </>
  );
}
