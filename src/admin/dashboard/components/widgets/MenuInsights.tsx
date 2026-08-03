import React from "react";
import { useAnalyticsSummary } from "../../hooks/useDashboardData";
import { Layers, AlertTriangle, RefreshCw, Trophy, Sparkles } from "lucide-react";

export const MenuInsights: React.FC<{ dateRange: { from: string; to: string } }> = ({
  dateRange,
}) => {
  const { data: analytics, isLoading, isError, refetch } = useAnalyticsSummary(dateRange);

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="space-y-3">
          <div className="h-10 bg-gray-50 dark:bg-gray-900 rounded-xl" />
          <div className="h-10 bg-gray-50 dark:bg-gray-900 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !analytics) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Menu & Product Performance
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Failed to pull database product ledger or sold volume aggregates.
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry Performance Search
        </button>
      </div>
    );
  }

  const topProducts = analytics?.topProducts || [];
  const maxUnits = topProducts.length > 0 ? Math.max(...topProducts.map((p) => p.units)) : 1;

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5">
          <div>
            <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
              Top Selling Core Menu items
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Ranked items based on aggregate transaction checkout volumes
            </p>
          </div>
          <Layers size={16} className="text-[#0E4825] dark:text-emerald-400 shrink-0" />
        </div>

        {/* Products lists */}
        <div className="space-y-4 max-h-[360px] overflow-y-auto no-scrollbar pr-1">
          {topProducts.length > 0 ? (
            topProducts.slice(0, 5).map((p, idx) => {
              const pct = Math.round((p.units / maxUnits) * 100);
              const rankColor =
                idx === 0
                  ? "bg-[#FF6600]/10 text-[#FF6600]"
                  : idx === 1
                    ? "bg-[#0E4825]/10 text-[#0E4825]"
                    : "bg-gray-100 text-gray-500";

              return (
                <div key={p.productId} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <div className="flex items-center gap-2.5 truncate max-w-[240px]">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-lg text-[10px] font-black shrink-0 ${rankColor}`}
                      >
                        #{idx + 1}
                      </span>
                      <span className="font-bold text-gray-800 dark:text-gray-200 truncate">
                        {p.name}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="font-bold font-mono text-gray-900 dark:text-white">
                        ₹
                        {(p.revenuePaise / 100).toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold ml-1.5">
                        ({p.units} pcs)
                      </span>
                    </div>
                  </div>

                  <div className="w-full h-1 bg-gray-50 dark:bg-gray-900 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        idx === 0 ? "bg-[#FF6600]" : "bg-[#0E4825]"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-8 text-center space-y-1">
              <Trophy size={20} className="text-gray-300 mx-auto" />
              <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                No items have sold in this range.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
