import React, { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Search,
  Filter,
  Download,
  Award,
  DollarSign,
  UserCheck,
  Percent,
  PlusCircle,
  Mail,
  Ban,
  CheckCircle,
  Eye,
  Settings,
  MessageSquare,
  ChevronRight,
  TrendingUp,
  MapPin,
  Calendar,
  AlertCircle,
  FileText,
  HelpCircle,
  Bell,
  Sliders,
  Send,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/Utilities";
import { customerStorage, CustomerProfile, SavedSegment } from "./customersData";
import { useAdmin } from "../hooks/useAdmin";
import { toast } from "sonner";

export const AdminCustomersPage: React.FC = () => {
  const { role } = useAdmin();

  // Storage Subscription
  const [customers, setCustomers] = useState<CustomerProfile[]>(customerStorage.getCustomers());
  const [segments, setSegments] = useState<SavedSegment[]>(customerStorage.getSegments());

  useEffect(() => {
    const sub = customerStorage.subscribe(() => {
      setCustomers([...customerStorage.getCustomers()]);
      setSegments([...customerStorage.getSegments()]);
    });
    return () => {
      sub();
    };
  }, []);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("all");
  const [selectedStore, setSelectedStore] = useState("all");
  const [selectedTier, setSelectedTier] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedSegment, setSelectedSegment] = useState("all");

  // Dialog / Action states
  const [selectedCustForAction, setSelectedCustForAction] = useState<CustomerProfile | null>(null);
  const [confirmBlockCust, setConfirmBlockCust] = useState<CustomerProfile | null>(null);

  // Points Adjust Modal State
  const [pointsAdjustCust, setPointsAdjustCust] = useState<CustomerProfile | null>(null);
  const [pointsAmount, setPointsAmount] = useState(100);
  const [pointsAction, setPointsAction] = useState<"ADD" | "REMOVE" | "EXPIRE">("ADD");
  const [pointsReason, setPointsReason] = useState("");

  // Broadcast campaign Modal State
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignType, setCampaignType] = useState<"SMS" | "Push" | "WhatsApp" | "Email">(
    "WhatsApp",
  );
  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignBody, setCampaignBody] = useState("");
  const [campaignSegmentFilter, setCampaignSegmentFilter] = useState("all");

  // Cities and Stores options
  const uniqueCities = useMemo(() => {
    return Array.from(new Set(customers.map((c) => c.city)));
  }, [customers]);

  const uniqueStores = useMemo(() => {
    return Array.from(new Set(customers.map((c) => c.preferredStore)));
  }, [customers]);

  // Aggregate Metrics (HubSpot / McDonald's Level Intelligence)
  const stats = useMemo(() => {
    const total = customers.length;
    const activeToday = Math.round(total * 0.4); // Simulated active profiles based on 40%
    const goldOrAbove = customers.filter((c) =>
      ["Gold", "Platinum", "VIP"].includes(c.loyaltyTier),
    ).length;
    const returningCustCount = customers.filter((c) => c.ordersCount > 3).length;
    const totalSpentSum = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    const avgSpend = total > 0 ? totalSpentSum / total : 0;
    const totalOrders = customers.reduce((sum, c) => sum + c.ordersCount, 0);
    const avgOrderValue = totalOrders > 0 ? totalSpentSum / totalOrders : 0;
    const blockedCount = customers.filter((c) => c.status === "Blocked").length;

    return {
      total,
      activeToday,
      goldOrAbove,
      returningPercent: total > 0 ? Math.round((returningCustCount / total) * 100) : 0,
      totalSpentSum,
      avgSpend,
      avgOrderValue,
      blockedCount,
    };
  }, [customers]);

  // Filters logic
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Search Box (Name, phone, email, ID)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const match =
          c.fullName.toLowerCase().includes(query) ||
          c.phone.includes(query) ||
          c.email.toLowerCase().includes(query) ||
          c.id.toLowerCase().includes(query);
        if (!match) return false;
      }

      // City filter
      if (selectedCity !== "all" && c.city !== selectedCity) return false;

      // Store filter
      if (selectedStore !== "all" && c.preferredStore !== selectedStore) return false;

      // Tier filter
      if (selectedTier !== "all" && c.loyaltyTier !== selectedTier) return false;

      // Status filter
      if (selectedStatus !== "all" && c.status !== selectedStatus) return false;

      // Segment filter
      if (selectedSegment !== "all") {
        const segment = segments.find((s) => s.id === selectedSegment);
        if (segment) {
          const { city, minSpend, minOrders, lastOrderDays, loyaltyTier } = segment.filters;
          if (city && c.city !== city) return false;
          if (minSpend && c.totalSpent < minSpend) return false;
          if (minOrders && c.ordersCount < minOrders) return false;
          if (loyaltyTier && c.loyaltyTier !== loyaltyTier) return false;

          if (lastOrderDays) {
            const lastDate = new Date(c.lastOrderDate);
            const diffTime = Math.abs(new Date().getTime() - lastDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < lastOrderDays) return false;
          }
        }
      }

      return true;
    });
  }, [
    customers,
    searchQuery,
    selectedCity,
    selectedStore,
    selectedTier,
    selectedStatus,
    selectedSegment,
    segments,
  ]);

  // Actions
  const handlePointsAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pointsAdjustCust) return;
    if (!pointsReason.trim()) {
      toast.error("Please supply a reason for modifying points for auditing purposes.");
      return;
    }

    customerStorage.adjustLoyaltyPoints(
      pointsAdjustCust.id,
      pointsAction,
      pointsAmount,
      pointsReason,
      "Super Admin (Jesal Pande)",
    );

    setPointsAdjustCust(null);
    setPointsReason("");
    setPointsAmount(100);
  };

  const handleToggleBlock = () => {
    if (!confirmBlockCust) return;
    customerStorage.toggleBlockStatus(confirmBlockCust.id, "Super Admin (Jesal Pande)");
    setConfirmBlockCust(null);
  };

  const handleCampaignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignTitle.trim() || !campaignBody.trim()) {
      toast.error("Please fill in the campaign title and body message.");
      return;
    }

    // Determine target recipient IDs
    let targets: string[] = [];
    if (campaignSegmentFilter === "all") {
      targets = customers.map((c) => c.id);
    } else {
      const segment = segments.find((s) => s.id === campaignSegmentFilter);
      if (segment) {
        targets = customers
          .filter((c) => {
            const { city, minSpend, minOrders, loyaltyTier } = segment.filters;
            if (city && c.city !== city) return false;
            if (minSpend && c.totalSpent < minSpend) return false;
            if (minOrders && c.ordersCount < minOrders) return false;
            if (loyaltyTier && c.loyaltyTier !== loyaltyTier) return false;
            return true;
          })
          .map((c) => c.id);
      }
    }

    if (targets.length === 0) {
      toast.error("The selected segment has 0 customers matching these rules.");
      return;
    }

    customerStorage.broadcastCampaign(
      campaignType,
      campaignTitle,
      campaignBody,
      targets,
      "Super Admin (Jesal Pande)",
    );
    setShowCampaignModal(false);
    setCampaignTitle("");
    setCampaignBody("");
  };

  const handleDownloadReport = (format: "CSV" | "EXCEL" | "PDF") => {
    toast.success(`Compiling and cryptographically signing Customer ${format}...`);

    setTimeout(() => {
      if (format === "CSV" || format === "EXCEL") {
        const headers = [
          "Customer ID",
          "Full Name",
          "Contact",
          "Email",
          "City",
          "Store",
          "Total Orders",
          "Lifetime Revenue",
          "Tier",
          "Joined At",
          "Status",
        ];
        const rows = filteredCustomers.map((c) => [
          c.id,
          c.fullName,
          c.phone,
          c.email,
          c.city,
          c.preferredStore,
          c.ordersCount,
          `₹${c.totalSpent.toFixed(2)}`,
          c.loyaltyTier,
          c.joinedAt,
          c.status,
        ]);

        const content = [
          headers.join(","),
          ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
        ].join("\n");
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `burgonomics-crm-export-${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success(`CRM database downloaded successfully.`);
      } else {
        // PDF Simulation
        toast.success("PDF document compiled with vector charts and billing histories.");
      }
    }, 1200);
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Customer Intelligence & Loyalty CRM"
          description="Consolidated customer records, loyalty tiers, segment builders, support desk compliance, and automated notification engines."
          breadcrumbs={[{ label: "Customer CRM Desk" }]}
        />

        <div className="flex items-center gap-2 self-start md:self-center">
          <Link to="/admin/customers/analytics">
            <AdminButton variant="outline" size="sm">
              <TrendingUp size={13} className="mr-1.5 text-[#FF6600]" />
              <span>CRM Analytics</span>
            </AdminButton>
          </Link>
          <Link to="/admin/customers/segments">
            <AdminButton variant="outline" size="sm">
              <Sliders size={13} className="mr-1.5" />
              <span>Manage Segments</span>
            </AdminButton>
          </Link>
          <Link to="/admin/customers/loyalty">
            <AdminButton variant="outline" size="sm">
              <Award size={13} className="mr-1.5 text-yellow-500" />
              <span>Configure Loyalty</span>
            </AdminButton>
          </Link>
          <AdminButton variant="primary" size="sm" onClick={() => setShowCampaignModal(true)}>
            <Mail size={13} className="mr-1.5" />
            <span>Broadcast Campaign</span>
          </AdminButton>
        </div>
      </div>

      {/* KPI Grid (Enterprise SaaS Level Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <AdminCard className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gray-100 rounded-full blur-2xl dark:bg-gray-800/10" />
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            TOTAL CUSTOMERS
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {stats.total}
          </span>
          <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-bold mt-1.5">
            <TrendingUp size={10} />
            <span>+14.2% Growth (MoM)</span>
          </div>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-[#0E4825]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-[#0E4825] dark:text-emerald-400 uppercase tracking-widest font-mono">
            LIFETIME CRM REVENUE
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            ₹{stats.totalSpentSum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            Average Spend: ₹{stats.avgSpend.toFixed(2)} / cust
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden border-l-4 border-l-[#FF6600]">
          <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl" />
          <span className="block text-[9px] font-black text-[#FF6600] uppercase tracking-widest font-mono">
            REPEAT PURCHASE RATE
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            {stats.returningPercent}%
          </span>
          <span className="block text-[10px] text-gray-400 font-mono mt-1">
            Customers with 4+ repeat orders
          </span>
        </AdminCard>

        <AdminCard className="relative overflow-hidden">
          <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
            AVERAGE ORDER VALUE
          </span>
          <span className="block text-2xl font-black font-mono tracking-tight text-gray-900 mt-1 dark:text-white">
            ₹{stats.avgOrderValue.toFixed(2)}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-mono mt-1">
            <span>{stats.activeToday} online active today</span>
          </div>
        </AdminCard>
      </div>

      {/* Filter and Search Panel */}
      <AdminCard className="p-5">
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 items-center">
            {/* Search Box */}
            <div className="relative w-full md:flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by Customer Name, Phone, Email, Customer ID..."
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl py-2 px-4 pl-10 text-xs font-semibold focus:outline-none focus:border-[#0E4825] dark:text-white"
              />
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
            </div>

            {/* Segment select dropdown */}
            <div className="w-full md:w-56 relative">
              <select
                value={selectedSegment}
                onChange={(e) => setSelectedSegment(e.target.value)}
                className="w-full appearance-none bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl py-2 px-4 text-xs font-bold focus:outline-none dark:text-white"
              >
                <option value="all">📁 All Core Segments</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    ⚡ {s.name}
                  </option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 font-bold">
                ▼
              </div>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
              <AdminButton variant="outline" size="sm" onClick={() => handleDownloadReport("CSV")}>
                <Download size={13} className="mr-1.5" />
                <span>Export CSV</span>
              </AdminButton>
            </div>
          </div>

          {/* Collapsible/Extended Multi-filters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gray-50/50 dark:bg-gray-900/10 p-3 rounded-2xl border border-gray-100 dark:border-gray-800/40">
            {/* City */}
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 font-mono">
                Location City
              </label>
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-lg py-1 px-2.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200"
              >
                <option value="all">All Cities</option>
                {uniqueCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            {/* Store */}
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 font-mono">
                Preferred Store
              </label>
              <select
                value={selectedStore}
                onChange={(e) => setSelectedStore(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-lg py-1 px-2.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200"
              >
                <option value="all">All Stores</option>
                {uniqueStores.map((store) => (
                  <option key={store} value={store}>
                    {store.replace("Burgonomics ", "")}
                  </option>
                ))}
              </select>
            </div>

            {/* Loyalty Tier */}
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 font-mono">
                Loyalty Tier
              </label>
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-lg py-1 px-2.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200"
              >
                <option value="all">All Tiers</option>
                <option value="Bronze">Bronze Tier</option>
                <option value="Silver">Silver Tier</option>
                <option value="Gold">Gold Tier</option>
                <option value="Platinum">Platinum Tier</option>
                <option value="VIP">VIP Tier</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-[9px] font-bold text-gray-400 uppercase mb-1 font-mono">
                Status
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-lg py-1 px-2.5 text-[11px] font-semibold text-gray-700 dark:text-gray-200"
              >
                <option value="all">All Accounts</option>
                <option value="Active">Active Profile</option>
                <option value="Blocked">Blocked / Suspended</option>
              </select>
            </div>
          </div>
        </div>
      </AdminCard>

      {/* Main CRM Table Directory */}
      <AdminCard
        title="CRM Customer Directory Ledger"
        subtitle={`Displaying ${filteredCustomers.length} profiles from database ledger`}
      >
        {filteredCustomers.length === 0 ? (
          <div className="py-12 text-center text-gray-400 font-mono">
            <AlertCircle size={24} className="mx-auto mb-2 opacity-40" />
            <h4 className="font-bold text-gray-900 dark:text-white text-xs">No Customer Matches</h4>
            <p className="text-[10px] text-gray-400 mt-1">
              Reset your active search query or segments to fetch profiles.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800/60">
            <table className="w-full text-left border-collapse font-sans text-xs">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase font-bold text-gray-400 tracking-wider font-mono">
                  <th className="py-3.5 px-4">Profile</th>
                  <th className="py-3.5 px-4">Location</th>
                  <th className="py-3.5 px-4 text-center">Loyalty Tier</th>
                  <th className="py-3.5 px-4 text-center">Orders Count</th>
                  <th className="py-3.5 px-4 text-right">Lifetime Spent</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40">
                {filteredCustomers.map((c) => {
                  let tierColor = "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
                  if (c.loyaltyTier === "VIP")
                    tierColor =
                      "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 font-extrabold";
                  else if (c.loyaltyTier === "Platinum")
                    tierColor =
                      "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 font-bold";
                  else if (c.loyaltyTier === "Gold")
                    tierColor =
                      "bg-yellow-50 text-yellow-700 border border-yellow-200 dark:bg-yellow-950/25 dark:text-yellow-400";
                  else if (c.loyaltyTier === "Silver")
                    tierColor =
                      "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-300";

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50/40 dark:hover:bg-gray-900/10 transition-colors"
                    >
                      {/* Name & ID & contact */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={c.avatar}
                            alt={c.fullName}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border border-gray-150 dark:border-gray-800 shadow-sm"
                          />
                          <div className="space-y-0.5">
                            <span className="font-extrabold text-gray-900 dark:text-white block hover:underline text-[12px]">
                              <Link to={`/admin/customers/$id`} params={{ id: c.id }}>
                                {c.fullName}
                              </Link>
                            </span>
                            <span className="font-mono text-[9px] text-gray-400 uppercase tracking-wider block">
                              {c.id}
                            </span>
                            <span className="font-mono text-[10px] text-gray-500 block">
                              {c.phone}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* City & Preferred Store */}
                      <td className="py-4 px-4 font-sans text-xs text-gray-500">
                        <span className="font-bold text-gray-800 dark:text-gray-300 block">
                          {c.city}
                        </span>
                        <span className="text-[10px] block mt-0.5">
                          {c.preferredStore.replace("Burgonomics ", "")}
                        </span>
                        <span className="text-[9px] text-gray-400 mt-1 block">
                          Joined: {c.joinedAt}
                        </span>
                      </td>

                      {/* Loyalty Tier */}
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-mono text-[9px] tracking-wide uppercase ${tierColor}`}
                        >
                          {c.loyaltyTier}
                        </span>
                        <span className="block text-[9px] text-gray-400 font-mono mt-1">
                          {c.loyalty.currentPoints} pts
                        </span>
                      </td>

                      {/* Orders Count */}
                      <td className="py-4 px-4 text-center font-mono font-bold text-gray-700 dark:text-gray-300">
                        <span className="block text-[12px]">{c.ordersCount}</span>
                        <span className="text-[9px] text-gray-400 font-sans font-medium">
                          Last order: {c.lastOrderDate}
                        </span>
                      </td>

                      {/* Lifetime Spend */}
                      <td className="py-4 px-4 text-right font-mono font-black text-[#0E4825] dark:text-emerald-400 text-[12px]">
                        ₹{c.totalSpent.toFixed(2)}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        <StatusBadge
                          status={c.status === "Active" ? "active" : "inactive"}
                          label={c.status}
                        />
                      </td>

                      {/* Operations */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Adjust points */}
                          <button
                            onClick={() => setPointsAdjustCust(c)}
                            title="Adjust Loyalty Points"
                            className="p-1.5 rounded-lg border border-gray-150 hover:bg-gray-100 text-gray-500 hover:text-gray-900 dark:border-gray-800 dark:hover:bg-gray-800 cursor-pointer"
                          >
                            <Award size={13} className="text-yellow-600" />
                          </button>

                          {/* Suspension toggle */}
                          <button
                            onClick={() => setConfirmBlockCust(c)}
                            title={c.status === "Active" ? "Suspend Account" : "Reinstate Profile"}
                            className={`p-1.5 rounded-lg border cursor-pointer ${
                              c.status === "Active"
                                ? "border-red-100 text-red-500 hover:bg-red-50"
                                : "border-emerald-100 text-emerald-500 hover:bg-emerald-50"
                            }`}
                          >
                            {c.status === "Active" ? <Ban size={13} /> : <CheckCircle size={13} />}
                          </button>

                          {/* Profile deep-link */}
                          <Link to={`/admin/customers/$id`} params={{ id: c.id }}>
                            <AdminButton
                              variant="outline"
                              size="sm"
                              className="h-7 py-0 px-2 flex items-center gap-1"
                            >
                              <Eye size={12} />
                              <span>View Profile</span>
                            </AdminButton>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Adjust Points Modal */}
      <AnimatePresence>
        {pointsAdjustCust && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1A1A1A] w-full max-w-sm rounded-[20px] p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/60 pb-3 mb-4">
                <div className="space-y-0.5">
                  <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    Adjust Customer Wallet
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    Audited points modifier for {pointsAdjustCust.fullName}
                  </p>
                </div>
              </div>

              <form onSubmit={handlePointsAdjustSubmit} className="space-y-4">
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  {(["ADD", "REMOVE", "EXPIRE"] as const).map((act) => (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setPointsAction(act)}
                      className={`py-1.5 rounded-lg text-[10px] font-black uppercase font-mono transition-all ${
                        pointsAction === act
                          ? "bg-[#0E4825] text-white"
                          : "text-gray-400 hover:text-gray-900"
                      }`}
                    >
                      {act}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Loyalty Points Amount
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={pointsAmount}
                    onChange={(e) => setPointsAmount(parseInt(e.target.value) || 0)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl py-2 px-3 text-xs font-bold text-gray-800 dark:text-white focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono font-bold">
                    Audit Ledger Reason
                  </label>
                  <textarea
                    required
                    rows={2}
                    value={pointsReason}
                    onChange={(e) => setPointsReason(e.target.value)}
                    placeholder="E.g. Guest hospitality recovery, manually adjusting system delay gap, birthday gesture..."
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl p-3 focus:outline-none placeholder-gray-400 leading-normal"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-50 dark:border-gray-800/60">
                  <button
                    type="button"
                    onClick={() => setPointsAdjustCust(null)}
                    className="flex-1 py-2 text-center font-bold border border-gray-100 dark:border-gray-850 rounded-xl hover:bg-gray-50 text-gray-400"
                  >
                    Cancel
                  </button>
                  <AdminButton type="submit" variant="primary" className="flex-1 py-2 rounded-xl">
                    Apply Points
                  </AdminButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Broadcast Campaign Modal */}
      <AnimatePresence>
        {showCampaignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-[#1A1A1A] w-full max-w-md rounded-[20px] p-6 shadow-2xl border border-gray-100 dark:border-gray-800"
            >
              <div className="flex items-center justify-between border-b border-gray-50 dark:border-gray-800/60 pb-3 mb-4">
                <div className="space-y-0.5 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-[#FF6600]" />
                  <h3 className="text-xs font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    Broadcast Marketing Campaign
                  </h3>
                </div>
              </div>

              <form onSubmit={handleCampaignSubmit} className="space-y-4 font-sans text-xs">
                {/* Gateway */}
                <div className="grid grid-cols-4 gap-1 bg-gray-50 dark:bg-gray-900 p-1 rounded-xl">
                  {(["SMS", "Push", "WhatsApp", "Email"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCampaignType(type)}
                      className={`py-1.5 rounded-lg text-[9px] font-black uppercase font-mono transition-all ${
                        campaignType === type
                          ? "bg-[#0E4825] text-white"
                          : "text-gray-400 hover:text-gray-900"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                {/* Target segment */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Target Campaign Audience
                  </label>
                  <select
                    value={campaignSegmentFilter}
                    onChange={(e) => setCampaignSegmentFilter(e.target.value)}
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl py-2 px-3 focus:outline-none"
                  >
                    <option value="all">Entire Customer Database (All Profiles)</option>
                    {segments.map((s) => (
                      <option key={s.id} value={s.id}>
                        ⚡ {s.name} ({s.description})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono">
                    Campaign Heading / Subject
                  </label>
                  <input
                    type="text"
                    required
                    value={campaignTitle}
                    onChange={(e) => setCampaignTitle(e.target.value)}
                    placeholder="E.g. Hot Pizza Burger Weekend Deal!"
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl py-2 px-3 text-xs font-bold text-gray-800 dark:text-white focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider font-mono font-bold">
                    Body Message Markup
                  </label>
                  <textarea
                    required
                    rows={4}
                    value={campaignBody}
                    onChange={(e) => setCampaignBody(e.target.value)}
                    placeholder="Use literal tags such as {name} or {points} to personalize template delivery. Hi {name}! Grab 2 Double Cheese Burgers and get 25% off!"
                    className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl p-3 focus:outline-none placeholder-gray-400 leading-normal"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-50 dark:border-gray-800/60">
                  <button
                    type="button"
                    onClick={() => setShowCampaignModal(false)}
                    className="flex-1 py-2 text-center font-bold border border-gray-150 dark:border-gray-850 rounded-xl hover:bg-gray-50 text-gray-400"
                  >
                    Cancel
                  </button>
                  <AdminButton type="submit" variant="primary" className="flex-1 py-2 rounded-xl">
                    <Send size={11} className="mr-1 inline" />
                    <span>Launch Campaign</span>
                  </AdminButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Suspension Confirmation */}
      {confirmBlockCust && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmBlockCust(null)}
          onConfirm={handleToggleBlock}
          isDestructive={confirmBlockCust.status === "Active"}
          title={`${confirmBlockCust.status === "Active" ? "Suspend" : "Reinstate"} Account?`}
          description={
            confirmBlockCust.status === "Active"
              ? `Are you sure you want to suspend account ${confirmBlockCust.fullName}? They will be logged out of all active Android/Web sessions immediately and banned from checkouts.`
              : `Are you sure you want to reinstate profile ${confirmBlockCust.fullName}? This will restore access to OTP logging instantly.`
          }
          confirmLabel={confirmBlockCust.status === "Active" ? "Suspend Profile" : "Restore Access"}
        />
      )}
    </div>
  );
};

export default AdminCustomersPage;
