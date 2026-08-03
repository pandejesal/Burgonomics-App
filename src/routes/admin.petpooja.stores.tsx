import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { MOCK_STORES } from "@/features/stores/data/mockStores";
import { AdminCard, DataCard } from "@/admin/components/Cards";
import { AdminButton, DangerButton } from "@/admin/components/Buttons";
import { ConfirmDialog } from "@/admin/components/Utilities";
import {
  Store,
  RefreshCw,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Play,
  Database,
  ShieldCheck,
  Zap,
  Activity,
  Trash2,
  FileText,
  Search,
  Filter,
  ArrowRight,
  Wifi,
  KeyRound,
  FileCode,
  Network,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/stores")({
  component: PetpoojaStoresPage,
});

interface StoreOperationalState {
  storeId: string;
  menuVersion: string;
  lastSuccessfulVersion: string;
  lastSyncTime: string;
  webhookStatus: "active" | "degraded" | "failing";
  circuitBreaker: "closed" | "half-open" | "open";
  queueState: "idle" | "active" | "failed" | "waiting";
  retryCount: number;
  apiCredentialsLinked: boolean;
  webhookSecretLinked: boolean;
  posTerminalOnline: boolean;
}

// Initialise rich metadata for our stores
const INITIAL_OPERATIONAL_STATE: Record<string, StoreOperationalState> = {
  str_001: {
    storeId: "str_001",
    menuVersion: "v4.2.1",
    lastSuccessfulVersion: "v4.2.0",
    lastSyncTime: "2 hours ago",
    webhookStatus: "active",
    circuitBreaker: "closed",
    queueState: "idle",
    retryCount: 0,
    apiCredentialsLinked: true,
    webhookSecretLinked: true,
    posTerminalOnline: true,
  },
  str_002: {
    storeId: "str_002",
    menuVersion: "v4.1.8",
    lastSuccessfulVersion: "v4.1.8",
    lastSyncTime: "4 hours ago",
    webhookStatus: "active",
    circuitBreaker: "closed",
    queueState: "idle",
    retryCount: 0,
    apiCredentialsLinked: true,
    webhookSecretLinked: true,
    posTerminalOnline: true,
  },
  str_003: {
    storeId: "str_003",
    menuVersion: "v4.2.0",
    lastSuccessfulVersion: "v4.2.0",
    lastSyncTime: "12 mins ago",
    webhookStatus: "active",
    circuitBreaker: "closed",
    queueState: "idle",
    retryCount: 0,
    apiCredentialsLinked: true,
    webhookSecretLinked: true,
    posTerminalOnline: true,
  },
  str_004: {
    storeId: "str_004",
    menuVersion: "v4.0.2",
    lastSuccessfulVersion: "v4.0.1",
    lastSyncTime: "1 day ago",
    webhookStatus: "degraded",
    circuitBreaker: "half-open",
    queueState: "waiting",
    retryCount: 2,
    apiCredentialsLinked: true,
    webhookSecretLinked: true,
    posTerminalOnline: false,
  },
  str_005: {
    storeId: "str_005",
    menuVersion: "v3.9.5",
    lastSuccessfulVersion: "v3.9.2",
    lastSyncTime: "3 hours ago",
    webhookStatus: "failing",
    circuitBreaker: "open",
    queueState: "failed",
    retryCount: 5,
    apiCredentialsLinked: true,
    webhookSecretLinked: false,
    posTerminalOnline: false,
  },
};

// Sync report simulation
interface SyncReport {
  currentVersion: string;
  lastSuccessfulVersion: string;
  started: string;
  finished: string;
  duration: string;
  created: number;
  updated: number;
  deleted: number;
  categories: number;
  modifiers: number;
  errors: number;
  warnings: number;
  conflicts: number;
}

const DEFAULT_SYNC_REPORT: SyncReport = {
  currentVersion: "v4.2.1",
  lastSuccessfulVersion: "v4.2.0",
  started: "2026-07-19 06:42:11",
  finished: "2026-07-19 06:42:15",
  duration: "4.32s",
  created: 3,
  updated: 34,
  deleted: 1,
  categories: 2,
  modifiers: 14,
  errors: 0,
  warnings: 1,
  conflicts: 0,
};

function PetpoojaStoresPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("str_001");
  const [storeStates, setStoreStates] =
    useState<Record<string, StoreOperationalState>>(INITIAL_OPERATIONAL_STATE);
  const [syncReport, setSyncReport] = useState<SyncReport>(DEFAULT_SYNC_REPORT);

  // Manual Operations state management
  const [isOpRunning, setIsOpRunning] = useState(false);
  const [confirmOp, setConfirmOp] = useState<{
    type: string;
    title: string;
    description: string;
    action: () => void;
  } | null>(null);

  const selectedStore = MOCK_STORES.find((s) => s.id === selectedStoreId) || MOCK_STORES[0];
  const selectedState = storeStates[selectedStore.id] || INITIAL_OPERATIONAL_STATE.str_001;

  // Filter stores based on search query
  const filteredStores = MOCK_STORES.filter(
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
    callback: () => void,
  ) => {
    setConfirmOp({
      type: opName,
      title: opTitle,
      description: opDescription,
      action: () => {
        setIsOpRunning(true);
        toast.info(`Executing administrative command: ${opName.toUpperCase()}`);
        setTimeout(() => {
          setIsOpRunning(false);
          callback();
          toast.success(`Success: ${opTitle} completed successfully.`);
        }, 1500);
      },
    });
  };

  const syncTimelines = [
    { type: "FULL", status: "COMPLETED", version: "v4.2.1", duration: "4.3s", time: "2 hours ago" },
    {
      type: "STOCK",
      status: "COMPLETED",
      version: "v4.2.0",
      duration: "1.1s",
      time: "4 hours ago",
    },
    {
      type: "INCREMENTAL",
      status: "COMPLETED",
      version: "v4.2.0",
      duration: "2.3s",
      time: "1 day ago",
    },
    {
      type: "FULL",
      status: "FAILED",
      version: null,
      duration: "9.2s",
      time: "2 days ago",
      err: "POS terminal link timeout",
    },
  ];

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
              const state = storeStates[store.id] || INITIAL_OPERATIONAL_STATE.str_001;
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
                              : "bg-red-50 text-red-700 dark:bg-red-950/10 dark:text-red-400"
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
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        <Wifi size={8} />
                        {state.posTerminalOnline ? "ONLINE" : "OFFLINE"}
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
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-black uppercase font-mono ${
                  selectedState.posTerminalOnline
                    ? "bg-[#0E4825]/10 text-[#0E4825]"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {selectedState.posTerminalOnline ? "NODE LINK ACTIVE" : "NODE DEGRADED"}
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
                    <span>{selectedState.apiCredentialsLinked ? "CONFIGURED" : "MISSING"}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    WEBHOOK SECRET
                  </span>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-700 dark:text-gray-300">
                    <ShieldCheck size={13} className="text-emerald-600" />
                    <span>{selectedState.webhookSecretLinked ? "VALIDATED" : "NOT SET"}</span>
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
                    Last Completed Synchronization Report
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
                        "Are you sure you want to download and rebuild the entire store menu structure? This completely sweeps clean and overwrites current menu versions, rebuilding all indices.",
                        () => {
                          setStoreStates((prev) => ({
                            ...prev,
                            [selectedStore.id]: {
                              ...prev[selectedStore.id],
                              menuVersion: "v4.2.2",
                              lastSyncTime: "Just now",
                              queueState: "idle",
                            },
                          }));
                          setSyncReport((prev) => ({
                            ...prev,
                            currentVersion: "v4.2.2",
                            updated: 42,
                            created: 1,
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
                        "Fetch items with modified flag only. This does not sweep entire menu layouts and is much lighter.",
                        () => {
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
                        "Download active inventory status (in-stock / out-of-stock) from Petpooja POS and match with Burgonomics catalog.",
                        () => {},
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
                        "Verify whether POS gateway is answering handshakes.",
                        () => {
                          setStoreStates((prev) => ({
                            ...prev,
                            [selectedStore.id]: {
                              ...prev[selectedStore.id],
                              posTerminalOnline: true,
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
                        "Erase Redis cache for this store. Next user request will perform warm loader fetch.",
                        () => {},
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
                        "Replay Last webhook Payload",
                        "Inject last recorded webhook packet back into BullMQ processor queue.",
                        () => {},
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
                        "Purge Redis Store State",
                        "DANGEROUS: Forcefully delete any cached metadata, token mappings and metrics. Required only for terminal repossessions.",
                        () => {},
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
                        "Establish New Terminal Handshake",
                        "Force token generation and secure WebSocket link setup.",
                        () => {
                          setStoreStates((prev) => ({
                            ...prev,
                            [selectedStore.id]: {
                              ...prev[selectedStore.id],
                              posTerminalOnline: true,
                              circuitBreaker: "closed",
                              webhookStatus: "active",
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

              {/* Sync timeline history */}
              <div className="space-y-2 border-t border-gray-50 dark:border-gray-800/50 pt-4">
                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Terminal Activity Logs (Timeline)
                </span>

                <div className="space-y-2 font-mono text-[10px] leading-relaxed">
                  {syncTimelines.map((log, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 rounded-xl flex items-start justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold text-white uppercase ${
                              log.status === "COMPLETED" ? "bg-emerald-600" : "bg-red-500"
                            }`}
                          >
                            {log.status}
                          </span>
                          <span className="font-extrabold text-gray-800 dark:text-gray-200">
                            {log.type} SYNC
                          </span>
                        </div>
                        {log.err && (
                          <p className="text-red-500 font-medium text-[9px] mt-0.5">{log.err}</p>
                        )}
                        {log.version && (
                          <span className="text-gray-400 block text-[9px]">
                            Schema: {log.version}
                          </span>
                        )}
                      </div>
                      <div className="text-right text-gray-400 flex flex-col items-end">
                        <span>{log.time}</span>
                        <span>{log.duration}</span>
                      </div>
                    </div>
                  ))}
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
            confirmOp.action();
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
