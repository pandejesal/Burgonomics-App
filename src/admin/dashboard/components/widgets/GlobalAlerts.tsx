import React, { useState, useEffect } from "react";
import {
  AlertCircle,
  ShieldAlert,
  WifiOff,
  Database,
  ToggleLeft,
  Activity,
  BellRing,
  X,
} from "lucide-react";
import { useSystemHealth, useQueueStats } from "../../hooks/useDashboardData";

interface Alert {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  icon: React.ComponentType<any>;
}

export const GlobalAlerts: React.FC = () => {
  const { data: healthData } = useSystemHealth();
  const { data: queueData } = useQueueStats();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    const activeAlerts: Alert[] = [];

    // Analyze System Health
    if (healthData && healthData.status !== "ok") {
      const details = healthData.details || {};
      Object.entries(details).forEach(([key, value]) => {
        if (value.status === "down") {
          activeAlerts.push({
            id: `health-${key}`,
            title: `Downstream System Offline: ${key.toUpperCase()}`,
            description:
              value.message || `Connection to the ${key} downstream gateway is completely broken.`,
            severity: "critical",
            icon: WifiOff,
          });
        }
      });
    }

    // Analyze Queue failures
    if (queueData) {
      queueData.forEach((q) => {
        if (q.failed > 50) {
          activeAlerts.push({
            id: `queue-failed-${q.name}`,
            title: `High Failures: BullMQ ${q.name.replace(/_/g, " ")}`,
            description: `${q.failed} failed jobs currently in the pipeline. Dead-letter threshold breached.`,
            severity: "warning",
            icon: ShieldAlert,
          });
        }
      });
    }

    setAlerts(activeAlerts);
  }, [healthData, queueData]);

  const dismissAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  if (alerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {alerts.map((alert) => {
        const Icon = alert.icon;
        const colorClasses =
          alert.severity === "critical"
            ? "bg-red-50 text-[#DC2626] border-red-200/50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-950/30"
            : alert.severity === "warning"
              ? "bg-orange-50 text-[#FF6600] border-orange-200/40 dark:bg-orange-950/20 dark:text-orange-400 dark:border-orange-950/20"
              : "bg-emerald-50 text-[#0E4825] border-emerald-200/50 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-950/30";

        return (
          <div
            key={alert.id}
            className={`flex items-start gap-3.5 p-4 rounded-[20px] border ${colorClasses} shadow-sm relative transition-all duration-300 animate-in fade-in slide-in-from-top-2`}
          >
            <div className="p-1 rounded-xl bg-white/20 dark:bg-black/10 shrink-0">
              <Icon size={18} />
            </div>
            <div className="flex-1 pr-6">
              <span className="block font-bold text-xs tracking-tight uppercase">
                {alert.title}
              </span>
              <p className="text-xs font-medium opacity-90 mt-1">{alert.description}</p>
            </div>
            <button
              onClick={() => dismissAlert(alert.id)}
              className="absolute top-4 right-4 text-current opacity-60 hover:opacity-100 p-0.5 rounded-lg hover:bg-black/5"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
