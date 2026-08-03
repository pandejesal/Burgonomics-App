import React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  TrendingUp,
  TrendingDown,
  IndianRupee,
  ShoppingBag,
  Radio,
  CheckCircle,
  XCircle,
  Calculator,
  Users,
  Store,
  AlertTriangle,
} from "lucide-react";
import { useAnalyticsSummary, useLiveCounts } from "../../hooks/useDashboardData";

interface SparklineProps {
  points: number[];
  isPositive: boolean;
}

const Sparkline: React.FC<SparklineProps> = ({ points, isPositive }) => {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = max - min;
  const width = 80;
  const height = 24;

  const coordinates = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * width;
    const y = height - ((p - min) / range) * height;
    return `${x},${y}`;
  });

  const pathData = `M ${coordinates.join(" L ")}`;
  const strokeColor = isPositive ? "#16A34A" : "#EF4444";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<any>;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  sparklineData: number[];
  lastUpdated: string;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  navigateTo: string;
}

const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  icon: Icon,
  trend,
  sparklineData,
  lastUpdated,
  isLoading,
  isError,
  refetch,
  navigateTo,
}) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-5 h-[155px] flex flex-col justify-between animate-pulse">
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded" />
            <div className="h-7 w-28 bg-gray-100 dark:bg-gray-800 rounded" />
          </div>
          <div className="h-10 w-10 bg-gray-100 dark:bg-gray-800 rounded-xl" />
        </div>
        <div className="flex justify-between items-end border-t border-gray-50/50 dark:border-gray-800/10 pt-3">
          <div className="h-4 w-12 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-3 w-16 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-5 h-[155px] flex flex-col justify-between">
        <div className="flex justify-between items-start">
          <div className="space-y-1.5">
            <span className="block text-[10px] font-bold text-red-500 uppercase tracking-wider">
              {title}
            </span>
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 block pr-2">
              Error loading data
            </span>
          </div>
          <AlertTriangle size={18} className="text-red-500 shrink-0" />
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            refetch();
          }}
          className="w-full text-center py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/15 dark:hover:bg-red-950/25 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const isPositive = trend?.isPositive ?? true;

  return (
    <div
      onClick={() => navigate({ to: navigateTo as any })}
      className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-5 shadow-[0_4px_16px_rgba(0,0,0,0.01)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.03)] dark:hover:border-emerald-950 hover:border-[#0E4825] transition-all duration-300 flex flex-col justify-between h-[155px] cursor-pointer group relative overflow-hidden"
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider group-hover:text-[#0E4825] dark:group-hover:text-emerald-400 transition-colors">
            {title}
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white">
            {value}
          </span>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-900/50 text-[#0E4825] dark:text-emerald-400 group-hover:bg-[#0E4825] group-hover:text-white dark:group-hover:bg-emerald-800 dark:group-hover:text-white transition-all">
          <Icon size={18} />
        </div>
      </div>

      <div className="flex justify-between items-end border-t border-gray-50/50 dark:border-gray-800/10 pt-3">
        <div className="flex items-center gap-1.5">
          {trend ? (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                isPositive
                  ? "bg-emerald-50 text-[#16A34A] dark:bg-emerald-950/20"
                  : "bg-red-50 text-[#DC2626] dark:bg-red-950/20"
              }`}
            >
              {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              <span>{trend.value}%</span>
            </span>
          ) : (
            <span className="text-[10px] text-gray-400 font-bold">STABLE</span>
          )}
          <Sparkline points={sparklineData} isPositive={isPositive} />
        </div>
        <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider shrink-0">
          Sync {lastUpdated}
        </span>
      </div>
    </div>
  );
};

interface KpiSectionProps {
  dateRange: { from: string; to: string };
  storeId?: string;
  lastUpdatedTime: string;
}

export const KpiSection: React.FC<KpiSectionProps> = ({ dateRange, storeId, lastUpdatedTime }) => {
  const {
    data: summaryData,
    isLoading: isSummaryLoading,
    isError: isSummaryError,
    refetch: refetchSummary,
  } = useAnalyticsSummary(dateRange);

  const {
    data: liveCounts,
    isLoading: isLiveLoading,
    isError: isLiveError,
    refetch: refetchLive,
  } = useLiveCounts();

  // Metrics details
  const todayRevenue = summaryData?.revenue?.totalRevenuePaise
    ? `₹${(summaryData.revenue.totalRevenuePaise / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "₹0.00";

  const todayOrders = summaryData?.revenue?.orderCount ?? 0;
  const aov = summaryData?.revenue?.aov
    ? `₹${(summaryData.revenue.aov / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "₹0.00";

  const newCustomers = summaryData?.customers?.newCustomers ?? 0;

  // Extract completed/cancelled counts from statusBreakdown
  const statusBreakdown = summaryData?.statusBreakdown || [];
  const completedCount =
    statusBreakdown.find((s) => ["COMPLETED", "DELIVERED"].includes(s.status.toUpperCase()))
      ?.count ?? 0;
  const cancelledCount =
    statusBreakdown.find((s) => ["CANCELLED"].includes(s.status.toUpperCase()))?.count ?? 0;

  const liveOrders = liveCounts?.ordersActive ?? 0;
  const activeStores = liveCounts?.storesActive ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {/* Today's Revenue */}
      <KpiCard
        title="Today's Revenue"
        value={todayRevenue}
        icon={IndianRupee}
        trend={{ value: 12.4, isPositive: true }}
        sparklineData={[12000, 15000, 18200, 14000, 22000, 19000, 25420]}
        lastUpdated={lastUpdatedTime}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/payments"
      />

      {/* Today's Orders */}
      <KpiCard
        title="Today's Orders"
        value={todayOrders}
        icon={ShoppingBag}
        trend={{ value: 8.2, isPositive: true }}
        sparklineData={[42, 55, 68, 51, 72, 60, todayOrders || 78]}
        lastUpdated={lastUpdatedTime}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/orders"
      />

      {/* Live Orders */}
      <KpiCard
        title="Live Orders"
        value={liveOrders}
        icon={Radio}
        trend={undefined}
        sparklineData={[2, 4, 3, 5, 4, liveOrders, liveOrders]}
        lastUpdated="10s ago"
        isLoading={isLiveLoading}
        isError={isLiveError}
        refetch={refetchLive}
        navigateTo="/admin/orders"
      />

      {/* Completed Orders */}
      <KpiCard
        title="Completed Orders"
        value={completedCount}
        icon={CheckCircle}
        trend={{ value: 15.1, isPositive: true }}
        sparklineData={[30, 42, 50, 48, 62, 55, completedCount || 68]}
        lastUpdated={lastUpdatedTime}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/orders"
      />

      {/* Cancelled Orders */}
      <KpiCard
        title="Cancelled Orders"
        value={cancelledCount}
        icon={XCircle}
        trend={{ value: 33.3, isPositive: false }} // Red trend represents higher cancellation
        sparklineData={[2, 4, 1, 3, 2, 5, cancelledCount || 1]}
        lastUpdated={lastUpdatedTime}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/orders"
      />

      {/* Average Order Value */}
      <KpiCard
        title="Avg Order Value"
        value={aov}
        icon={Calculator}
        trend={{ value: 3.8, isPositive: true }}
        sparklineData={[280, 295, 310, 290, 305, 315, 320]}
        lastUpdated={lastUpdatedTime}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/analytics"
      />

      {/* New Customers */}
      <KpiCard
        title="New Customers"
        value={newCustomers}
        icon={Users}
        trend={{ value: 5.6, isPositive: true }}
        sparklineData={[8, 12, 10, 15, 14, 18, newCustomers || 15]}
        lastUpdated={lastUpdatedTime}
        isLoading={isSummaryLoading}
        isError={isSummaryError}
        refetch={refetchSummary}
        navigateTo="/admin/customers"
      />

      {/* Active Stores */}
      <KpiCard
        title="Active Stores"
        value={`${activeStores} Active`}
        icon={Store}
        trend={undefined}
        sparklineData={[4, 4, 4, 4, 4, activeStores, activeStores]}
        lastUpdated="10s ago"
        isLoading={isLiveLoading}
        isError={isLiveError}
        refetch={refetchLive}
        navigateTo="/admin/stores"
      />
    </div>
  );
};
