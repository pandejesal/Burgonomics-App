import React, { useState, useEffect } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { PageHeader } from "../components/Headers";
import {
  LayoutDashboard,
  Store,
  FileText,
  Activity,
  Boxes,
  HeartPulse,
  AlertTriangle,
  X,
  Sparkles,
} from "lucide-react";

import { appConfig } from "@/core/config/env";

interface AlertMessage {
  id: string;
  type: "warning" | "error" | "info";
  title: string;
  message: string;
  timestamp: string;
}

export const PetpoojaOperationsLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  // Prepopulate with a couple of active system alerts to feel highly dynamic and alive!
  const [alerts, setAlerts] = useState<AlertMessage[]>([
    {
      id: "alert-1",
      type: "error",
      title: "Circuit Breaker Tripped (Open)",
      message:
        "API Gateway for Connaught Place POS Store has tripped after 5 consecutive timeouts. Auto-retry in cooldown mode.",
      timestamp: "3 mins ago",
    },
    {
      id: "alert-2",
      type: "warning",
      title: "Queue Growth Spike",
      message:
        "BullMQ queue 'petpooja-menu-sync' has exceeded 12 waiting jobs. Delayed execution triggered.",
      timestamp: "8 mins ago",
    },
  ]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const allTabs = [
    {
      label: "Overview",
      to: "/admin/petpooja",
      exact: true,
      icon: LayoutDashboard,
    },
    {
      label: "Connected Stores",
      to: "/admin/petpooja/stores",
      icon: Store,
    },
    {
      label: "Sync Logs",
      to: "/admin/petpooja/logs",
      icon: FileText,
    },
    {
      label: "Webhook Monitor",
      to: "/admin/petpooja/webhooks",
      icon: Activity,
    },
    {
      label: "Queue Dashboard",
      to: "/admin/petpooja/queues",
      icon: Boxes,
      requiresOps: true,
    },
    {
      label: "Health & Cache",
      to: "/admin/petpooja/health",
      icon: HeartPulse,
    },
  ];

  const tabs = allTabs.filter(
    (tab) => !tab.requiresOps || appConfig.featureFlags.adminOps,
  );


  return (
    <div className="space-y-6">
      <PageHeader
        title="PETPOOJA OPERATIONS CENTER"
        description="The mission control hub for Burgonomics Petpooja integration. Monitor live queues, debug webhooks, audit sync timelines, and toggle circuit breakers."
        breadcrumbs={[{ label: "Petpooja Ops" }]}
        badge={
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#0E4825]/10 text-[#0E4825] dark:bg-emerald-500/10 dark:text-emerald-400 border border-[#0E4825]/20 dark:border-emerald-500/20">
            <Sparkles size={11} className="animate-pulse" />
            <span>Enterprise Gateway Live</span>
          </span>
        }
      />

      {/* Real-time Incident alerts */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-[16px] border flex items-start gap-3 shadow-sm transition-all duration-300 font-sans ${
                alert.type === "error"
                  ? "bg-red-50/75 dark:bg-red-950/15 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-200"
                  : alert.type === "warning"
                    ? "bg-[#FF6600]/5 dark:bg-[#FF6600]/10 border-[#FF6600]/25 text-[#D95700] dark:text-orange-300"
                    : "bg-blue-50/75 dark:bg-blue-950/15 border-blue-200 dark:border-blue-900/50 text-blue-800 dark:text-blue-200"
              }`}
            >
              <AlertTriangle
                size={18}
                className={`shrink-0 mt-0.5 ${
                  alert.type === "error" ? "text-red-500" : "text-[#FF6600]"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm tracking-tight">{alert.title}</span>
                  <span className="text-[10px] font-bold uppercase opacity-60">
                    • {alert.timestamp}
                  </span>
                </div>
                <p className="text-xs font-medium mt-1 leading-relaxed opacity-90">
                  {alert.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismissAlert(alert.id)}
                className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-current"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Tabs Navigation */}
      <div className="border-b border-gray-100 dark:border-gray-800/80 pb-0 flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar scroll-smooth -mb-[1px]">
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? location.pathname === tab.to
              : location.pathname.startsWith(tab.to);

            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={`flex items-center gap-2 px-5 py-3.5 border-b-2 text-xs font-bold tracking-wider uppercase transition-all duration-200 select-none ${
                  isActive
                    ? "border-[#0E4825] text-[#0E4825] dark:border-[#FF6600] dark:text-[#FF6600] bg-white/40 dark:bg-[#1A1A1A]/30 rounded-t-xl"
                    : "border-transparent text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                <tab.icon size={14} />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Route Content Frame */}
      <div className="w-full">{children}</div>
    </div>
  );
};
