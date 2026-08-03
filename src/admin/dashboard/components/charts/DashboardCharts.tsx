import React, { useState } from "react";
import { useRevenueSeries, useOrderSeries } from "../../hooks/useDashboardData";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart3, LineChart, AlertTriangle, RefreshCw, CalendarRange } from "lucide-react";

interface DashboardChartsProps {
  dateRange: { from: string; to: string };
  storeId?: string;
}

export const DashboardCharts: React.FC<DashboardChartsProps> = ({ dateRange, storeId }) => {
  const [chartTab, setChartTab] = useState<"revenue" | "orders">("revenue");

  const {
    data: revenueSeries,
    isLoading: isRevLoading,
    isError: isRevError,
    refetch: refetchRev,
  } = useRevenueSeries({
    from: dateRange.from,
    to: dateRange.to,
    granularity: "day",
    storeId,
  });

  const {
    data: orderSeries,
    isLoading: isOrdLoading,
    isError: isOrdError,
    refetch: refetchOrd,
  } = useOrderSeries({
    from: dateRange.from,
    to: dateRange.to,
    granularity: "day",
    storeId,
  });

  const handleRefresh = () => {
    refetchRev();
    refetchOrd();
  };

  const isLoading = chartTab === "revenue" ? isRevLoading : isOrdLoading;
  const isError = chartTab === "revenue" ? isRevError : isOrdError;
  const rawData = chartTab === "revenue" ? revenueSeries : orderSeries;

  // Format data for charts
  const chartData = (rawData || []).map((item) => {
    let label = item.bucket;
    // Format timestamp label nicely if possible
    try {
      const d = new Date(item.bucket);
      if (!isNaN(d.getTime())) {
        label = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }
    } catch (_) {
      // Ignore conversion error and fall back to raw bucket string
    }

    return {
      name: label,
      value: chartTab === "revenue" ? Number((item.value / 100).toFixed(2)) : item.value,
    };
  });

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 h-[380px] animate-pulse">
        <div className="flex justify-between items-center pb-4 border-b border-gray-50">
          <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-8 w-32 bg-gray-100 dark:bg-gray-800 rounded-lg" />
        </div>
        <div className="w-full h-60 bg-gray-50 dark:bg-gray-900 rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 h-[380px] flex flex-col justify-center items-center text-center space-y-3.5">
        <AlertTriangle size={32} className="text-red-500" />
        <div>
          <span className="block font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Failed to build analytics curves
          </span>
          <p className="text-xs text-gray-400 font-semibold mt-1">
            Timeout or connectivity failure occurred on Postgres time-series aggregates.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          <RefreshCw size={13} />
          <span>Reload Series</span>
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-[380px] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5 shrink-0">
          <div>
            <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
              Financial & Order Metrics curves
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Live continuous time-series plotted against your selected time dimension
            </p>
          </div>

          <div className="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/60 p-1 rounded-xl border border-gray-100 dark:border-gray-800/80">
            <button
              onClick={() => setChartTab("revenue")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                chartTab === "revenue"
                  ? "bg-white dark:bg-gray-800 text-[#0E4825] dark:text-emerald-400 shadow-sm border border-gray-100 dark:border-gray-700/50"
                  : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <BarChart3 size={12} />
              <span>Revenue</span>
            </button>
            <button
              onClick={() => setChartTab("orders")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                chartTab === "orders"
                  ? "bg-white dark:bg-gray-800 text-[#0E4825] dark:text-emerald-400 shadow-sm border border-gray-100 dark:border-gray-700/50"
                  : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <LineChart size={12} />
              <span>Orders</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full h-full min-h-0">
        <ResponsiveContainer width="100%" height="95%">
          {chartTab === "revenue" ? (
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0E4825" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#0E4825" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5EBF7/30" />
              <XAxis
                dataKey="name"
                stroke="#94A3B8"
                fontSize={9}
                fontWeight="bold"
                tickLine={false}
              />
              <YAxis stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #E5EBF7",
                  fontSize: "11px",
                  fontWeight: "700",
                  fontFamily: "Montserrat",
                  backgroundColor: "rgba(255,255,255,0.96)",
                }}
                formatter={(val: any) => [`₹${val.toLocaleString()}`, "Revenue"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#0E4825"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5EBF7/30" />
              <XAxis
                dataKey="name"
                stroke="#94A3B8"
                fontSize={9}
                fontWeight="bold"
                tickLine={false}
              />
              <YAxis stroke="#94A3B8" fontSize={9} fontWeight="bold" tickLine={false} />
              <Tooltip
                contentStyle={{
                  borderRadius: "12px",
                  border: "1px solid #E5EBF7",
                  fontSize: "11px",
                  fontWeight: "700",
                  fontFamily: "Montserrat",
                  backgroundColor: "rgba(255,255,255,0.96)",
                }}
                formatter={(val: any) => [val, "Orders"]}
              />
              <Bar dataKey="value" fill="#FF6600" radius={[4, 4, 0, 0]} barSize={24} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
