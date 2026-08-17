import * as React from "react";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { AppShell } from "@/shared/layouts/AppShell";
import { AddressForm } from "@/features/addresses/components/AddressForm";
import { useAddressStore, selectAddresses } from "@/features/addresses/state/addressStore";
import { toast } from "sonner";
import type { Address } from "@/features/addresses/models";

export const Route = createFileRoute("/addresses/create")({
  validateSearch: (search: Record<string, unknown>): { editId?: string; returnTo?: string } => {
    return {
      editId: typeof search.editId === "string" ? search.editId : undefined,
      returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Delivery Address — Burgonomics" },
      { name: "description", content: "Enter your delivery address for Burgonomics order." },
    ],
  }),
  component: AddressCreatePage,
});

function AddressCreatePage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/addresses/create" });
  const addresses = useAddressStore(selectAddresses);
  const select = useAddressStore((s) => s.select);

  const initialAddress = React.useMemo(() => {
    if (!search.editId) return undefined;
    return addresses.find((a) => a.id === search.editId);
  }, [addresses, search.editId]);

  const returnTarget = search.returnTo || "/checkout";

  const handleSaved = (saved: Address | { id: string }) => {
    select(saved.id);
    toast.success(initialAddress ? "Address updated successfully" : "Address saved successfully");
    void navigate({ to: returnTarget as any });
  };

  const handleCancel = () => {
    void navigate({ to: returnTarget as any });
  };

  return (
    <AppShell
      title={initialAddress ? "Edit address" : "Add address"}
      backTo={returnTarget}
      showTabs={false}
      showTopBar
    >
      <div className="mx-auto max-w-[560px] px-4 py-4">
        <AddressForm initial={initialAddress} onSaved={handleSaved} onCancel={handleCancel} />
      </div>
    </AppShell>
  );
}
