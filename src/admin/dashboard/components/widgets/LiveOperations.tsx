import React from "react";
import { useLiveCounts, useAnalyticsSummary } from "../../hooks/useDashboardData";
import {
  Radio,
  AlertTriangle,
  RefreshCw,
  ShoppingBag,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
  RefreshCcw,
} from "lucide-react";

interface OperationMetricProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<any>;
  colorClass: string;
}

const OperationMetric: React.FC<OperationMetricProps> = ({
  label,
  value,
  icon: Icon,
  colorClass,
}) => {
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl ${colorClass}`}>
          <Icon size={16} />
        </div>
        <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <span className="text-xl font-black font-mono text-gray-900 dark:text-white">{value}</span>
    </div>
  );
};

export const LiveOperations: React.FC<{ dateRange: { from: string; to: string } }> = ({
  dateRange,
}) => {
  const {
    data: liveData,
    isLoading: isLiveLoading,
    isError: isLiveError,
    refetch: refetchLive,
  } = useLiveCounts();
  const {
    data: analyticsData,
    isLoading: isAnalyticsLoading,
    isError: isAnalyticsError,
    refetch: refetchAnalytics,
  } = useAnalyticsSummary(dateRange);

  const handleManualRefresh = () => {
    refetchLive();
    refetchAnalytics();
  };

  const isLoading = isLiveLoading || isAnalyticsLoading;
  const isError = isLiveError || isAnalyticsError;

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="flex justify-between items-center pb-4 border-b border-gray-50 dark:border-gray-800/50">
          <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
          <div className="h-4 w-24 bg-gray-100 dark:bg-gray-800 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="h-[68px] bg-gray-100 dark:bg-gray-800 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-4">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Live Operations Status
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Failed to stream real-time operational metrics from the gateway.
        </p>
        <button
          onClick={handleManualRefresh}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          <RefreshCw size={13} />
          <span>Retry Web Connection</span>
        </button>
      </div>
    );
  }

  // Parse statuses
  const statusBreakdown = analyticsData?.statusBreakdown || [];

  const getCountByStatus = (statuses: string[]) => {
    return statusBreakdown
      .filter((s) => statuses.includes(s.status.toUpperCase()))
      .reduce((sum, s) => sum + s.count, 0);
  };

  const incoming = getCountByStatus(["ORDER_CREATED", "CREATED", "PLACED"]);
  const preparing = getCountByStatus(["PREPARING", "ACCEPTED", "ORDER_ACCEPTED"]);
  const ready = getCountByStatus(["READY"]);
  const completed = getCountByStatus(["COMPLETED", "DELIVERED"]);
  const cancelled = getCountByStatus(["CANCELLED", "REJECTED"]);

  const paymentPending = liveData?.paymentWebhooksPending ?? 0;
  const refundPending = liveData?.refundsPendingCount ?? 0;

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)]">
      <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#10B981] animate-ping" />
          <div>
            <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
              Live Operations Monitoring
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Refreshes continuously every 10 seconds via operational webhook pooling
            </p>
          </div>
        </div>
        <button
          onClick={handleManualRefresh}
          className="p-2 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-[#0E4825] dark:hover:border-emerald-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer"
          title="Force refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <OperationMetric
          label="Incoming Orders"
          value={incoming}
          icon={Radio}
          colorClass="bg-blue-50 text-[#2563EB] dark:bg-blue-950/20 dark:text-blue-400"
        />
        <OperationMetric
          label="Preparing"
          value={preparing}
          icon={Clock}
          colorClass="bg-amber-50 text-[#D97706] dark:bg-amber-950/20 dark:text-amber-400"
        />
        <OperationMetric
          label="Ready for Dispatch"
          value={ready}
          icon={ShoppingBag}
          colorClass="bg-emerald-50 text-[#16A34A] dark:bg-emerald-950/20 dark:text-emerald-400"
        />
        <OperationMetric
          label="Completed"
          value={completed}
          icon={CheckCircle2}
          colorClass="bg-[#0E4825]/5 text-[#0E4825] dark:bg-[#0E4825]/10 dark:text-emerald-400"
        />
        <OperationMetric
          label="Cancelled"
          value={cancelled}
          icon={XCircle}
          colorClass="bg-red-50 text-[#DC2626] dark:bg-red-950/20 dark:text-red-400"
        />
        <OperationMetric
          label="Payment Pending"
          value={paymentPending}
          icon={CreditCard}
          colorClass="bg-orange-50 text-[#EF6124] dark:bg-orange-950/20 dark:text-orange-400"
        />
        <OperationMetric
          label="Refund Pending"
          value={refundPending}
          icon={RefreshCcw}
          colorClass="bg-purple-50 text-[#7C3AED] dark:bg-purple-950/20 dark:text-purple-400"
        />
      </div>
    </div>
  );
};
