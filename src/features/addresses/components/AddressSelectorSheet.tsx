import * as React from "react";
import { Plus, Pencil, Trash2, Star } from "lucide-react";
import { BottomSheet } from "@/shared/components/common/BottomSheet";
import { AppButton } from "@/shared/components/common/AppButton";
import { Text } from "@/shared/components/common/Text";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { ConfirmDialog } from "@/shared/components/common/ConfirmDialog";
import { AddressCard } from "./AddressCard";
import { AddressForm } from "./AddressForm";
import { useAddressStore, selectAddresses } from "@/features/addresses/state/addressStore";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";
import type { Address } from "@/features/addresses/models";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm?: (id: string) => void;
}

type View = "list" | "create" | { kind: "edit"; address: Address };

/**
 * AddressSelectorSheet — the single interaction surface for choosing,
 * adding, editing, and removing addresses. Repository-driven end to
 * end; no calculation or persistence logic lives here.
 */
export function AddressSelectorSheet({ open, onOpenChange, onConfirm }: Props) {
  const addresses = useAddressStore(selectAddresses);
  const selectedId = useAddressStore((s) => s.selectedId);
  const select = useAddressStore((s) => s.select);
  const [view, setView] = React.useState<View>("list");
  const [pendingDelete, setPendingDelete] = React.useState<Address | null>(null);

  React.useEffect(() => {
    if (open) setView(addresses.length ? "list" : "create");
  }, [open, addresses.length]);

  const title =
    view === "list" ? "Delivery address" : view === "create" ? "Add address" : "Edit address";

  return (
    <>
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        description={view === "list" ? "Select where you'd like your order delivered." : undefined}
      >
        {view === "list" && (
          <div className="space-y-3">
            {addresses.length === 0 ? (
              <EmptyState
                title="No saved addresses"
                description="Add your first delivery address to continue."
                actionLabel="Add address"
                onAction={() => setView("create")}
              />
            ) : (
              <>
                <ul className="space-y-2">
                  {addresses.map((a) => (
                    <li key={a.id}>
                      <AddressCard
                        address={a}
                        selected={a.id === (selectedId ?? addresses.find((x) => x.isDefault)?.id)}
                        onClick={() => select(a.id)}
                        actionSlot={
                          <div className="flex flex-wrap gap-2">
                            {!a.isDefault && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void addressRepository.setDefault(a.id);
                                }}
                                className="inline-flex items-center gap-1 type-caption text-primary hover:underline"
                              >
                                <Star className="h-3.5 w-3.5" aria-hidden /> Set default
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setView({ kind: "edit", address: a });
                              }}
                              className="inline-flex items-center gap-1 type-caption text-text-secondary hover:text-primary"
                            >
                              <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDelete(a);
                              }}
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
                <div className="flex flex-col gap-2 pt-1">
                  <AppButton
                    variant="outlined"
                    fullWidth
                    onClick={() => setView("create")}
                    iconLeft={<Plus className="h-4 w-4" aria-hidden />}
                  >
                    Add new address
                  </AppButton>
                  <AppButton
                    fullWidth
                    onClick={() => {
                      const id =
                        selectedId ?? addresses.find((x) => x.isDefault)?.id ?? addresses[0]?.id;
                      if (id) {
                        select(id);
                        onConfirm?.(id);
                      }
                      onOpenChange(false);
                    }}
                  >
                    Deliver here
                  </AppButton>
                </div>
              </>
            )}
            <Text variant="caption" tone="secondary" className="block pt-1">
              Addresses are saved on this device. When you sign in, they sync across your devices.
            </Text>
          </div>
        )}

        {view === "create" && (
          <AddressForm
            onCancel={() => setView(addresses.length ? "list" : "create")}
            onSaved={() => setView("list")}
          />
        )}

        {typeof view === "object" && view.kind === "edit" && (
          <AddressForm
            initial={view.address}
            onCancel={() => setView("list")}
            onSaved={() => setView("list")}
          />
        )}
      </BottomSheet>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(v) => !v && setPendingDelete(null)}
        title="Delete this address?"
        description="You can add it back later, but this action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) void addressRepository.remove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </>
  );
}
