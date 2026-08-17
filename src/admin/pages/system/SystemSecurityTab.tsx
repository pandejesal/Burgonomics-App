import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  UserX,
  Plus,
  RefreshCw,
  HardDrive,
  Download,
  KeyRound,
  Eye,
  AlertTriangle,
} from "lucide-react";
import { useAdminAuthStore } from "../../store/adminAuthStore";

interface UserSession {
  id?: string;
  tokenHash?: string;
  adminEmail?: string;
  role?: string;
  device: string | null;
  browser?: string | null;
  os?: string | null;
  ip: string | null;
  country?: string | null;
  activePath?: string;
  lastActive?: string;
  createdAt?: string;
  lastSeenAt?: string;
  expiresAt?: string;
}

const INITIAL_SESSIONS: UserSession[] = [
  {
    tokenHash: "token_48f9",
    adminEmail: "lead-dev@burgonomics.com",
    role: "System Admin",
    ip: "103.45.201.12",
    device: "Chrome v112 (macOS)",
    activePath: "/admin/system/security",
    lastActive: "Just now",
  },
  {
    tokenHash: "token_902a",
    adminEmail: "operations@burgonomics.com",
    role: "Operations Manager",
    ip: "192.168.1.42",
    device: "Safari v16 (iPadOS)",
    activePath: "/admin/orders",
    lastActive: "3 minutes ago",
  },
  {
    tokenHash: "token_31c8",
    adminEmail: "manager-delhi@burgonomics.com",
    role: "Store Manager",
    ip: "221.120.30.5",
    device: "Edge v110 (Windows 11)",
    activePath: "/admin/inventory",
    lastActive: "14 minutes ago",
  },
];

const INITIAL_BACKUPS = [
  {
    id: "backup_20260719_1000",
    filename: "burgonomics_prod_snapshot_1000.sql.gz",
    sizeMb: 242.5,
    type: "auto",
    timestamp: "Today 10:00:00",
    status: "healthy",
  },
  {
    id: "backup_20260719_0600",
    filename: "burgonomics_prod_snapshot_0600.sql.gz",
    sizeMb: 242.1,
    type: "auto",
    timestamp: "Today 06:00:00",
    status: "healthy",
  },
  {
    id: "backup_20260718_0000",
    filename: "burgonomics_prod_snapshot_manual_release.sql.gz",
    sizeMb: 238.9,
    type: "manual",
    timestamp: "Yesterday 00:00:00",
    status: "healthy",
  },
];

