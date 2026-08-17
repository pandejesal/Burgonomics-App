import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { petpoojaGateway } from "@/core/integrations/petpooja";
import { StatCard, AdminCard } from "@/admin/components/Cards";
import { AdminButton } from "@/admin/components/Buttons";
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  Zap,
  RefreshCw,
  Server,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
} from "recharts";

export const Route = createFileRoute("/admin/petpooja/")({
  component: PetpoojaOverviewPage,
});

function PetpoojaOverviewPage() {
  const [refreshInterval] = useState(15);
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: ["petpooja-gateway-health"],
    queryFn: () => petpoojaGateway.getHealth(),
    refetchInterval: refreshInterval * 1000,
  });

  const { data: metrics, refetch: refetchMetrics } = useQuery({
    queryKey: ["petpooja-gateway-metrics"],
    queryFn: () => petpoojaGateway.getMetrics(),
    refetchInterval: refreshInterval * 1000,
  });

  const handleManualRefresh = () => {
    refetchHealth();
    refetchMetrics();
    setLastRefreshed(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setLastRefreshed(new Date().toLocaleTimeString());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const timeSeriesData = metrics?.timeSeries || [];
  const menuSyncDurationData = metrics?.menuSyncDuration || [];
  const prometheusText = metrics?.prometheusText || "";

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100 } },
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* Standby sync row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800/80 rounded-[20px] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
            <Activity size={18} className="animate-pulse" />
          </div>
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              Gateway Daemon State
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                STANDBY • Awaiting live merchant credentials
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-gray-400 font-mono">
            Last pull: {lastRefreshed}
          </span>
          <AdminButton variant="outline" size="sm" onClick={handleManualRefresh}>
            <RefreshCw size={12} className="mr-1" />
            <span>Refresh telemetry</span>
          </AdminButton>
        </div>
      </div>

      {/* KPI Stat Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div variants={itemVariants}>
          <StatCard
            title="Connected Stores"
            value={`${metrics?.connectedStoresCount ?? 0} / ${metrics?.totalStoresCount ?? 5}`}
            icon={Server}
            subtext="Awaiting live merchant credentials"
            trend={{ value: 0, label: "Live link rate", isPositive: false }}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <StatCard
            title="Gateway Status"
            value="Standby"
            icon={CheckCircle}
            subtext="Mock interface active"
            trend={{ value: 100, label: "Simulated readiness", isPositive: true }}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <StatCard
            title="Circuit Breakers Open"
            value={String(metrics?.openBreakersCount ?? 0)}
            icon={AlertTriangle}
            subtext="In-memory simulator"
            trend={{ value: 0, label: "Tripped gateways", isPositive: true }}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <StatCard
            title="BullMQ Queue Health"
            value="Standby"
            icon={Zap}
            subtext="0 pending, 0 failed, 0 DLQ"
            trend={{ value: 0, label: "Idle queue latency", isPositive: true }}
          />
        </motion.div>
      </div>

      {/* Performance graphs row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <AdminCard
            title="API Latency & Processing Speed"
            subtitle="Petpooja API request latency vs webhook processing speed (ms)"
            extra={
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 uppercase tracking-wider">
                Simulated
              </span>
            }
          >
            <div className="h-[280px] w-full mt-4 font-mono text-[10px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData}>
                  <defs>
                    <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF6600" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#FF6600" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="procGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0E4825" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0E4825" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E5E7EB"
                    className="dark:stroke-gray-800"
                  />
                  <XAxis dataKey="time" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(17, 24, 39, 0.95)",
                      borderRadius: "12px",
                      borderColor: "#374151",
                      color: "#fff",
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Area
                    type="monotone"
                    name="API Latency (ms)"
                    dataKey="latency"
                    stroke="#FF6600"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#latencyGrad)"
                  />
                  <Area
                    type="monotone"
                    name="Processing Time (ms)"
                    dataKey="processingTime"
                    stroke="#0E4825"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#procGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </AdminCard>
        </motion.div>

        <motion.div variants={itemVariants}>
          <AdminCard
            title="Menu Synchronization Volume"
            subtitle="Completed node mutations, created items and deleted structures (count)"
            extra={
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 uppercase tracking-wider">
                Simulated
              </span>
            }
          >
            <div className="h-[280px] w-full mt-4 font-mono text-[10px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={menuSyncDurationData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E5E7EB"
                    className="dark:stroke-gray-800"
                  />
                  <XAxis dataKey="date" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(17, 24, 39, 0.95)",
                      borderRadius: "12px",
                      borderColor: "#374151",
                      color: "#fff",
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar
                    name="Created Nodes"
                    dataKey="created"
                    fill="#0E4825"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    name="Updated Nodes"
                    dataKey="updated"
                    fill="#FF6600"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    name="Deleted Nodes"
                    dataKey="deleted"
                    fill="#DC2626"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </AdminCard>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Queue and Webhook Volumes */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <AdminCard
            title="Queue Growth Rate & Retries"
            subtitle="Simultaneous BullMQ sync requests vs active exponential retries"
            extra={
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 uppercase tracking-wider">
                Simulated
              </span>
            }
          >
            <div className="h-[260px] w-full mt-4 font-mono text-[10px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#E5E7EB"
                    className="dark:stroke-gray-800"
                  />
                  <XAxis dataKey="time" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(17, 24, 39, 0.95)",
                      borderRadius: "12px",
                      borderColor: "#374151",
                      color: "#fff",
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Line
                    type="monotone"
                    name="Queue Growth"
                    dataKey="queueGrowth"
                    stroke="#0E4825"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    name="Exponential Retries"
                    dataKey="retries"
                    stroke="#FF6600"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </AdminCard>
        </motion.div>

        {/* Prometheus Plaintext telemetry terminal */}
        <motion.div variants={itemVariants}>
          <AdminCard
            title="Prometheus Metrics Feed"
            subtitle="Scraper node-exporter telemetry terminal"
            extra={
              <span className="flex h-2 w-2 items-center justify-center relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500"></span>
              </span>
            }
          >
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gray-900 text-gray-300 border border-gray-800 font-mono text-[10px] h-[210px] overflow-y-auto leading-relaxed whitespace-pre select-all no-scrollbar">
                {prometheusText}
              </div>
              <div className="flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono">
                <span>PORT: 3000/metrics</span>
                <span>Content-Type: text/plain</span>
              </div>
            </div>
          </AdminCard>
        </motion.div>
      </div>
    </motion.div>
  );
}
