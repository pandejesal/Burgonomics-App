import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  petpoojaGateway,
  type SyncLogRecord,
  type GatewayStore,
} from "@/core/integrations/petpooja";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton } from "@/admin/components/Buttons";
import {
  Search,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/logs")({
  component: PetpoojaLogsPage,
});

function PetpoojaLogsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [stores, setStores] = useState<GatewayStore[]>([]);

  useEffect(() => {
    void petpoojaGateway.getStores().then(setStores);
  }, []);

  const {
    data: logs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["petpooja-gateway-sync-logs"],
    queryFn: () => petpoojaGateway.getSyncLogs(),
    refetchInterval: 10000,
  });

  // Filter logs based on parameters
  const filteredLogs = logs.filter((log: SyncLogRecord) => {
    const matchesSearch =
      log.storeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.version && log.version.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (log.error && log.error.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStore = storeFilter === "all" || log.storeId === storeFilter;
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    const matchesScope = scopeFilter === "all" || log.scope === scopeFilter;

    return matchesSearch && matchesStore && matchesStatus && matchesScope;
  });

  // Function to download CSV
  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent +=
      "ID,Store,Scope,Status,Version,Started At,Finished At,Duration,Created,Updated,Deleted,Conflicts,Error\n";

    filteredLogs.forEach((log) => {
      const errorStr = log.error ? `"${log.error.replace(/"/g, '""')}"` : "None";
      csvContent += `${log.id},"${log.storeName}",${log.scope},${log.status},${log.version},${log.startedAt},${log.finishedAt},${log.duration},${log.created},${log.updated},${log.deleted},${log.conflicts},${errorStr}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `petpooja_sync_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Successfully compiled and downloaded CSV spreadsheet.");
  };

  const handleExportExcel = () => {
    toast.info("Generating spreadsheet document...");
    setTimeout(() => {
      handleExportCSV();
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Filters panel */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[20px] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-[#0E4825] dark:text-emerald-400" />
            <span className="text-xs font-black uppercase tracking-wider text-gray-800 dark:text-gray-200 font-sans">
              Filters Explorer
            </span>
          </div>
          <AdminButton
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            isLoading={isLoading}
          >
            <RefreshCw size={12} className="mr-1" />
            <span>Refresh</span>
          </AdminButton>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-sans">
          {/* Search bar */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Search Queries
            </label>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Version, Error logs, etc..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* Store select */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Filter by Merchant
            </label>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All Connected Stores</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status select */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Task Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All States</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="RUNNING">Running</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {/* Scope select */}
          <div className="space-y-1">
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Sync Scope
            </label>
            <select
              value={scopeFilter}
              onChange={(e) => setScopeFilter(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50/50 dark:bg-gray-900/30 border border-gray-100 dark:border-gray-800 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">All Scopes</option>
              <option value="FULL">FULL MENU</option>
              <option value="INCREMENTAL">INCREMENTAL</option>
              <option value="STOCK">STOCK LEVEL</option>
              <option value="STATUS">ONLINE CHECK</option>
            </select>
          </div>
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-50 dark:border-gray-800/40 font-sans">
          <span className="text-xs text-gray-400 font-semibold">
            Matched logs: {filteredLogs.length} entries (Firestore-persisted)
          </span>
          <div className="flex gap-2">
            <AdminButton variant="outline" size="sm" onClick={handleExportCSV}>
              <Download size={13} className="mr-1" />
              <span>Export CSV</span>
            </AdminButton>
            <AdminButton variant="outline" size="sm" onClick={handleExportExcel}>
              <Download size={13} className="mr-1" />
              <span>Export Excel</span>
            </AdminButton>
          </div>
        </div>
      </div>

      {/* Synchronizations Logs Table */}
      <AdminCard
        title="Catalog Mutations Logbook"
        subtitle="Audited chronological ledger of POS synchronization events (persisted in Firestore)"
      >
        <div className="overflow-x-auto no-scrollbar rounded-xl border border-gray-100 dark:border-gray-800">
          <table className="w-full text-left border-collapse font-sans">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/75 dark:bg-gray-900/40 text-[10px] font-black uppercase tracking-wider text-gray-400 font-mono">
                <th className="py-3 px-4">Merchant Store</th>
                <th className="py-3 px-4">Scope</th>
                <th className="py-3 px-4">State</th>
                <th className="py-3 px-4">Schema Version</th>
                <th className="py-3 px-4">Started / Finished</th>
                <th className="py-3 px-4">Duration</th>
                <th className="py-3 px-4 text-center">Mutations (+ / ~ / -)</th>
                <th className="py-3 px-4 text-center">Conflicts</th>
                <th className="py-3 px-4">Diagnostic Log</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-gray-100 dark:divide-gray-800/40 font-medium">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-400 font-semibold">
                    {isLoading
                      ? "Loading sync logs from Firestore..."
                      : "No sync logs recorded yet. Trigger a sync from Connected Stores to create logs."}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-gray-50/40 dark:hover:bg-[#1A1A1A]/30 transition-colors"
                  >
                    <td className="py-4 px-4 font-bold text-gray-800 dark:text-gray-200">
                      {log.storeName}
                    </td>
                    <td className="py-4 px-4 font-bold font-mono">
                      <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-[10px]">
                        {log.scope}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      {log.status === "COMPLETED" ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-600 font-extrabold uppercase text-[10px]">
                          <CheckCircle size={11} />
                          <span>Success</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-red-500 font-extrabold uppercase text-[10px]">
                          <XCircle size={11} />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-mono font-bold">{log.version}</td>
                    <td className="py-4 px-4 font-mono text-[10px] text-gray-400">
                      <div>ST: {log.startedAt}</div>
                      <div>FT: {log.finishedAt}</div>
                    </td>
                    <td className="py-4 px-4 font-mono">{log.duration}</td>
                    <td className="py-4 px-4 font-mono text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <span className="text-emerald-600 font-black">+{log.created}</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-[#FF6600] font-black">~{log.updated}</span>
                        <span className="text-gray-300">/</span>
                        <span className="text-red-500 font-black">-{log.deleted}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 font-mono font-black text-center text-amber-500">
                      {log.conflicts}
                    </td>
                    <td className="py-4 px-4 max-w-xs truncate text-[10px] text-gray-400 font-mono">
                      {log.error ? (
                        <span className="text-red-400 flex items-center gap-1 font-semibold leading-relaxed">
                          <AlertTriangle size={11} className="shrink-0" />
                          <span>{log.error}</span>
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">None</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
