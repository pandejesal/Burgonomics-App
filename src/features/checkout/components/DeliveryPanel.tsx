import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { MapPin, ChevronRight, Clock, Truck, Pencil } from "lucide-react";
import { CheckoutSection } from "./CheckoutSection";
import { NotesEditor } from "./NotesEditor";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { AddressCard } from "@/features/addresses/components/AddressCard";
import { useAddressStore, selectSelectedAddress } from "@/features/addresses/state/addressStore";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import { useCheckoutStore } from "@/features/checkout/state/checkoutStore";
import { useAuthStore, selectIsAuthenticated } from "@/features/auth/state/authStore";
import { formatINR } from "@/core/utils/format";
import type { Store } from "@/features/stores/models/Store";

interface Props {
  store: Store | null;
  deliveryFee?: number;
  onAddressChange?: () => void;
}

export function DeliveryPanel({ store, deliveryFee, onAddressChange }: Props) {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const selected = useAddressStore(selectSelectedAddress);
  const [presets, setPresets] = React.useState<string[]>([]);
  const instructions = useCheckoutStore((s) => s.deliveryInstructions);
  const setInstructions = useCheckoutStore((s) => s.setDeliveryInstructions);

  React.useEffect(() => {
    let mounted = true;
    void addressRepository.listDeliveryInstructionPresets().then((r) => {
      if (mounted && r.success) setPresets(r.data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleOpenAddressPage = (editId?: string) => {
    void navigate({
      to: "/addresses/create",
      search: {
        editId,
        returnTo: "/checkout",
      },
    });
  };

  return (
    <>
      <CheckoutSection
        title="Delivery address"
        action={
          selected && (
            <button
              type="button"
              onClick={() => handleOpenAddressPage(selected.id)}
              className="type-label-large text-primary hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <Pencil className="h-3 w-3" /> Change
            </button>
          )
        }
      >
        {selected ? (
          <div onClick={() => handleOpenAddressPage(selected.id)} className="cursor-pointer">
            <AddressCard address={selected} />
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
              <Text variant="bodyMedium" tone="secondary">
                {isAuthenticated
                  ? "Add a delivery address to continue."
                  : "Sign in to use your saved addresses, or add a new address below."}
              </Text>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <AppButton
                variant="outlined"
                size="sm"
                onClick={() => handleOpenAddressPage()}
                iconRight={<ChevronRight className="h-4 w-4" aria-hidden />}
              >
                Add address
              </AppButton>
              {!isAuthenticated && (
                <Link
                  to="/auth/login"
                  search={{ redirect: "/checkout" }}
                  className="type-label-large text-primary font-bold hover:underline"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--radius-medium)] bg-bg-secondary p-3">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-text-secondary" aria-hidden />
            <div>
              <Text variant="titleMedium">Delivery fee</Text>
              <Text variant="caption" tone="secondary">
                Estimate — finalised at payment
              </Text>
            </div>
          </div>
          <Text variant="titleMedium" className="tabular-nums">
            {deliveryFee === undefined ? "Calculating..." : deliveryFee > 0 ? formatINR(deliveryFee) : "Free"}
          </Text>
        </div>
        {store && (
          <div className="mt-2 flex items-center gap-2 text-text-secondary">
            <Clock className="h-4 w-4" aria-hidden />
            <Text variant="caption" tone="secondary">
              Estimated delivery in {store.etaMinutes} min from {store.name}
            </Text>
          </div>
        )}
      </CheckoutSection>

      <CheckoutSection title="Delivery instructions">
        <NotesEditor
          label="Delivery instructions"
          value={instructions}
          presets={presets}
          maxLength={160}
          placeholder="e.g. Ring the bell, second floor, no contact"
          onChange={setInstructions}
          helperText="Shared with the delivery partner."
        />
      </CheckoutSection>
    </>
  );
}
