import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/admin/dashboard/services/dashboardService";
import { MOCK_STORES } from "@/features/stores/data/mockStores";
import { AdminCard } from "@/admin/components/Cards";
import { AdminButton } from "@/admin/components/Buttons";
import {
  FileText,
  Search,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/petpooja/logs")({
  component: PetpoojaLogsPage,
});

interface SyncLogRecord {
  id: string;
  storeName: string;
  storeId: string;
  scope: "FULL" | "INCREMENTAL" | "STOCK" | "STATUS";
  status: "COMPLETED" | "FAILED" | "RUNNING" | "PENDING";
  version: string;
  startedAt: string;
  finishedAt: string;
  duration: string;
  created: number;
  updated: number;
  deleted: number;
  conflicts: number;
  error: string | null;
}

const MOCK_SYNC_LOGS: SyncLogRecord[] = [
  {
    id: "log_001",
    storeName: "Burgonomics Navrangpura",
    storeId: "str_001",
    scope: "FULL",
    status: "COMPLETED",
    version: "v4.2.1",
    startedAt: "2026-07-19 06:42:11",
    finishedAt: "2026-07-19 06:42:15",
    duration: "4.3s",
    created: 3,
    updated: 34,
    deleted: 1,
    conflicts: 0,
    error: null,
  },
  {
    id: "log_002",
    storeName: "Burgonomics Nehrunagar",
    storeId: "str_002",
    scope: "STOCK",
    status: "COMPLETED",
    version: "v4.1.8",
    startedAt: "2026-07-19 05:12:00",
    finishedAt: "2026-07-19 05:12:01",
    duration: "1.2s",
    created: 0,
    updated: 12,
    deleted: 0,
    conflicts: 0,
    error: null,
  },
  {
    id: "log_003",
    storeName: "Burgonomics Mansi Circle",
    storeId: "str_003",
    scope: "INCREMENTAL",
    status: "COMPLETED",
    version: "v4.2.0",
    startedAt: "2026-07-19 04:00:30",
    finishedAt: "2026-07-19 04:00:32",
    duration: "2.1s",
    created: 1,
    updated: 8,
    deleted: 0,
    conflicts: 0,
    error: null,
  },
  {
    id: "log_004",
    storeName: "Burgonomics Science City",
    storeId: "str_004",
    scope: "FULL",
    status: "FAILED",
    version: "v4.0.2",
    startedAt: "2026-07-18 23:45:00",
    finishedAt: "2026-07-18 23:45:12",
    duration: "12.0s",
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    error: "Petpooja POS terminal handshake timeout after 10000ms",
  },
  {
    id: "log_005",
    storeName: "Burgonomics Gota",
    storeId: "str_005",
    scope: "STATUS",
    status: "COMPLETED",
    version: "v3.9.5",
    startedAt: "2026-07-18 22:15:00",
    finishedAt: "2026-07-18 22:15:01",
    duration: "0.8s",
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    error: null,
  },
  {
    id: "log_006",
    storeName: "Burgonomics Navrangpura",
    storeId: "str_001",
    scope: "INCREMENTAL",
    status: "COMPLETED",
    version: "v4.2.0",
    startedAt: "2026-07-18 20:00:00",
    finishedAt: "2026-07-18 20:00:02",
    duration: "1.9s",
    created: 0,
    updated: 14,
    deleted: 2,
    conflicts: 1,
    error: null,
  },
  {
    id: "log_007",
    storeName: "Burgonomics Gota",
    storeId: "str_005",
    scope: "FULL",
    status: "FAILED",
    version: "v3.9.2",
    startedAt: "2026-07-18 18:30:10",
    finishedAt: "2026-07-18 18:30:18",
    duration: "8.4s",
    created: 0,
    updated: 0,
    deleted: 0,
    conflicts: 0,
    error: "Signature mismatch: webhook verification failed",
  },
];

function PetpoojaLogsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");

  const { data: remoteSyncLogs, isLoading } = useQuery({
    queryKey: ["petpooja-sync-history-logs"],
    queryFn: () => dashboardService.getSyncHistory().catch(() => []),
  });

  // Filter logs based on parameters
  const filteredLogs = MOCK_SYNC_LOGS.filter((log) => {
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
    toast.info("Generating Excel document...");
    setTimeout(() => {
      handleExportCSV(); // Fallback to clean CSV structure with excel file extension triggers Excel nicely too
    }, 500);
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Filters panel */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 rounded-[20px] p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-gray-50 dark:border-gray-800 pb-3">
          <Filter size={14} className="text-[#0E4825] dark:text-emerald-400" />
          <span className="text-xs font-black uppercase tracking-wider text-gray-800 dark:text-gray-200 font-sans">
            Filters Explorer
          </span>
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
              {MOCK_STORES.map((s) => (
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
            Matched logs: {filteredLogs.length} entries
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
        title="Catalog Mutations Logs Logbook"
        subtitle="Audited chronological ledger of POS menu downloads"
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
                    No sync logs match the search filters.
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
