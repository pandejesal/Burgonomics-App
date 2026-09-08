import * as React from "react";
import { Store as StoreIcon } from "lucide-react";
import { AddressCard } from "@/features/addresses/components/AddressCard";
import { useNavigate } from "@tanstack/react-router";
import type { Address } from "@/features/addresses/models";
import type { Store } from "@/features/stores/models/Store";

interface Props {
  addresses: Address[];
  selectedAddress: Address | null;
  activeStore: Store | null;
  onSelectAddress: (id: string) => void;
  onSwitchToTakeaway: () => void;
}

/**
 * AddressSelector — inline delivery-address picker for checkout.
 * Lists saved addresses (selection only; add/edit lives on
 * /profile/addresses) plus an honest out-of-zone escape to takeaway.
 */
export function AddressSelector({
  addresses,
  selectedAddress,
  activeStore,
  onSelectAddress,
  onSwitchToTakeaway,
}: Props) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text">
          Delivery address
        </h3>
        <button
          type="button"
          onClick={() => void navigate({ to: "/profile/addresses" })}
          className="text-xs font-bold text-[#FF6600] hover:underline cursor-pointer"
        >
          {addresses.length ? "Manage" : "Add address"}
        </button>
      </div>

      {addresses.length === 0 ? (
        <p className="text-xs text-text-secondary">
          No saved addresses yet{activeStore ? ` near ${activeStore.name}` : ""}. Add one to
          continue with delivery — or switch to takeaway.
        </p>
      ) : (
        <ul className="space-y-2">
          {addresses.map((addr) => (
            <li key={addr.id}>
              <AddressCard
                address={addr}
                selected={selectedAddress?.id === addr.id}
                onClick={() => onSelectAddress(addr.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={onSwitchToTakeaway}
        className="flex w-full items-center gap-2 rounded-xl border border-divider bg-bg-secondary px-3 py-2.5 text-left text-xs font-bold text-text hover:border-primary/40 transition-colors cursor-pointer"
      >
        <StoreIcon className="h-4 w-4 shrink-0 text-[#0E4825]" aria-hidden />
        Outside the delivery zone? Switch to Takeaway
      </button>
    </div>
  );
}
