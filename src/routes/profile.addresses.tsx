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
  // Inline, persistent copy for a failed delete / set-default. A toast alone
  // disappears before a screen-reader user can act on it, and this screen has
  // no other place where the failure stays visible.
  const [actionError, setActionError] = React.useState<string | null>(null);
  // Server seed state (audit 02 F3). While the first read is in flight and the
  // local list is empty, showing "No saved addresses" would be a false empty
  // state; a failed read shows its own persistent alert instead.
  const [seeding, setSeeding] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    // Best-effort seed; the persisted store remains the render source. The
    // optional call keeps isolated view hosts/test doubles that omit hydrate
    // from crashing the screen's mount.
    const seed = addressRepository.hydrate?.();
    if (!seed) {
      setSeeding(false);
      return;
    }
    void seed.then(
      (res) => {
        if (!active) return;
        setSeeding(false);
        if (!res.success) setLoadError(res.error.message);
      },
      () => {
        if (!active) return;
        setSeeding(false);
        setLoadError("We couldn't load your saved addresses. Please try again.");
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setActionError(null);
    const res = await addressRepository.remove(pendingDelete.id);
    setPendingDelete(null);
    if (res.success) {
      setActionError(null);
      toast.success("Address removed");
    } else {
      setActionError(res.error.message);
      toast.error(res.error.message);
    }
  };

  const handleSetDefault = async (id: string) => {
    setActionError(null);
    const res = await addressRepository.setDefault(id);
    if (res.success) {
      setActionError(null);
      toast.success("Default address updated");
    } else {
      setActionError(res.error.message);
      toast.error(res.error.message);
    }
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
      <div className="mx-auto max-w-[520px] space-y-4 px-4 py-4">
        {actionError && (
          <p
            role="alert"
            className="rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error"
          >
            {actionError}
          </p>
        )}
        {loadError && (
          <p
            role="alert"
            className="rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error"
          >
            {loadError}
          </p>
        )}
        {seeding && addresses.length === 0 ? (
          <p role="status" className="py-6 text-center text-sm text-text-secondary">
            Loading your saved addresses…
          </p>
        ) : addresses.length === 0 ? (
          loadError ? null : (
            <EmptyState
              title="No saved addresses"
              description="Add your delivery address so your favorite smash burgers are just one tap away."
              actionLabel="Add address"
              onAction={handleAddAddress}
            />
          )
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
                            onClick={() => void handleSetDefault(a.id)}
                            className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 type-label-large text-primary-text transition-colors hover:bg-primary/10 cursor-pointer"
                          >
                            <Star className="h-3.5 w-3.5" aria-hidden />
                            <span>Set default</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleEditAddress(a)}
                          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 type-label-large text-text-secondary transition-colors hover:bg-bg-secondary hover:text-text cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(a)}
                          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2.5 type-label-large text-text-secondary transition-colors hover:bg-error/10 hover:text-error cursor-pointer"
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
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-divider px-4 py-3 text-sm font-semibold text-text transition-colors hover:border-primary hover:bg-surface cursor-pointer"
              >
                <Plus className="h-4 w-4 text-primary-text" aria-hidden />
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
