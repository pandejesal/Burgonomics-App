import React from "react";
import {
  useDuplicatePayments,
  usePaymentReconciliation,
  useRecentRefunds,
} from "../../hooks/useDashboardData";
import {
  CreditCard,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
  Layers,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

export const PaymentOverview: React.FC<{ dateRange: { from: string; to: string } }> = ({
  dateRange,
}) => {
  const {
    data: duplicates,
    isLoading: isDupLoading,
    isError: isDupError,
    refetch: refetchDups,
  } = useDuplicatePayments(60);
  const {
    data: reconcile,
    isLoading: isRecLoading,
    isError: isRecError,
    refetch: refetchRec,
  } = usePaymentReconciliation(dateRange);
  const {
    data: refunds,
    isLoading: isRefLoading,
    isError: isRefError,
    refetch: refetchRefs,
  } = useRecentRefunds(5);

  const handleRefresh = () => {
    refetchDups();
    refetchRec();
    refetchRefs();
  };

  const isLoading = isDupLoading || isRecLoading || isRefLoading;
  const isError = isDupError || isRecError || isRefError;

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 space-y-4 animate-pulse">
        <div className="h-5 w-40 bg-gray-100 dark:bg-gray-800 rounded" />
        <div className="h-28 bg-gray-50 dark:bg-gray-900 rounded-xl" />
        <div className="h-28 bg-gray-50 dark:bg-gray-900 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-[20px] border border-red-100 dark:border-red-950/20 bg-red-50/10 dark:bg-red-950/5 p-6 space-y-3">
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm text-gray-900 dark:text-white uppercase font-sans">
            Payment & Gateway Operations
          </span>
          <AlertTriangle size={18} className="text-red-500" />
        </div>
        <p className="text-xs font-semibold text-gray-400">
          Failed to load payment reconciliations, gateways, or transaction locks.
        </p>
        <button
          onClick={handleRefresh}
          className="px-4 py-2 rounded-xl bg-red-50 dark:bg-red-950/15 text-red-600 dark:text-red-400 text-xs font-bold transition-all cursor-pointer"
        >
          Retry Load
        </button>
      </div>
    );
  }

  const dupCount = duplicates?.length ?? 0;
  const discrepancies = reconcile?.discrepancies || [];
  const hasDiscrepancies = discrepancies.length > 0;

  return (
    <div className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.02)] h-full flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-gray-50 dark:border-gray-800/50 mb-5">
          <div>
            <h4 className="text-sm font-black text-gray-900 dark:text-white font-sans uppercase">
              Razorpay Gateway Ops & Ledger
            </h4>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
              Live ledger reconciliation, gateway fraud filters, and payment locks
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-[#0E4825] dark:hover:border-emerald-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {/* Major duplicate alert box if duplicate payment exists */}
        {dupCount > 0 && (
          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900/60 dark:text-red-400 mb-4 flex items-start gap-3 animate-bounce">
            <AlertTriangle className="shrink-0 text-red-500 mt-0.5 animate-pulse" size={18} />
            <div>
              <span className="block font-black text-xs uppercase tracking-wider">
                CRITICAL: DUPLICATE TRANSACTIONS ENCOUNTERED
              </span>
              <p className="text-[11px] font-medium mt-1 leading-relaxed">
                Found {dupCount} order(s) with multiple captured payment locks within the 60-minute
                transaction gateway window. Immediate audit required.
              </p>
            </div>
          </div>
        )}

        {/* Reconciliation overview */}
        <div className="grid grid-cols-2 gap-4 mb-5">
          <div className="p-3.5 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-gray-900/10">
            <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">
              Reconciled Cash
            </span>
            <span className="block text-base font-black font-mono text-[#0E4825] dark:text-emerald-400 mt-1">
              ₹
              {(
                ((reconcile?.totalPaise ?? 0) - (reconcile?.refundedPaise ?? 0)) /
                100
              ).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl border border-gray-50 dark:border-gray-900 bg-gray-50/20 dark:bg-gray-900/10">
            <span className="block text-[8px] font-black text-gray-400 uppercase tracking-wider">
              Refunded Ledger
            </span>
            <span className="block text-base font-black font-mono text-[#FF6600] mt-1">
              ₹
              {((reconcile?.refundedPaise ?? 0) / 100).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* Ledger discrepancies logs */}
        <div className="space-y-3 mb-5 text-xs">
          <div className="flex items-center justify-between pb-1.5 border-b border-gray-50 dark:border-gray-900/40">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Ledger Discrepancy Audits
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${hasDiscrepancies ? "bg-red-50 text-red-600 dark:bg-red-950/20" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"}`}
            >
              {hasDiscrepancies ? `${discrepancies.length} alerts` : "ledger green"}
            </span>
          </div>

          {hasDiscrepancies ? (
            <div className="space-y-2 max-h-[120px] overflow-y-auto no-scrollbar">
              {discrepancies.map((d, i) => (
                <div
                  key={i}
                  className="p-2 rounded-xl border border-red-50 dark:border-red-950/10 bg-red-50/10 dark:bg-red-950/5 flex items-start gap-2"
                >
                  <AlertTriangle size={12} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-medium text-red-700 dark:text-red-400 leading-normal">
                    <span className="font-bold">{d.paymentId}:</span> {d.reason}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
              <ShieldCheck size={14} className="text-emerald-500" />
              <span>All payment logs balance with actual captured bank totals.</span>
            </div>
          )}
        </div>

        {/* Refund logs list */}
        <div className="space-y-2.5 text-xs">
          <div className="flex items-center justify-between pb-1 border-b border-gray-50 dark:border-gray-900/40">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
              Recent Refunds Pipeline
            </span>
            <span className="text-[9px] font-bold text-gray-400 uppercase">Status</span>
          </div>

          <div className="space-y-2">
            {refunds && refunds.length > 0 ? (
              refunds.map((ref) => {
                const isSuccess = ref.status === "COMPLETED";
                const isPending = ref.status === "PENDING";

                return (
                  <div
                    key={ref.id}
                    className="flex items-center justify-between py-1 border-b border-dashed border-gray-50 dark:border-gray-900/20 last:border-b-0"
                  >
                    <div className="space-y-0.5">
                      <span className="block font-bold text-[11px] text-gray-800 dark:text-gray-200">
                        ₹{(ref.amountPaise / 100).toFixed(2)}
                      </span>
                      <span className="block text-[9px] text-gray-400 truncate max-w-[200px]">
                        {ref.reason || "Customer request"} • {ref.id}
                      </span>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${
                        isSuccess
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"
                          : isPending
                            ? "bg-amber-50 text-amber-600 dark:bg-amber-950/20"
                            : "bg-red-50 text-red-600 dark:bg-red-950/20"
                      }`}
                    >
                      {isSuccess ? (
                        <CheckCircle2 size={8} />
                      ) : isPending ? (
                        <Clock size={8} />
                      ) : (
                        <XCircle size={8} />
                      )}
                      {ref.status}
                    </span>
                  </div>
                );
              })
            ) : (
              <span className="block py-2 text-[10px] font-bold text-gray-400 uppercase text-center">
                No recent refund transactions processed.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
