import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  ShoppingBag,
  Check,
  X,
  Clock,
  Play,
  AlertCircle,
  Volume2,
  VolumeX,
  List,
  Kanban,
  Eye,
  SlidersHorizontal,
  RefreshCw,
  Printer,
  Download,
  FileText,
  ArrowRight,
  User,
  MapPin,
  Phone,
  Mail,
  Award,
  CreditCard,
  ShieldAlert,
  Sliders,
  Bell,
  CheckCircle2,
  ChevronRight,
  PlayCircle,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { StatCard } from "../components/Cards";
import { ResponsiveTable, TableColumn } from "../components/TableSystem";
import { getRelativeTime } from "@/shared/utils/dateUtils";
import { generateSecureId } from "@/shared/utils/cryptoUtils";
import { StatusBadge } from "../components/Badges";
import { AdminButton } from "../components/Buttons";
import { ConfirmDialog } from "../components/Utilities";
import { motion, AnimatePresence } from "motion/react";
import { INITIAL_RICH_ORDERS, RichOrder, getThermalReceiptText } from "./ordersData";
import { adminOrdersService } from "../services/adminOrdersService";
import { useAdminAuthStore } from "@/admin/store/adminAuthStore";

interface AdminOrdersPageProps {
  defaultTab?: "live" | "history";
  defaultOrderId?: string;
}

// Sound Synthesizer Engine using Web Audio API to bypass asset file dependencies
const playIncomingChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Play beautiful soft dual bell tone
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880.0, now + 0.15); // A5

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(293.66, now); // D4
    osc2.frequency.exponentialRampToValueAtTime(440.0, now + 0.15); // A4

    gainNode.gain.setValueAtTime(0.12, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.6);
    osc2.start(now);
    osc2.stop(now + 0.6);
  } catch (e) {
    console.warn("Audio Context playback failed", e);
  }
};

