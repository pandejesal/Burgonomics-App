import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton } from "@/admin/components/Buttons";
import {
  Activity,
  Search,
  Copy,
  Check,
  Code,
  XCircle,
  Clock,
  Play,
  Pause,
  ArrowRight,
  Eye,
  RefreshCw,
  AlertTriangle,
  MinusCircle,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/webhooks")({
  component: PetpoojaWebhooksPage,
});

interface WebhookRecord {
  id: string;
  timestamp: string;
  storeName: string;
  storeId: string;
  type: "order.save" | "menu.sync" | "inventory.update" | "store.status";
  status: "SUCCESS" | "IGNORED" | "RETRYING" | "FAILED";
  executionTimeMs: number;
  payload: Record<string, any>;
  previousPayload?: Record<string, any>; // for highlighting diffs
}

const MOCK_WEBHOOKS: WebhookRecord[] = [
  {
    id: "wh_001",
    timestamp: "2026-07-19 09:12:45",
    storeName: "Burgonomics Navrangpura",
    storeId: "str_001",
    type: "order.save",
    status: "SUCCESS",
    executionTimeMs: 42,
    payload: {
      restaurant_id: "rest_navrangpura",
      order_id: "89224155",
      total_amount: 549.0,
      payment_type: "online",
      items: [
        { item_id: "itm_double_cheese", qty: 2, price: 210.0 },
        { item_id: "itm_fries_large", qty: 1, price: 129.0 },
      ],
      customer: { name: "Aarav Sharma", phone: "9876543210" },
    },
    previousPayload: {
      restaurant_id: "rest_navrangpura",
      order_id: "89224155",
      total_amount: 500.0, // shows a diff
      payment_type: "online",
      items: [{ item_id: "itm_double_cheese", qty: 2, price: 210.0 }],
      customer: { name: "Aarav Sharma", phone: "9876543210" },
    },
  },
  {
    id: "wh_002",
    timestamp: "2026-07-19 09:11:02",
    storeName: "Burgonomics Nehrunagar",
    storeId: "str_002",
    type: "inventory.update",
    status: "SUCCESS",
    executionTimeMs: 18,
    payload: {
      restaurant_id: "rest_nehrunagar",
      updated_at: "2026-07-19T09:11:02.000Z",
      items: [
        { item_id: "itm_classic_veg", stock_status: "in_stock" },
        { item_id: "itm_nutella_shake", stock_status: "out_of_stock" },
      ],
    },
  },
  {
    id: "wh_003",
    timestamp: "2026-07-19 09:08:15",
    storeName: "Burgonomics Gota",
    storeId: "str_005",
    type: "menu.sync",
    status: "FAILED",
    executionTimeMs: 350,
    payload: {
      restaurant_id: "rest_gota",
      reason: "manual_push",
      checksum: "sha256:0e4825ff6600",
      menu_structure: {
        categories_count: 8,
        items_count: 142,
      },
    },
    previousPayload: {
      restaurant_id: "rest_gota",
      reason: "manual_push",
      checksum: "sha256:old_checksum",
      menu_structure: {
        categories_count: 8,
        items_count: 140, // count diff
      },
    },
  },
  {
    id: "wh_004",
    timestamp: "2026-07-19 09:05:30",
    storeName: "Burgonomics Mansi Circle",
    storeId: "str_003",
    type: "store.status",
    status: "IGNORED",
    executionTimeMs: 5,
    payload: {
      restaurant_id: "rest_mansi_circle",
      status: "online",
      reason: "periodic_keepalive",
    },
  },
  {
    id: "wh_005",
    timestamp: "2026-07-19 08:59:12",
    storeName: "Burgonomics Science City",
    storeId: "str_004",
    type: "order.save",
    status: "RETRYING",
    executionTimeMs: 120,
    payload: {
      restaurant_id: "rest_science_city",
      order_id: "89224012",
      total_amount: 320.0,
      payment_type: "cod",
      items: [{ item_id: "itm_peri_peri_burger", qty: 1, price: 180.0 }],
      error_logs: "Connection failure to Burgonomics client API. Attempt 2 of 5.",
    },
  },
];

function PetpoojaWebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>(MOCK_WEBHOOKS);
  const [isPlaying, setIsPlaying] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWh, setSelectedWh] = useState<WebhookRecord | null>(MOCK_WEBHOOKS[0]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [jsonSearchQuery, setJsonSearchQuery] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  // Poll simulation: add a new webhook payload every 5 seconds to show dynamic movement
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const types: Array<WebhookRecord["type"]> = [
        "order.save",
        "inventory.update",
        "store.status",
        "menu.sync",
      ];
      const statuses: Array<WebhookRecord["status"]> = ["SUCCESS", "IGNORED", "RETRYING", "FAILED"];
      const chosenType = types[Math.floor(Math.random() * types.length)];
      const chosenStatus = statuses[Math.floor(Math.random() * statuses.length)];
      const execTime = Math.floor(Math.random() * 80) + 5;

      const randomWhId = Math.floor(Math.random() * 900000) + 100000;

      const newWh: WebhookRecord = {
        id: `wh_${randomWhId}`,
        timestamp: new Date().toISOString().replace("T", " ").substring(0, 19),
        storeName: "Burgonomics Navrangpura",
        storeId: "str_001",
        type: chosenType,
        status: chosenStatus,
        executionTimeMs: execTime,
        payload: {
          restaurant_id: "rest_navrangpura",
          event_fired: chosenType,
          live_status: chosenStatus,
          timestamp_epoch: Date.now(),
          node_meta: {
            balancer: "cloud-run-ingress",
            datacenter: "asia-south1",
          },
        },
      };

      setWebhooks((prev) => [newWh, ...prev.slice(0, 12)]);
      toast.info(`New Webhook received: ${chosenType.toUpperCase()} for Navrangpura`, {
        description: `Status: ${chosenStatus} (${execTime}ms)`,
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId("copied");
    toast.success("Payload copied to clipboard.");
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Search filter for webhook list
  const filteredWebhooks = webhooks.filter(
    (wh) =>
      wh.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wh.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wh.status.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Lazy loaded JSON string generator with search highlighting
  const renderFormattedJson = (obj: any, search: string) => {
    const jsonStr = JSON.stringify(obj, null, 2);
    if (!search) return jsonStr;

    // Highlights matching substrings with amber tags
    const escapedSearch = search.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp(`(${escapedSearch})`, "gi");
    return jsonStr.split(regex).map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-amber-400/30 text-amber-300 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  return (
    <div className="space-y-6">
      {/* Live Stream Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800/80 rounded-[20px] p-4 shadow-sm">
        <div className="flex items-center gap-3 font-sans">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
              isPlaying
                ? "bg-emerald-50 text-emerald-600 animate-pulse"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <Activity size={18} />
          </div>
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              Live Webhook Streamer
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${isPlaying ? "bg-emerald-500" : "bg-gray-400"}`}
              />
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                {isPlaying
                  ? "LIVE MODE ACTIVE • Simulating payload delivery (5s)"
                  : "STREAM PAUSED"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AdminButton
            variant="outline"
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
            className="flex items-center gap-1.5"
          >
            {isPlaying ? (
              <>
                <Pause size={12} />
                <span>Pause Stream</span>
              </>
            ) : (
              <>
                <Play size={12} />
                <span>Resume Stream</span>
              </>
            )}
          </AdminButton>
        </div>
      </div>

      {/* Split view: Table list vs Raw JSON Viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Table Panel */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between font-sans">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              Live Ingress Deliveries ({filteredWebhooks.length})
            </span>

            <div className="relative w-64">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Filter stream logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-xl text-[11px] font-bold outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <div className="overflow-x-auto no-scrollbar border border-gray-100 dark:border-gray-800 rounded-2xl bg-white dark:bg-[#1A1A1A] shadow-sm">
            <table className="w-full text-left border-collapse font-sans">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 text-[10px] font-black uppercase tracking-wider text-gray-400 font-mono">
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Merchant Node</th>
                  <th className="py-3.5 px-4">Event Topic</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Latency</th>
                  <th className="py-3.5 px-4 text-right">Payload</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-gray-100 dark:divide-gray-800/40 font-semibold text-gray-700 dark:text-gray-300">
                {filteredWebhooks.map((wh) => (
                  <tr
                    key={wh.id}
                    onClick={() => setSelectedWh(wh)}
                    className={`cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-all ${
                      selectedWh?.id === wh.id
                        ? "bg-[#0E4825]/[0.02] dark:bg-[#FF6600]/[0.02] border-l-2 border-[#0E4825] dark:border-[#FF6600]"
                        : ""
                    }`}
                  >
                    <td className="py-4 px-4 font-mono text-[10px] text-gray-400">
                      {wh.timestamp.split(" ")[1]}
                    </td>
                    <td className="py-4 px-4 font-black text-gray-900 dark:text-white">
                      {wh.storeName.replace("Burgonomics ", "")}
                    </td>
                    <td className="py-4 px-4 font-mono text-[10px]">
                      <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded font-black text-gray-600 dark:text-gray-300">
                        {wh.type}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {wh.status === "SUCCESS" && (
                        <span className="text-emerald-600 font-black uppercase text-[10px] flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                          <span>Delivered</span>
                        </span>
                      )}
                      {wh.status === "IGNORED" && (
                        <span className="text-gray-400 font-black uppercase text-[10px] flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                          <span>Ignored</span>
                        </span>
                      )}
                      {wh.status === "RETRYING" && (
                        <span className="text-amber-500 font-black uppercase text-[10px] flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                          <span>Retrying</span>
                        </span>
                      )}
                      {wh.status === "FAILED" && (
                        <span className="text-red-500 font-black uppercase text-[10px] flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-mono text-[10px] text-gray-500">
                      {wh.executionTimeMs}ms
                    </td>
                    <td className="py-4 px-4 text-right">
                      <button
                        type="button"
                        className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-800 dark:hover:text-white"
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* JSON Viewer and Diff Analyzer */}
        <div className="lg:col-span-5 space-y-4">
          <AnimatePresence mode="wait">
            {selectedWh ? (
              <motion.div
                key={selectedWh.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between font-sans">
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                    Raw Webhook Payload Reader
                  </span>
                  {selectedWh.previousPayload && (
                    <button
                      onClick={() => setShowDiff(!showDiff)}
                      className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1 text-[#0E4825] dark:text-orange-400 hover:underline cursor-pointer font-sans"
                    >
                      <Code size={11} />
                      <span>{showDiff ? "View JSON" : "Analyze Payload Diff"}</span>
                    </button>
                  )}
                </div>

                <AdminCard
                  title={`Packet ID: ${selectedWh.id}`}
                  subtitle={`Dispatched at ${selectedWh.timestamp}`}
                  extra={
                    <div className="flex gap-1">
                      <AdminButton
                        variant="outline"
                        size="sm"
                        className="py-1 px-2.5 rounded-lg"
                        onClick={() => handleCopy(JSON.stringify(selectedWh.payload, null, 2))}
                      >
                        {copiedId === "copied" ? <Check size={11} /> : <Copy size={11} />}
                        <span>Copy</span>
                      </AdminButton>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    {/* Embedded search field within raw payload viewer */}
                    <div className="relative font-sans">
                      <Search
                        size={12}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                      />
                      <input
                        type="text"
                        placeholder="Search keys, values or objects inside JSON..."
                        value={jsonSearchQuery}
                        onChange={(e) => setJsonSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl text-[10px] font-bold outline-none focus:border-emerald-500"
                      />
                    </div>

                    {showDiff && selectedWh.previousPayload ? (
                      /* Diff Visualizer Panel */
                      <div className="space-y-3 font-mono text-[10px] leading-relaxed p-4 rounded-xl bg-gray-950 text-gray-300 border border-gray-800 h-[360px] overflow-y-auto no-scrollbar whitespace-pre">
                        <div className="text-gray-400 border-b border-gray-800 pb-2 mb-2 font-sans flex items-center gap-1.5">
                          <AlertTriangle size={11} className="text-amber-500" />
                          <span>Diffing against previous state payload</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-rose-400 bg-rose-950/20 px-2 py-1 rounded">
                          <MinusCircle size={12} className="shrink-0 mt-0.5" />
                          <span>- total_amount: 500.0</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-emerald-400 bg-emerald-950/20 px-2 py-1 rounded">
                          <PlusCircle size={12} className="shrink-0 mt-0.5" />
                          <span>+ total_amount: 549.0</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-rose-400 bg-rose-950/20 px-2 py-1 rounded mt-2">
                          <MinusCircle size={12} className="shrink-0 mt-0.5" />
                          <span>- items count: 1</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-emerald-400 bg-emerald-950/20 px-2 py-1 rounded">
                          <PlusCircle size={12} className="shrink-0 mt-0.5" />
                          <span>+ items count: 2 (added fries_large)</span>
                        </div>
                        <div className="text-gray-500 italic mt-4 font-sans">
                          All other structured elements match perfectly.
                        </div>
                      </div>
                    ) : (
                      /* Formatted formatted lazy JSON Viewer */
                      <div className="p-4 rounded-xl bg-gray-950 text-gray-300 border border-gray-800 font-mono text-[10px] h-[360px] overflow-y-auto leading-relaxed whitespace-pre select-all no-scrollbar">
                        {renderFormattedJson(selectedWh.payload, jsonSearchQuery)}
                      </div>
                    )}

                    <div className="flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase tracking-wider font-mono">
                      <span>Datagram Size: ~{JSON.stringify(selectedWh.payload).length} B</span>
                      <span>Verified: SSL Handshake</span>
                    </div>
                  </div>
                </AdminCard>
              </motion.div>
            ) : (
              <div className="text-center py-12 border border-dashed border-gray-100 dark:border-gray-800 rounded-[20px] bg-white dark:bg-[#1A1A1A] text-gray-400 font-sans">
                <Code size={24} className="mx-auto text-gray-300 mb-2" />
                <p className="text-xs font-semibold">
                  Select a webhook to examine the structured payload.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
