import React, { useState } from "react";
import { motion } from "motion/react";
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
import { BarChart3, Clock, Zap, Server, Activity, Database } from "lucide-react";

export const SystemMetricsTab: React.FC = () => {
  const [metricView, setMetricView] = useState<"http" | "infrastructure" | "integration">("http");

  // High-fidelity time series metrics (mocking actual Prometheus counters)
  const timeSeriesData = [
    {
      time: "10:00",
      requests: 120,
      latency: 112,
      dbQueries: 410,
      redisHit: 98.4,
      queueRate: 1.2,
      cpu: 22,
      ram: 58,
    },
    {
      time: "11:00",
      requests: 240,
      latency: 145,
      dbQueries: 820,
      redisHit: 97.9,
      queueRate: 2.4,
      cpu: 28,
      ram: 61,
    },
    {
      time: "12:00",
      requests: 480,
      latency: 290,
      dbQueries: 1850,
      redisHit: 98.1,
      queueRate: 5.1,
      cpu: 55,
      ram: 63,
    },
    {
      time: "13:00",
      requests: 650,
      latency: 420,
      dbQueries: 2410,
      redisHit: 97.2,
      queueRate: 8.8,
      cpu: 74,
      ram: 65,
    },
    {
      time: "14:00",
      requests: 380,
      latency: 195,
      dbQueries: 1320,
      redisHit: 98.3,
      queueRate: 4.1,
      cpu: 42,
      ram: 62,
    },
    {
      time: "15:00",
      requests: 290,
      latency: 130,
      dbQueries: 910,
      redisHit: 98.6,
      queueRate: 2.2,
      cpu: 31,
      ram: 59,
    },
    {
      time: "16:00",
      requests: 410,
      latency: 165,
      dbQueries: 1180,
      redisHit: 98.5,
      queueRate: 3.5,
      cpu: 38,
      ram: 60,
    },
  ];

  // Profiler data objects
  const slowestApis = [
    { route: "/api/menu/sync (Petpooja)", time: "3420ms", count: 42, severity: "critical" },
    { route: "/api/checkout/verify-payment", time: "520ms", count: 180, severity: "warning" },
    { route: "/api/orders/create", time: "340ms", count: 1205, severity: "healthy" },
    { route: "/api/auth/otp/verify", time: "220ms", count: 4890, severity: "healthy" },
  ];

  const slowQueries = [
    {
      query:
        "SELECT * FROM public.order_items WHERE store_id = $1 AND status = 'pending' ORDER BY created_at DESC",
      duration: "185ms",
      hits: 1420,
    },
    {
      query:
        "UPDATE public.product_variants SET stock_level = stock_level - $1 WHERE variant_id = $2",
      duration: "124ms",
      hits: 8200,
    },
    {
      query:
        "SELECT c.*, l.points_balance FROM public.customers c LEFT JOIN public.loyalty_ledgers l ON c.id = l.customer_id",
      duration: "95ms",
      hits: 110,
    },
  ];

  const largestResponses = [
    { route: "/api/stores/all-full-menu", size: "1.42 MB", hits: 840, gzip: "180 KB" },
    { route: "/api/admin/orders-history-export", size: "850 KB", hits: 45, gzip: "110 KB" },
    { route: "/api/products/explore-cards", size: "310 KB", hits: 4120, gzip: "42 KB" },
  ];

  return (
    <div className="space-y-6">
      {/* Category Toggles */}
      <div className="flex items-center gap-2 bg-[#0c130e] border border-gray-800 p-1.5 rounded-xl self-start w-fit">
        <button
          onClick={() => setMetricView("http")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            metricView === "http"
              ? "bg-[#0E4825] text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          API & HTTP Engine
        </button>
        <button
          onClick={() => setMetricView("infrastructure")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            metricView === "infrastructure"
              ? "bg-[#0E4825] text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Durable Infrastructure
        </button>
        <button
          onClick={() => setMetricView("integration")}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            metricView === "integration"
              ? "bg-[#0E4825] text-white shadow"
              : "text-gray-400 hover:text-white"
          }`}
        >
          Integration Queues
        </button>
      </div>

      {/* Grid of Prometheus Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {metricView === "http" && (
          <>
            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  HTTP Request Volume
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: http_requests_total [1h rate]
                </span>
              </div>
              <div className="h-[240px] font-mono text-[10px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#121e16" vertical={false} />
                    <XAxis dataKey="time" stroke="#4b5563" />
                    <YAxis stroke="#4b5563" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#060a07",
                        borderColor: "#1b3021",
                        color: "#fff",
                      }}
                    />
                    <Legend />
                    <Bar
                      name="Requests / min"
                      dataKey="requests"
                      fill="#0E4825"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  HTTP Round-Trip Latency (ms)
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: http_request_duration_seconds [p95 quantile]
                </span>
              </div>
              <div className="h-[240px] font-mono text-[10px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData}>
                    <defs>
                      <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#FF6600" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#FF6600" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#121e16" vertical={false} />
                    <XAxis dataKey="time" stroke="#4b5563" />
                    <YAxis stroke="#4b5563" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#060a07",
                        borderColor: "#1b3021",
                        color: "#fff",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      name="Latency (ms)"
                      dataKey="latency"
                      stroke="#FF6600"
                      fill="url(#latencyGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {metricView === "infrastructure" && (
          <>
            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  Database Query Load
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: pg_stat_statements_calls_total [sum]
                </span>
              </div>
              <div className="h-[240px] font-mono text-[10px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timeSeriesData}>
                    <defs>
                      <linearGradient id="dbGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0E4825" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#0E4825" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#121e16" vertical={false} />
                    <XAxis dataKey="time" stroke="#4b5563" />
                    <YAxis stroke="#4b5563" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#060a07",
                        borderColor: "#1b3021",
                        color: "#fff",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      name="Queries / min"
                      dataKey="dbQueries"
                      stroke="#10b981"
                      fill="url(#dbGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  Redis Key Storage & Hits
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: redis_hit_ratio_percent [gauge]
                </span>
              </div>
              <div className="h-[240px] font-mono text-[10px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#121e16" vertical={false} />
                    <XAxis dataKey="time" stroke="#4b5563" />
                    <YAxis domain={[95, 100]} stroke="#4b5563" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#060a07",
                        borderColor: "#1b3021",
                        color: "#fff",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      name="Hit Ratio (%)"
                      dataKey="redisHit"
                      stroke="#FF6600"
                      strokeWidth={2.5}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {metricView === "integration" && (
          <>
            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  BullMQ Queue Processing Volume
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: bullmq_processed_jobs_total [1h rate]
                </span>
              </div>
              <div className="h-[240px] font-mono text-[10px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#121e16" vertical={false} />
                    <XAxis dataKey="time" stroke="#4b5563" />
                    <YAxis stroke="#4b5563" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#060a07",
                        borderColor: "#1b3021",
                        color: "#fff",
                      }}
                    />
                    <Legend />
                    <Bar
                      name="Jobs Rate"
                      dataKey="queueRate"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
              <div>
                <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
                  Server VM CPU & Memory Allocation
                </span>
                <span className="block text-[10px] text-gray-500 font-mono uppercase mt-0.5">
                  Prometheus: node_cpu_seconds_total / node_memory_MemTotal
                </span>
              </div>
              <div className="h-[240px] font-mono text-[10px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeSeriesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#121e16" vertical={false} />
                    <XAxis dataKey="time" stroke="#4b5563" />
                    <YAxis stroke="#4b5563" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#060a07",
                        borderColor: "#1b3021",
                        color: "#fff",
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      name="CPU Usage (%)"
                      dataKey="cpu"
                      stroke="#ef4444"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      name="Memory Usage (%)"
                      dataKey="ram"
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Profiler panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Slowest API Endpoints */}
        <div className="p-5 rounded-[20px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-800 pb-2">
            <Clock size={16} className="text-amber-500" />
            <span className="font-mono text-xs uppercase tracking-wider">Slowest REST APIs</span>
          </div>
          <div className="space-y-3 font-mono text-[11px]">
            {slowestApis.map((api, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-black/40 border border-gray-900/60 flex items-center justify-between"
              >
                <span className="text-gray-300 font-bold truncate max-w-[180px]">{api.route}</span>
                <div className="text-right">
                  <span
                    className={`block font-bold ${api.severity === "critical" ? "text-red-400" : "text-amber-400"}`}
                  >
                    {api.time}
                  </span>
                  <span className="text-[9px] text-gray-500">{api.count} calls</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Slow Database Queries */}
        <div className="p-5 rounded-[20px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-800 pb-2">
            <Database size={16} className="text-emerald-500" />
            <span className="font-mono text-xs uppercase tracking-wider">
              Slow PostgreSQL Queries
            </span>
          </div>
          <div className="space-y-3 font-mono text-[10px]">
            {slowQueries.map((q, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-black/40 border border-gray-900/60 space-y-1.5"
              >
                <p className="text-gray-400 line-clamp-2 italic">"{q.query}"</p>
                <div className="flex justify-between items-center text-[9px] font-bold">
                  <span className="text-emerald-400">P95: {q.duration}</span>
                  <span className="text-gray-600">{q.hits} execution runs</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Largest REST Responses */}
        <div className="p-5 rounded-[20px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-gray-800 pb-2">
            <Server size={16} className="text-blue-500" />
            <span className="font-mono text-xs uppercase tracking-wider">
              Largest Payload Sizes
            </span>
          </div>
          <div className="space-y-3 font-mono text-[11px]">
            {largestResponses.map((res, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-black/40 border border-gray-900/60 flex items-center justify-between"
              >
                <div>
                  <span className="block text-gray-300 font-bold truncate max-w-[170px]">
                    {res.route}
                  </span>
                  <span className="text-[9px] text-gray-600">Gzipped: {res.gzip}</span>
                </div>
                <div className="text-right">
                  <span className="block text-blue-400 font-bold">{res.size}</span>
                  <span className="text-[9px] text-gray-500">{res.hits} hits</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
