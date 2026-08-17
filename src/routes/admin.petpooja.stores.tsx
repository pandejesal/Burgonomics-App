import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton, DangerButton } from "@/admin/components/Buttons";
import { ConfirmDialog } from "@/admin/components/Utilities";
import {
  petpoojaGateway,
  type GatewayStore,
  type StoreOperationalState,
  type SyncReport,
} from "@/core/integrations/petpooja";
import {
  RefreshCw,
  Sliders,
  CheckCircle,
  Database,
  ShieldCheck,
  Zap,
  Activity,
  Trash2,
  Search,
  ArrowRight,
  Wifi,
  KeyRound,
  FileCode,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/stores")({
  component: PetpoojaStoresPage,
});

const DEFAULT_SYNC_REPORT: SyncReport = {
  currentVersion: "v4.2.1",
  lastSuccessfulVersion: "v4.2.0",
  started: new Date(Date.now() - 3600000).toLocaleString(),
  finished: new Date(Date.now() - 3596800).toLocaleString(),
  duration: "3.2s",
  created: 3,
  updated: 24,
  deleted: 0,
  categories: 5,
  modifiers: 8,
  errors: 0,
  warnings: 0,
  conflicts: 0,
  simulated: true,
};

function PetpoojaStoresPage() {
  const [stores, setStores] = useState<GatewayStore[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("str_001");
  const [storeStates, setStoreStates] = useState<Record<string, StoreOperationalState>>({});
  const [syncReport, setSyncReport] = useState<SyncReport>(DEFAULT_SYNC_REPORT);

  // Manual Operations state management
  const [isOpRunning, setIsOpRunning] = useState(false);
  const [confirmOp, setConfirmOp] = useState<{
    type: string;
    title: string;
    description: string;
    action: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    void petpoojaGateway.getStores().then((list) => {
      setStores(list);
      if (list.length > 0) {
        setSelectedStoreId(list[0].id);
        // Pre-fetch operational states
        Promise.all(
          list.map((s) =>
            petpoojaGateway.getStoreStatus(s.id).then((st) => ({ id: s.id, state: st })),
          ),
        ).then((results) => {
          const map: Record<string, StoreOperationalState> = {};
          results.forEach((r) => {
            map[r.id] = r.state;
          });
          setStoreStates(map);
        });
      }
    });
  }, []);

  const selectedStore = stores.find((s) => s.id === selectedStoreId) ||
    stores[0] || {
      id: "str_001",
      name: "Burgonomics Navrangpura",
      petpoojaRestId: "rest_navrangpura",
    };

  const selectedState: StoreOperationalState = storeStates[selectedStore.id] || {
    storeId: selectedStore.id,
    menuVersion: "Standby",
    lastSuccessfulVersion: "Standby",
    lastSyncTime: "Awaiting sync",
    webhookStatus: "standby",
    circuitBreaker: "closed",
    queueState: "idle",
    retryCount: 0,
    apiCredentialsLinked: false,
    webhookSecretLinked: false,
    posTerminalOnline: false,
  };

  // Filter stores based on search query
  const filteredStores = stores.filter(
    (store) =>
      store.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      store.city.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (store.petpoojaRestId &&
        store.petpoojaRestId.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const handleTriggerOperation = (
    opName: string,
    opTitle: string,
    opDescription: string,
    actionFn: () => Promise<void>,
  ) => {
    setConfirmOp({
      type: opName,
      title: opTitle,
      description: opDescription,
      action: async () => {
        setIsOpRunning(true);
        toast.info(`Executing administrative command: ${opName.toUpperCase()}`);
        try {
          await actionFn();
          toast.success(`Success: ${opTitle} completed successfully.`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Operation failed";
          toast.error(`Failed: ${msg}`);
        } finally {
          setIsOpRunning(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Filters and search bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96 font-sans">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search stores by name, city, or Restaurant ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-2xl text-xs font-bold font-sans outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400">
            Total match: {filteredStores.length} stores
          </span>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT / TOP Pane: Store Cards Grid */}
        <div className="lg:col-span-7 space-y-4">
          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
            Connected Terminal Fleet ({filteredStores.length})
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredStores.map((store) => {
              const state = storeStates[store.id] || selectedState;
              const isSelected = selectedStoreId === store.id;

              return (
                <motion.div
                  key={store.id}
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => setSelectedStoreId(store.id)}
                  className={`rounded-[20px] p-5 border text-left cursor-pointer transition-all duration-200 shadow-sm relative overflow-hidden ${
                    isSelected
                      ? "border-[#0E4825] bg-[#0E4825]/[0.02] dark:border-[#FF6600] dark:bg-[#FF6600]/[0.02] ring-2 ring-[#0E4825]/5 dark:ring-[#FF6600]/10"
                      : "border-gray-100 dark:border-gray-800/80 bg-white dark:bg-[#1A1A1A] hover:border-gray-200"
                  }`}
                >
                  {/* Subtle selection visual indicator */}
                  {isSelected && (
                    <div className="absolute top-0 right-0 h-10 w-10 overflow-hidden">
                      <div className="absolute top-1 right-1 h-3 w-3 rounded-full bg-[#0E4825] dark:bg-[#FF6600] animate-pulse" />
                    </div>
                  )}

                  <div className="space-y-3 font-sans">
                    <div>
                      <h4 className="text-xs font-black text-gray-900 dark:text-white truncate">
                        {store.name}
                      </h4>
                      <p className="text-[10px] font-bold text-gray-400 mt-0.5 uppercase tracking-wider font-mono">
                        ID: {store.petpoojaRestId || "N/A"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold border-t border-b border-gray-50 dark:border-gray-800/40 py-2 mt-2 font-mono">
                      <div>
                        <span className="text-gray-400 block uppercase">Version</span>
                        <span className="text-gray-700 dark:text-gray-200">
                          {state.menuVersion}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 block uppercase">Last Sync</span>
                        <span className="text-gray-700 dark:text-gray-200 truncate">
                          {state.lastSyncTime}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[9px] font-black uppercase tracking-wider font-mono">
                      {/* Webhook badge */}
                      <span
                        className={`px-2 py-0.5 rounded-md ${
                          state.webhookStatus === "active"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/10 dark:text-emerald-400"
                            : state.webhookStatus === "degraded"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/10 dark:text-amber-400"
                              : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        WEBHOOK: {state.webhookStatus}
                      </span>

                      {/* Circuit breaker state */}
                      <span
                        className={`px-2 py-0.5 rounded-md ${
                          state.circuitBreaker === "closed"
                            ? "bg-[#0E4825]/5 text-[#0E4825] dark:bg-emerald-500/10 dark:text-emerald-400"
                            : state.circuitBreaker === "half-open"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-red-50 text-red-600"
                        }`}
                      >
                        CB: {state.circuitBreaker}
                      </span>

                      {/* POS link */}
                      <span
                        className={`px-2 py-0.5 rounded-md flex items-center gap-1 ${
                          state.posTerminalOnline
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        <Wifi size={8} />
                        {state.posTerminalOnline ? "ONLINE" : "STANDBY"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-gray-50 dark:border-gray-800/40 mt-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase">
                        Retries:{" "}
                        <span className="font-bold text-gray-800 dark:text-gray-200">
                          {state.retryCount}
                        </span>
                      </span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1 hover:text-[#0E4825] font-black uppercase">
                        <span>Details</span>
                        <ArrowRight size={10} />
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* RIGHT / BOTTOM Pane: Merchant Control Room & Operations */}
        <div className="lg:col-span-5 space-y-6">
          <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
            Petpooja Merchant Control Room
          </span>

          <AdminCard
            title={selectedStore.name}
            subtitle={`Integrated with POS node terminal ${selectedStore.petpoojaRestId}`}
            extra={
              <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase font-mono bg-amber-500/10 text-amber-800 dark:text-amber-300">
                GATEWAY STANDBY
              </span>
            }
          >
            {/* Split Details info */}
            <div className="space-y-5 font-sans">
              {/* Credentials mapping */}
              <div className="grid grid-cols-2 gap-4 border-b border-gray-50 dark:border-gray-800/50 pb-4">
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    API KEY MAPPING
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
                    <KeyRound size={13} className="text-[#0E4825] dark:text-emerald-400" />
                    <span>{selectedState.apiCredentialsLinked ? "CONFIGURED" : "STANDBY"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    WEBHOOK SECRET
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
                    <ShieldCheck size={13} className="text-emerald-600" />
                    <span>{selectedState.webhookSecretLinked ? "VALIDATED" : "STANDBY"}</span>
                  </div>
                </div>
              </div>

              {/* Version mapping */}
              <div className="grid grid-cols-2 gap-4 border-b border-gray-50 dark:border-gray-800/50 pb-4">
                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    CURRENT MENU VERSION
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-[#0E4825] dark:text-emerald-400">
                    <FileCode size={13} />
                    <span>{selectedState.menuVersion}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    LAST SOLID SUCCESS
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-gray-600 dark:text-gray-400">
                    <CheckCircle size={13} />
                    <span>{selectedState.lastSuccessfulVersion}</span>
                  </div>
                </div>
              </div>

              {/* Active Sync mutations overview */}
              <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/50 space-y-3 font-sans text-xs">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-[#0E4825] dark:text-emerald-400 uppercase text-[10px] tracking-wider">
                    Last Synchronization Report
                  </span>
                  <span className="font-mono text-[10px]">{syncReport.duration}</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-[10px] font-bold font-mono text-center pt-1">
                  <div className="p-2 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800/80 rounded-xl">
                    <span className="text-gray-400 block text-[9px] uppercase">Created</span>
                    <span className="text-emerald-600 text-sm font-black">
                      {syncReport.created}
                    </span>
                  </div>
                  <div className="p-2 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800/80 rounded-xl">
                    <span className="text-gray-400 block text-[9px] uppercase">Updated</span>
                    <span className="text-[#FF6600] text-sm font-black">{syncReport.updated}</span>
                  </div>
                  <div className="p-2 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800/80 rounded-xl">
                    <span className="text-gray-400 block text-[9px] uppercase">Deleted</span>
                    <span className="text-red-500 text-sm font-black">{syncReport.deleted}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-semibold text-gray-500 pt-1">
                  <div className="flex justify-between">
                    <span>Categories Updated</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200">
                      {syncReport.categories}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Modifiers Updated</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200">
                      {syncReport.modifiers}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Sync Warnings</span>
                    <span className="font-bold text-amber-500">{syncReport.warnings}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Menu Conflicts</span>
                    <span className="font-bold text-gray-800 dark:text-gray-200">
                      {syncReport.conflicts}
                    </span>
                  </div>
                </div>
              </div>

              {/* MANUAL OPERATIONS GRID */}
              <div className="space-y-3">
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider">
                  Operational Control Switches (Admin Only)
                </span>

                <div className="grid grid-cols-2 gap-3">
                  <AdminButton
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    isLoading={isOpRunning}
                    onClick={() =>
                      handleTriggerOperation(
                        "full sync",
                        "Run Full Catalog Sync",
                        "Rebuild the entire store menu structure via Petpooja gateway. This triggers a full catalog synchronization and persists audit logs.",
                        async () => {
                          const rep = await petpoojaGateway.runSync(selectedStore.id, "full");
                          setSyncReport(rep);
                          setStoreStates((prev) => ({
                            ...prev,
                            [selectedStore.id]: {
                              ...prev[selectedStore.id],
                              menuVersion: rep.currentVersion,
                              lastSuccessfulVersion: rep.lastSuccessfulVersion,
                              lastSyncTime: "Just now",
                              queueState: "idle",
                            },
                          }));
                        },
                      )
                    }
                  >
                    <RefreshCw size={12} />
                    <span>Full Menu Sync</span>
                  </AdminButton>

                  <AdminButton
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    isLoading={isOpRunning}
                    onClick={() =>
                      handleTriggerOperation(
                        "incremental sync",
                        "Run Incremental Sync",
                        "Fetch items with modified flags only via the Petpooja gateway.",
                        async () => {
                          const rep = await petpoojaGateway.runSync(
                            selectedStore.id,
                            "incremental",
                          );
                          setSyncReport(rep);
                          setStoreStates((prev) => ({
                            ...prev,
                            [selectedStore.id]: {
                              ...prev[selectedStore.id],
                              lastSyncTime: "Just now",
                            },
                          }));
                        },
                      )
                    }
                  >
                    <Sliders size={12} />
                    <span>Incremental Sync</span>
                  </AdminButton>

                  <AdminButton
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    isLoading={isOpRunning}
                    onClick={() =>
                      handleTriggerOperation(
                        "stock sync",
                        "Run Stock Levels Sync",
                        "Download active inventory status (in-stock / out-of-stock) from Petpooja gateway and reconcile with Burgonomics catalog.",
                        async () => {
                          const rep = await petpoojaGateway.runSync(selectedStore.id, "stock");
                          setSyncReport(rep);
                          setStoreStates((prev) => ({
                            ...prev,
                            [selectedStore.id]: {
                              ...prev[selectedStore.id],
                              lastSyncTime: "Just now",
                            },
                          }));
                        },
                      )
                    }
                  >
                    <Database size={12} />
                    <span>Run Stock Sync</span>
                  </AdminButton>

                  <AdminButton
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    isLoading={isOpRunning}
                    onClick={() =>
                      handleTriggerOperation(
                        "terminal status sync",
                        "Sync POS Terminal Status",
                        "Check whether Petpooja POS gateway terminal is answering handshakes.",
                        async () => {
                          const rep = await petpoojaGateway.runSync(selectedStore.id, "status");
                          setSyncReport(rep);
                          setStoreStates((prev) => ({
                            ...prev,
                            [selectedStore.id]: {
                              ...prev[selectedStore.id],
                              posTerminalOnline: false,
                              lastSyncTime: "Just now",
                            },
                          }));
                        },
                      )
                    }
                  >
                    <Wifi size={12} />
                    <span>Terminal Sync</span>
                  </AdminButton>

                  <AdminButton
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    isLoading={isOpRunning}
                    onClick={() =>
                      handleTriggerOperation(
                        "refresh cache",
                        "Invalidate Menu Cache",
                        "Flush local Petpooja cache for this store.",
                        async () => {
                          await petpoojaGateway.flushCache();
                        },
                      )
                    }
                  >
                    <Activity size={12} />
                    <span>Refresh Cache</span>
                  </AdminButton>

                  <AdminButton
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    isLoading={isOpRunning}
                    onClick={() =>
                      handleTriggerOperation(
                        "replay webhook",
                        "Replay Last Webhook Payload",
                        "Inject last recorded webhook packet back into the gateway ingestion pipeline.",
                        async () => {
                          const res = await petpoojaGateway.replayWebhook(selectedStore.id);
                          if (!res.acknowledged) {
                            toast.info(
                              "Standby gateway: no unacknowledged webhook payloads found.",
                            );
                          }
                        },
                      )
                    }
                  >
                    <Zap size={12} />
                    <span>Replay Webhook</span>
                  </AdminButton>

                  <DangerButton
                    size="sm"
                    className="justify-start gap-2 border-red-200 hover:bg-red-50"
                    isLoading={isOpRunning}
                    onClick={() =>
                      handleTriggerOperation(
                        "clear cache",
                        "Purge Gateway Cache State",
                        "Forcefully delete cached metadata, token mappings and metrics from local cache.",
                        async () => {
                          await petpoojaGateway.flushCache();
                        },
                      )
                    }
                  >
                    <Trash2 size={12} />
                    <span>Purge Cache</span>
                  </DangerButton>

                  <AdminButton
                    variant="ghost"
                    size="sm"
                    className="justify-start gap-2 bg-[#0E4825]/5 hover:bg-[#0E4825]/10 text-[#0E4825]"
                    isLoading={isOpRunning}
                    onClick={() =>
                      handleTriggerOperation(
                        "reconnect store",
                        "Reset Breaker & Reconnect Store",
                        "Reset circuit breaker and establish link state.",
                        async () => {
                          await petpoojaGateway.resetBreaker(selectedStore.id);
                          setStoreStates((prev) => ({
                            ...prev,
                            [selectedStore.id]: {
                              ...prev[selectedStore.id],
                              circuitBreaker: "closed",
                            },
                          }));
                        },
                      )
                    }
                  >
                    <Wifi size={12} />
                    <span>Reconnect Store</span>
                  </AdminButton>
                </div>
              </div>
            </div>
          </AdminCard>
        </div>
      </div>

      {/* Confirmation dialogues */}
      {confirmOp && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmOp(null)}
          onConfirm={() => {
            void confirmOp.action();
            setConfirmOp(null);
          }}
          title={`${confirmOp.title}?`}
          description={confirmOp.description}
          confirmLabel="Execute Command"
        />
      )}
    </div>
  );
}
