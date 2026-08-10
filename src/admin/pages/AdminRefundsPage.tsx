import React, { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  CheckCircle,
  Clock,
  AlertTriangle,
  Play,
  ArrowLeft,
  X,
  User,
  Store,
  DollarSign,
  AlertCircle,
  History,
  ShieldCheck,
  Ban,
  Download,
  Info,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/Utilities";
import {
  paymentStorage,
  RefundDetails,
  PaymentTransaction,
} from "./paymentsData";
import { adminPaymentsService } from "../services/adminPaymentsService";
import { useAdmin } from "../hooks/useAdmin";
import { toast } from "sonner";

export const AdminRefundsPage: React.FC = () => {
  const { role, isDeveloper } = useAdmin();

  // Real-time state subscription
  const [refunds, setRefunds] = useState<RefundDetails[]>([]);
  useEffect(() => {
    const unsubscribe = adminPaymentsService.listenLiveRefunds(
      (data) => setRefunds(data),
      (err) => {
        console.error("Live refund listener error:", err);
        toast.error("Failed to connect to live refund stream.");
      },
      100
    );
    return () => unsubscribe();
  }, []);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING" | "COMPLETED" | "FAILED">("ALL");

  // Modal states
  const [approvingRefund, setApprovingRefund] = useState<RefundDetails | null>(null);
  const [rejectingRefund, setRejectingRefund] = useState<RefundDetails | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [isSubmittingRejection, setIsSubmittingRejection] = useState(false);

  // Store Managers restriction: only see their store
  const isStoreManager = role === "Store Manager";
  const managerStoreName = "Burgonomics Navrangpura";

  // RBAC checks
  const canPerformRefundActions = role === "Developer" || role === "Finance";

  // Filter Refunds
  const filteredRefunds = useMemo(() => {
    return refunds.filter((r) => {
      // Store Manager filter
      if (isStoreManager && r.storeName !== managerStoreName) {
        return false;
      }

      // Tab filter
      if (activeTab !== "ALL" && r.status !== activeTab) {
        return false;
      }

      // Search Query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          r.id.toLowerCase().includes(query) ||
          r.paymentId.toLowerCase().includes(query) ||
          r.orderId.toLowerCase().includes(query) ||
          r.customerName.toLowerCase().includes(query) ||
          r.reason.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [refunds, searchQuery, activeTab, isStoreManager]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const list = isStoreManager ? refunds.filter((r) => r.storeName === managerStoreName) : refunds;

    const totalCount = list.length;
    const totalVolume = list.reduce((sum, r) => sum + r.amountPaise, 0) / 100;

    const pendingList = list.filter((r) => r.status === "PENDING");
    const pendingCount = pendingList.length;
    const pendingVolume = pendingList.reduce((sum, r) => sum + r.amountPaise, 0) / 100;

    const completedList = list.filter((r) => r.status === "COMPLETED");
    const completedCount = completedList.length;
    const completedVolume = completedList.reduce((sum, r) => sum + r.amountPaise, 0) / 100;

    const failedList = list.filter((r) => r.status === "FAILED");
    const failedCount = failedList.length;
    const failedVolume = failedList.reduce((sum, r) => sum + r.amountPaise, 0) / 100;

    return {
      totalCount,
      totalVolume,
      pendingCount,
      pendingVolume,
      completedCount,
      completedVolume,
      failedCount,
      failedVolume,
    };
  }, [refunds, isStoreManager]);

  // Handlers
  const handleApproveRelease = () => {
    if (!approvingRefund) return;

    if (!canPerformRefundActions) {
      toast.error(
        "Access Denied: Your administrative role is unauthorized to release refund payouts.",
      );
      setApprovingRefund(null);
      return;
    }

    const success = paymentStorage.approveRefundRelease(approvingRefund.id);
    if (success) {
      setApprovingRefund(null);
    }
  };

  const handleRejectRefund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingRefund) return;

    if (!canPerformRefundActions) {
      toast.error("Access Denied: Your administrative role is unauthorized to reject refunds.");
      setRejectingRefund(null);
      return;
    }

    if (!rejectionReason.trim()) {
      toast.error("Please supply a reason for rejection.");
      return;
    }

    setIsSubmittingRejection(true);
    setTimeout(() => {
      const success = paymentStorage.rejectRefundRelease(rejectingRefund.id, rejectionReason);
      setIsSubmittingRejection(false);
      if (success) {
        setRejectingRefund(null);
        setRejectionReason("");
      }
    }, 800);
  };

  const handleRetryRefund = (refundId: string) => {
    if (!canPerformRefundActions) {
      toast.error(
        "Access Denied: Your administrative role is unauthorized to retry refund payouts.",
      );
      return;
    }

    paymentStorage.retryRefundRelease(refundId);
  };

  const handleDownloadReport = () => {
    toast.success("Compiling refund reports and audit trail metadata...");
    setTimeout(() => {
      const element = document.createElement("a");
      const file = new Blob(
        [
          "Refund ID,Payment ID,Order Reference,Customer Name,Store Name,Amount,Reason,Status,Processed By,Timestamp\n" +
            refunds
              .map(
                (r) =>
                  `${r.id},${r.paymentId},${r.orderId},${r.customerName},${r.storeName},₹${(r.amountPaise / 100).toFixed(2)},"${r.reason}",${r.status},${r.processedBy},${r.createdAt}`,
              )
              .join("\n"),
        ],
        { type: "text/plain" },
      );
      element.href = URL.createObjectURL(file);
      element.download = "burgonomics-refunds-ledger.csv";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Refund report downloaded successfully.");
    }, 1000);
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Refund Clearance Terminal"
          description={
            isStoreManager
              ? `Review customer escalations, log cancellations, and monitor refund requests for ${managerStoreName}.`
              : "Enterprise Refund Control Console. Authorize manager-release payouts, auditing reasons such as duplicate transactions or delivery disputes."
          }
          breadcrumbs={[{ label: "Refunds Center" }]}
        />

        <div className="flex gap-2 self-start md:self-center">
          <AdminButton variant="outline" size="sm" onClick={handleDownloadReport}>
            <Download size={13} className="mr-1" />
            <span>Export Refund Ledger</span>
          </AdminButton>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <AdminCard className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gray-100 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            TOTAL REFUNDS
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            ₹{metrics.totalVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            {metrics.totalCount} overall claims filed
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-[#FF6600]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-[#FF6600] uppercase tracking-widest font-mono">
            AWAITING RELEASE
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            ₹{metrics.pendingVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
          <span className="block text-[10px] text-[#FF6600] font-mono mt-1">
            {metrics.pendingCount} pending authorization
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-[#0E4825]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#0E4825]/5 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-[#0E4825] uppercase tracking-widest font-mono">
            COMPLETED SETTLEMENTS
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            ₹{metrics.completedVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            {metrics.completedCount} processed back to original sources
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-red-600">
          <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-red-600 uppercase tracking-widest font-mono">
            FAILED RE-QUEUES
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            ₹{metrics.failedVolume.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            {metrics.failedCount} failed release attempts
          </span>
        </AdminCard>
      </div>

      {/* Tab select & Search Filters */}
      <AdminCard className="p-5">
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          {/* Tabs */}
          <div className="flex gap-1.5 p-1 bg-gray-50 dark:bg-gray-900/50 rounded-2xl w-full sm:w-auto">
            {(["ALL", "PENDING", "COMPLETED", "FAILED"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 sm:flex-initial px-4 py-2 rounded-xl text-xs font-bold transition-all uppercase font-mono ${
                  activeTab === tab
                    ? "bg-[#0E4825] text-white shadow-sm"
                    : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                {tab === "ALL" ? "All Payouts" : tab}
              </button>
            ))}
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search refunds directory by customer, order ID..."
              className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 rounded-xl py-2 px-4 pl-10 text-xs font-semibold focus:outline-none"
            />
            <Info size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      </AdminCard>

      {/* Main Refunds Stream Grid */}
      <AdminCard title="Filing Escalations Folder">
        {filteredRefunds.length === 0 ? (
          <div className="py-12 text-center text-gray-400">
            <Info size={24} className="mx-auto mb-2 opacity-50" />
            <h5 className="font-bold text-gray-900 dark:text-white text-xs">
              No Refund Escalations Found
            </h5>
            <p className="text-[10px] text-gray-400 mt-0.5">
              There are no active refund requests matching this tab criteria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredRefunds.map((r) => {
              let statusStyle: "active" | "pending" | "failed" | "warning" = "pending";
              if (r.status === "COMPLETED") statusStyle = "active";
              else if (r.status === "FAILED") statusStyle = "failed";

              const isPending = r.status === "PENDING";
              const isFailed = r.status === "FAILED";

              return (
                <div
                  key={r.id}
                  className="rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-5 shadow-sm space-y-4 hover:shadow-md transition-all relative overflow-hidden"
                >
                  {/* Top line with refund and order ID */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest font-mono">
                        CLAIM REF ID
                      </span>
                      <span className="font-mono font-black text-gray-900 dark:text-white text-xs block">
                        {r.id}
                      </span>
                    </div>

                    <StatusBadge status={statusStyle} label={r.status} />
                  </div>

                  {/* Customer, store, amount block */}
                  <div className="grid grid-cols-3 gap-3 border-y border-gray-50 dark:border-gray-800/40 py-3 text-xs font-sans">
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-bold block">
                        Customer
                      </span>
                      <span className="font-extrabold text-gray-800 dark:text-gray-200 block truncate">
                        {r.customerName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-bold block">
                        Store
                      </span>
                      <span className="font-bold text-gray-500 block truncate">
                        {r.storeName.replace("Burgonomics ", "")}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-gray-400 uppercase font-bold block">
                        Refund Total
                      </span>
                      <span className="font-black text-gray-900 dark:text-white font-mono block">
                        ₹{(r.amountPaise / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Reason & processed by details */}
                  <div className="space-y-2 text-[11px] leading-normal text-gray-500 font-sans">
                    <p className="font-medium">
                      <span className="font-black text-gray-900 dark:text-gray-300 font-mono text-[9px] uppercase tracking-wider block">
                        Refund Justification:
                      </span>
                      {r.reason}
                    </p>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] text-gray-400 font-mono gap-1 pt-1">
                      <span>
                        Auth Operator: {r.processedBy.replace(" (pandejesal@gmail.com)", "")}
                      </span>
                      <span>Filed: {r.createdAt}</span>
                    </div>
                  </div>

                  {/* Diagnostic details if failed */}
                  {isFailed && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/10 border border-red-100 dark:border-red-900/30 rounded-xl flex gap-2 text-red-700 dark:text-red-400">
                      <AlertCircle size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block text-[10px]">
                          Gateway Failure Code: insufficient_merchant_balance
                        </span>
                        <span className="text-[9px] block mt-0.5 leading-normal">
                          The payout API failed. Razorpay balance pool contains insufficient
                          capital. Please refill your merchant wallet escrow, then re-trigger
                          release.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Actions footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-gray-800/40 gap-2">
                    <Link
                      to={`/admin/payments/$id`}
                      params={{ id: r.paymentId }}
                      className="text-[10px] font-black uppercase text-[#0E4825] dark:text-emerald-400 hover:underline font-mono"
                    >
                      View Original Txn ID
                    </Link>

                    <div className="flex items-center gap-1.5">
                      {isPending && (
                        <>
                          <button
                            onClick={() => {
                              if (!canPerformRefundActions) {
                                toast.error(
                                  "Access Denied: Store Managers & Operations cannot reject refunds.",
                                );
                                return;
                              }
                              setRejectingRefund(r);
                            }}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-[10px] font-extrabold uppercase transition-all cursor-pointer"
                          >
                            Reject
                          </button>

                          <button
                            onClick={() => {
                              if (!canPerformRefundActions) {
                                toast.error(
                                  "Access Denied: Store Managers & Operations cannot release refunds.",
                                );
                                return;
                              }
                              setApprovingRefund(r);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#0E4825] text-white hover:bg-[#0B3A1D] text-[10px] font-extrabold uppercase transition-all cursor-pointer shadow-sm"
                          >
                            Approve Payout
                          </button>
                        </>
                      )}

                      {isFailed && (
                        <button
                          onClick={() => handleRetryRefund(r.id)}
                          className="px-3 py-1.5 rounded-lg bg-gray-900 text-white dark:bg-gray-850 hover:bg-gray-800 text-[10px] font-extrabold uppercase transition-all cursor-pointer shadow-sm flex items-center gap-1"
                        >
                          <RefreshCw size={10} />
                          <span>Retry Release</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminCard>

      {/* Confirmation Dialogs */}
      {approvingRefund && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setApprovingRefund(null)}
          onConfirm={handleApproveRelease}
          title="Authorize Refund Clearance Payout?"
          description={`Are you sure you want to approve the refund payout of ₹${(approvingRefund.amountPaise / 100).toFixed(2)} for ${approvingRefund.customerName}? Payout will be processed back via Razorpay API instantly.`}
          confirmLabel="Approve & Release"
        />
      )}

      {/* Reject Refund Modal */}
      <AnimatePresence>
        {rejectingRefund && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1A1A1A] w-full max-w-sm rounded-[20px] p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/60 pb-3 mb-4">
                <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">
                  Reject Refund Request
                </h3>
                <button
                  onClick={() => setRejectingRefund(null)}
                  className="h-6 w-6 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-900"
                >
                  <X size={12} />
                </button>
              </div>

              <form onSubmit={handleRejectRefund} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Rejection Reason
                  </label>
                  <textarea
                    required
                    rows={3}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Specify the reason why this refund request was rejected..."
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl p-3 focus:outline-none placeholder-gray-400 leading-normal"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-50 dark:border-gray-800/60">
                  <button
                    type="button"
                    onClick={() => setRejectingRefund(null)}
                    className="flex-1 py-2 text-center font-bold border border-gray-100 dark:border-gray-800 rounded-lg hover:bg-gray-50 text-gray-400"
                  >
                    Cancel
                  </button>
                  <AdminButton
                    type="submit"
                    variant="secondary"
                    isLoading={isSubmittingRejection}
                    className="flex-1 py-2 text-center rounded-lg"
                  >
                    Reject Claim
                  </AdminButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
export default AdminRefundsPage;
