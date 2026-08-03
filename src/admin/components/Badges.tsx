import React from "react";
import { Shield, Sparkles, User, CheckCircle, Activity, Server, Database } from "lucide-react";

// Success Badge
export const SuccessBadge: React.FC<{ label: string }> = ({ label }) => {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 text-xs font-bold text-[#16A34A] border border-emerald-200/50 dark:border-emerald-800/20">
      <CheckCircle size={12} />
      <span>{label}</span>
    </span>
  );
};

// Status Badge
export const StatusBadge: React.FC<{
  status: "active" | "inactive" | "pending" | "failed" | string;
  label?: string;
}> = ({ status, label }) => {
  const normalized = status.toLowerCase();
  let classes =
    "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-800";

  if (
    normalized === "active" ||
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "live"
  ) {
    classes =
      "bg-emerald-50 text-[#16A34A] border-emerald-200/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30";
  } else if (
    normalized === "inactive" ||
    normalized === "disabled" ||
    normalized === "failed" ||
    normalized === "danger"
  ) {
    classes =
      "bg-red-50 text-[#DC2626] border-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-900/30";
  } else if (normalized === "pending" || normalized === "warning" || normalized === "queued") {
    classes =
      "bg-amber-50 text-[#F59E0B] border-amber-200/50 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30";
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border ${classes}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      <span>{label || status}</span>
    </span>
  );
};

// Health Badge
export const HealthBadge: React.FC<{
  system: "api" | "database" | "redis" | "petpooja" | string;
  status: "healthy" | "degraded" | "down";
}> = ({ system, status }) => {
  let colorClass = "text-[#16A34A] bg-emerald-50 dark:bg-emerald-950/20";
  let icon = <Server size={12} />;

  if (system === "database") icon = <Database size={12} />;
  else if (system === "redis") icon = <Activity size={12} />;
  else if (system === "petpooja") icon = <Sparkles size={12} />;

  if (status === "degraded") {
    colorClass = "text-[#F59E0B] bg-amber-50 dark:bg-amber-950/20";
  } else if (status === "down") {
    colorClass = "text-[#DC2626] bg-red-50 dark:bg-red-950/20";
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-100 dark:border-gray-800 text-xs font-semibold ${colorClass}`}
    >
      {icon}
      <span className="capitalize">{system}</span>
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="text-[10px] uppercase font-bold tracking-wider">{status}</span>
    </div>
  );
};

// Permission Chip
export const PermissionChip: React.FC<{ permission: string }> = ({ permission }) => {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800">
      <Shield size={11} className="opacity-70" />
      <span>{permission}</span>
    </span>
  );
};

// Role Chip
export const RoleChip: React.FC<{ role: string }> = ({ role }) => {
  const isDev = role === "Developer";
  const colorClass = isDev
    ? "bg-amber-50 text-[#FF6600] border-amber-200/50 dark:bg-amber-950/20 dark:text-[#FF6600]"
    : "bg-[#0E4825]/5 text-[#0E4825] border-[#0E4825]/10 dark:bg-[#0E4825]/10 dark:text-emerald-400";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${colorClass}`}
    >
      <User size={12} />
      <span>{role}</span>
    </span>
  );
};
