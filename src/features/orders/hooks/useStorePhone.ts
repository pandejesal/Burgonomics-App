import * as React from "react";
import { storesService } from "@/features/stores/services/storesService";
import type { Order } from "@/features/orders/models";

/**
 * The outlet's phone number for an order.
 *
 * The order keeps a snapshot of the store taken at checkout, and that snapshot
 * can carry a blank phone even though the store has one. The store directory is
 * the honest fallback. There is no default number: with neither source this
 * returns undefined and the caller shows the phone as unavailable.
 */
export function useStorePhone(order: Pick<Order, "store"> | null | undefined): string | undefined {
  const snapshotPhone = order?.store?.phone || undefined;
  const storeId = order?.store?.id;
  const [directoryPhone, setDirectoryPhone] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    // A number from another store must never survive into this one's call button.
    setDirectoryPhone(undefined);
    if (snapshotPhone || !storeId) return;
    let cancelled = false;
    storesService
      .byId(storeId)
      .then((res) => {
        if (!cancelled && res.success) setDirectoryPhone(res.data?.phone || undefined);
      })
      .catch(() => {
        // Nothing to show; the caller already handles an unavailable phone.
      });
    return () => {
      cancelled = true;
    };
  }, [snapshotPhone, storeId]);

  return snapshotPhone ?? directoryPhone;
}
