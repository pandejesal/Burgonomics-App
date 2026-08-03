import React, { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Search,
  Filter,
  Download,
  ShieldCheck,
  ShieldAlert,
  Info,
  Sliders,
  DollarSign,
  AlertCircle,
  BadgeAlert,
  Fingerprint,
  Link2,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { paymentStorage, DiscrepancyDetails, DuplicateAttempt } from "./paymentsData";
import { useAdmin } from "../hooks/useAdmin";
import { toast } from "sonner";

export const AdminReconciliationPage: React.FC = () => {
  const { role } = useAdmin();

  // Real-time state subscription
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyDetails[]>(
    paymentStorage.getDiscrepancies(),
  );
  const [duplicates, setDuplicates] = useState<DuplicateAttempt[]>(paymentStorage.getDuplicates());

  useEffect(() => {
    return paymentStorage.subscribe(() => {
      setDiscrepancies([...paymentStorage.getDiscrepancies()]);
      setDuplicates([...paymentStorage.getDuplicates()]);
    });
  }, []);

  // UI state
  const [isSyncingLedger, setIsSyncingLedger] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");

  const isStoreManager = role === "Store Manager";

  // RBAC checks
  const canPerformReconciliation = role === "Developer" || role === "Finance";

  // Filter discrepancies
  const filteredDiscrepancies = useMemo(() => {
    return discrepancies.filter((d) => {
      // Search
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matches =
          d.orderId.toLowerCase().includes(query) ||
          d.paymentId.toLowerCase().includes(query) ||
          d.reason.toLowerCase().includes(query);
        if (!matches) return false;
      }

      // Type filter
      if (selectedType !== "all" && d.type !== selectedType) {
        return false;
      }

      return true;
    });
  }, [discrepancies, searchQuery, selectedType]);

  // Actions
  const handleResolveDiscrepancy = (id: string) => {
    if (!canPerformReconciliation) {
      toast.error(
        "Access Denied: Your administrative role is unauthorized to mark financial discrepancies as resolved.",
      );
      return;
    }

    paymentStorage.resolveDiscrepancy(id, "resolve");
  };

  const handleRecheckDiscrepancy = (id: string) => {
    paymentStorage.resolveDiscrepancy(id, "retry");
  };

  const handleDuplicateAction = (orderId: string, action: "merge" | "ignore" | "investigate") => {
    if (!canPerformReconciliation) {
      toast.error(
        `Access Denied: Store Managers & Operations cannot resolve duplicate payments. Role authorized: Finance/Developer.`,
      );
      return;
    }

    paymentStorage.resolveDuplicate(orderId, action);
  };

  const handleRunReconciliationRun = () => {
    setIsSyncingLedger(true);
    toast.loading("Initiating ledger comparison pipeline across 5 outlets...");

    setTimeout(() => {
      setIsSyncingLedger(false);
      toast.dismiss();
      toast.success("Reconciliation scan finished. Detected 0 new ledger discrepancies.");
    }, 2000);
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Financial Reconciliation & Deduplication Engine"
          description="Ledger integrity verification desk. Detect and resolve amount mismatches, uncaptured checkouts, duplicate webhook firings, and missing merchant signatures."
          breadcrumbs={[{ label: "Reconciliation Desk" }]}
        />

        <div className="flex gap-2 self-start md:self-center">
          <AdminButton
            variant="outline"
            size="sm"
            onClick={handleRunReconciliationRun}
            isLoading={isSyncingLedger}
          >
            <RefreshCw size={13} className={`mr-1.5 ${isSyncingLedger ? "animate-spin" : ""}`} />
            <span>Scan Ledger Discrepancies</span>
          </AdminButton>
        </div>
      </div>

      {/* Top statistics rows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <AdminCard className="relative overflow-hidden border-l-4 border-l-amber-500">
          <span className="block text-[9px] font-black text-amber-500 uppercase tracking-widest font-mono">
            UNRESOLVED DISCREPANCIES
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {discrepancies.filter((d) => d.status === "UNRESOLVED").length}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            Pending manual clearing & audits
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-[#FF6600]">
          <span className="block text-[9px] font-black text-[#FF6600] uppercase tracking-widest font-mono">
            DUPLICATE ALERTS
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {duplicates.filter((dup) => dup.status === "UNRESOLVED").length}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            Matched by fingerprinting analytics
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-emerald-600">
          <span className="block text-[9px] font-black text-emerald-600 uppercase tracking-widest font-mono">
            RESOLVED ALERTS
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {discrepancies.filter((d) => d.status === "RESOLVED").length}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            Audited and marked closed today
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden bg-gradient-to-br from-[#0E4825] to-[#0A321A] text-white">
          <span className="block text-[9px] font-black text-green-200 uppercase tracking-widest font-mono">
            LEDGER COHERENCE
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-white mt-1">
            99.98%
          </span>
          <span className="block text-[10px] text-green-200 font-mono mt-1">
            Synced to Razorpay Settlement Pool
          </span>
        </AdminCard>
      </div>

      {/* Main Reconciliation Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Discrepancies listing (occupies 2/3 space) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Discrepancy Filter Header */}
          <AdminCard className="p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              {/* Search bar */}
              <div className="relative w-full sm:flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search discrepancy registry by ID, order reference..."
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800/80 rounded-xl py-2 px-4 pl-10 text-xs font-semibold focus:outline-none"
                />
                <Search
                  size={13}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
              </div>

              {/* Filter Type */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="w-full sm:w-48 bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none dark:text-white"
              >
                <option value="all">All Deviation Types</option>
                <option value="AMOUNT_MISMATCH">Amount Mismatch</option>
                <option value="DUPLICATE_PAYMENT">Duplicate Webhook</option>
                <option value="FAILED_CAPTURE">Failed Capture</option>
                <option value="MISSING_PAYMENT">Missing Handshake</option>
              </select>
            </div>
          </AdminCard>

          {/* Discrepancies stream */}
          <AdminCard
            title="Gateway vs Database Discrepancy Ledger"
            subtitle={`Analyzing ${filteredDiscrepancies.length} discrepancy warnings across system threads`}
          >
            {filteredDiscrepancies.length === 0 ? (
              <div className="py-8 text-center text-gray-400 font-mono">
                No discrepancies found matching the current criteria. Ledger is fully coherent.
              </div>
            ) : (
              <div className="space-y-4 font-sans text-xs">
                {filteredDiscrepancies.map((d) => {
                  const isResolved = d.status === "RESOLVED";

                  return (
                    <div
                      key={d.id}
                      className={`border rounded-[20px] p-5 space-y-4 transition-all relative overflow-hidden ${
                        isResolved
                          ? "bg-gray-50/20 dark:bg-gray-900/10 border-gray-100 dark:border-gray-900"
                          : "bg-white dark:bg-[#1C1C1C]/40 border-gray-150 dark:border-gray-800"
                      }`}
                    >
                      {/* Top status line */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded font-mono text-[9px] font-black uppercase ${
                              isResolved
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/25 dark:text-emerald-400"
                                : "bg-amber-50 text-amber-600 dark:bg-amber-950/25 dark:text-amber-400"
                            }`}
                          >
                            {d.type.replace("_", " ")}
                          </span>

                          <span className="font-mono text-gray-400 font-bold text-[10px]">
                            ID: {d.id}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[10px] font-bold font-mono">
                          {isResolved ? (
                            <span className="text-emerald-600 flex items-center gap-1">
                              <CheckCircle size={12} />
                              <span>RESOLVED</span>
                            </span>
                          ) : (
                            <span className="text-amber-500 flex items-center gap-1">
                              <AlertCircle size={12} />
                              <span>UNRESOLVED DRIFT</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Content Comparison block */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-gray-50 dark:border-gray-800/40 py-3 font-sans">
                        <div>
                          <span className="block text-[9px] font-bold text-gray-400 uppercase">
                            Internal DB Record
                          </span>
                          <span className="block font-black text-gray-800 dark:text-gray-200 mt-1">
                            ₹{(d.internalAmountPaise / 100).toFixed(2)}
                          </span>
                          <span className="block text-[9px] text-gray-400 font-mono mt-0.5">
                            Order Ref: {d.orderId}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold text-gray-400 uppercase">
                            Razorpay API Payload
                          </span>
                          <span className="block font-black text-[#FF6600] mt-1 font-mono">
                            ₹{(d.gatewayAmountPaise / 100).toFixed(2)}
                          </span>
                          <span className="block text-[9px] text-gray-400 font-mono mt-0.5">
                            Payment ID: {d.paymentId}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[9px] font-bold text-gray-400 uppercase">
                            Audit Trail Variance
                          </span>
                          <span
                            className={`block font-black mt-1 font-mono ${
                              d.gatewayAmountPaise - d.internalAmountPaise === 0
                                ? "text-emerald-600"
                                : "text-red-500"
                            }`}
                          >
                            ₹{((d.gatewayAmountPaise - d.internalAmountPaise) / 100).toFixed(2)}
                          </span>
                          <span className="block text-[9px] text-gray-400 font-mono mt-0.5">
                            Variance Margin
                          </span>
                        </div>
                      </div>

                      {/* Explanation of drift */}
                      <div className="space-y-1">
                        <span className="block text-[9px] font-black text-gray-400 uppercase font-mono">
                          Drift Analysis Diagnostic:
                        </span>
                        <p className="text-gray-500 leading-normal text-[11px] font-medium font-sans">
                          {d.reason}
                        </p>
                      </div>

                      {/* Resolve actions */}
                      <div className="flex items-center justify-between pt-3 border-t border-gray-50 dark:border-gray-800/40">
                        <Link
                          to={`/admin/payments/$id`}
                          params={{ id: d.paymentId }}
                          className="text-[10px] font-black uppercase text-[#0E4825] dark:text-emerald-400 hover:underline font-mono inline-flex items-center gap-1"
                        >
                          <Link2 size={10} />
                          <span>Audit Payment Flow</span>
                        </Link>

                        {!isResolved && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRecheckDiscrepancy(d.id)}
                              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-[10px] font-extrabold uppercase transition-all cursor-pointer font-sans"
                            >
                              Sync Recheck
                            </button>
                            <button
                              onClick={() => handleResolveDiscrepancy(d.id)}
                              className="px-3 py-1.5 rounded-lg bg-[#0E4825] text-white hover:bg-[#0B3A1D] text-[10px] font-extrabold uppercase transition-all cursor-pointer shadow-sm font-sans"
                            >
                              Force Settle
                            </button>
                          </div>
                        )}

                        {isResolved && d.resolvedAt && (
                          <div className="text-[10px] text-gray-400 font-mono">
                            Resolved by {d.resolvedBy?.replace(" (pandejesal@gmail.com)", "")} on{" "}
                            {d.resolvedAt}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AdminCard>
        </div>

        {/* Duplicate checkout attempts (occupies 1/3 space) */}
        <div className="space-y-6">
          <AdminCard
            title="Deduplication Analytics Sandbox"
            subtitle="Analyzing checkout attempts made in rapid succession from same network fingerprints"
          >
            {duplicates.length === 0 ? (
              <div className="py-6 text-center text-gray-400 font-mono">
                No duplicate alerts reported.
              </div>
            ) : (
              <div className="space-y-4 font-sans text-xs">
                {duplicates.map((dup) => {
                  const isUnresolved = dup.status === "UNRESOLVED";

                  return (
                    <div
                      key={dup.id}
                      className="border border-gray-100 dark:border-gray-800 p-4 rounded-xl space-y-3 relative overflow-hidden bg-white dark:bg-gray-950/40"
                    >
                      {/* Top headers */}
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-red-500 bg-red-50 dark:bg-red-950/20 px-2 py-0.5 rounded font-mono">
                          {dup.probability} Match
                        </span>

                        <span className="text-[10px] font-bold font-mono uppercase text-gray-400">
                          {dup.status}
                        </span>
                      </div>

                      {/* Info layout */}
                      <div className="space-y-2 text-xs border-y border-gray-50 dark:border-gray-800/40 py-2.5 font-sans">
                        <div className="flex justify-between items-center">
                          <span className="text-gray-400 font-medium">Customer:</span>
                          <span className="font-extrabold text-gray-900 dark:text-white">
                            {dup.customer.name}
                          </span>
                        </div>
                        <div className="flex justify-between items-center font-mono">
                          <span className="text-gray-400 font-sans font-medium">
                            Checkout Delta:
                          </span>
                          <span className="font-bold text-gray-800 dark:text-gray-200">
                            {dup.timeDiff}
                          </span>
                        </div>
                        <div className="flex justify-between items-center font-mono">
                          <span className="text-gray-400 font-sans font-medium">
                            Order Reference:
                          </span>
                          <span className="font-bold text-[#FF6600]">{dup.orderId}</span>
                        </div>
                        <div className="flex justify-between items-center font-mono">
                          <span className="text-gray-400 font-sans font-medium">Amount:</span>
                          <span className="font-black text-gray-900 dark:text-white">
                            ₹{(dup.amountPaise / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center font-mono">
                          <span className="text-gray-400 font-sans font-medium">Gateway:</span>
                          <span className="text-gray-500 text-[10px] uppercase font-bold">
                            {dup.gateway}
                          </span>
                        </div>
                      </div>

                      {/* Interactive duplicate actions */}
                      {isUnresolved ? (
                        <div className="grid grid-cols-3 gap-1.5 pt-1.5">
                          <button
                            onClick={() => handleDuplicateAction(dup.orderId, "ignore")}
                            className="py-2 text-center text-gray-500 font-bold hover:text-gray-900 border border-gray-150 dark:border-gray-800 rounded-lg text-[9px] uppercase transition-all cursor-pointer bg-gray-50 dark:bg-transparent"
                          >
                            Ignore
                          </button>
                          <button
                            onClick={() => handleDuplicateAction(dup.orderId, "investigate")}
                            className="py-2 text-center text-amber-600 hover:text-amber-700 font-bold border border-amber-200/50 rounded-lg text-[9px] uppercase transition-all cursor-pointer bg-amber-50/15"
                          >
                            Investigate
                          </button>
                          <button
                            onClick={() => handleDuplicateAction(dup.orderId, "merge")}
                            className="py-2 text-center bg-[#0E4825] text-white hover:bg-[#0B3A1D] font-bold rounded-lg text-[9px] uppercase transition-all cursor-pointer shadow-sm"
                          >
                            Merge Txns
                          </button>
                        </div>
                      ) : (
                        <div className="p-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 rounded-lg font-bold text-center uppercase tracking-wider text-[9px]">
                          ✓ Action Applied: {dup.status}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AdminCard>
        </div>
      </div>
    </div>
  );
};
export default AdminReconciliationPage;
