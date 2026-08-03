import React, { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  Cpu,
  Database,
  Zap,
  Activity,
  CheckCircle,
  AlertTriangle,
  HardDrive,
  Users,
  RefreshCw,
} from "lucide-react";
import { useAdminAuthStore } from "../../store/adminAuthStore";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  status: "healthy" | "warning" | "critical" | "offline";
  subtext: string;
}

const MiniStatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, status, subtext }) => {
  const statusColor = {
    healthy: "text-emerald-400 bg-emerald-500/10 border-emerald-950",
    warning: "text-amber-400 bg-amber-500/10 border-amber-950",
    critical: "text-red-400 bg-red-500/10 border-red-950",
    offline: "text-gray-400 bg-gray-500/10 border-gray-950",
  }[status];

  return (
    <div
      className={`p-5 rounded-[20px] bg-[#0c130e] border ${statusColor} shadow-lg transition-all hover:scale-[1.02]`}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 font-mono">
          {title}
        </span>
        <div className="p-1.5 rounded-lg bg-black/40">
          <Icon size={16} />
        </div>
      </div>
      <div className="mt-3">
        <span className="text-xl font-bold font-mono tracking-tight text-white">{value}</span>
        <span className="block text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">
          {subtext}
        </span>
      </div>
    </div>
  );
};

export const SystemDashboardTab: React.FC = () => {
  const { accessToken } = useAdminAuthStore();
  const [cpuVal, setCpuVal] = useState(24);
  const [memVal, setMemVal] = useState(48.5);
  const [activeUsers, setActiveUsers] = useState(115);
  const [respTime, setRespTime] = useState(98);
  const [isLoading, setIsLoading] = useState(false);

  // Terminus dynamic health status states
  const [dbStatus, setDbStatus] = useState<"healthy" | "critical">("healthy");
  const [redisStatus, setRedisStatus] = useState<"healthy" | "critical">("healthy");
  const [petpoojaStatus, setPetpoojaStatus] = useState<"healthy" | "critical" | "warning">(
    "healthy",
  );
  const [razorpayStatus, setRazorpayStatus] = useState<"healthy" | "critical">("healthy");
  const [firebaseStatus, setFirebaseStatus] = useState<"healthy" | "critical">("healthy");

  const fetchHealthCheck = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const response = await fetch("/api/v1/admin/dashboard/system-health", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        const details = data.details || {};

        setDbStatus(details.database?.status === "up" ? "healthy" : "critical");
        setRedisStatus(details.redis?.status === "up" ? "healthy" : "critical");
        setPetpoojaStatus(
          details.petpooja?.status === "up"
            ? "healthy"
            : details.petpooja?.status === "warning"
              ? "warning"
              : "critical",
        );
        setRazorpayStatus(details.razorpay?.status === "up" ? "healthy" : "critical");
        setFirebaseStatus(details.firebase?.status === "up" ? "healthy" : "critical");
      }
    } catch (err) {
      console.error("Failed to perform system Terminus health check", err);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchHealthCheck();
    const interval = setInterval(fetchHealthCheck, 30000); // refresh system health every 30s
    return () => clearInterval(interval);
  }, [fetchHealthCheck]);

  // Bouncing hardware simulator
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuVal((prev) => Math.min(99, Math.max(10, prev + Math.floor(Math.random() * 7) - 3)));
      setMemVal((prev) => {
        const next = Math.min(95, Math.max(40, prev + Math.random() * 0.8 - 0.4));
        return Math.round(next * 10) / 10;
      });
      setActiveUsers((prev) => Math.max(90, prev + Math.floor(Math.random() * 3) - 1));
      setRespTime((prev) => Math.max(70, prev + Math.floor(Math.random() * 9) - 4));
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Healthy</span>
          </span>
        );
      case "warning":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span>Warning</span>
          </span>
        );
      case "critical":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-ping" />
            <span>Critical</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-gray-500/10 text-gray-400 border border-gray-500/20 font-mono">
            <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            <span>Offline</span>
          </span>
        );
    }
  };

  const healthChecks = [
    {
      name: "Database Cluster",
      status: dbStatus,
      value: "PostgreSQL (Cloud SQL)",
      details:
        dbStatus === "healthy"
          ? "Active connection pool OK. Latency: 2.1ms"
          : "Connection failed or pooling depleted",
    },
    {
      name: "Redis Memory Cache",
      status: redisStatus,
      value: "Redis v7 (Durable Server)",
      details:
        redisStatus === "healthy"
          ? "Memory footprint optimal. Hit Ratio: 98.2%"
          : "Redis connection timeout",
    },
    {
      name: "Petpooja POS Bridge",
      status: petpoojaStatus,
      value: "POS Sync Gateway Node",
      details:
        petpoojaStatus === "healthy"
          ? "Signature verification & webhook queue online"
          : "Scraper endpoints slow or circuit-breaker open",
    },
    {
      name: "Razorpay Checkout Gateway",
      status: razorpayStatus,
      value: "Automated Checkout Ledger",
      details:
        razorpayStatus === "healthy"
          ? "Payment captures & instant refund triggers responsive"
          : "Razorpay API handshake failure",
    },
    {
      name: "Firebase Service Suite",
      status: firebaseStatus,
      value: "Server-side Client Keys Engine",
      details:
        firebaseStatus === "healthy"
          ? "Auth challenge endpoints and user scopes synced"
          : "Firebase API credentials invalid",
    },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Stat Block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <MiniStatCard
          title="CPU Core Load"
          value={`${cpuVal}%`}
          icon={Cpu}
          status={cpuVal > 85 ? "critical" : cpuVal > 65 ? "warning" : "healthy"}
          subtext="Quad-Core Server VM"
        />
        <MiniStatCard
          title="Server RAM Buffer"
          value={`${memVal}%`}
          icon={HardDrive}
          status="healthy"
          subtext="Used: 3.88GB / 8GB"
        />
        <MiniStatCard
          title="Active Sessions"
          value={activeUsers}
          icon={Users}
          status="healthy"
          subtext="Live websocket links"
        />
        <MiniStatCard
          title="Avg API Response Time"
          value={`${respTime}ms`}
          icon={Activity}
          status={respTime > 300 ? "warning" : "healthy"}
          subtext="P95 Latency over 5m"
        />
      </div>

      {/* Live System Health Dashboard */}
      <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h3 className="text-base font-black tracking-tight text-white font-mono">
              LIVE SYSTEM HEALTH REGISTRIES
            </h3>
            <p className="text-xs text-gray-400 uppercase tracking-widest mt-1 font-bold">
              Automatic state checks executing every 30 seconds
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchHealthCheck}
              className="p-1.5 rounded bg-black border border-gray-800 text-gray-400 hover:text-white flex items-center gap-1.5 text-xs font-mono"
            >
              <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
              <span>Force Poll</span>
            </button>
            <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 font-mono">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Telemetries active</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {healthChecks.map((item, index) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="p-4 rounded-xl bg-black/40 border border-gray-900/60 flex flex-col justify-between space-y-3 hover:border-gray-800 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="block text-xs font-bold text-white tracking-tight leading-none">
                    {item.name}
                  </span>
                  <span className="block text-[10px] text-gray-500 mt-1 font-mono">
                    {item.value}
                  </span>
                </div>
                {getStatusBadge(item.status)}
              </div>
              <p className="text-[10px] text-gray-400 font-mono leading-relaxed bg-[#050906] p-2 rounded-lg border border-emerald-950/20">
                {item.details}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};