export const AdminOrdersPage: React.FC<AdminOrdersPageProps> = ({
  defaultTab = "live",
  defaultOrderId,
}) => {
  // Use real Admin Auth Role
  const { admin } = useAdminAuthStore();
  const selectedRole =
    (admin?.role?.name as "Developer" | "Operations" | "Store Manager" | "Finance") || "Developer";

  // Real apps might store the assigned store in the user profile/claims
  const managerAssignedStoreId = admin?.assignedStoreId || "st_cp_delhi";

  // Main states
  const [orders, setOrders] = useState<RichOrder[]>([]);
  const [isSimulatorEnabled, setIsSimulatorEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<"live" | "history">(defaultTab);
  const [selectedOrder, setSelectedOrder] = useState<RichOrder | null>(null);

  // Audio & Simulation controllers
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
  const [newOrderAlert, setNewOrderAlert] = useState<boolean>(false);

  // Filters
  const [filterStore, setFilterStore] = useState<string>("all");
  const [filterFulfillment, setFilterFulfillment] = useState<string>("all");
  const [filterPayment, setFilterPayment] = useState<string>("all");

  // Fetch Live Orders
  useEffect(() => {
    if (viewMode !== "live") return;

    // If user is Store Manager, restrict to their store. Otherwise, follow the filterStore UI selection.
    const effectiveStoreFilter =
      selectedRole === "Store Manager"
        ? managerAssignedStoreId
        : filterStore === "all"
          ? null
          : filterStore;

    const unsubscribe = adminOrdersService.listenLiveOrders(
      effectiveStoreFilter,
      (liveOrders) => setOrders(liveOrders),
      (err) => console.error("Error listening to live orders:", err),
    );

    return () => unsubscribe();
  }, [viewMode, filterStore, selectedRole, managerAssignedStoreId]);

  // Fetch Historical Orders
  useEffect(() => {
    if (viewMode !== "history") return;

    const effectiveStoreFilter =
      selectedRole === "Store Manager"
        ? managerAssignedStoreId
        : filterStore === "all"
          ? null
          : filterStore;

    adminOrdersService.getHistory(effectiveStoreFilter, 50).then(setOrders);
  }, [viewMode, filterStore, selectedRole, managerAssignedStoreId]);

  // Confirm actions
  const [confirmAction, setConfirmAction] = useState<{
    type:
      | "accept"
      | "reject"
      | "prepare"
      | "ready"
      | "dispatch"
      | "complete"
      | "cancel"
      | "refund"
      | "petpooja";
    orderId: string;
  } | null>(null);

  // Printing Receipt Modal state
  const [printReceiptData, setPrintReceiptData] = useState<{
    order: RichOrder;
    type: "KOT" | "INVOICE" | "TAX_RECEIPT";
  } | null>(null);

  // Auto-open specific order if passed as prop
  useEffect(() => {
    if (defaultOrderId) {
      const found = orders.find((o) => o.id === defaultOrderId);
      if (found) {
        setSelectedOrder(found);
      }
    }
  }, [defaultOrderId, orders]);

  // Alert trigger whenever a "New" status order exists and sound is on
  const hasNewOrders = useMemo(() => orders.some((o) => o.orderStatus === "New"), [orders]);
  useEffect(() => {
    if (hasNewOrders) {
      setNewOrderAlert(true);
      if (isSoundEnabled) {
        playIncomingChime();
        const interval = setInterval(() => {
          playIncomingChime();
        }, 12000);
        return () => clearInterval(interval);
      }
    } else {
      setNewOrderAlert(false);
    }
  }, [hasNewOrders, isSoundEnabled]);

  // Active kitchen queue count stats
  const stats = useMemo(() => {
    const fresh = orders.filter((o) => o.orderStatus === "New").length;
    const preps = orders.filter(
      (o) => o.orderStatus === "Preparing" || o.orderStatus === "Accepted",
    ).length;
    const completedToday = orders.filter((o) => o.orderStatus === "Completed").length;
    const activeRevenue = orders
      .filter((o) => o.orderStatus === "Completed" && o.paymentStatus === "Paid")
      .reduce((sum, o) => sum + o.totals.grandTotal, 0);

    return { fresh, preps, completedToday, activeRevenue };
  }, [orders]);

  // Asynchronous state updating function + audit logging write
  const handleUpdateStatus = async (
    orderId: string,
    nextStatus: RichOrder["orderStatus"],
    actor: string = "Store Manager",
    descOverride?: string,
  ) => {
    try {
      await adminOrdersService.updateOrderStatus(orderId, nextStatus, {
        title: `Order status: ${nextStatus}`,
        actor,
        description: descOverride || `Transitioned status to ${nextStatus}`,
      });

      // The local state (orders array) will automatically update via the onSnapshot listener if we are in "live" mode.
      // If we are in "history" mode, we might need a manual refresh, but history mode shouldn't typically be used for real-time status transitions.

      // Update selected order view if it is open
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => (prev ? { ...prev, orderStatus: nextStatus } : prev));
      }

      console.log(
        `[AUDIT LOG] ${actor} modified order ${orderId} status to ${nextStatus} at ${new Date().toLocaleTimeString()}`,
      );
    } catch (error) {
      console.error("Failed to update status", error);
    }
  };

  // Filter implementation
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (filterStore !== "all" && o.store.id !== filterStore) return false;
      if (filterFulfillment !== "all" && o.fulfillment !== filterFulfillment) return false;
      if (filterPayment !== "all" && o.payment.method !== filterPayment) return false;
      return true;
    });
  }, [orders, filterStore, filterFulfillment, filterPayment]);

  // Kanban Columns configuration
  const KANBAN_COLUMNS: Array<{
    status: RichOrder["orderStatus"];
    title: string;
    bgHeader: string;
    textHeader: string;
  }> = [
    {
      status: "New",
      title: "New Awaiting",
      bgHeader: "bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-900/30",
      textHeader: "text-red-600 dark:text-red-400",
    },
    {
      status: "Accepted",
      title: "Accepted / POS",
      bgHeader: "bg-orange-50 dark:bg-orange-950/10 border-orange-200 dark:border-orange-900/30",
      textHeader: "text-[#FF6600]",
    },
    {
      status: "Preparing",
      title: "Preparing",
      bgHeader: "bg-amber-50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-900/30",
      textHeader: "text-[#F59E0B]",
    },
    {
      status: "Ready",
      title: "Ready / Dispatch",
      bgHeader:
        "bg-[#0E4825]/5 dark:bg-[#0E4825]/10 border-emerald-200/50 dark:border-emerald-900/30",
      textHeader: "text-[#0E4825] dark:text-emerald-400",
    },
    {
      status: "Out for Delivery",
      title: "Out for Delivery",
      bgHeader: "bg-blue-50 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900/30",
      textHeader: "text-blue-600 dark:text-blue-400",
    },
    {
      status: "Completed",
      title: "Completed",
      bgHeader:
        "bg-emerald-50 dark:bg-emerald-950/10 border-emerald-200/50 dark:border-emerald-900/30",
      textHeader: "text-emerald-600 dark:text-emerald-400",
    },
    {
      status: "Cancelled",
      title: "Cancelled",
      bgHeader: "bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800",
      textHeader: "text-gray-500",
    },
    {
      status: "Refunded",
      title: "Refunded",
      bgHeader: "bg-purple-50 dark:bg-purple-950/10 border-purple-200 dark:border-purple-900/30",
      textHeader: "text-purple-600 dark:text-purple-400",
    },
  ];

  // Table Columns mapping
  const tableColumns: TableColumn<RichOrder>[] = [
    {
      header: "Order ID",
      accessorKey: "id",
      cell: (row) => (
        <span className="font-mono font-bold text-[#0E4825] dark:text-emerald-400">{row.id}</span>
      ),
    },
    {
      header: "Customer Info",
      accessorKey: "address.contactName",
      cell: (row) => (
        <div>
          <span className="block font-bold text-gray-900 dark:text-white">
            {row.address?.contactName || row.id}
          </span>
          <span className="block text-xs font-mono text-gray-400">
            {row.address?.contactPhone || "Dine-In Client"}
          </span>
        </div>
      ),
    },
    {
      header: "Fulfillment",
      accessorKey: "fulfillment",
      cell: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold uppercase ${
            row.fulfillment === "delivery"
              ? "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400"
              : row.fulfillment === "takeaway"
                ? "bg-orange-50 dark:bg-orange-950/20 text-[#FF6600]"
                : "bg-[#0E4825]/5 dark:bg-[#0E4825]/10 text-[#0E4825] dark:text-emerald-400"
          }`}
        >
          {row.fulfillment}
        </span>
      ),
    },
    {
      header: "Store Outlet",
      accessorKey: "store.name",
    },
    {
      header: "Grand Total",
      accessorKey: "totals.grandTotal",
      cell: (row) => (
        <span className="font-mono font-black text-gray-900 dark:text-white">
          ₹{row.totals.grandTotal.toFixed(2)}
        </span>
      ),
    },
    {
      header: "Order Status",
      accessorKey: "orderStatus",
      cell: (row) => <StatusBadge status={row.orderStatus} label={row.orderStatus} />,
    },
    {
      header: "Payment Status",
      accessorKey: "paymentStatus",
      cell: (row) => (
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold uppercase border ${
            row.paymentStatus === "Paid"
              ? "bg-emerald-50 text-emerald-600 border-emerald-200/50"
              : row.paymentStatus === "Pending"
                ? "bg-amber-50 text-amber-600 border-amber-200/50"
                : "bg-red-50 text-red-600 border-red-200/50"
          }`}
        >
          {row.paymentStatus}
        </span>
      ),
    },
    {
      header: "Petpooja API",
      accessorKey: "petpoojaStatus",
      cell: (row) => (
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-bold font-mono ${
            row.petpoojaStatus === "Synced"
              ? "text-emerald-500"
              : row.petpoojaStatus === "Pending"
                ? "text-amber-500"
                : "text-red-500"
          }`}
        >
          <Sliders size={12} />
          {row.petpoojaStatus}
        </span>
      ),
    },
    {
      header: "Operations",
      accessorKey: "operations",
      sortable: false,
      cell: (row) => (
        <AdminButton
          size="sm"
          variant="ghost"
          className="flex items-center gap-1.5 border border-gray-100 dark:border-gray-800 hover:bg-gray-50 text-xs font-bold"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedOrder(row);
          }}
        >
          <Eye size={12} />
          <span>Monitor</span>
        </AdminButton>
      ),
    },
  ];

  return (
    <div className="space-y-6 font-sans">
      <PageHeader
        title="Order Management System (OMS)"
        description="The live operational heart of the kitchens. Confirm, prepare, route, and audit orders in real time."
        breadcrumbs={[{ label: "Operations Control" }, { label: "OMS Core" }]}
      />

      {/* Stats Display Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard
          title="New Incoming Alerts"
          value={stats.fresh}
          icon={Bell}
          trend={{
            value: stats.fresh > 0 ? 100 : 0,
            label: stats.fresh > 0 ? "Urgent attention" : "All clear",
            isPositive: stats.fresh === 0,
          }}
          accent={stats.fresh > 0}
          className={stats.fresh > 0 ? "ring-2 ring-red-500 animate-pulse" : ""}
        />
        <StatCard
          title="Active in Kitchens"
          value={stats.preps}
          icon={PlayCircle}
          subtext="Cooking / preparing"
        />
        <StatCard
          title="Completed Orders (Today)"
          value={stats.completedToday}
          icon={CheckCircle2}
        />
        <StatCard
          title="Active Gross Revenue"
          value={`₹${stats.activeRevenue.toLocaleString()}`}
          icon={ShoppingBag}
        />
      </div>

      {/* Live Alarm / Flashing alert bar */}
      <AnimatePresence>
        {newOrderAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-500 text-white p-4 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl border border-red-600 animate-pulse"
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-white/25 flex items-center justify-center animate-bounce">
                <ShieldAlert size={20} className="text-white" />
              </div>
              <div>
                <span className="block font-black tracking-tight text-sm uppercase">
                  NEW INCOMING ORDERS AWAITING ACTION
                </span>
                <span className="block text-xs text-white/90 font-bold">
                  Kitchen routing queue is blocking. Please accept or reject live receipts
                  immediately.
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const firstNew = orders.find((o) => o.orderStatus === "New");
                  if (firstNew) setSelectedOrder(firstNew);
                }}
                className="px-4 py-2 bg-white text-red-600 font-bold text-xs rounded-xl hover:bg-red-50 transition-all flex items-center gap-1"
              >
                <span>View First New</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-[20px] bg-white dark:bg-[#1A1A1A] border border-gray-100 dark:border-gray-800 shadow-sm">
        {/* View mode toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("live")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold uppercase transition-all ${
              viewMode === "live"
                ? "bg-[#0E4825] text-white"
                : "bg-gray-50 dark:bg-gray-900 text-gray-500 hover:text-gray-900"
            }`}
          >
            <Kanban size={14} />
            <span>Live Kanban Board</span>
          </button>
          <button
            onClick={() => setViewMode("history")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold uppercase transition-all ${
              viewMode === "history"
                ? "bg-[#0E4825] text-white"
                : "bg-gray-50 dark:bg-gray-900 text-gray-500 hover:text-gray-900"
            }`}
          >
            <List size={14} />
            <span>All Orders / Search</span>
          </button>
        </div>

        {/* Simulator & Audio control switches */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Sound toggle */}
          <button
            onClick={() => setIsSoundEnabled(!isSoundEnabled)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-100 dark:border-gray-800 text-xs font-bold transition-all ${
              isSoundEnabled
                ? "bg-emerald-50 dark:bg-emerald-950/20 text-[#16A34A] border-emerald-100"
                : "bg-gray-50 dark:bg-gray-900 text-gray-400"
            }`}
          >
            {isSoundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span>{isSoundEnabled ? "Audio Chime ON" : "Audio Chime MUTED"}</span>
          </button>

          {/* Simulator toggle */}
          <button
            onClick={() => {
              setIsSimulatorEnabled(!isSimulatorEnabled);
              console.log(`[SIMULATOR] Order Generator changed to: ${!isSimulatorEnabled}`);
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-xs font-bold transition-all ${
              isSimulatorEnabled
                ? "bg-amber-50 dark:bg-amber-950/20 text-[#FF6600] border-amber-200"
                : "bg-gray-50 dark:bg-gray-900 text-gray-400 border-gray-100 dark:border-gray-800"
            }`}
          >
            <RefreshCw size={14} className={isSimulatorEnabled ? "animate-spin" : ""} />
            <span>{isSimulatorEnabled ? "Order Generator: ACTIVE" : "Simulator: INACTIVE"}</span>
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Store outlet filter */}
        <div className="relative">
          <select
            value={filterStore}
            onChange={(e) => setFilterStore(e.target.value)}
            className="w-full px-4 py-3 text-xs font-bold rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="all">ALL STORES OUTLETS</option>
            <option value="st_cp_delhi">Connaught Place, Delhi</option>
            <option value="st_andheri_mumbai">Andheri West, Mumbai</option>
            <option value="st_koramangala_blr">Koramangala, Bangalore</option>
            <option value="st_sec62_noida">Sector 62, Noida</option>
          </select>
        </div>

        {/* Fulfillment filter */}
        <div className="relative">
          <select
            value={filterFulfillment}
            onChange={(e) => setFilterFulfillment(e.target.value)}
            className="w-full px-4 py-3 text-xs font-bold rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="all">ALL FULFILLMENT TYPES</option>
            <option value="delivery">DELIVERY</option>
            <option value="takeaway">TAKEAWAY</option>
            <option value="dinein">DINE-IN</option>
          </select>
        </div>

        {/* Payment filter */}
        <div className="relative">
          <select
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
            className="w-full px-4 py-3 text-xs font-bold rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            <option value="all">ALL PAYMENT METHODS</option>
            <option value="upi">UPI / GPAY / PHONEPE</option>
            <option value="card">DEBIT / CREDIT CARD</option>
            <option value="online">NET BANKING</option>
          </select>
        </div>
      </div>

      {/* Main Workspace content depends on View Mode */}
      {viewMode === "live" ? (
        /* Kanban Live Board View */
        <div className="overflow-x-auto pb-4 no-scrollbar">
          <div className="flex gap-5 min-w-[1600px] h-[680px]">
            {KANBAN_COLUMNS.map((col) => {
              const colOrders = filteredOrders.filter((o) => o.orderStatus === col.status);

              return (
                <div
                  key={col.status}
                  className="flex flex-col w-[300px] shrink-0 bg-white dark:bg-[#181818]/60 rounded-3xl border border-gray-100 dark:border-gray-800/80 p-4 shadow-[0_4px_16px_rgba(0,0,0,0.01)]"
                >
                  {/* Column Header */}
                  <div
                    className={`p-3 rounded-2xl border ${col.bgHeader} mb-4 flex items-center justify-between`}
                  >
                    <span
                      className={`text-xs font-black uppercase tracking-wider ${col.textHeader}`}
                    >
                      {col.title}
                    </span>
                    <span className="h-5 w-5 rounded-md bg-black/5 dark:bg-white/5 text-[10px] font-black flex items-center justify-center font-mono text-gray-600 dark:text-gray-400">
                      {colOrders.length}
                    </span>
                  </div>

                  {/* Column Cards Container */}
                  <div className="flex-1 overflow-y-auto space-y-3 pr-1 no-scrollbar">
                    {colOrders.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-gray-100 dark:border-gray-800/40 rounded-2xl">
                        <ShoppingBag size={24} className="text-gray-300 mb-2" />
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          Queue Empty
                        </span>
                      </div>
                    ) : (
                      colOrders.map((order) => {
                        const elapsedMins = Math.round(
                          (Date.now() - new Date(order.placedAt).getTime()) / 60000,
                        );
                        const isLate =
                          elapsedMins > 25 &&
                          order.orderStatus !== "Completed" &&
                          order.orderStatus !== "Cancelled";

                        return (
                          <motion.div
                            key={order.id}
                            layoutId={order.id}
                            onClick={() => setSelectedOrder(order)}
                            className={`p-4 rounded-2xl border bg-white dark:bg-[#1C1C1C] cursor-pointer hover:shadow-md transition-all duration-150 relative group ${
                              isLate
                                ? "border-red-300 dark:border-red-950/40 bg-red-50/10"
                                : "border-gray-100 dark:border-gray-800 hover:border-[#0E4825]"
                            }`}
                          >
                            {/* Card badge indicators */}
                            <div className="flex items-center justify-between gap-1 mb-2.5">
                              <span
                                className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg ${
                                  order.fulfillment === "delivery"
                                    ? "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400"
                                    : "bg-orange-50 dark:bg-orange-950/30 text-[#FF6600]"
                                }`}
                              >
                                {order.fulfillment}
                              </span>

                              <div className="flex items-center gap-1">
                                <Clock size={10} className="text-gray-400" />
                                <span
                                  className={`text-[10px] font-mono font-bold ${isLate ? "text-red-500" : "text-gray-400"}`}
                                >
                                  {elapsedMins}m ago
                                </span>
                              </div>
                            </div>

                            {/* Order short details */}
                            <div className="mb-2.5">
                              <span className="block font-mono font-black text-xs text-[#0E4825] dark:text-emerald-400 mb-0.5">
                                {order.id}
                              </span>
                              <span className="block font-bold text-xs text-gray-900 dark:text-white truncate">
                                {order.address?.contactName || "Dine-In Client"}
                              </span>
                            </div>

                            {/* Item overview list */}
                            <div className="border-t border-b border-gray-50 dark:border-gray-800/40 py-2 my-2.5 space-y-1">
                              {order.items.map((it, idx) => (
                                <span
                                  key={idx}
                                  className="block text-xs font-semibold text-gray-600 dark:text-gray-400 line-clamp-1"
                                >
                                  {it.quantity}x {it.name}
                                </span>
                              ))}
                            </div>

                            {/* Invoice total and fast actions */}
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black font-mono text-gray-900 dark:text-white">
                                ₹{order.totals.grandTotal.toFixed(2)}
                              </span>

                              {/* Action shortcut button */}
                              {order.orderStatus === "New" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmAction({ type: "accept", orderId: order.id });
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#0E4825] hover:bg-[#12582e] text-white text-[10px] font-black uppercase flex items-center gap-1"
                                >
                                  <Check size={11} />
                                  <span>Accept</span>
                                </button>
                              )}
                              {order.orderStatus === "Accepted" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateStatus(order.id, "Preparing");
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#FF6600] hover:bg-[#e05900] text-white text-[10px] font-black uppercase flex items-center gap-1"
                                >
                                  <Play size={11} />
                                  <span>Prepare</span>
                                </button>
                              )}
                              {order.orderStatus === "Preparing" && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateStatus(order.id, "Ready");
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-[#F59E0B] hover:bg-[#d98b09] text-white text-[10px] font-black uppercase flex items-center gap-1"
                                >
                                  <CheckCircle2 size={11} />
                                  <span>Ready</span>
                                </button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* History Search & Database Table View */
        <ResponsiveTable
          data={filteredOrders}
          columns={tableColumns}
          searchPlaceholder="Search OMS core database by Customer, ID, Phone, Store..."
          searchFields={["id", "address.contactName", "address.contactPhone", "store.name"]}
          exportFileName="burgonomics-orders-audit"
          onRowClick={(row) => setSelectedOrder(row)}
          bulkActions={[
            {
              label: "Bulk Accept Incoming",
              onClick: (selected) => {
                selected.forEach((o) => {
                  if (o.orderStatus === "New") {
                    handleUpdateStatus(o.id, "Accepted", "Bulk Operations Panel");
                  }
                });
              },
            },
            {
              label: "Force Refund/Cancel Selected",
              variant: "danger",
              onClick: (selected) => {
                selected.forEach((o) => {
                  if (o.orderStatus !== "Completed" && o.orderStatus !== "Cancelled") {
                    handleUpdateStatus(
                      o.id,
                      "Cancelled",
                      "Bulk Operations Panel",
                      "Bulk force cancellation",
                    );
                  }
                });
              },
            },
          ]}
        />
      )}

      {/* Slide-Over Split Panel Drawer for Detailed Order View */}
      <AnimatePresence>
        {selectedOrder && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedOrder(null)}
              className="fixed inset-0 bg-black z-40 backdrop-blur-[2px]"
            />

            {/* Slide over layout container */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 220 }}
              className="fixed inset-y-0 right-0 z-50 w-full max-w-[800px] bg-white dark:bg-[#1A1A1A] border-l border-gray-100 dark:border-gray-800 shadow-2xl flex flex-col overflow-hidden font-sans"
            >
              {/* Drawer Header */}
              <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/10">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-[#0E4825]/5 dark:bg-[#0E4825]/10 flex items-center justify-center text-[#0E4825] dark:text-emerald-400">
                    <ShoppingBag size={18} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-base text-[#0E4825] dark:text-emerald-400">
                        {selectedOrder.id}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-wider text-[#FF6600] bg-orange-50 dark:bg-orange-950/20 px-2 py-0.5 rounded-lg">
                        {selectedOrder.fulfillment}
                      </span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      PLACED AT: {new Date(selectedOrder.placedAt).toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drawer Body - Split Layout */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6 no-scrollbar">
                {/* LEFT COLUMN (45%): Customer, Address, Instruction Notes, Milestone Timeline */}
                <div className="md:col-span-5 space-y-6">
                  {/* Customer Information Card */}
                  <div className="p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-900/10 border border-gray-100 dark:border-gray-800 space-y-4">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-[#0E4825] dark:text-emerald-400">
                      Customer Profile
                    </span>
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500">
                        <User size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block font-black text-sm text-gray-900 dark:text-white truncate">
                          {selectedOrder.address?.contactName || "Walk-In Dine-In Customer"}
                        </span>
                        <div className="flex items-center gap-1 text-xs text-[#FF6600] font-bold mt-0.5">
                          <Award size={13} />
                          <span>{selectedOrder.customerCohort || "Gold Tier Member"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-gray-100 dark:border-gray-800/40 pt-3 text-xs">
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 font-bold">
                        <Phone size={13} className="text-gray-400" />
                        <span>{selectedOrder.address?.contactPhone || "N/A (Table Client)"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400 font-bold">
                        <Mail size={13} className="text-gray-400" />
                        <span className="truncate">
                          {selectedOrder.customerEmail || "no-email@burgonomics.com"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Delivery / Address details */}
                  {selectedOrder.fulfillment === "delivery" && selectedOrder.address && (
                    <div className="p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-900/10 border border-gray-100 dark:border-gray-800 space-y-3">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                        Delivery Address
                      </span>
                      <div className="flex gap-2 text-xs">
                        <MapPin size={15} className="text-gray-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <span className="font-bold text-gray-900 dark:text-white">
                            {selectedOrder.address.label}
                          </span>
                          <p className="text-gray-500">
                            {selectedOrder.address.line1}, {selectedOrder.address.line2}
                          </p>
                          <p className="text-gray-400 font-bold text-[10px]">
                            Landmark: {selectedOrder.address.landmark}
                          </p>
                        </div>
                      </div>

                      {selectedOrder.fulfillmentInstructions && (
                        <div className="bg-blue-50/50 dark:bg-blue-950/10 border border-blue-100/50 p-2.5 rounded-xl text-[11px] text-blue-700 dark:text-blue-400 font-bold">
                          <span>Note: {selectedOrder.fulfillmentInstructions}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Special Kitchen Notes */}
                  {selectedOrder.notes && (
                    <div className="p-4 rounded-2xl bg-amber-50/40 dark:bg-amber-950/5 border border-amber-100/60 text-xs">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">
                        Customer Instructions
                      </span>
                      <p className="text-gray-600 dark:text-gray-300 font-medium italic">
                        "{selectedOrder.notes}"
                      </p>
                    </div>
                  )}

                  {/* Chronological Milestone Timeline */}
                  <div className="space-y-4 pt-2">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Chronological Logs
                    </span>
                    <div className="relative border-l-2 border-gray-100 dark:border-gray-800 pl-4 ml-2.5 space-y-5 text-xs">
                      {selectedOrder.timeline.map((step, idx) => (
                        <div key={idx} className="relative">
                          {/* Pulsing state bullet */}
                          <div
                            className={`absolute -left-[23px] top-0 h-3 w-3 rounded-full border bg-white dark:bg-[#1A1A1A] ${
                              idx === selectedOrder.timeline.length - 1
                                ? "border-[#0E4825] bg-[#0E4825] dark:border-emerald-400 dark:bg-emerald-400 animate-pulse"
                                : "border-gray-300"
                            }`}
                          />
                          <div>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="font-bold text-gray-900 dark:text-white">
                                {step.title}
                              </span>
                              <span className="text-[10px] text-gray-400 font-mono font-bold">
                                {step.timestamp}
                              </span>
                            </div>
                            <span className="block text-[10px] font-black uppercase text-[#FF6600]">
                              {step.actor}
                            </span>
                            <p className="text-gray-500 mt-0.5">{step.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* RIGHT COLUMN (55%): Invoice Breakdown, Totals, Payment Details, Petpooja Sync */}
                <div className="md:col-span-7 space-y-6 border-t md:border-t-0 md:border-l border-gray-100 dark:border-gray-800/80 pt-6 md:pt-0 md:pl-6">
                  {/* Items Invoice list */}
                  <div className="space-y-3">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Order Invoice Items
                    </span>
                    <div className="divide-y divide-gray-100 dark:divide-gray-800/40">
                      {selectedOrder.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="h-5 w-5 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg flex items-center justify-center font-mono font-bold text-[10px]">
                                {item.quantity}
                              </span>
                              <span className="font-bold text-gray-900 dark:text-white">
                                {item.name}
                              </span>
                            </div>
                            {item.customizations && item.customizations.length > 0 && (
                              <div className="pl-6 space-y-0.5">
                                {item.customizations.map((cust: any, cIdx: number) => (
                                  <span
                                    key={cIdx}
                                    className="block text-[10px] text-gray-400 font-medium"
                                  >
                                    + {cust.name || cust.optionName} (+₹
                                    {cust.price || cust.priceDelta || 0})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="font-mono font-bold text-gray-900 dark:text-white shrink-0">
                            ₹
                            {(
                              ((item.price ?? item.unitPrice ?? 0) as number) * item.quantity
                            ).toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Financial Summary panel */}
                    <div className="border-t border-gray-100 dark:border-gray-800/60 pt-3 space-y-2 text-xs font-semibold">
                      <div className="flex items-center justify-between text-gray-500">
                        <span>Items Subtotal</span>
                        <span className="font-mono">
                          ₹{selectedOrder.totals.subtotal.toFixed(2)}
                        </span>
                      </div>
                      {(selectedOrder.totals.discount ?? 0) > 0 && (
                        <div className="flex items-center justify-between text-emerald-500">
                          <span>Discounts / Coupon</span>
                          <span className="font-mono">
                            -₹{(selectedOrder.totals.discount ?? 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {(selectedOrder.totals.deliveryCharge ??
                        selectedOrder.totals.deliveryFee ??
                        0) > 0 && (
                        <div className="flex items-center justify-between text-gray-500">
                          <span>Delivery Logistics</span>
                          <span className="font-mono">
                            ₹
                            {(
                              selectedOrder.totals.deliveryCharge ??
                              selectedOrder.totals.deliveryFee ??
                              0
                            ).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {(selectedOrder.totals.packagingCharge ??
                        selectedOrder.totals.packingFee ??
                        0) > 0 && (
                        <div className="flex items-center justify-between text-gray-500">
                          <span>Eco Packaging</span>
                          <span className="font-mono">
                            ₹
                            {(
                              selectedOrder.totals.packagingCharge ??
                              selectedOrder.totals.packingFee ??
                              0
                            ).toFixed(2)}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-gray-500">
                        <span>Taxes (GST 5%)</span>
                        <span className="font-mono">
                          ₹
                          {(selectedOrder.totals.tax ?? selectedOrder.totals.taxes ?? 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between border-t border-gray-100 dark:border-gray-800 pt-3 font-mono font-black text-sm text-gray-900 dark:text-white">
                        <span>Grand Total</span>
                        <span>₹{selectedOrder.totals.grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Payment Verification Information */}
                  <div className="p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-900/10 border border-gray-100 dark:border-gray-800 space-y-3">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Payment Gateway Details
                    </span>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 font-bold text-gray-600 dark:text-gray-400">
                        <CreditCard size={14} className="text-gray-400" />
                        <span>{selectedOrder.payment.label}</span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                          selectedOrder.paymentStatus === "Paid"
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-amber-50 text-amber-600"
                        }`}
                      >
                        {selectedOrder.paymentStatus}
                      </span>
                    </div>

                    <div className="space-y-1.5 border-t border-gray-100 dark:border-gray-800/40 pt-2.5 text-[11px] font-mono font-semibold text-gray-400">
                      <div className="flex justify-between">
                        <span>Razorpay ID:</span>
                        <span className="text-gray-700 dark:text-gray-300 select-all">
                          {selectedOrder.payment.transactionId || "CASH_SETTLED"}
                        </span>
                      </div>
                      {selectedOrder.payment.paidAt && (
                        <div className="flex justify-between">
                          <span>Settled At:</span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {new Date(selectedOrder.payment.paidAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Petpooja POS Integration Panel */}
                  <div className="p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-900/10 border border-gray-100 dark:border-gray-800 space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#FF6600]">
                        Petpooja POS API Link
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-black uppercase ${
                          selectedOrder.petpoojaStatus === "Synced"
                            ? "text-emerald-500"
                            : "text-amber-500"
                        }`}
                      >
                        <Sliders size={12} />
                        <span>{selectedOrder.petpoojaStatus}</span>
                      </span>
                    </div>

                    <div className="space-y-2 text-[11px] font-mono font-semibold text-gray-400">
                      <div className="flex justify-between">
                        <span>Restaurant ID:</span>
                        <span className="text-gray-600 dark:text-gray-300">PP-RES-CP07</span>
                      </div>
                      <div className="flex justify-between">
                        <span>KOT Number:</span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {selectedOrder.petpoojaDetails?.kotId || "Pending acceptance"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>POS Ticket ID:</span>
                        <span className="text-gray-700 dark:text-gray-300">
                          {selectedOrder.petpoojaDetails?.posOrderId || "Not synced"}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 border-t border-gray-100 dark:border-gray-800/40 pt-3">
                      <button
                        onClick={() =>
                          setConfirmAction({ type: "petpooja", orderId: selectedOrder.id })
                        }
                        className="flex-1 py-2 text-[10px] font-black uppercase rounded-xl border border-orange-200 text-[#FF6600] hover:bg-orange-50/30 transition-all"
                      >
                        Push to POS
                      </button>
                      <button
                        onClick={() => {
                          setOrders((prev) =>
                            prev.map((o) =>
                              o.id === selectedOrder.id ? { ...o, petpoojaStatus: "Bypassed" } : o,
                            ),
                          );
                          setSelectedOrder((prev) =>
                            prev ? { ...prev, petpoojaStatus: "Bypassed" } : null,
                          );
                          console.log(
                            `[OMS] Petpooja POS integration bypassed for order ${selectedOrder.id}`,
                          );
                        }}
                        className="py-2 px-3 text-[10px] font-black uppercase rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
                      >
                        Bypass POS
                      </button>
                    </div>
                  </div>

                  {/* Delivery partner panel (Only if delivery and dispatch state) */}
                  {selectedOrder.fulfillment === "delivery" && (
                    <div className="p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-900/10 border border-gray-100 dark:border-gray-800 space-y-3">
                      <span className="block text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">
                        Delivery Logistics Assignment
                      </span>
                      <div className="flex items-center justify-between text-xs font-bold text-gray-600 dark:text-gray-400">
                        <span>Assigned Rider:</span>
                        <span className="text-gray-900 dark:text-white">
                          {selectedOrder.deliveryPartner?.name || "Awaiting assignment"}
                        </span>
                      </div>
                      {selectedOrder.deliveryPartner?.phone && (
                        <div className="flex items-center justify-between text-xs font-bold text-gray-600 dark:text-gray-400">
                          <span>Rider Contact:</span>
                          <span className="text-gray-900 dark:text-white">
                            {selectedOrder.deliveryPartner.phone}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Thermal receipt Printing Triggers */}
                  <div className="p-4 rounded-2xl bg-gray-50/50 dark:bg-gray-900/10 border border-gray-100 dark:border-gray-800 space-y-3">
                    <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
                      Print Physical Thermal Tickets
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setPrintReceiptData({ order: selectedOrder, type: "KOT" })}
                        className="py-2.5 text-xs font-bold rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Printer size={13} />
                        <span>Kitchen KOT</span>
                      </button>
                      <button
                        onClick={() =>
                          setPrintReceiptData({ order: selectedOrder, type: "INVOICE" })
                        }
                        className="py-2.5 text-xs font-bold rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-all"
                      >
                        <FileText size={13} />
                        <span>Tax Invoice</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawer Footer Actions Control panel */}
              <div className="p-6 border-t border-gray-100 dark:border-gray-800 bg-gray-50/40 dark:bg-gray-900/10 flex flex-wrap gap-3">
                {/* 1. New -> Accept/Reject */}
                {selectedOrder.orderStatus === "New" && (
                  <>
                    <button
                      onClick={() =>
                        setConfirmAction({ type: "accept", orderId: selectedOrder.id })
                      }
                      className="flex-1 py-3 px-4 bg-[#0E4825] hover:bg-[#11572c] text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5"
                    >
                      <Check size={14} />
                      <span>Accept Order</span>
                    </button>
                    <button
                      onClick={() =>
                        setConfirmAction({ type: "reject", orderId: selectedOrder.id })
                      }
                      className="py-3 px-4 bg-red-50 hover:bg-red-100 text-[#DC2626] font-black text-xs uppercase tracking-wider rounded-2xl transition-all"
                    >
                      Reject
                    </button>
                  </>
                )}

                {/* 2. Accepted -> Start Preparing */}
                {selectedOrder.orderStatus === "Accepted" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, "Preparing")}
                    className="flex-1 py-3 px-4 bg-[#FF6600] hover:bg-[#e05900] text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <Play size={14} />
                    <span>Send to Kitchen (Prepare)</span>
                  </button>
                )}

                {/* 3. Preparing -> Mark Ready */}
                {selectedOrder.orderStatus === "Preparing" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, "Ready")}
                    className="flex-1 py-3 px-4 bg-[#F59E0B] hover:bg-[#da8c0a] text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    <span>Mark Ready (Packed)</span>
                  </button>
                )}

                {/* 4. Ready -> Complete or Dispatch */}
                {selectedOrder.orderStatus === "Ready" && (
                  <>
                    {selectedOrder.fulfillment === "delivery" ? (
                      <button
                        onClick={() => handleUpdateStatus(selectedOrder.id, "Out for Delivery")}
                        className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5"
                      >
                        <ArrowRight size={14} />
                        <span>Assign Rider & Dispatch</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(selectedOrder.id, "Completed")}
                        className="flex-1 py-3 px-4 bg-[#0E4825] hover:bg-[#11572c] text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5"
                      >
                        <Check size={14} />
                        <span>Mark Handed Over / Settled</span>
                      </button>
                    )}
                  </>
                )}

                {/* 5. Out for delivery -> Complete */}
                {selectedOrder.orderStatus === "Out for Delivery" && (
                  <button
                    onClick={() => handleUpdateStatus(selectedOrder.id, "Completed")}
                    className="flex-1 py-3 px-4 bg-[#0E4825] hover:bg-[#11572c] text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md transition-all flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle2 size={14} />
                    <span>Confirm Rider Delivery</span>
                  </button>
                )}

                {/* Standard Cancellation safety-valve for non-settled */}
                {selectedOrder.orderStatus !== "Completed" &&
                  selectedOrder.orderStatus !== "Cancelled" &&
                  selectedOrder.orderStatus !== "Refunded" && (
                    <button
                      onClick={() =>
                        setConfirmAction({ type: "cancel", orderId: selectedOrder.id })
                      }
                      className="py-3 px-4 bg-red-50 text-red-500 hover:bg-red-100 text-xs font-black uppercase rounded-2xl transition-all"
                    >
                      Void Order
                    </button>
                  )}

                {/* Refund route for completed orders */}
                {selectedOrder.orderStatus === "Completed" &&
                  selectedOrder.paymentStatus === "Paid" && (
                    <button
                      onClick={() =>
                        setConfirmAction({ type: "refund", orderId: selectedOrder.id })
                      }
                      className="py-3 px-5 bg-purple-50 text-purple-600 hover:bg-purple-100 text-xs font-black uppercase rounded-2xl transition-all"
                    >
                      Trigger Gateway Refund
                    </button>
                  )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirmation Dialog overlays */}
      {confirmAction && (
        <ConfirmDialog
          isOpen={true}
          isDestructive={
            confirmAction.type === "reject" ||
            confirmAction.type === "cancel" ||
            confirmAction.type === "refund"
          }
          onClose={() => setConfirmAction(null)}
          onConfirm={() => {
            if (confirmAction.type === "accept") {
              handleUpdateStatus(
                confirmAction.orderId,
                "Accepted",
                "Store Manager (Rajesh)",
                "Accepted order and pushed to kitchen printer",
              );
            } else if (confirmAction.type === "reject") {
              handleUpdateStatus(
                confirmAction.orderId,
                "Cancelled",
                "Store Manager (Rajesh)",
                "Store manager rejected order due to high operational volume",
              );
            } else if (confirmAction.type === "cancel") {
              handleUpdateStatus(
                confirmAction.orderId,
                "Cancelled",
                "Store Manager (Rajesh)",
                "Voided and cancelled session",
              );
            } else if (confirmAction.type === "refund") {
              setOrders((prev) =>
                prev.map((o) =>
                  o.id === confirmAction.orderId
                    ? { ...o, orderStatus: "Refunded", paymentStatus: "Refunded" }
                    : o,
                ),
              );
              // Update drawer details
              if (selectedOrder && selectedOrder.id === confirmAction.orderId) {
                setSelectedOrder((prev) =>
                  prev ? { ...prev, orderStatus: "Refunded", paymentStatus: "Refunded" } : null,
                );
              }
              console.log(
                `[AUDIT LOG] Razorpay API refund generated of order ${confirmAction.orderId}`,
              );
            } else if (confirmAction.type === "petpooja") {
              setOrders((prev) =>
                prev.map((o) =>
                  o.id === confirmAction.orderId ? { ...o, petpoojaStatus: "Synced" } : o,
                ),
              );
              if (selectedOrder && selectedOrder.id === confirmAction.orderId) {
                setSelectedOrder((prev) => (prev ? { ...prev, petpoojaStatus: "Synced" } : null));
              }
              console.log(
                `[OMS] Manual Petpooja sync completed successfully for order ${confirmAction.orderId}`,
              );
            }
            setConfirmAction(null);
          }}
          title={
            confirmAction.type === "accept"
              ? "Accept Incoming Order?"
              : confirmAction.type === "reject"
                ? "Reject Order?"
                : confirmAction.type === "cancel"
                  ? "Cancel & Void Order?"
                  : confirmAction.type === "refund"
                    ? "Refund Order Value?"
                    : "Force POS Push?"
          }
          description={
            confirmAction.type === "accept"
              ? "This will send the order ticket and print the kitchen receipt."
              : confirmAction.type === "reject"
                ? "Are you sure you want to reject this incoming order? This is permanent."
                : confirmAction.type === "cancel"
                  ? "Warning: Voiding this order will cancel the preparation queue."
                  : confirmAction.type === "refund"
                    ? "This triggers an instant full gateway refund via Razorpay to the customer. This cannot be reversed."
                    : "This bypasses the queue and forces a push to the Petpooja POS API."
          }
          confirmLabel={
            confirmAction.type === "accept"
              ? "Print & Accept"
              : confirmAction.type === "reject"
                ? "Reject Order"
                : confirmAction.type === "cancel"
                  ? "Void Order"
                  : confirmAction.type === "refund"
                    ? "Refund Money"
                    : "Force Push"
          }
        />
      )}

      {/* Printable Thermal Receipt Modal overlay */}
      {printReceiptData && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1A1A1A] w-full max-w-md rounded-3xl overflow-hidden flex flex-col h-[90vh] shadow-2xl">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-gray-500">
                Thermal Ticket Preview
              </span>
              <button
                onClick={() => setPrintReceiptData(null)}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400"
              >
                <X size={16} />
              </button>
            </div>

            {/* Receipt Tabs */}
            <div className="flex border-b border-gray-100 dark:border-gray-800 p-1 bg-gray-50 dark:bg-gray-900/30">
              {["KOT", "INVOICE", "TAX_RECEIPT"].map((t) => (
                <button
                  key={t}
                  onClick={() => setPrintReceiptData({ ...printReceiptData, type: t as any })}
                  className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all ${
                    printReceiptData.type === t
                      ? "bg-white dark:bg-[#1A1A1A] text-[#0E4825] dark:text-emerald-400 shadow-sm"
                      : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {t === "KOT"
                    ? "Kitchen KOT"
                    : t === "INVOICE"
                      ? "Customer Invoice"
                      : "Tax Receipt"}
                </button>
              ))}
            </div>

            {/* Monospaced Paper Container */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-[#121212] flex justify-center no-scrollbar">
              <div className="bg-white dark:bg-zinc-900 p-6 w-full max-w-[340px] shadow-md border border-gray-200/50 dark:border-zinc-800/60 font-mono text-[11px] leading-relaxed text-black dark:text-zinc-200 select-all overflow-x-hidden">
                <pre className="whitespace-pre-wrap font-mono">
                  {getThermalReceiptText(printReceiptData.order, printReceiptData.type)}
                </pre>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10 flex gap-3">
              <button
                onClick={() => {
                  const printContent = getThermalReceiptText(
                    printReceiptData.order,
                    printReceiptData.type,
                  );
                  const printWindow = window.open("", "_blank");
                  if (printWindow) {
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>Burgonomics Thermal Receipt</title>
                          <style>
                            body { font-family: monospace; font-size: 12px; padding: 20px; white-space: pre-wrap; width: 300px; }
                          </style>
                        </head>
                        <body>
                          ${printContent.replace(/\n/g, "<br>")}
                          <script>window.print();</script>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                  }
                }}
                className="flex-1 py-3 px-4 bg-[#0E4825] text-white font-black text-xs uppercase tracking-wider rounded-2xl hover:bg-[#12592d] transition-all flex items-center justify-center gap-1.5"
              >
                <Printer size={13} />
                <span>Print Ticket</span>
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    getThermalReceiptText(printReceiptData.order, printReceiptData.type),
                  );
                  console.log("[OMS] Ticket text copied to administrative clipboard");
                }}
                className="py-3 px-4 border border-gray-200 text-gray-500 hover:bg-gray-50 font-black text-xs uppercase rounded-2xl transition-all"
              >
                Copy Text
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
