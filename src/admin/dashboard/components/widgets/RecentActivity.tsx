import React, { useState } from "react";
import { useAuditLogs } from "../../hooks/useDashboardData";
import {
  Activity,
  ShieldAlert,
  Key,
  RefreshCw,
  CreditCard,
  RefreshCcw,
  Database,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react";

export const RecentActivity: React.FC = () => {
  const { data: audit, isLoading, isError, refetch } = useAuditLogs({ page: 1, pageSize: 8 });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-50 dark:bg-gray-900 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !audit) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Recent Security & Audit activity
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Failed to stream audit logs and operations ledger from system ledger.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry Audit Query
        </button>
      </div>
    );
  }

  const logs = audit?.results || [];

  const getActionIconAndColor = (action: string, resource: string) => {
    const act = action.toLowerCase();
    const res = resource.toLowerCase();

    if (act.includes("login") || act.includes("auth")) {
      return { icon: Key, bg: "bg-blue-50 text-blue-600 dark:bg-blue-950/20 dark:text-blue-400" };
    }
    if (act.includes("sync") || res.includes("catalog") || res.includes("sync")) {
      return {
        icon: RefreshCw,
        bg: "bg-[#0E4825]/5 text-[#0E4825] dark:bg-[#0E4825]/10 dark:text-emerald-400",
      };
    }
    if (act.includes("payment") || act.includes("charge") || act.includes("reconcile")) {
      return {
        icon: CreditCard,
        bg: "bg-orange-50 text-orange-600 dark:bg-orange-950/20 dark:text-orange-400",
      };
    }
    if (act.includes("refund")) {
      return {
        icon: RefreshCcw,
        bg: "bg-purple-50 text-purple-600 dark:bg-purple-950/20 dark:text-purple-400",
      };
    }
    if (act.includes("role") || act.includes("permission") || act.includes("user")) {
      return {
        icon: ShieldAlert,
        bg: "bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400",
      };
    }
    return { icon: Activity, bg: "bg-gray-100 text-gray-500 dark:bg-gray-900 dark:text-gray-400" };
  };

  const formatRelativeTime = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "Just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const days = Math.floor(hr / 24);
    return `${days}d ago`;
  };

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5">
          <div>
            <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
              Recent Security & Audit Logs
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Immutable operational audit trail for compliance and safety monitors
            </p>
          </div>
          <Activity size={16} className="text-[#0E4825] dark:text-emerald-400 shrink-0" />
        </div>

        {/* Timeline */}
        <div className="relative border-l-2 border-gray-50 dark:border-gray-900 pl-4 ml-3.5 space-y-5 max-h-[440px] overflow-y-auto no-scrollbar pr-1">
          {logs.length > 0 ? (
            logs.map((log) => {
              const { icon: Icon, bg } = getActionIconAndColor(log.action, log.resourceType);
              const isExpanded = expandedId === log.id;

              return (
                <div key={log.id} className="relative group/item">
                  {/* Timeline bullet dot wrapper */}
                  <div
                    className={`absolute -left-[27px] top-1.5 p-1 rounded-full border-4 border-white dark:border-[#1A1A1A] shrink-0 ${bg}`}
                  >
                    <Icon size={12} />
                  </div>

                  <div
                    onClick={() => toggleExpand(log.id)}
                    className="p-3 rounded-2xl border border-transparent hover:border-gray-50 dark:hover:border-gray-900 bg-gray-50/10 hover:bg-gray-50/20 dark:bg-transparent dark:hover:bg-gray-900/10 cursor-pointer transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-0.5">
                        <span className="block font-bold text-xs text-gray-900 dark:text-white group-hover/item:text-[#0E4825] dark:group-hover/item:text-emerald-400 transition-colors">
                          {log.action.replace(/\./g, " ").toUpperCase()}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400">
                          <User size={10} />
                          <span>{log.actorEmail || "System Core"}</span>
                          <span>•</span>
                          <span>{formatRelativeTime(log.createdAt)}</span>
                        </div>
                      </div>

                      <div className="text-gray-400 mt-1 shrink-0">
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </div>
                    </div>

                    {/* Expand details block */}
                    {isExpanded && (
                      <div className="mt-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-950 font-mono text-[10px] leading-relaxed text-gray-500 dark:text-gray-300 space-y-2 animate-in fade-in slide-in-from-top-1">
                        <div className="flex justify-between border-b border-gray-200/50 dark:border-gray-800/40 pb-1.5">
                          <span className="font-bold text-gray-400 uppercase text-[9px]">
                            Resource Node:
                          </span>
                          <span className="font-bold text-gray-700 dark:text-gray-100">
                            {log.resourceType.toUpperCase()} ({log.resourceId || "N/A"})
                          </span>
                        </div>
                        {log.ipAddress && (
                          <div className="flex justify-between border-b border-gray-200/50 dark:border-gray-800/40 pb-1.5">
                            <span className="font-bold text-gray-400 uppercase text-[9px]">
                              IP Coordinates:
                            </span>
                            <span className="font-bold text-gray-700 dark:text-gray-100">
                              {log.ipAddress}
                            </span>
                          </div>
                        )}
                        {log.metadata && (
                          <div className="pt-1.5">
                            <span className="block font-bold text-gray-400 uppercase text-[9px] mb-1">
                              Audit payload metadata:
                            </span>
                            <pre className="p-1.5 rounded bg-white dark:bg-[#0A0A0A] overflow-x-auto text-[9px] max-h-[120px] no-scrollbar border border-gray-50 dark:border-gray-900 font-medium">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-10">
              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                No recent activity logged in ledger.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
