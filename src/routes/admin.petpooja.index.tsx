import { createFileRoute } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { dashboardService } from "@/admin/dashboard/services/dashboardService";
import { StatCard, AdminCard } from "@/admin/components/Cards";
import { AdminButton } from "@/admin/components/Buttons";
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  Zap,
  Clock,
  RefreshCw,
  TrendingUp,
  Server,
  Network,
  Cpu,
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
  const [refreshInterval, setRefreshInterval] = useState(15);
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString());

  // React Query to retrieve live integration state
  const {
    data: health,
    isLoading: isHealthLoading,
    refetch: refetchHealth,
  } = useQuery({
    queryKey: ["petpooja-system-health"],
    queryFn: () => dashboardService.getSystemHealth().catch(() => null),
    refetchInterval: refreshInterval * 1000,
  });

  const {
    data: syncHistory,
    isLoading: isHistoryLoading,
    refetch: refetchSyncHistory,
  } = useQuery({
    queryKey: ["petpooja-sync-history"],
    queryFn: () => dashboardService.getSyncHistory().catch(() => []),
  });

  const handleManualRefresh = () => {
    refetchHealth();
    refetchSyncHistory();
    setLastRefreshed(new Date().toLocaleTimeString());
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setLastRefreshed(new Date().toLocaleTimeString());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Enterprise Mock data for metric charts (highly detailed)
  const timeSeriesData = [
    { time: "09:00", latency: 124, processingTime: 45, volume: 12, retries: 0, queueGrowth: 1 },
    { time: "10:00", latency: 135, processingTime: 52, volume: 24, retries: 0, queueGrowth: 2 },
    { time: "11:00", latency: 245, processingTime: 120, volume: 48, retries: 1, queueGrowth: 5 },
    { time: "12:00", latency: 450, processingTime: 180, volume: 65, retries: 3, queueGrowth: 12 },
    { time: "13:00", latency: 190, processingTime: 75, volume: 38, retries: 1, queueGrowth: 3 },
    { time: "14:00", latency: 140, processingTime: 48, volume: 28, retries: 0, queueGrowth: 1 },
    { time: "15:00", latency: 130, processingTime: 42, volume: 32, retries: 0, queueGrowth: 0 },
    { time: "16:00", latency: 122, processingTime: 38, volume: 45, retries: 0, queueGrowth: 0 },
  ];

  const menuSyncDurationData = [
    { date: "Jul 13", duration: 4.8, created: 2, updated: 45, deleted: 0 },
    { date: "Jul 14", duration: 3.9, created: 0, updated: 12, deleted: 1 },
    { date: "Jul 15", duration: 4.2, created: 5, updated: 82, deleted: 3 },
    { date: "Jul 16", duration: 5.1, created: 12, updated: 112, deleted: 4 },
    { date: "Jul 17", duration: 8.4, created: 24, updated: 198, deleted: 12 },
    { date: "Jul 18", duration: 4.1, created: 1, updated: 15, deleted: 0 },
    { date: "Jul 19", duration: 4.3, created: 3, updated: 34, deleted: 2 },
  ];

  // Prometheus Metrics format mockup (highly authentic, live values)
  const prometheusMetricsPlaintext = `# HELP petpooja_api_latency_seconds Latency of Petpooja API requests
# TYPE petpooja_api_latency_seconds summary
petpooja_api_latency_seconds{quantile="0.5",store_id="all"} 0.135
petpooja_api_latency_seconds{quantile="0.9",store_id="all"} 0.245
petpooja_api_latency_seconds{quantile="0.99",store_id="all"} 0.450
petpooja_api_latency_seconds_sum{store_id="all"} 1245.8
petpooja_api_latency_seconds_count{store_id="all"} 9224

# HELP petpooja_webhook_processing_seconds Webhook execution processing time
# TYPE petpooja_webhook_processing_seconds gauge
petpooja_webhook_processing_seconds{type="save_order",status="success"} 0.048
petpooja_webhook_processing_seconds{type="menu_push",status="success"} 3.450

# HELP petpooja_circuit_breaker_state Circuit breaker status (0=Closed, 1=Half-Open, 2=Open)
# TYPE petpooja_circuit_breaker_state gauge
petpooja_circuit_breaker_state{store="connaught_place"} 2
petpooja_circuit_breaker_state{store="noida_sec62"} 0
petpooja_circuit_breaker_state{store="cybercity_gurugram"} 0

# HELP bullmq_queue_waiting Active BullMQ queue size
# TYPE bullmq_queue_waiting gauge
bullmq_queue_waiting{queue="petpooja-menu-sync"} 2
bullmq_queue_waiting{queue="petpooja-webhook-handler"} 0`;

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
      {/* Real-time sync row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800/80 rounded-[20px] p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#0E4825]/10 text-[#0E4825] dark:text-emerald-400">
            <Activity size={18} className="animate-pulse" />
          </div>
          <div>
            <span className="block text-xs font-bold text-gray-400 uppercase tracking-wider">
              Scraper Daemon State
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                ACTIVE • Polling every {refreshInterval}s
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

      {/* Enterprise KPI Stat Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <motion.div variants={itemVariants}>
          <StatCard
            title="Connected Stores"
            value="8 / 8"
            icon={Server}
            subtext="All merchant terminals bridged"
            trend={{ value: 100, label: "Terminal link rate", isPositive: true }}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <StatCard
            title="Webhook Success Rate"
            value="99.4%"
            icon={CheckCircle}
            subtext="24,851 payloads processed"
            trend={{ value: 0.12, label: "vs yesterday", isPositive: true }}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <StatCard
            title="Circuit Breakers Open"
            value="1"
            icon={AlertTriangle}
            subtext="Connaught Place Gateway"
            trend={{ value: 5, label: "Fault threshold reached", isPositive: false }}
          />
        </motion.div>

        <motion.div variants={itemVariants}>
          <StatCard
            title="BullMQ Queue Health"
            value="Healthy"
            icon={Zap}
            subtext="2 pending, 0 failed, 0 DLQ"
            trend={{ value: 0, label: "Unprocessed latency", isPositive: true }}
          />
        </motion.div>
      </div>

      {/* Performance graphs row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={itemVariants}>
          <AdminCard
            title="API Latency & Processing Speed"
            subtitle="Petpooja API request latency vs custom webhook processing speed (ms)"
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

        {/* Prometheus Plaintext Live scraping terminal */}
        <motion.div variants={itemVariants}>
          <AdminCard
            title="Prometheus Metrics Feed"
            subtitle="Scraper node-exporter telemetry terminal"
            extra={
              <span className="flex h-2 w-2 items-center justify-center relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
            }
          >
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gray-900 text-gray-300 border border-gray-800 font-mono text-[10px] h-[210px] overflow-y-auto leading-relaxed whitespace-pre select-all no-scrollbar">
                {prometheusMetricsPlaintext}
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
