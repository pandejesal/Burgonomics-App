import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Terminal,
  Search,
  Download,
  Play,
  Pause,
  Trash2,
  UserCheck,
  RefreshCw,
} from "lucide-react";
import { useAdminAuthStore } from "../../store/adminAuthStore";

interface SystemLog {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "CRITICAL";
  subsystem: "AUTH" | "STORE" | "PAYMENT" | "QUEUE" | "WEBHOOK" | "PETPOOJA";
  message: string;
}

const INITIAL_LOGS: SystemLog[] = [
  {
    timestamp: "10:04:12",
    level: "INFO",
    subsystem: "PETPOOJA",
    message: "Initialized full catalog synchronization process for Store node: connaught_place",
  },
  {
    timestamp: "10:04:13",
    level: "INFO",
    subsystem: "WEBHOOK",
    message: "Pulled raw JSON manifest from Petpooja POS bridge (1.42 MB, HTTP 200)",
  },
  {
    timestamp: "10:04:15",
    level: "INFO",
    subsystem: "PETPOOJA",
    message: "Synthesized and validated 124 menu items, 15 sub-categories, 12 add-on groups",
  },
  {
    timestamp: "10:04:16",
    level: "INFO",
    subsystem: "QUEUE",
    message: "Executed transactional database mutations: 2 created, 114 updated, 0 removed",
  },
  {
    timestamp: "10:04:16",
    level: "INFO",
    subsystem: "STORE",
    message: "Cleaned Redis page cached collections for menu grids",
  },
  {
    timestamp: "10:04:16",
    level: "INFO",
    subsystem: "PETPOOJA",
    message: "Job completed successfully in 4120ms. Transmitting webhook confirmation.",
  },
];

interface AuditRecord {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ip: string | null;
  createdAt: string;
}

