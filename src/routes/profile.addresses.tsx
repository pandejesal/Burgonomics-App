import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, Star, Pencil, Trash2 } from "lucide-react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { AddressCard } from "@/features/addresses/components/AddressCard";
import { AddressForm } from "@/features/addresses/components/AddressForm";
import { useAddressStore, selectAddresses } from "@/features/addresses/state/addressStore";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import type { Address } from "@/features/addresses/models";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/addresses")({
  head: () => ({
    meta: [
      { title: "Saved addresses — Burgonomics" },
      { name: "description", content: "Manage your delivery addresses." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <ProtectedRoute>
      <Body />
    </ProtectedRoute>
  );
}

type SheetView = { kind: "create" } | { kind: "edit"; address: Address } | null;

function Body() {
  const addresses = useAddressStore(selectAddresses);
  const [sheet, setSheet] = React.useState<SheetView>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Address | null>(null);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const res = await addressRepository.remove(pendingDelete.id);
    setPendingDelete(null);
    if (res.success) toast.success("Address removed");
  };

  return (
    <AppShell title="Saved addresses" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-3 px-4 py-4">
        {addresses.length === 0 ? (
          <EmptyState
            title="No saved addresses"
            description="Add your first delivery address so checkout is one tap away."
            actionLabel="Add address"
            onAction={() => setSheet({ kind: "create" })}
          />
        ) : (
          <>
            <ul className="space-y-2">
              {addresses.map((a) => (
                <li key={a.id}>
                  <AddressCard
                    address={a}
                    actionSlot={
                      <div className="flex flex-wrap gap-2">
                        {!a.isDefault && (
                          <button
                            type="button"
                            onClick={() => {
                              void addressRepository.setDefault(a.id);
                              toast.success("Default address updated");
                            }}
                            className="inline-flex items-center gap-1 type-caption text-primary hover:underline"
                          >
                            <Star className="h-3.5 w-3.5" aria-hidden /> Set default
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSheet({ kind: "edit", address: a })}
                          className="inline-flex items-center gap-1 type-caption text-text-secondary hover:text-primary"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(a)}
                          className="inline-flex items-center gap-1 type-caption text-text-secondary hover:text-error"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                        </button>
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>
            <AppButton
              variant="outlined"
              fullWidth
              onClick={() => setSheet({ kind: "create" })}
              iconLeft={<Plus className="h-4 w-4" aria-hidden />}
            >
              Add new address
            </AppButton>
          </>
        )}
      </div>

      <BottomSheet
        open={sheet !== null}
        onOpenChange={(o) => !o && setSheet(null)}
        title={sheet?.kind === "edit" ? "Edit address" : "Add address"}
      >
        {sheet && (
          <AddressForm
            initial={sheet.kind === "edit" ? sheet.address : undefined}
            onCancel={() => setSheet(null)}
            onSaved={() => {
              toast.success(sheet.kind === "edit" ? "Address updated" : "Address saved");
              setSheet(null);
            }}
          />
        )}
      </BottomSheet>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this address?"
        description="You can add it again later from this screen."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />
    </AppShell>
  );
}
