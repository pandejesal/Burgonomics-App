import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton } from "@/admin/components/Buttons";
import { petpoojaGateway, type WebhookRecord } from "@/core/integrations/petpooja";
import {
  Activity,
  Search,
  Copy,
  Check,
  Code,
  Clock,
  Play,
  Pause,
  Eye,
  AlertTriangle,
  MinusCircle,
  PlusCircle,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/webhooks")({
  component: PetpoojaWebhooksPage,
});

function PetpoojaWebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([]);
  const [isPlaying, setIsPlaying] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWh, setSelectedWh] = useState<WebhookRecord | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [jsonSearchQuery, setJsonSearchQuery] = useState("");
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    if (!isPlaying) return;

    const unsubscribe = petpoojaGateway.subscribeWebhookLogs((records) => {
      setWebhooks(records);
      if (records.length > 0 && !selectedWh) {
        setSelectedWh(records[0]);
      }
    });

    return () => unsubscribe();
  }, [isPlaying, selectedWh]);

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

  // Formatted JSON string generator with search highlighting
  const renderFormattedJson = (obj: any, search: string) => {
    const jsonStr = JSON.stringify(obj, null, 2);
    if (!search) return jsonStr;

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
      {/* Gateway Ingestion Endpoints (Standby) */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-[20px] p-5 shadow-sm font-sans">
        <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-2">
          <Activity size={16} /> Gateway Webhook Ingestion
        </h3>
        <p className="text-xs text-amber-700 dark:text-amber-400/80 mb-3 max-w-2xl">
          Petpooja webhook callbacks will route through the secure serverless ingestion gateway once
          live merchant credentials and POS terminals are activated.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-white dark:bg-[#1A1A1A] p-3 rounded-xl border border-gray-100 dark:border-gray-800/80 flex items-center justify-between">
            <div>
              <span className="block text-[10px] font-black uppercase text-gray-400 mb-0.5">
                Catalog Push Hook
              </span>
              <span className="text-gray-700 dark:text-gray-300">/api/webhooks/petpooja/menu</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20">
              STANDBY
            </span>
          </div>
          <div className="bg-white dark:bg-[#1A1A1A] p-3 rounded-xl border border-gray-100 dark:border-gray-800/80 flex items-center justify-between">
            <div>
              <span className="block text-[10px] font-black uppercase text-gray-400 mb-0.5">
                Terminal Status Hook
              </span>
              <span className="text-gray-700 dark:text-gray-300">
                /api/webhooks/petpooja/status
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20">
              STANDBY
            </span>
          </div>
        </div>
      </div>

      {/* Stream Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800/80 rounded-[20px] p-4 shadow-sm font-sans">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-2xl ${
              isPlaying
                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-300"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <Activity size={18} />
          </div>
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              Webhook Listener Feed
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`h-1.5 w-1.5 rounded-full ${isPlaying ? "bg-amber-500" : "bg-gray-400"}`}
              />
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                {isPlaying ? "LISTENER ACTIVE • Awaiting incoming live payloads" : "STREAM PAUSED"}
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
              Incoming Payload Records ({filteredWebhooks.length})
            </span>

            <div className="relative w-64">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Filter webhook records..."
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
                {filteredWebhooks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-400 font-semibold">
                      No webhook deliveries recorded yet. Ingress listener is standby.
                    </td>
                  </tr>
                ) : (
                  filteredWebhooks.map((wh) => (
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
                        {wh.timestamp ? new Date(wh.timestamp).toLocaleTimeString() : "N/A"}
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
                        {wh.status === "SUCCESS" || wh.status === "success" ? (
                          <span className="text-emerald-600 font-black uppercase text-[10px] flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                            <span>Delivered</span>
                          </span>
                        ) : wh.status === "IGNORED" ? (
                          <span className="text-gray-400 font-black uppercase text-[10px] flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                            <span>Ignored</span>
                          </span>
                        ) : (
                          <span className="text-red-500 font-black uppercase text-[10px] flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                            <span>{wh.status}</span>
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
                  ))
                )}
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
                </div>

                <AdminCard
                  title={`Packet ID: ${selectedWh.id}`}
                  subtitle={`Dispatched at ${selectedWh.timestamp ? new Date(selectedWh.timestamp).toLocaleString() : "N/A"}`}
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

                    <div className="p-4 rounded-xl bg-gray-950 text-gray-300 border border-gray-800 font-mono text-[10px] h-[360px] overflow-y-auto leading-relaxed whitespace-pre select-all no-scrollbar">
                      {renderFormattedJson(selectedWh.payload, jsonSearchQuery)}
                    </div>

                    <div className="flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase tracking-wider font-mono">
                      <span>Datagram Size: ~{JSON.stringify(selectedWh.payload).length} B</span>
                      <span>Verified: SSL Ingress</span>
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
