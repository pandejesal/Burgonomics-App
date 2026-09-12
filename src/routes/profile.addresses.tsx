import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Star, Pencil, Trash2 } from "lucide-react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { AppButton } from "@/shared/components/common/AppButton";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { AddressCard } from "@/features/addresses/components/AddressCard";
import { AddressFormModal } from "@/features/profile/components/AddressFormModal";
import { useAddressStore, selectAddresses } from "@/features/addresses/state/addressStore";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import type { Address } from "@/features/addresses/models";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/addresses")({
  head: () => ({
    meta: [
      { title: "Saved Addresses — Burgonomics" },
      { name: "description", content: "Manage your delivery addresses and set default address." },
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

function Body() {
  const navigate = useNavigate();
  const addresses = useAddressStore(selectAddresses);
  const [pendingDelete, setPendingDelete] = React.useState<Address | null>(null);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingAddress, setEditingAddress] = React.useState<Address | null>(null);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const res = await addressRepository.remove(pendingDelete.id);
    setPendingDelete(null);
    if (res.success) toast.success("Address removed");
  };

  const handleAddAddress = () => {
    setEditingAddress(null);
    setModalOpen(true);
  };

  const handleEditAddress = (a: Address) => {
    setEditingAddress(a);
    setModalOpen(true);
  };

  return (
    <AppShell title="Saved Addresses" backTo="/profile" showTabs showTopBar>
      <div className="mx-auto max-w-[520px] space-y-3 px-4 py-4">
        {addresses.length === 0 ? (
          <EmptyState
            title="No saved addresses"
            description="Add your delivery address so your favorite smash burgers are just one tap away."
            actionLabel="Add address"
            onAction={handleAddAddress}
          />
        ) : (
          <>
            <ul className="space-y-2.5">
              {addresses.map((a) => (
                <li key={a.id}>
                  <AddressCard
                    address={a}
                    actionSlot={
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {!a.isDefault && (
                          <button
                            type="button"
                            onClick={() => {
                              void addressRepository.setDefault(a.id);
                              toast.success("Default address updated");
                            }}
                            className="inline-flex items-center gap-1 min-h-[36px] px-2 py-1 rounded-lg text-xs font-bold text-[#0E4825] dark:text-[#4ADE80] hover:bg-[#0E4825]/10 cursor-pointer transition-colors"
                          >
                            <Star className="h-3.5 w-3.5" aria-hidden />
                            <span>Set default</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEditAddress(a)}
                          className="inline-flex items-center gap-1 min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium text-text-secondary hover:text-text hover:bg-bg-secondary cursor-pointer transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(a)}
                          className="inline-flex items-center gap-1 min-h-[36px] px-2 py-1 rounded-lg text-xs font-medium text-text-secondary hover:text-red-500 hover:bg-red-500/10 cursor-pointer transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          <span>Delete</span>
                        </button>
                      </div>
                    }
                  />
                </li>
              ))}
            </ul>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleAddAddress}
                className="w-full min-h-[48px] py-3 px-4 rounded-2xl border-2 border-dashed border-divider hover:border-primary text-text font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all hover:bg-surface cursor-pointer"
              >
                <Plus className="h-4 w-4 text-primary" />
                <span>Add new address</span>
              </button>
            </div>
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this address?"
        description="You can add it again later from this screen."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDelete}
      />

      <AddressFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        addressToEdit={editingAddress}
        onSuccess={() => setModalOpen(false)}
      />
    </AppShell>
  );
}

export default Page;
