import React, { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  Calendar,
  CreditCard,
  User,
  Store,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  DollarSign,
  AlertTriangle,
  History,
  Code,
  Download,
  Terminal,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  BadgeCheck,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { paymentStorage, PaymentTransaction } from "./paymentsData";
import { useAdmin } from "../hooks/useAdmin";
import { toast } from "sonner";

export const AdminPaymentDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams({ from: "/admin/payments/$id" }) as { id: string };
  const { role, isDeveloper } = useAdmin();

  // State
  const [txn, setTxn] = useState<PaymentTransaction | undefined>(undefined);
  const [expandedWebhookId, setExpandedWebhookId] = useState<string | null>(null);

  // Refund Pop-up Modal State
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [partialAmount, setPartialAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  // Load and subscribe to real-time storage
  useEffect(() => {
    const data = paymentStorage.getTransactionById(id);
    setTxn(data);

    return paymentStorage.subscribe(() => {
      const updated = paymentStorage.getTransactionById(id);
      setTxn(updated);
    });
  }, [id]);

  // RBAC checks
  const canPerformWriteActions = role === "Developer" || role === "Finance";

  // Actions
  const handleRetryVerification = () => {
    if (!canPerformWriteActions) {
      toast.error(
        "Access Denied: Your administrative role is unauthorized to override payment verifications.",
      );
      return;
    }

    toast.loading("Initiating manual transaction signature validation...");
    setTimeout(() => {
      toast.dismiss();
      const success = paymentStorage.retryVerification(id);
      if (success) {
        toast.success("Signature validation succeeded! Verified flag set.");
      }
    }, 1000);
  };

  const handleDownloadReceipt = () => {
    toast.success("Generating receipts and invoice ledger documents...");
    setTimeout(() => {
      const element = document.createElement("a");
      const file = new Blob(
        [
          `BURGONOMICS RECEIPT\n` +
            `====================\n` +
            `Transaction ID: ${txn?.id}\n` +
            `Order Number: ${txn?.orderId}\n` +
            `Store Location: ${txn?.store.name}\n` +
            `Customer Name: ${txn?.customer.name}\n` +
            `Customer Email: ${txn?.customer.email}\n` +
            `Customer Phone: ${txn?.customer.phone}\n` +
            `Amount Paid: ₹${((txn?.amountPaise || 0) / 100).toFixed(2)}\n` +
            `Gateway: ${txn?.gateway}\n` +
            `Gateway Payment ID: ${txn?.gatewayPaymentId}\n` +
            `Timestamp: ${txn?.createdAt}\n` +
            `Security Signature: ${txn?.signature}\n` +
            `====================\n` +
            `Thank you for your order!`,
        ],
        { type: "text/plain" },
      );
      element.href = URL.createObjectURL(file);
      element.download = `receipt-${txn?.orderId}.txt`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Receipt invoice downloaded.");
    }, 800);
  };

  const handleSubmitRefund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!txn) return;

    if (!canPerformWriteActions) {
      toast.error("Access Denied: Your administrative role is unauthorized to issue refunds.");
      setShowRefundModal(false);
      return;
    }

    if (!refundReason.trim()) {
      toast.error("Please specify a reason for this refund.");
      return;
    }

    let refundAmountPaise = txn.amountPaise;
    if (refundType === "partial") {
      const parsedAmt = parseFloat(partialAmount);
      if (isNaN(parsedAmt) || parsedAmt <= 0) {
        toast.error("Please specify a valid partial refund amount.");
        return;
      }
      refundAmountPaise = Math.round(parsedAmt * 100);
      if (refundAmountPaise > txn.amountPaise) {
        toast.error(
          `Refund amount cannot exceed the transaction total of ₹${(txn.amountPaise / 100).toFixed(2)}.`,
        );
        return;
      }
    }

    setIsSubmittingRefund(true);
    toast.loading("Communicating with Razorpay payout APIs...");

    setTimeout(() => {
      toast.dismiss();
      const success = paymentStorage.issueRefund(
        txn.id,
        refundAmountPaise,
        refundReason,
        refundType === "partial",
      );

      setIsSubmittingRefund(false);
      if (success) {
        setShowRefundModal(false);
        // Clear inputs
        setPartialAmount("");
        setRefundReason("");
      }
    }, 1200);
  };

  if (!txn) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center font-sans">
        <div className="h-12 w-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-3">
          <ShieldAlert size={20} />
        </div>
        <h5 className="text-sm font-bold text-gray-900">Transaction Not Found</h5>
        <p className="text-xs text-gray-400 mt-1">
          The requested transaction reference does not exist in the active ledger.
        </p>
        <Link to="/admin/payments" className="mt-4">
          <AdminButton variant="outline" size="sm">
            <ArrowLeft size={12} className="mr-1" />
            <span>Return to Payments</span>
          </AdminButton>
        </Link>
      </div>
    );
  }

  // Determine styles
  let statusType: "active" | "pending" | "failed" | "warning" = "pending";
  if (txn.status === "CAPTURED") statusType = "active";
  else if (
    txn.status === "FAILED" ||
    txn.status === "CANCELLED" ||
    txn.status === "EXPIRED" ||
    txn.status === "DISPUTED"
  )
    statusType = "failed";
  else if (txn.status === "REFUNDED" || txn.status === "PARTIALLY_REFUNDED") statusType = "warning";

  const totalRefundedPaise = txn.refunds.reduce((sum, r) => sum + r.amountPaise, 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Header and Back navigation */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <Link
            to="/admin/payments"
            className="inline-flex items-center gap-1.5 text-xs font-black text-[#0E4825] hover:underline uppercase tracking-wider font-mono mb-2"
          >
            <ArrowLeft size={13} />
            <span>Back to Transactions Feed</span>
          </Link>
          <PageHeader
            title={`Transaction Details: ${txn.id}`}
            description={`Order reference ${txn.orderId} managed via ${txn.store.name}`}
            breadcrumbs={[{ label: "Payments Center", to: "/admin/payments" }, { label: txn.id }]}
          />
        </div>

        {/* Global Action buttons */}
        <div className="flex flex-wrap gap-2 self-start md:self-center">
          <AdminButton variant="outline" size="sm" onClick={handleDownloadReceipt}>
            <Download size={13} className="mr-1" />
            <span>Receipt Invoice</span>
          </AdminButton>

          <button
            onClick={() => {
              if (!canPerformWriteActions) {
                toast.error(
                  `Access Denied: Store Managers & Operations cannot process refunds. Role authorized: Finance/Developer.`,
                );
                return;
              }
              setShowRefundModal(true);
            }}
            disabled={txn.status === "REFUNDED" || txn.status === "FAILED"}
            className="inline-flex items-center justify-center gap-1.5 bg-[#FF6600] text-white hover:bg-[#D95700] px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-2xl shadow-sm transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <History size={13} />
            <span>Process Refund</span>
          </button>
        </div>
      </div>

      {/* Grid of details */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns (occupies 2/3 of space in desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Stats overview */}
          <AdminCard className="bg-white dark:bg-[#1A1A1A] p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="border-r border-gray-100 dark:border-gray-800/60 pr-2">
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                  Gross Amount
                </span>
                <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 dark:text-white mt-1">
                  ₹{(txn.amountPaise / 100).toFixed(2)}
                </span>
                <span className="text-[10px] font-bold text-gray-400 font-mono">INR Currency</span>
              </div>
              <div className="border-r border-gray-100 dark:border-gray-800/60 sm:px-2">
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                  Ledger Status
                </span>
                <div className="mt-1">
                  <StatusBadge status={statusType} label={txn.status} />
                </div>
                <span className="block text-[10px] text-gray-400 font-mono mt-1">
                  Captured Webhook verified
                </span>
              </div>
              <div className="border-r border-gray-100 dark:border-gray-800/60 sm:px-2">
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                  Secured Integrity
                </span>
                <div className="mt-1">
                  {txn.verificationStatus === "VERIFIED" ? (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 dark:text-emerald-400 px-2 py-0.5 rounded font-mono">
                      <ShieldCheck size={10} />
                      <span>SECURED</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-amber-500 bg-amber-50 dark:bg-amber-950/20 dark:text-amber-400 px-2 py-0.5 rounded font-mono">
                      <ShieldAlert size={10} />
                      <span>OVERRIDE REQ</span>
                    </span>
                  )}
                </div>
                <span className="block text-[10px] text-gray-400 font-mono mt-1">
                  Razorpay handshake
                </span>
              </div>
              <div className="sm:pl-2">
                <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                  Timestamp
                </span>
                <span className="block text-xs font-bold text-gray-800 dark:text-gray-200 mt-1">
                  {txn.createdAt}
                </span>
                <span className="text-[10px] text-gray-400 font-mono">GMT +5:30</span>
              </div>
            </div>
          </AdminCard>

          {/* Customer File Card */}
          <AdminCard title="Customer Profile Folder" icon={User}>
            <div className="flex flex-col sm:flex-row items-center gap-4 font-sans">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0E4825]/5 text-[#0E4825] dark:bg-emerald-950/30 dark:text-emerald-400 font-black text-xl">
                {txn.customer.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 text-center sm:text-left space-y-1">
                <h4 className="text-sm font-black text-gray-900 dark:text-white leading-none">
                  {txn.customer.name}
                </h4>
                <div className="flex flex-wrap justify-center sm:justify-start items-center gap-x-4 gap-y-1 text-xs text-gray-500 font-medium">
                  <span className="font-mono">{txn.customer.phone}</span>
                  <span>●</span>
                  <span>{txn.customer.email}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <a
                  href={`tel:${txn.customer.phone}`}
                  className="flex px-3 py-1.5 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-bold transition-all border border-gray-100 dark:border-gray-800"
                >
                  Call Contact
                </a>
              </div>
            </div>
          </AdminCard>

          {/* Store & Order snapshots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <AdminCard title="Store Location Outlet" icon={Store}>
              <div className="space-y-3 font-sans text-xs">
                <div>
                  <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Assigned Store
                  </span>
                  <span className="text-gray-900 dark:text-white font-black block mt-0.5">
                    {txn.store.name}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Store Reference ID
                  </span>
                  <span className="text-gray-400 font-mono block mt-0.5">{txn.store.id}</span>
                </div>
                <div className="pt-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#0E4825] dark:text-emerald-400 uppercase tracking-wider font-mono bg-[#0E4825]/5 dark:bg-emerald-950/20 px-2.5 py-1 rounded-lg">
                    <span>
                      Petpooja Rest ID: {txn.store.id === "str_001" ? "PP_REST_912" : "PP_REST_420"}
                    </span>
                  </span>
                </div>
              </div>
            </AdminCard>

            <AdminCard title="Order Dispatch Snapshot" icon={Sliders}>
              <div className="space-y-3 font-sans text-xs">
                <div>
                  <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Order Number Reference
                  </span>
                  <span className="text-[#FF6600] font-mono font-black block mt-0.5 text-sm">
                    {txn.orderId}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Fulfillment Routing
                  </span>
                  <span className="text-gray-500 font-bold block mt-0.5">
                    {txn.metadata["Fulfillment Method"] || "Self-Pickup Outlet"}
                  </span>
                </div>
                <div className="pt-1.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono block">
                    Order Operations Check:
                  </span>
                  <span className="text-emerald-600 font-bold block mt-0.5">
                    ✓ Synced to Petpooja POS KDS
                  </span>
                </div>
              </div>
            </AdminCard>
          </div>

          {/* Verification Timeline Progress */}
          <AdminCard title="Transaction Lifecycle Audit Trail">
            <div className="relative border-l border-gray-100 dark:border-gray-800 ml-3 pl-6 space-y-6 py-2 font-sans text-xs">
              {txn.timeline.map((item, index) => (
                <div key={index} className="relative">
                  {/* Timeline dot */}
                  <div className="absolute -left-[31px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white dark:bg-[#1A1A1A]">
                    <div
                      className={`h-2.5 w-2.5 rounded-full ${
                        item.status === "failed"
                          ? "bg-red-500"
                          : item.status === "refunded"
                            ? "bg-[#FF6600]"
                            : index === 0
                              ? "bg-emerald-500"
                              : "bg-gray-300"
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                      <span className="font-black text-gray-900 dark:text-white uppercase tracking-tight text-xs">
                        {item.title}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400 whitespace-nowrap">
                        {item.time}
                      </span>
                    </div>
                    <p className="text-gray-400 text-[11px] font-semibold mt-0.5">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </AdminCard>

          {/* Metadata attributes */}
          <AdminCard title="Extensible Metadata Payload">
            <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 text-xs">
              <table className="w-full text-left font-sans">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40 text-[10px] font-black text-gray-400 uppercase font-mono">
                    <th className="py-2.5 px-4">Attribute Key</th>
                    <th className="py-2.5 px-4">Associated Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/40 font-medium">
                  {Object.entries(txn.metadata).map(([key, val]) => (
                    <tr key={key} className="hover:bg-gray-50/10 dark:hover:bg-gray-900/10">
                      <td className="py-2.5 px-4 text-gray-400 font-mono text-[10px] uppercase font-black">
                        {key}
                      </td>
                      <td className="py-2.5 px-4 text-gray-800 dark:text-gray-200 font-mono text-[10px]">
                        {val}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2.5 px-4 text-gray-400 font-mono text-[10px] uppercase font-black">
                      Escrow Wallet ID
                    </td>
                    <td className="py-2.5 px-4 text-gray-400 font-mono text-[10px]">
                      esc_razorpay_burgonomics_live_01
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </AdminCard>
        </div>

        {/* Right Column (occupies 1/3 of space in desktop) */}
        <div className="space-y-6">
          {/* Gateway & Signature security checks */}
          <AdminCard title="Gateway Handshake Info">
            <div className="space-y-4 font-sans text-xs">
              <div>
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  Razorpay Payment ID
                </span>
                <span className="text-gray-900 dark:text-white font-mono font-black block mt-0.5 text-xs">
                  {txn.gatewayPaymentId}
                </span>
              </div>

              <div>
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  Checksum Signature Hash
                </span>
                <span className="text-[10px] text-gray-400 font-mono block break-all bg-gray-50 dark:bg-gray-900 p-2 rounded-xl mt-1 leading-normal border border-gray-100 dark:border-gray-800">
                  {txn.signature || "NOT_STORED_INCOMPLETE_TRANSACTION_PAYLOAD"}
                </span>
              </div>

              <div className="pt-2 border-t border-gray-100 dark:border-gray-800/40 space-y-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider font-mono block">
                  Signature Checks:
                </span>
                {txn.verificationStatus === "VERIFIED" ? (
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                    <BadgeCheck size={16} />
                    <span>Validated Checksum Match</span>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-amber-500 font-bold">
                      <AlertTriangle size={16} />
                      <span>Validation Pending / Failed</span>
                    </div>
                    <button
                      onClick={handleRetryVerification}
                      className="w-full text-center py-2.5 rounded-xl border border-[#0E4825] text-[#0E4825] hover:bg-[#0E4825]/5 dark:border-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-wider text-[10px] transition-all cursor-pointer shadow-sm"
                    >
                      Override Signature Validate
                    </button>
                  </div>
                )}
              </div>
            </div>
          </AdminCard>

          {/* Webhooks logs stream */}
          <AdminCard title="Razorpay Webhook Events">
            <div className="space-y-2 font-sans text-xs">
              {txn.webhookEvents.length === 0 ? (
                <div className="py-4 text-center text-gray-400 font-mono text-[10px]">
                  No delivery webhooks tracked for this session.
                </div>
              ) : (
                <div className="space-y-2">
                  {txn.webhookEvents.map((w) => {
                    const isExpanded = expandedWebhookId === w.id;
                    return (
                      <div
                        key={w.id}
                        className="border border-gray-50 dark:border-gray-800/80 rounded-xl overflow-hidden bg-gray-50/20 dark:bg-gray-900/20"
                      >
                        <div
                          onClick={() => setExpandedWebhookId(isExpanded ? null : w.id)}
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-900/50 transition-colors"
                        >
                          <div>
                            <span className="block font-bold text-gray-800 dark:text-white font-mono text-[10px]">
                              {w.event}
                            </span>
                            <span className="block text-[9px] text-gray-400 font-mono mt-0.5">
                              {w.time}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded font-mono">
                              {w.status}
                            </span>
                            {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="p-3 border-t border-gray-50 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
                            <span className="block text-[8px] font-black text-gray-400 uppercase tracking-widest font-mono mb-1.5">
                              JSON Payload
                            </span>
                            <pre className="text-[9px] font-mono text-gray-500 leading-normal overflow-x-auto whitespace-pre-wrap max-h-40 break-all bg-[#F8F8F8] dark:bg-[#121212] p-2 rounded-lg border border-gray-100 dark:border-gray-900/50">
                              {w.payload}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </AdminCard>

          {/* Refunds Management Card */}
          <AdminCard title="Active Payouts & Refunds">
            <div className="space-y-4 font-sans text-xs">
              <div>
                <span className="block text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                  Total Refunded Amount
                </span>
                <span className="text-xl font-mono font-black text-gray-900 dark:text-white block mt-0.5">
                  ₹{(totalRefundedPaise / 100).toFixed(2)}
                </span>
              </div>

              {txn.refunds.length === 0 ? (
                <div className="py-6 text-center text-gray-400 font-mono text-[10px] bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-100 dark:border-gray-800">
                  No active refunds have been processed.
                </div>
              ) : (
                <div className="space-y-3">
                  {txn.refunds.map((r, index) => (
                    <div
                      key={index}
                      className="border border-gray-50 dark:border-gray-800 p-3 rounded-xl bg-white dark:bg-gray-950/40 relative"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-gray-900 dark:text-white font-mono text-[10px]">
                          {r.id}
                        </span>
                        <span className="text-[9px] font-black text-amber-600 bg-amber-50 dark:bg-amber-950/20 px-2 py-0.5 rounded font-mono">
                          {r.status}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] border-t border-gray-50 dark:border-gray-900 pt-2 font-mono">
                        <div>
                          <span className="block text-gray-400">Refunded Amount</span>
                          <span className="font-black text-gray-800 dark:text-gray-200">
                            ₹{(r.amountPaise / 100).toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-gray-400">Timestamp</span>
                          <span className="text-gray-500">{r.createdAt}</span>
                        </div>
                      </div>
                      <div className="mt-1.5 text-[9px] text-gray-400 font-medium font-sans">
                        Reason: {r.reason}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AdminCard>

          {/* Audit Logs */}
          <AdminCard title="Administrative Actions Ledger">
            <div className="space-y-3 font-sans text-xs">
              {txn.auditLogs.length === 0 ? (
                <div className="py-4 text-center text-gray-400 font-mono text-[10px]">
                  No administrative actions performed.
                </div>
              ) : (
                <div className="space-y-3">
                  {txn.auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="border-l border-gray-200 dark:border-gray-800 pl-3 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-gray-800 dark:text-white text-[10px]">
                          {log.admin.replace(" (pandejesal@gmail.com)", "")}
                        </span>
                        <span className="text-[9px] text-gray-400 font-mono">{log.timestamp}</span>
                      </div>
                      <div className="font-bold text-[10px] text-[#FF6600] font-mono">
                        ACTION: {log.action}
                      </div>
                      <div className="text-[9px] text-gray-400 font-mono">
                        {log.oldValue} → {log.newValue}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </AdminCard>
        </div>
      </div>

      {/* Process Refund Modal / Dialog */}
      <AnimatePresence>
        {showRefundModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1A1A1A] w-full max-w-md rounded-[20px] p-6 shadow-2xl border border-gray-100 dark:border-gray-800 text-xs font-sans"
            >
              <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/60 pb-3 mb-4">
                <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
                  Initiate Razorpay Refund Payout
                </h3>
                <button
                  onClick={() => setShowRefundModal(false)}
                  className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  <X size={14} />
                </button>
              </div>

              <form onSubmit={handleSubmitRefund} className="space-y-4">
                <div className="bg-amber-50 dark:bg-amber-950/15 border border-amber-100 dark:border-amber-900/30 p-3 rounded-xl flex gap-2.5 text-amber-800 dark:text-amber-400">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-extrabold block">Caution: Destructive Ledger Action</span>
                    <span className="text-[10px] block mt-0.5 leading-normal">
                      Issuing a refund will directly instruct Razorpay to debit your merchant
                      settlement escrow and return the funds to the customer's original payment
                      method. This cannot be undone.
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Refund Scope
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRefundType("full")}
                      className={`py-2.5 text-center font-bold rounded-xl transition-all border ${
                        refundType === "full"
                          ? "bg-[#0E4825] text-white border-[#0E4825]"
                          : "bg-gray-50 border-gray-100 dark:bg-gray-900 dark:border-gray-800 text-gray-400 hover:text-gray-900"
                      }`}
                    >
                      Full Refund (₹{(txn.amountPaise / 100).toFixed(2)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefundType("partial")}
                      className={`py-2.5 text-center font-bold rounded-xl transition-all border ${
                        refundType === "partial"
                          ? "bg-[#0E4825] text-white border-[#0E4825]"
                          : "bg-gray-50 border-gray-100 dark:bg-gray-900 dark:border-gray-800 text-gray-400 hover:text-gray-900"
                      }`}
                    >
                      Partial Refund
                    </button>
                  </div>
                </div>

                {refundType === "partial" && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                      Partial Amount (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 font-mono font-bold">
                        ₹
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="1"
                        max={(txn.amountPaise / 100).toFixed(2)}
                        required
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                        placeholder="Enter amount to refund..."
                        className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl py-2.5 pl-8 pr-4 font-mono font-bold focus:outline-none dark:text-white"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Refund Reason Dropdown
                  </label>
                  <select
                    required
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-50 dark:border-gray-800/80 rounded-xl px-3 py-2.5 font-bold focus:outline-none dark:text-white"
                  >
                    <option value="">Select Reason...</option>
                    <option value="Duplicate payment made at checkout">
                      Duplicate transaction charge
                    </option>
                    <option value="Customer cancelled part of order before kitchen prep">
                      Customer cancellation request
                    </option>
                    <option value="Out of stock wrap ingredients">Ingredients out-of-stock</option>
                    <option value="POS sync timeout, cashier manually cancelled">
                      POS synchronization failure
                    </option>
                    <option value="Customer complaint - delivery quality / cold food">
                      Quality escalation claim
                    </option>
                  </select>
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-50 dark:border-gray-800/60">
                  <button
                    type="button"
                    onClick={() => setShowRefundModal(false)}
                    className="flex-1 py-2.5 text-center font-bold border border-gray-100 dark:border-gray-800 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900 text-gray-400 hover:text-gray-900 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <AdminButton
                    type="submit"
                    variant="secondary"
                    isLoading={isSubmittingRefund}
                    className="flex-1 py-2.5 text-center rounded-xl"
                  >
                    Submit Refund Release
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
export default AdminPaymentDetailsPage;