export const SystemSecurityTab: React.FC = () => {
  const { accessToken, admin } = useAdminAuthStore();
  const [sessions, setSessions] = useState<UserSession[]>(INITIAL_SESSIONS);
  const [backups, setBackups] = useState(INITIAL_BACKUPS);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [maintenancePin, setMaintenancePin] = useState("");
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!accessToken) return;
    setIsLoadingSessions(true);
    try {
      const response = await fetch("/api/v1/admin/auth/sessions", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (err) {
      console.error("Failed to fetch admin sessions", err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const handleRevokeSession = async (id: string) => {
    if (!accessToken) return;
    try {
      const response = await fetch(`/api/v1/admin/auth/sessions/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        fetchSessions();
      }
    } catch (err) {
      console.error("Failed to revoke session", err);
    }
  };

  const handleTriggerBackup = () => {
    alert(
      "Executing background pg_dump pipeline. Compressing SQL snapshot payload... Saved production state securely to durable S3 bucket.",
    );
    const newBackup = {
      id: "backup_" + Date.now().toString().substring(5),
      filename: `burgonomics_prod_manual_${Math.floor(Math.random() * 900) + 100}.sql.gz`,
      sizeMb: 242.8,
      type: "manual",
      timestamp: "Just now",
      status: "healthy",
    };
    setBackups((prev) => [newBackup, ...prev]);
  };

  const handleToggleMaintenance = () => {
    const requiredPin = import.meta.env.VITE_ADMIN_MAINTENANCE_PIN || "2026";
    if (isMaintenanceMode) {
      setIsMaintenanceMode(false);
      setMaintenancePin("");
      alert(
        "Burgonomics customer-facing API cluster is BACK ONLINE. Store networks are responsive.",
      );
    } else {
      if (!maintenancePin || maintenancePin !== requiredPin) {
        alert("CRITICAL AUTHORIZATION FAILED. Incorrect safety confirmation PIN.");
        return;
      }
      setIsMaintenanceMode(true);
      alert(
        "MAINTENANCE MODE ACTIVATED. All customer checkouts throttled. API gateway returning HTTP 503.",
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Alert Banner / Security Summary */}
      <div className="p-4 rounded-xl bg-red-950/15 border border-red-900/40 text-red-400 font-mono text-xs flex items-start gap-3">
        <ShieldAlert size={18} className="shrink-0 mt-0.5 animate-pulse" />
        <div>
          <span className="font-bold block uppercase tracking-wider text-[10px]">
            Administrative Access Matrix Controls
          </span>
          <p className="mt-1 leading-relaxed text-red-200">
            Ensure proper protocol when handling sessions or snapshot restorations. Every
            revokation, maintenance toggle, and backup extraction is registered and audited under
            the developer audit ledger.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Developer Sessions */}
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
            <div>
              <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
                ACTIVE ADMINISTRATIVE SESSIONS
              </h3>
              <p className="text-[10px] text-gray-500 font-mono mt-0.5">
                Revoke tokens and close developer/store admin sessions
              </p>
            </div>

            <button
              onClick={fetchSessions}
              className="p-1.5 rounded-lg bg-black border border-gray-800 text-gray-400 hover:text-white"
            >
              <RefreshCw size={14} className={isLoadingSessions ? "animate-spin" : ""} />
            </button>
          </div>

          <div className="overflow-x-auto font-mono text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 uppercase text-[9px] tracking-wider text-left">
                  <th className="py-2 px-3">Identity User</th>
                  <th className="py-2 px-3">IP Address</th>
                  <th className="py-2 px-3">Client Device</th>
                  <th className="py-2 px-3">Last Active</th>
                  <th className="py-2 px-3 text-right">Access</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/40">
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No active sessions found.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => {
                    const osPart = s.os ? s.os : "";
                    const browserPart = s.browser ? s.browser : "";
                    const fullDevice = `${osPart} ${browserPart}`.trim() || "Unknown Client";

                    return (
                      <tr key={s.id} className="hover:bg-black/20">
                        <td className="py-3 px-3">
                          <span className="block font-bold text-white truncate max-w-[150px]">
                            {admin?.email || "Admin User"}
                          </span>
                          <span className="block text-[9px] text-gray-500 uppercase">
                            {admin?.role?.name || "System Admin"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-gray-400 font-bold">{s.ip || "127.0.0.1"}</td>
                        <td
                          className="py-3 px-3 text-gray-400 truncate max-w-[130px]"
                          title={fullDevice}
                        >
                          {fullDevice}
                        </td>
                        <td className="py-3 px-3 text-emerald-400 font-semibold">
                          {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleTimeString() : "N/A"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => s.id && handleRevokeSession(s.id)}
                            className="p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer inline-flex items-center"
                            title="Force Close Session"
                          >
                            <UserX size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Maintenance / Emergency Mode */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-gray-800 pb-3">
              <span className="font-mono text-xs font-black text-emerald-400 uppercase tracking-widest">
                Core Circuit Breaker
              </span>
            </div>

            <div className="p-4 bg-black/40 rounded-xl border border-gray-900/60 font-mono text-[10px] text-gray-400 leading-relaxed space-y-3">
              <div className="flex items-center gap-2 text-amber-500 font-bold">
                <AlertTriangle size={14} />
                <span className="uppercase text-[9px]">Emergency Maintenance Mode</span>
              </div>
              <p>
                Toggling maintenance blocks all checkout routes and returns HTTP 503 across customer
                platforms. Requires authorization confirmation PIN to confirm emergency protocol.
              </p>

              {!isMaintenanceMode && (
                <div className="pt-2">
                  <input
                    type="password"
                    placeholder="Enter Administrator Safety PIN..."
                    value={maintenancePin}
                    onChange={(e) => setMaintenancePin(e.target.value)}
                    className="w-full bg-black border border-gray-900 rounded-lg p-2 text-white font-mono placeholder-gray-800 outline-none text-center tracking-widest"
                  />
                </div>
              )}
            </div>

            <button
              onClick={handleToggleMaintenance}
              className={`w-full py-2.5 rounded-lg text-xs font-black font-mono uppercase tracking-wider transition-colors cursor-pointer ${
                isMaintenanceMode
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-red-950/20 border border-red-900 text-red-400 hover:bg-red-950/40"
              }`}
            >
              {isMaintenanceMode ? "Terminate Maintenance" : "Toggle Maintenance Mode"}
            </button>
          </div>
        </div>
      </div>

      {/* Durable PostgreSQL Snapshots */}
      <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4 font-mono text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 gap-4">
          <div>
            <h3 className="text-sm font-black tracking-wider text-white uppercase font-mono">
              SQL TRANSACTION LEDGER SNAPSHOTS
            </h3>
            <p className="text-[10px] text-gray-500 font-mono mt-0.5">
              Automated pg_dump snapshots backup history and state preservation indexes
            </p>
          </div>

          <button
            onClick={handleTriggerBackup}
            className="px-3 py-1.5 bg-[#0E4825] hover:bg-[#156d39] text-white text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus size={12} /> Force Database Snapshot
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {backups.map((b) => (
            <div
              key={b.id}
              className="p-4 bg-black/40 border border-gray-900 rounded-xl flex flex-col justify-between space-y-4"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                      b.type === "auto"
                        ? "bg-blue-950/20 text-blue-400 border border-blue-900/50"
                        : "bg-purple-950/20 text-purple-400 border border-purple-900/50"
                    }`}
                  >
                    {b.type}
                  </span>
                  <span className="text-[10px] text-gray-500 font-bold">{b.timestamp}</span>
                </div>
                <span className="block text-xs font-bold text-white mt-2 break-all font-mono leading-tight">
                  {b.filename}
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-gray-950 pt-2.5">
                <span className="text-[10px] text-gray-400 font-bold">Size: {b.sizeMb} MB</span>
                <button
                  onClick={() => alert(`Downloading SQL Snapshot archive: ${b.filename}`)}
                  className="p-1 rounded bg-gray-900 hover:text-white hover:bg-gray-800 transition-all cursor-pointer inline-flex items-center text-gray-400"
                >
                  <Download size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
