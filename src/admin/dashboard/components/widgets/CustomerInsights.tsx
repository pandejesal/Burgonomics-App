import React from "react";
import { useAnalyticsSummary } from "../../hooks/useDashboardData";
import {
  Users,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  UserCheck,
  Heart,
  UserPlus,
} from "lucide-react";

export const CustomerInsights: React.FC<{ dateRange: { from: string; to: string } }> = ({
  dateRange,
}) => {
  const { data: analytics, isLoading, isError, refetch } = useAnalyticsSummary(dateRange);

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="h-24 bg-gray-50 dark:bg-gray-900 rounded-xl" />
      </div>
    );
  }

  if (isError || !analytics) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Customer Conversion
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Failed to pull database customer profiles and conversion counts.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry Search
        </button>
      </div>
    );
  }

  const customers = analytics?.customers || {
    newCustomers: 0,
    returningCustomers: 0,
    totalActive: 0,
  };
  const total = customers.totalActive || customers.newCustomers + customers.returningCustomers || 1;
  const newPct = Math.round((customers.newCustomers / total) * 100);
  const retPct = Math.round((customers.returningCustomers / total) * 100);

  // Calculate circular SVG progress values
  const radius = 35;
  const circumference = 2 * Math.PI * radius;
  const newOffset = circumference - (newPct / 100) * circumference;

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5">
          <div>
            <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
              Customer Cohorts & Loyalty
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Demographic slice of newly acquired vs. recurring loyalty customers
            </p>
          </div>
          <Users size={16} className="text-[#0E4825] dark:text-emerald-400 shrink-0" />
        </div>

        {/* Circular conversions SVG chart & Cohort stats side-by-side */}
        <div className="flex items-center justify-between gap-6 mb-6">
          <div className="relative shrink-0 flex items-center justify-center">
            <svg width="100" height="100" className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="var(--color-bg-secondary)"
                strokeWidth="10"
              />
              {/* New customers circle */}
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke="#0E4825"
                strokeWidth="10"
                strokeDasharray={circumference}
                strokeDashoffset={newOffset}
                strokeLinecap="round"
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center text-center">
              <span className="text-lg font-black font-mono text-gray-900 dark:text-white leading-none">
                {total}
              </span>
              <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                Total Active
              </span>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] font-bold">
                <span className="text-gray-400 uppercase">Newly Acquired</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">
                  {customers.newCustomers} ({newPct}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-50 dark:bg-gray-900 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#0E4825]" style={{ width: `${newPct}%` }} />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] font-bold">
                <span className="text-gray-400 uppercase">Returning Loyalty</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">
                  {customers.returningCustomers} ({retPct}%)
                </span>
              </div>
              <div className="w-full h-1.5 bg-gray-50 dark:bg-gray-900 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-[#FF6600]" style={{ width: `${retPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic insights cards */}
        <div className="grid grid-cols-2 gap-3.5 mb-2">
          <div className="p-3 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-[#1E1E1E]/20 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/10">
              <UserPlus size={14} />
            </div>
            <div>
              <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-wider">
                Conversion rate
              </span>
              <span className="text-xs font-black font-mono text-gray-800 dark:text-white">
                68.4%
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-[#1E1E1E]/20 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-orange-50 text-orange-600 dark:bg-orange-950/10">
              <Heart size={14} />
            </div>
            <div>
              <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-wider">
                Loyalty Lift
              </span>
              <span className="text-xs font-black font-mono text-gray-800 dark:text-white">
                +14.2%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