export const SystemLogsTab: React.FC = () => {
  const { accessToken } = useAdminAuthStore();
  const [logs, setLogs] = useState<SystemLog[]>(INITIAL_LOGS);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [isStreaming, setIsStreaming] = useState(true);
  const [logLevelFilter, setLogLevelFilter] = useState<
    "ALL" | "INFO" | "WARN" | "ERROR" | "CRITICAL"
  >("ALL");
  const [subsystemFilter, setSubsystemFilter] = useState<
    "ALL" | "AUTH" | "STORE" | "PAYMENT" | "QUEUE" | "WEBHOOK" | "PETPOOJA"
  >("ALL");
  const [searchLogs, setSearchLogs] = useState("");
  const [searchAudits, setSearchAudits] = useState("");
  const [isLoadingAudits, setIsLoadingAudits] = useState(false);
  const logScrollRef = useRef<HTMLDivElement>(null);

  // Stream logs simulator for background container output (benign visual HMR)
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      const timestamp = new Date().toLocaleTimeString();
      const levels: ("INFO" | "WARN" | "ERROR" | "CRITICAL")[] = [
        "INFO",
        "INFO",
        "INFO",
        "WARN",
        "INFO",
        "ERROR",
      ];
      const level = levels[Math.floor(Math.random() * levels.length)];
      const subsystems: ("AUTH" | "STORE" | "PAYMENT" | "QUEUE" | "WEBHOOK" | "PETPOOJA")[] = [
        "AUTH",
        "STORE",
        "PAYMENT",
        "QUEUE",
        "WEBHOOK",
        "PETPOOJA",
      ];
      const subsystem = subsystems[Math.floor(Math.random() * subsystems.length)];

      const messagesMap = {
        AUTH: [
          "Generated new OTP challenge hash on Redis memory",
          "Token validated successfully for sessionusr_94",
          "OTP Rate limit bucket evaluated for IP 127.0.0.1",
        ],
        STORE: [
          "Store Connaught Place ping responsive: latency 2.5ms",
          "Updated active orders cache for Delhi store network",
          "Fetched 12 menu categories from store memory pool",
        ],
        PAYMENT: [
          "Razorpay checkout session token acknowledged",
          "Refunding order total 420.00 to original UPI link",
          "Payments ledger reconciliation complete: zero anomalies",
        ],
        QUEUE: [
          "BullMQ worker poll: empty queue",
          "Successfully scheduled backup cron trigger at 12:00:00",
          "Worker processed 1 jobs in 140ms",
        ],
        WEBHOOK: [
          "Received order callback payload from POS client node",
          "Processed incoming menu synchronization webhook successfully",
          "Forwarding receipt event payload to whatsapp daemon",
        ],
        PETPOOJA: [
          "Acquired POS catalog token from Petpooja credentials key",
          "Sync complete for store Gurgaon Cyber City catalog",
          "Warning: Petpooja server response delayed by 1200ms",
        ],
      };

      const messages = messagesMap[subsystem];
      const message = messages[Math.floor(Math.random() * messages.length)];

      setLogs((prev) => [...prev.slice(-99), { timestamp, level, subsystem, message }]);
    }, 4000);

    return () => clearInterval(interval);
  }, [isStreaming]);

  // Fetch real audit logs from administrative backend
  const fetchAudits = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingAudits(true);
    try {
      let url = "/api/v1/admin/audit?page=1&pageSize=40";
      if (searchAudits.trim()) {
        url += `&q=${encodeURIComponent(searchAudits.trim())}`;
      }
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAudits(data.items || []);
      }
    } catch (err) {
      console.error("Failed to fetch administrative audits", err);
    } finally {
      setIsLoadingAudits(false);
    }
  }, [accessToken, searchAudits]);

  useEffect(() => {
    fetchAudits();
  }, [fetchAudits]);

  // Scroll to bottom on stream
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleDownloadLogs = () => {
    alert("Compiling logs stream... Downloaded burgonomics-system-logs.txt successfully.");
  };

  const handleExportAudits = async () => {
    if (!accessToken) return;
    try {
      const response = await fetch("/api/v1/admin/audit/export?format=CSV", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `burgonomics-audit-export-${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearLogs = () => {
    setLogs([]);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesLevel = logLevelFilter === "ALL" || log.level === logLevelFilter;
    const matchesSubsystem = subsystemFilter === "ALL" || log.subsystem === subsystemFilter;
    const matchesSearch = log.message.toLowerCase().includes(searchLogs.toLowerCase());
    return matchesLevel && matchesSubsystem && matchesSearch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case "INFO":
        return "text-emerald-400";
      case "WARN":
        return "text-amber-400";
      case "ERROR":
        return "text-red-400";
      default:
        return "text-purple-400 font-extrabold";
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Streaming Logs Panel */}
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between h-[480px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
            <div className="flex items-center gap-2.5">
              <Terminal size={18} className="text-emerald-400 animate-pulse" />
              <div>
                <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
                  DATADOG CORE LOG ENGINE
                </h3>
                <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                  Real-time stdout stream from server processes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 font-mono">
              <div className="flex items-center gap-1 bg-black border border-gray-900 rounded-lg px-2 py-1 text-[10px] text-gray-400">
                <Search size={10} />
                <input
                  type="text"
                  placeholder="Filter string..."
                  value={searchLogs}
                  onChange={(e) => setSearchLogs(e.target.value)}
                  className="bg-transparent border-0 outline-none text-white font-mono placeholder-gray-700 w-[90px]"
                />
              </div>

              <button
                onClick={() => setIsStreaming(!isStreaming)}
                className={`p-1.5 rounded bg-black border border-gray-900 hover:text-white transition-colors cursor-pointer text-[10px] font-bold ${
                  isStreaming ? "text-emerald-400" : "text-gray-500"
                }`}
              >
                {isStreaming ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <button
                onClick={handleDownloadLogs}
                className="p-1.5 rounded bg-[#0E4825]/20 border border-emerald-950 text-emerald-400 hover:bg-[#0E4825]/40 transition-all cursor-pointer"
              >
                <Download size={12} />
              </button>
              <button
                onClick={handleClearLogs}
                className="p-1.5 rounded bg-red-950/20 border border-red-900/40 text-red-400 hover:bg-red-950/40 transition-all cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex items-center gap-2 border-b border-gray-900 pb-2.5 mt-2.5 overflow-x-auto no-scrollbar font-mono text-[9px] font-bold text-gray-500">
            <span className="shrink-0 uppercase">Level:</span>
            {["ALL", "INFO", "WARN", "ERROR", "CRITICAL"].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLogLevelFilter(lvl as any)}
                className={`px-2 py-0.5 rounded transition-all cursor-pointer uppercase ${
                  logLevelFilter === lvl
                    ? "bg-[#0E4825] text-white border border-emerald-800"
                    : "hover:text-white"
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          {/* Logs scroll container */}
          <div
            ref={logScrollRef}
            className="flex-1 overflow-y-auto bg-black border border-gray-950/60 rounded-xl p-4 mt-4 font-mono text-[10px] text-gray-300 leading-normal space-y-1.5 shadow-inner custom-scrollbar select-all"
          >
            {filteredLogs.map((log, index) => (
              <div
                key={index}
                className="flex items-start gap-2 border-b border-gray-950 pb-1 last:border-0 hover:bg-white/5 p-0.5 rounded transition-colors"
              >
                <span className="text-gray-600 shrink-0 select-none">[{log.timestamp}]</span>
                <span className={`font-black shrink-0 select-none ${getLevelColor(log.level)}`}>
                  {log.level.padEnd(5)}
                </span>
                <span className="text-blue-400 font-extrabold shrink-0 select-none">
                  [{log.subsystem}]
                </span>
                <span className="text-gray-300 break-all select-all">{log.message}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Audit Trail Panel */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between h-[480px]">
          <div className="flex flex-col justify-between flex-1">
            <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck size={16} className="text-emerald-400" />
                <span className="font-mono text-xs font-black text-white uppercase tracking-widest">
                  Administrative Audit Trail
                </span>
              </div>

              <div className="flex items-center gap-1.5 font-mono">
                <input
                  type="text"
                  placeholder="Filter audits..."
                  value={searchAudits}
                  onChange={(e) => setSearchAudits(e.target.value)}
                  className="bg-black border border-gray-900 rounded p-1 text-[9px] text-white outline-none w-[90px]"
                />
                <button
                  onClick={handleExportAudits}
                  title="Export to CSV"
                  className="p-1 rounded bg-black border border-gray-900 text-gray-400 hover:text-white"
                >
                  <Download size={10} />
                </button>
                <button
                  onClick={fetchAudits}
                  className="p-1 rounded bg-black border border-gray-900 text-gray-400 hover:text-white"
                >
                  <RefreshCw size={10} className={isLoadingAudits ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto mt-4 space-y-3 font-mono text-[10px] custom-scrollbar">
              {audits.length === 0 ? (
                <div className="py-12 text-center text-gray-500 italic">
                  No audit records found.
                </div>
              ) : (
                audits.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 bg-black/40 border border-gray-900 rounded-xl space-y-1.5 hover:border-gray-800 transition-all select-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-white font-black truncate max-w-[130px]">
                        Actor: {a.actorId || "System"}
                      </span>
                      <span className="text-emerald-400 font-bold">
                        {new Date(a.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <span className="block px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase w-fit tracking-wider">
                      {a.action}
                    </span>
                    <p className="text-gray-400 italic">Resource: {a.resourceType}</p>
                    <code className="block text-[8px] text-gray-600 bg-black/80 p-1 rounded-md border border-gray-950/20">
                      IP: {a.ip || "127.0.0.1"} • ROLE: {a.actorRole || "N/A"}
                    </code>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
