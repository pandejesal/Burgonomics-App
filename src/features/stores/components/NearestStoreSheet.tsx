import * as React from "react";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { StoreCard } from "./StoreCard";
import type { Store } from "@/features/stores/models/Store";
import { isStoreInDeliveryArea } from "@/features/stores/utils/serviceArea";

interface NearestStoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store | null;
  onConfirm: (store: Store) => void;
  onChoose: () => void;
  /** Current fulfillment mode for delivery area checking */
  fulfillment?: "delivery" | "takeaway" | "dinein" | null;
  /** User coordinates for delivery area checking */
  userCoords?: { lat: number; lng: number } | null;
}

export function NearestStoreSheet({
  open,
  onOpenChange,
  store,
  onConfirm,
  onChoose,
  fulfillment,
  userCoords,
}: NearestStoreSheetProps) {
  // Check if store is out of delivery area
  const outOfArea =
    fulfillment === "delivery" && userCoords && store
      ? !isStoreInDeliveryArea(store, userCoords.lat, userCoords.lng)
      : false;

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={store ? `You're near Burgonomics ${store.name}` : "Nearest store"}
      description="We can prep everything from your closest kitchen. You can always switch later."
    >
      {store && (
        <div className="space-y-4">
          <StoreCard
            store={store}
            onSelect={onConfirm}
            outOfArea={outOfArea}
            fulfillment={fulfillment}
          />
          <div className="flex flex-col gap-2">
            <AppButton
              fullWidth
              size="lg"
              onClick={() => onConfirm(store)}
              disabled={outOfArea}
              aria-disabled={outOfArea}
            >
              {outOfArea ? "Outside delivery area" : `Continue with ${store.name}`}
            </AppButton>
            <AppButton variant="ghost" fullWidth onClick={onChoose}>
              Choose another store
            </AppButton>
          </div>
          <Text variant="caption" tone="secondary" className="text-center">
            Selection is saved on this device.
          </Text>
        </div>
      )}
    </BottomSheet>
  );
}
