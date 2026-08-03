import { useState } from "react";
import { toast } from "sonner";
import { useDemoStore } from "@/features/demo/state/demoStore";
import { useStoreSelection } from "@/features/stores/state/storeStore";
import { useOrdersStore } from "@/features/orders/state/ordersStore";
import { petpoojaAdapter } from "@/core/integrations/petpooja";
import { mapOrderToPetpoojaSaveOrder } from "@/core/integrations/petpooja/mapper";

interface WebhookLog {
  timestamp: string;
  type: string;
  payload: Record<string, unknown>;
}

export function PetpoojaTab() {
  const demo = useDemoStore();
  const storeSel = useStoreSelection();
  const ordersStore = useOrdersStore();
  const activeStore = storeSel.activeStore;

  const [syncing, setSyncing] = useState(false);
  const [viewingPayload, setViewingPayload] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);

  // Find most recent order to simulate callbacks/actions
  const activeOrderId = ordersStore.activeOrderId;
  const activeOrder = activeOrderId ? ordersStore.byId[activeOrderId] : null;

  // Track stock simulator
  const [itemsStock, setItemsStock] = useState<Record<string, boolean>>({
    prd_hero: true,
    prd_red_hot: true,
    prd_tandoori_paneer: true,
    prd_salted_fries: true,
  });

  const handleSyncMenu = async () => {
    if (!activeStore) {
      toast.error("Please select a store first.");
      return;
    }
    setSyncing(true);
    try {
      const result = await petpoojaAdapter.pushMenu(activeStore.id);
      toast.success("Menu Push Complete!", {
        description: `Successfully received push of ${result.itemsSynced} items & ${result.categoriesCount} categories.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast.error("Menu push failed: " + msg);
    } finally {
      setSyncing(false);
    }
  };

  const copyPayloadToClipboard = (payload: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedPayload(true);
    toast.success("Payload copied to clipboard!");
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  // Callback simulation
  const triggerCallback = async (status: string, label: string) => {
    if (!activeOrder) {
      toast.error("No active order to simulate callback.");
      return;
    }

    const payload = {
      restID: activeOrder.store.petpoojaRestId || activeOrder.store.id,
      orderID: activeOrder.id,
      status,
      cancel_reason: status === "-1" ? "Customer requested cancellation" : "",
      minimum_prep_time: "25",
      minimum_delivery_time: "40",
      rider_name: status === "4" ? "Ramesh Kumar" : "",
      rider_phone_number: status === "4" ? "+91 9988776655" : "",
      is_modified: false,
    };

    setWebhookLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        type: `Callback (${label})`,
        payload,
      },
      ...prev,
    ]);

    // Apply simulation update to active order status
    let mappedCode:
      "PLACED" | "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED" =
      "PLACED";
    if (status === "1" || status === "2" || status === "3") {
      mappedCode = "PREPARING"; // order accepted -> preparing
    } else if (status === "5") {
      mappedCode = "READY_FOR_PICKUP"; // food ready -> ready for pickup
    } else if (status === "4") {
      mappedCode = "OUT_FOR_DELIVERY"; // dispatch -> out for delivery
    } else if (status === "10") {
      mappedCode = "DELIVERED"; // delivered -> completed
    } else if (status === "-1") {
      mappedCode = "CANCELLED"; // cancelled -> cancelled
    }

    // Call dynamic import to ordersService debug/resolution
    const { resolveStatus } = await import("@/features/orders/services/ordersService");
    const updatedOrder = {
      ...activeOrder,
      status: resolveStatus(mappedCode),
      completedAt:
        mappedCode === "DELIVERED" || mappedCode === "CANCELLED"
          ? new Date().toISOString()
          : undefined,
      deliveryPartner:
        status === "4"
          ? {
              name: "Ramesh Kumar",
              phone: "+91 9988776655",
            }
          : undefined,
    };

    ordersStore.upsert(updatedOrder);

    demo.pushApiCall({
      label: `WEBHOOK petpooja/order_callback (${label})`,
      status: "ok",
      ms: 100,
      meta: payload,
    });

    toast.success(`Simulated callback: ${label}`);
  };

  const toggleStock = (itemId: string, name: string) => {
    const current = itemsStock[itemId];
    const next = !current;
    setItemsStock((prev) => ({ ...prev, [itemId]: next }));

    const payload = {
      restID: activeStore?.petpoojaRestId || activeStore?.id || "rest_navrangpura",
      inStock: next,
      type: "item",
      itemID: { [itemId]: next ? "1" : "0" },
      autoTurnOnTime: next ? "" : "custom",
      customTurnOnTime: next ? "" : new Date(Date.now() + 4 * 3600 * 1000).toISOString(),
    };

    setWebhookLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        type: `Stock ${next ? "IN" : "OUT"}`,
        payload,
      },
      ...prev,
    ]);

    demo.pushApiCall({
      label: `WEBHOOK petpooja/item_stock (${name})`,
      status: "ok",
      ms: 120,
      meta: payload,
    });

    toast.success(`Toggled stock status for "${name}"`, {
      description: `Item is now ${next ? "In Stock" : "Out of Stock"} via Petpooja webhook.`,
    });
  };

  const simulateStoreStatus = (status: "1" | "0") => {
    if (!activeStore) {
      toast.error("Please select a store first.");
      return;
    }

    const payload = {
      restID: activeStore.petpoojaRestId || activeStore.id,
      status: "success",
      store_status: status,
      turn_on_time: status === "0" ? "Tomorrow 11:00 AM" : "",
      reason: status === "0" ? "Kitchen Maintenance" : "",
    };

    setWebhookLogs((prev) => [
      {
        timestamp: new Date().toLocaleTimeString(),
        type: `Store Status (${status === "1" ? "OPEN" : "CLOSED"})`,
        payload,
      },
      ...prev,
    ]);

    demo.pushApiCall({
      label: "WEBHOOK petpooja/store_status",
      status: "ok",
      ms: 110,
      meta: payload,
    });

    toast.success(`Store status simulated: ${status === "1" ? "OPEN" : "CLOSED"}`, {
      description: `Store is now ${status === "1" ? "receiving" : "blocking"} online orders.`,
    });
  };

  // Build current Order Payload for viewing
  const currentSaveOrderPayload = activeOrder
    ? mapOrderToPetpoojaSaveOrder(activeOrder, {
        customerEmail: "john@example.com",
      })
    : null;

  return (
    <div className="space-y-4 text-xs">
      {/* Introduction & Config */}
      <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-2.5 text-white/90">
        <div className="font-semibold text-orange-400 mb-1">Petpooja V2.1.0 Integration Suite</div>
        <p className="text-[10px] text-white/70 leading-relaxed">
          Provides full compliance with Point of Sale (PoS) online ordering API specifications.
        </p>
      </div>

      {/* Menu Sync */}
      <div className="space-y-2">
        <div className="font-semibold text-white/70 uppercase text-[10px] tracking-wider">
          Menu Push API
        </div>
        <button
          onClick={handleSyncMenu}
          disabled={syncing}
          className="w-full rounded-md bg-white/10 hover:bg-white/20 py-1.5 font-medium transition cursor-pointer text-center"
        >
          {syncing ? "Receiving Push..." : "Simulate Menu Push Webhook"}
        </button>
      </div>

      {/* Save Order JSON Inspector */}
      <div className="space-y-2">
        <div className="font-semibold text-white/70 uppercase text-[10px] tracking-wider">
          Save Order V2.1.0 Payload
        </div>
        {activeOrder ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] bg-white/5 px-2 py-1 rounded">
              <span className="text-white/60">Active: {activeOrder.shortCode}</span>
              <button
                onClick={() => setViewingPayload(!viewingPayload)}
                className="text-orange-400 font-semibold hover:underline"
              >
                {viewingPayload ? "Hide JSON" : "View V2.1.0 JSON"}
              </button>
            </div>
            {viewingPayload && currentSaveOrderPayload && (
              <div className="relative rounded bg-zinc-950 p-2 border border-white/5 font-mono text-[9px] max-h-48 overflow-y-auto">
                <button
                  onClick={() => copyPayloadToClipboard(currentSaveOrderPayload)}
                  className="absolute right-2 top-2 bg-white/10 hover:bg-white/20 px-1.5 py-0.5 rounded text-[8px] text-white/80"
                >
                  {copiedPayload ? "Copied" : "Copy"}
                </button>
                <pre>{JSON.stringify(currentSaveOrderPayload, null, 2)}</pre>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-white/50 bg-white/5 p-2 rounded text-center">
            Place an order to view the compliant Save Order JSON payload.
          </p>
        )}
      </div>

      {/* Order Callback Simulation */}
      <div className="space-y-2">
        <div className="font-semibold text-white/70 uppercase text-[10px] tracking-wider">
          Order Status Webhook
        </div>
        {activeOrder ? (
          <div className="grid grid-cols-2 gap-1 bg-white/5 p-2 rounded-lg">
            <button
              onClick={() => triggerCallback("1", "Accepted (1)")}
              className="px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 rounded text-[10px] font-medium transition text-center cursor-pointer"
            >
              Accept Order (1)
            </button>
            <button
              onClick={() => triggerCallback("5", "Food Ready (5)")}
              className="px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 rounded text-[10px] font-medium transition text-center cursor-pointer"
            >
              Food Ready (5)
            </button>
            <button
              onClick={() => triggerCallback("4", "Dispatched (4)")}
              className="px-2 py-1 bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 rounded text-[10px] font-medium transition text-center cursor-pointer"
            >
              Dispatch/Rider (4)
            </button>
            <button
              onClick={() => triggerCallback("10", "Delivered (10)")}
              className="px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded text-[10px] font-medium transition text-center cursor-pointer"
            >
              Delivered (10)
            </button>
            <button
              onClick={() => triggerCallback("-1", "Cancelled (-1)")}
              className="col-span-2 mt-1 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded text-[10px] font-medium transition text-center cursor-pointer"
            >
              Cancel Order (-1)
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-white/50 bg-white/5 p-2 rounded text-center">
            Place an order to simulate POS status webhooks.
          </p>
        )}
      </div>

      {/* Item Stock status toggle */}
      <div className="space-y-2">
        <div className="font-semibold text-white/70 uppercase text-[10px] tracking-wider">
          Update Item Stock (POS Trigger)
        </div>
        <div className="space-y-1 bg-white/5 p-2 rounded-lg">
          {[
            { id: "prd_hero", name: "Hero Burger" },
            { id: "prd_red_hot", name: "Red Hot Spicy Burger" },
            { id: "prd_tandoori_paneer", name: "Tandoori Paneer Burger" },
            { id: "prd_salted_fries", name: "Salted Fries" },
          ].map((item) => {
            const inStock = itemsStock[item.id] !== false;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between text-[11px] py-1 border-b border-white/5 last:border-none"
              >
                <span className="text-white/80">{item.name}</span>
                <button
                  onClick={() => toggleStock(item.id, item.name)}
                  className={`px-2 py-0.5 rounded text-[9px] font-semibold cursor-pointer ${
                    inStock ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {inStock ? "In Stock" : "Out of Stock"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Store status toggles */}
      <div className="space-y-2">
        <div className="font-semibold text-white/70 uppercase text-[10px] tracking-wider">
          Update Store Status
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => simulateStoreStatus("1")}
            className="flex-1 px-2 py-1 bg-emerald-600/30 hover:bg-emerald-600/45 text-emerald-300 border border-emerald-500/10 rounded font-medium text-center cursor-pointer"
          >
            Store OPEN (1)
          </button>
          <button
            onClick={() => simulateStoreStatus("0")}
            className="flex-1 px-2 py-1 bg-red-600/30 hover:bg-red-600/45 text-red-300 border border-red-500/10 rounded font-medium text-center cursor-pointer"
          >
            Store CLOSED (0)
          </button>
        </div>
      </div>

      {/* Webhook Activity Log */}
      <div className="space-y-1.5">
        <div className="font-semibold text-white/70 uppercase text-[10px] tracking-wider">
          Live Webhook Log
        </div>
        <div className="rounded bg-black/40 border border-white/5 p-2 font-mono text-[9px] max-h-36 overflow-y-auto space-y-1.5">
          {webhookLogs.length === 0 ? (
            <span className="text-white/40 block text-center py-2">
              No webhook events recorded in this session.
            </span>
          ) : (
            webhookLogs.map((log, idx) => (
              <div key={idx} className="border-b border-white/5 pb-1 last:border-none last:pb-0">
                <div className="flex justify-between text-white/50 text-[8px] mb-0.5">
                  <span>{log.type}</span>
                  <span>{log.timestamp}</span>
                </div>
                <pre className="text-[8px] text-orange-200 overflow-x-auto">
                  {JSON.stringify(log.payload, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
