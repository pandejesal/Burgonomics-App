import * as React from "react";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { StoreCard } from "./StoreCard";
import type { Store } from "@/features/stores/models/Store";

interface NearestStoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: Store | null;
  onConfirm: (store: Store) => void;
  onChoose: () => void;
}

export function NearestStoreSheet({
  open,
  onOpenChange,
  store,
  onConfirm,
  onChoose,
}: NearestStoreSheetProps) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={store ? `You're near Burgonomics ${store.name}` : "Nearest store"}
      description="We can prep everything from your closest kitchen. You can always switch later."
    >
      {store && (
        <div className="space-y-4">
          <StoreCard store={store} onSelect={onConfirm} />
          <div className="flex flex-col gap-2">
            <AppButton fullWidth size="lg" onClick={() => onConfirm(store)}>
              Continue with {store.name}
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
