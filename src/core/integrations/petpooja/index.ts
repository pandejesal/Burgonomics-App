import { mapOrderToPetpoojaSaveOrder, type PetpoojaSaveOrderPayload } from "./mapper";
import { useDemoStore } from "@/features/demo/state/demoStore";
import type { Order } from "@/features/orders/models";
import { useAuthStore } from "@/features/auth/state/authStore";
import { useOrdersStore } from "@/features/orders/state/ordersStore";

export interface PetpoojaMenuSyncResult {
  itemsSynced: number;
  syncedAt: string;
  categoriesCount: number;
  addonGroupsCount: number;
}

export interface PetpoojaOrderPushInput {
  orderId: string;
  storeId: string;
  items: Array<{ productId: string; qty: number; addOns?: string[] }>;
  amount: number;
}

export interface PetpoojaAdapter {
  readonly name: "petpooja";
  pushMenu(storeId: string): Promise<PetpoojaMenuSyncResult>;
  pushOrder(
    orderId: string,
    customOrder?: Order,
  ): Promise<{ acknowledged: boolean; kotNumber?: string; payload: PetpoojaSaveOrderPayload }>;
}

export const petpoojaAdapter: PetpoojaAdapter = {
  name: "petpooja",

  /**
   * Simulates Petpooja's Menu Push API.
   * Whenever merchant updates menu, Petpooja pushes full updated items/groups payload to the client endpoint.
   */
  async pushMenu(storeId: string): Promise<PetpoojaMenuSyncResult> {
    // Artificial network lag to feel realistic
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Get sample sizes
    const categoriesCount = 5;
    const itemsSynced = 16;
    const addonGroupsCount = 4;

    useDemoStore.getState().pushApiCall({
      label: "POST petpooja/menu_push",
      status: "ok",
      ms: 800,
      meta: { storeId, categoriesCount, itemsSynced, addonGroupsCount },
    });

    return {
      itemsSynced,
      categoriesCount,
      addonGroupsCount,
      syncedAt: new Date().toISOString(),
    };
  },

  /**
   * Compiles the exact Save Order payload according to V2.1.0 specifications and submits it.
   */
  async pushOrder(
    orderId: string,
    customOrder?: Order,
  ): Promise<{ acknowledged: boolean; kotNumber?: string; payload: PetpoojaSaveOrderPayload }> {
    // Artificial network lag
    await new Promise((resolve) => setTimeout(resolve, 350));

    let order = customOrder;

    if (!order) {
      order = useOrdersStore.getState().byId[orderId];
    }

    if (!order) {
      throw new Error(`Order ${orderId} not found in client store.`);
    }

    const user = useAuthStore.getState().user;

    // Generate compliant V2.1.0 Save Order request body
    const payload = mapOrderToPetpoojaSaveOrder(order, {
      customerName: user?.name || undefined,
      customerPhone: user?.phone || undefined,
      customerEmail: "customer@burgonomics.com",
    });

    const isSuccess = useDemoStore.getState().petpoojaSimulateSuccess;
    const kotNumber = `KOT-${orderId.slice(-6).toUpperCase()}`;

    useDemoStore.getState().pushApiCall({
      label: "POST petpooja/save_order",
      status: isSuccess ? "ok" : "fail",
      ms: 350,
      meta: {
        orderId,
        restID: payload.restID,
        kotNumber,
        payloadSize: JSON.stringify(payload).length,
        payload,
      },
    });

    if (!isSuccess) {
      return {
        acknowledged: false,
        kotNumber,
        payload,
      };
    }

    try {
      const { db } = await import("@/core/config/firebase");
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(db, "petpooja_orders", orderId), {
        ...payload,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("Failed to sync order to Firebase:", e);
    }

    return {
      acknowledged: true,
      kotNumber,
      payload,
    };
  },
};
export type { PetpoojaSaveOrderPayload } from "./mapper";
