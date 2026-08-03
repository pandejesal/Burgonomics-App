import React, { useState, useEffect, useMemo } from "react";
import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  User,
  MapPin,
  Mail,
  Phone,
  Calendar,
  Languages,
  Award,
  ShoppingBag,
  CreditCard,
  Percent,
  Bell,
  MessageSquare,
  History,
  AlertTriangle,
  FileText,
  Save,
  Send,
  Plus,
  Ban,
  CheckCircle,
  ExternalLink,
  Gift,
  HelpCircle,
  Cpu,
  Sparkles,
  Map,
  Clock,
  Briefcase,
  Home,
  Check,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { StatusBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/Utilities";
import { customerStorage, CustomerProfile, AddressSnapshot } from "./customersData";
import { toast } from "sonner";

export const AdminCustomerProfilePage: React.FC = () => {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();

  // Load profile from storage
  const [profile, setProfile] = useState<CustomerProfile | undefined>(
    customerStorage.getCustomerById(id),
  );

  useEffect(() => {
    const sub = customerStorage.subscribe(() => {
      setProfile(customerStorage.getCustomerById(id));
    });
    return () => {
      sub();
    };
  }, [id]);

  // Tab State
  const [activeTab, setActiveTab] = useState<
    "loyalty" | "orders" | "payments" | "coupons" | "notifications" | "support" | "audit"
  >("loyalty");

  // Notes Form State
  const [notesText, setNotesText] = useState(profile?.notes || "");
  useEffect(() => {
    if (profile) {
      setNotesText(profile.notes);
    }
  }, [profile]);

  // Points adjust form state
  const [pointsAction, setPointsAction] = useState<"ADD" | "REMOVE" | "EXPIRE">("ADD");
  const [pointsAmount, setPointsAmount] = useState(100);
  const [pointsReason, setPointsReason] = useState("");

  // Forced tier adjust form state
  const [selectedTier, setSelectedTier] = useState<
    "Bronze" | "Silver" | "Gold" | "Platinum" | "VIP"
  >("Bronze");
  useEffect(() => {
    if (profile) {
      setSelectedTier(profile.loyaltyTier);
    }
  }, [profile]);

  // Direct Message Modal State
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [msgGateway, setMsgGateway] = useState<"SMS" | "Push" | "WhatsApp" | "Email">("WhatsApp");
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");

  // Coupon issue form state
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState("₹150 FLAT OFF");
  const [couponSource, setCouponSource] = useState("Campaign");

  // Block Dialog State
  const [showBlockDialog, setShowBlockDialog] = useState(false);

  // AI-Generated Customer Summary (Dynamic, zero-hallucinations, purely calculated from record variables)
  const aiSummary = useMemo(() => {
    if (!profile) return "";
    const orders = profile.ordersCount;
    const spent = profile.totalSpent;
    const tier = profile.loyaltyTier;
    const language = profile.preferredLanguage;
    const city = profile.city;
    const store = profile.preferredStore;
    const status = profile.status;

    let segmentStr = "";
    if (spent > 12000 || tier === "VIP" || tier === "Platinum") {
      segmentStr = "Highly profitable VIP Cohort";
    } else if (orders > 10) {
      segmentStr = "High retention Steady Spender";
    } else if (orders === 0) {
      segmentStr = "Newly onboarded lead";
    } else {
      segmentStr = "Moderate frequency casual consumer";
    }

    let churnRisk = "Very Low Churn Risk";
    if (orders > 0) {
      const lastDate = new Date(profile.lastOrderDate);
      const daysDiff = Math.ceil(Math.abs(Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 90) churnRisk = "Critically At-Risk (Last order 90+ days ago)";
      else if (daysDiff > 45) churnRisk = "Medium Churn Risk (Inactive over 45 days)";
    }

    return `AI Insights: ${profile.fullName} is a ${segmentStr} from ${city} who has checked out ${orders} times spending ₹${spent.toFixed(2)}. Preferred kitchen is "${store.replace("Burgonomics ", "")}". Standard support risk index is healthy, and client is flagged as ${churnRisk}. Prefers interface interactions in ${language}.`;
  }, [profile]);

  // Fallback if customer ID is stale/missing
  if (!profile) {
    return (
      <div className="py-12 text-center font-mono space-y-4">
        <AlertTriangle size={32} className="mx-auto text-red-500 animate-pulse" />
        <h3 className="text-sm font-black text-gray-900 uppercase">Customer Profile Not Found</h3>
        <p className="text-xs text-gray-400">
          The requested profile reference "{id}" does not exist in the CRM database.
        </p>
        <Link to="/admin/customers">
          <AdminButton variant="outline" size="sm" className="mt-4">
            <ArrowLeft size={12} className="mr-1.5" />
            <span>Back to CRM Directory</span>
          </AdminButton>
        </Link>
      </div>
    );
  }

  // Handlers
  const handleSaveNotes = () => {
    customerStorage.updateCustomerNotes(profile.id, notesText, "Super Admin (Jesal Pande)");
  };

  const handleAdjustPointsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pointsReason.trim()) {
      toast.error("Please specify a reason for point ledger audit.");
      return;
    }
    customerStorage.adjustLoyaltyPoints(
      profile.id,
      pointsAction,
      pointsAmount,
      pointsReason,
      "Super Admin (Jesal Pande)",
    );
    setPointsReason("");
    setPointsAmount(100);
  };

  const handleForcedTierSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    customerStorage.adjustLoyaltyTier(profile.id, selectedTier, "Super Admin (Jesal Pande)");
  };

  const handleIssueCouponSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!couponCode.trim()) {
      toast.error("Coupon code cannot be empty.");
      return;
    }
    customerStorage.issueCoupon(
      profile.id,
      { code: couponCode, discount: couponDiscount, source: couponSource },
      "Super Admin (Jesal Pande)",
    );
    setCouponCode("");
  };

  const handleSendMessageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgTitle.trim() || !msgBody.trim()) {
      toast.error("Subject and body fields are required.");
      return;
    }
    customerStorage.sendDirectNotification(
      profile.id,
      { type: msgGateway, title: msgTitle, body: msgBody },
      "Super Admin (Jesal Pande)",
    );
    setShowMessageModal(false);
    setMsgTitle("");
    setMsgBody("");
  };

  const handleToggleBlock = () => {
    customerStorage.toggleBlockStatus(profile.id, "Super Admin (Jesal Pande)");
    setShowBlockDialog(false);
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title={`CRM Dossier: ${profile.fullName}`}
          description={`Comprehensive CRM intelligence, transactional records, and loyalty wallets for ID: ${profile.id}`}
          breadcrumbs={[
            { label: "Customer CRM", to: "/admin/customers" },
            { label: profile.fullName },
          ]}
        />

        <div className="flex items-center gap-2 self-start md:self-center">
          <Link to="/admin/customers">
            <AdminButton variant="outline" size="sm">
              <ArrowLeft size={13} className="mr-1.5" />
              <span>Back to Directory</span>
            </AdminButton>
          </Link>
          <AdminButton variant="outline" size="sm" onClick={() => setShowMessageModal(true)}>
            <Send size={13} className="mr-1.5 text-[#FF6600]" />
            <span>Send Message</span>
          </AdminButton>
          <AdminButton
            variant={profile.status === "Active" ? "outline" : "primary"}
            size="sm"
            onClick={() => setShowBlockDialog(true)}
            className={
              profile.status === "Active"
                ? "border-red-200 text-red-500 hover:bg-red-50/50"
                : "bg-emerald-700 text-white"
            }
          >
            {profile.status === "Active" ? (
              <Ban size={13} className="mr-1.5" />
            ) : (
              <CheckCircle size={13} className="mr-1.5" />
            )}
            <span>{profile.status === "Active" ? "Suspend Account" : "Reinstate Profile"}</span>
          </AdminButton>
        </div>
      </div>

      {/* AI Intelligence Insights Banner (Cosmic/Green Sparkle Theme) */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-emerald-950 text-emerald-50 rounded-[20px] p-4.5 border border-emerald-800 relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#FF6600]/10 rounded-full blur-2xl" />
        <div className="flex items-center gap-3 relative z-10">
          <div className="p-2.5 bg-emerald-900 rounded-xl text-emerald-300 border border-emerald-850 shrink-0">
            <Cpu size={16} className="animate-pulse" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black tracking-widest text-[#FF6600] uppercase font-mono">
                BURGONOMICS CORE AI
              </span>
              <Sparkles size={11} className="text-[#FF6600]" />
            </div>
            <p className="font-semibold text-emerald-100 leading-relaxed text-[11.5px] max-w-4xl">
              {aiSummary}
            </p>
          </div>
        </div>
        <div className="shrink-0 relative z-10">
          <span className="text-[9px] font-mono px-2.5 py-1 bg-emerald-900/60 rounded-full text-emerald-400 border border-emerald-800">
            CHURN INDEX:{" "}
            <span className="font-extrabold text-white">
              {profile.loyaltyTier === "VIP" || profile.ordersCount > 15 ? "STABLE" : "MONITOR"}
            </span>
          </span>
        </div>
      </motion.div>

      {/* Dual Split Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Profile info, addresses, editable notes (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card 1: Basic Profile File */}
          <AdminCard className="p-5">
            <div className="flex flex-col items-center text-center border-b border-gray-100 dark:border-gray-800/60 pb-5">
              <div className="relative">
                <img
                  src={profile.avatar}
                  alt={profile.fullName}
                  referrerPolicy="no-referrer"
                  className="w-24 h-24 rounded-full object-cover border-4 border-[#0E4825]/15 shadow-sm"
                />
                <span
                  className={`absolute bottom-0 right-1 w-4 h-4 rounded-full border-2 border-white dark:border-[#1A1A1A] ${
                    profile.status === "Active" ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
              </div>
              <h2 className="text-sm font-black text-gray-900 dark:text-white mt-3 font-mono tracking-tight">
                {profile.fullName}
              </h2>
              <p className="text-[9px] font-mono text-gray-400 uppercase tracking-widest mt-0.5">
                {profile.id}
              </p>
              <div className="mt-2.5">
                <StatusBadge
                  status={profile.status === "Active" ? "active" : "inactive"}
                  label={profile.status}
                />
              </div>
            </div>

            <div className="mt-5 space-y-3.5">
              <div className="flex items-center gap-3">
                <Phone size={13} className="text-gray-400 shrink-0" />
                <div className="space-y-0.5">
                  <span className="text-[9px] block text-gray-400 uppercase font-mono font-bold">
                    Phone Number
                  </span>
                  <span className="font-mono font-bold text-gray-800 dark:text-gray-300">
                    {profile.phone}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Mail size={13} className="text-gray-400 shrink-0" />
                <div className="space-y-0.5">
                  <span className="text-[9px] block text-gray-400 uppercase font-mono font-bold">
                    Email Address
                  </span>
                  <span className="font-mono font-bold text-gray-800 dark:text-gray-300">
                    {profile.email}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800/40">
                <div className="flex items-center gap-2">
                  <Calendar size={13} className="text-gray-400 shrink-0" />
                  <div>
                    <span className="text-[8px] block text-gray-400 uppercase font-mono font-bold">
                      Birthday
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-gray-300">
                      {profile.birthday}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <User size={13} className="text-gray-400 shrink-0" />
                  <div>
                    <span className="text-[8px] block text-gray-400 uppercase font-mono font-bold">
                      Gender
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-gray-300">
                      {profile.gender}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-gray-800/40">
                <div className="flex items-center gap-2">
                  <Languages size={13} className="text-gray-400 shrink-0" />
                  <div>
                    <span className="text-[8px] block text-gray-400 uppercase font-mono font-bold">
                      Language
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-gray-300">
                      {profile.preferredLanguage}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={13} className="text-gray-400 shrink-0" />
                  <div>
                    <span className="text-[8px] block text-gray-400 uppercase font-mono font-bold">
                      City
                    </span>
                    <span className="font-semibold text-gray-800 dark:text-gray-300">
                      {profile.city}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-3.5 border-t border-gray-100 dark:border-gray-800/40 text-[10px] text-gray-400 font-mono flex justify-between">
                <span>Registration Date:</span>
                <span className="font-bold text-gray-700 dark:text-gray-300">
                  {profile.joinedAt}
                </span>
              </div>
            </div>
          </AdminCard>

          {/* Card 2: Interactive Notes box with Save */}
          <AdminCard title="Internal CRM File Notes" subtitle="Private operator tags & audit flags">
            <div className="space-y-3">
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="E.g. VIP guest likes extra sauce cup. Blocked address alternate handles..."
                rows={4}
                className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-850 p-3 rounded-xl focus:outline-none placeholder-gray-400 text-xs font-semibold leading-relaxed"
              />
              <AdminButton variant="primary" size="sm" onClick={handleSaveNotes} className="w-full">
                <Save size={12} className="mr-1.5" />
                <span>Save Notes Dossier</span>
              </AdminButton>
            </div>
          </AdminCard>

          {/* Card 3: Address coordinate list */}
          <AdminCard
            title="Saved Addresses"
            subtitle={`Saved physical outlets (${profile.addresses.length})`}
          >
            {profile.addresses.length === 0 ? (
              <span className="block py-4 text-center text-gray-400 font-mono text-[10px]">
                No delivery addresses registered.
              </span>
            ) : (
              <div className="space-y-3">
                {profile.addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={`p-3 rounded-xl border border-gray-100 dark:border-gray-800/50 relative overflow-hidden ${
                      addr.isDefault
                        ? "bg-emerald-50/20 border-emerald-100 dark:bg-emerald-950/10"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      {addr.label === "Home" ? (
                        <Home size={12} className="text-[#0E4825]" />
                      ) : (
                        <Briefcase size={12} className="text-[#FF6600]" />
                      )}
                      <span className="font-black text-gray-800 dark:text-white uppercase font-mono tracking-wider text-[10px]">
                        {addr.label}
                      </span>
                      {addr.isDefault && (
                        <span className="text-[8px] font-mono px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded dark:bg-emerald-900/30 dark:text-emerald-300">
                          DEFAULT
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 font-sans text-xs text-gray-600 dark:text-gray-300 leading-relaxed font-semibold">
                      <p className="font-extrabold text-gray-900 dark:text-white">
                        {addr.contactName} ({addr.contactPhone})
                      </p>
                      <p>
                        {addr.line1}, {addr.line2}
                      </p>
                      <p>
                        {addr.city} - {addr.pincode}
                      </p>
                    </div>

                    <div className="mt-2.5 pt-2 border-t border-gray-50 dark:border-gray-850/60 flex justify-between items-center text-[10px]">
                      <span className="font-mono text-gray-400 text-[9px]">
                        Lat/Lng: {addr.coords}
                      </span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.coords)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#FF6600] font-bold flex items-center gap-0.5 hover:underline"
                      >
                        <Map size={10} />
                        <span>Google Maps</span>
                        <ExternalLink size={8} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminCard>
        </div>

        {/* RIGHT COLUMN: Tabs Workspace (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Tabs header list */}
          <div className="flex items-center gap-1 border-b border-gray-100 dark:border-gray-800/40 pb-px overflow-x-auto">
            {[
              { id: "loyalty", label: "Loyalty Wallet", icon: Award },
              { id: "orders", label: "Orders Ledger", icon: ShoppingBag },
              { id: "payments", label: "Payments Ledger", icon: CreditCard },
              { id: "coupons", label: "Promo Coupons", icon: Percent },
              { id: "notifications", label: "Notifications Logs", icon: Bell },
              { id: "support", label: "Support Cases", icon: HelpCircle },
              { id: "audit", label: "Audit Trails", icon: History },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`py-2 px-3.5 rounded-t-xl text-[10.5px] font-black uppercase font-mono border-t border-x border-transparent shrink-0 flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-white dark:bg-[#1A1A1A] text-[#0E4825] border-gray-100 dark:border-gray-800/60 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]"
                      : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
                  }`}
                >
                  <Icon size={12} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="bg-white dark:bg-[#1A1A1A] p-5 rounded-[20px] border border-gray-100 dark:border-gray-800/40 min-h-[350px]">
            {/* Active Tab rendering */}
            {activeTab === "loyalty" && (
              <div className="space-y-6">
                {/* Points overview cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10">
                    <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                      CURRENT BALANCE
                    </span>
                    <span className="block text-xl font-mono font-black text-[#0E4825] dark:text-emerald-400 mt-1">
                      {profile.loyalty.currentPoints} pts
                    </span>
                    {profile.loyalty.pointsExpiring > 0 && (
                      <span className="text-[9px] text-orange-600 block mt-1 font-mono">
                        ⚠️ {profile.loyalty.pointsExpiring} pts expire on{" "}
                        {profile.loyalty.expiringDate}
                      </span>
                    )}
                  </div>
                  <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10">
                    <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                      LIFETIME ACCUMULATED
                    </span>
                    <span className="block text-xl font-mono font-black text-gray-900 mt-1 dark:text-white">
                      {profile.loyalty.lifetimePoints} pts
                    </span>
                  </div>
                  <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/10">
                    <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                      ACTIVE TIER
                    </span>
                    <span className="block text-xl font-mono font-black text-purple-700 mt-1 dark:text-purple-400 uppercase">
                      {profile.loyaltyTier}
                    </span>
                  </div>
                </div>

                {/* Tier progress bar */}
                {profile.loyaltyTier !== "VIP" && (
                  <div className="space-y-1.5 p-4 rounded-xl border border-emerald-100 bg-emerald-50/10 dark:border-emerald-950/40">
                    <div className="flex justify-between items-center text-[10px] font-mono">
                      <span className="text-[#0E4825] font-extrabold">Next Tier Progression</span>
                      <span className="font-bold">{profile.loyalty.tierProgress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden dark:bg-gray-800">
                      <div
                        className="bg-[#0E4825] h-full"
                        style={{ width: `${profile.loyalty.tierProgress}%` }}
                      />
                    </div>
                    <span className="block text-[9px] text-gray-400">
                      Earn more points to unlock higher cashback multipliers and direct KOT VIP
                      priority!
                    </span>
                  </div>
                )}

                {/* Operations: Points adjuster & Tier overrides */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-50 dark:border-gray-850/60">
                  {/* points modifier */}
                  <form onSubmit={handleAdjustPointsSubmit} className="space-y-3.5">
                    <h4 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white border-l-2 border-l-[#FF6600] pl-2">
                      Point Adjuster Audit
                    </h4>

                    <div className="grid grid-cols-3 gap-1 bg-gray-50 dark:bg-gray-900 p-0.5 rounded-lg">
                      {(["ADD", "REMOVE", "EXPIRE"] as const).map((act) => (
                        <button
                          key={act}
                          type="button"
                          onClick={() => setPointsAction(act)}
                          className={`py-1 rounded text-[9px] font-black uppercase font-mono ${
                            pointsAction === act
                              ? "bg-[#0E4825] text-white"
                              : "text-gray-400 hover:text-gray-900"
                          }`}
                        >
                          {act}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <div className="w-1/3">
                        <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                          Points
                        </label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={pointsAmount}
                          onChange={(e) => setPointsAmount(parseInt(e.target.value) || 0)}
                          className="w-full bg-gray-50 border border-gray-150 p-1.5 rounded-lg focus:outline-none font-bold text-xs font-mono text-gray-800 dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                          Audit Reason log
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="Manually adjusting delay mistake, guest gesture..."
                          value={pointsReason}
                          onChange={(e) => setPointsReason(e.target.value)}
                          className="w-full bg-gray-50 border border-gray-150 p-1.5 rounded-lg focus:outline-none text-xs font-semibold placeholder-gray-400 dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                        />
                      </div>
                    </div>

                    <AdminButton type="submit" variant="primary" size="sm" className="w-full">
                      Apply Wallet Adjustment
                    </AdminButton>
                  </form>

                  {/* Tier Override */}
                  <form onSubmit={handleForcedTierSubmit} className="space-y-3.5">
                    <h4 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white border-l-2 border-l-[#0E4825] pl-2">
                      Tier Level Overrides
                    </h4>
                    <div>
                      <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                        Loyalty Tier Rank
                      </label>
                      <select
                        value={selectedTier}
                        onChange={(e) => setSelectedTier(e.target.value as any)}
                        className="w-full bg-gray-50 border border-gray-150 p-1.5 rounded-lg focus:outline-none text-xs font-bold dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                      >
                        <option value="Bronze">Bronze (Baseline)</option>
                        <option value="Silver">Silver (500 pts)</option>
                        <option value="Gold">Gold (1500 pts)</option>
                        <option value="Platinum">Platinum (3000 pts)</option>
                        <option value="VIP">VIP Elite (5000 pts)</option>
                      </select>
                    </div>
                    <span className="block text-[9px] text-gray-400 font-medium">
                      Forcing manual tier upgrades will override current baseline point thresholds
                      and instantly generate high-cashback codes for customer account.
                    </span>
                    <AdminButton
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="w-full mt-1.5"
                    >
                      Forcibly Set Tier
                    </AdminButton>
                  </form>
                </div>

                {/* Loyalty History table */}
                <div className="space-y-3 pt-4 border-t border-gray-50 dark:border-gray-850/60">
                  <h4 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white">
                    Wallet Points Activity Log
                  </h4>
                  {profile.loyalty.history.length === 0 ? (
                    <span className="block text-center py-4 text-gray-400 font-mono text-[10px]">
                      No wallet activity registered yet.
                    </span>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-gray-50 dark:border-gray-800">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-gray-50/60 dark:bg-gray-900/40 border-b border-gray-50 text-[9px] uppercase font-bold text-gray-400 tracking-wider font-mono">
                            <th className="py-2 px-3">Log ID</th>
                            <th className="py-2 px-3">Date</th>
                            <th className="py-2 px-3">Action</th>
                            <th className="py-2 px-3 text-right">Points</th>
                            <th className="py-2 px-3">Description</th>
                            <th className="py-2 px-3">Operator</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40">
                          {profile.loyalty.history.map((h) => (
                            <tr key={h.id} className="text-[11px] font-semibold">
                              <td className="py-2 px-3 font-mono text-gray-400">{h.id}</td>
                              <td className="py-2 px-3 text-gray-500">{h.date}</td>
                              <td className="py-2 px-3 uppercase">
                                <span
                                  className={`px-1.5 py-0.2 rounded font-mono text-[9px] ${
                                    h.action === "ADD"
                                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20"
                                      : "bg-red-50 text-red-600 dark:bg-red-950/20"
                                  }`}
                                >
                                  {h.action}
                                </span>
                              </td>
                              <td
                                className={`py-2 px-3 text-right font-mono font-black ${
                                  h.action === "ADD" ? "text-emerald-600" : "text-red-500"
                                }`}
                              >
                                {h.action === "ADD" ? "+" : "-"}
                                {h.points}
                              </td>
                              <td className="py-2 px-3 text-gray-600 dark:text-gray-300 font-sans max-w-xs truncate">
                                {h.description}
                              </td>
                              <td className="py-2 px-3 text-gray-500">{h.operator}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "orders" && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white">
                  Orders Ledger Dossier
                </h3>
                <span className="block text-[10px] text-gray-400 leading-normal mb-3">
                  Below represents real-time checkout summaries from this client profile connected
                  over PETPOOJA POS queues.
                </span>

                {profile.ordersCount === 0 ? (
                  <span className="block text-center py-10 text-gray-400 font-mono text-[10px]">
                    No orders logged for this client profile.
                  </span>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-50 dark:border-gray-800">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50/60 dark:bg-gray-900/40 border-b border-gray-50 text-[9px] uppercase font-bold text-gray-400 tracking-wider font-mono">
                          <th className="py-2.5 px-3">Order ID</th>
                          <th className="py-2.5 px-3">Fulfillment</th>
                          <th className="py-2.5 px-3">Kitchen Store</th>
                          <th className="py-2.5 px-3 text-center">Items</th>
                          <th className="py-2.5 px-3 text-right">Grand Total</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40">
                        {/* We inject beautiful mock orders matching their profile */}
                        {[
                          {
                            id: `BUR-${8200 + profile.ordersCount}`,
                            date: profile.lastOrderDate,
                            store: profile.preferredStore,
                            fulfillment: "delivery",
                            total: profile.totalSpent / profile.ordersCount,
                            items: "Double Cheese Combo",
                            status: "Completed",
                          },
                          {
                            id: `BUR-${7100 + profile.ordersCount}`,
                            date: "2026-06-10",
                            store: profile.preferredStore,
                            fulfillment: "takeaway",
                            total: 420.0,
                            items: "Pizza Burger Meal",
                            status: "Completed",
                          },
                        ]
                          .slice(0, profile.ordersCount)
                          .map((ord) => (
                            <tr
                              key={ord.id}
                              className="text-[11px] font-semibold text-gray-700 dark:text-gray-300"
                            >
                              <td className="py-3 px-3">
                                <span className="font-mono font-bold text-gray-900 dark:text-white block">
                                  {ord.id}
                                </span>
                                <span className="text-[9px] text-gray-400 font-mono">
                                  {ord.date}
                                </span>
                              </td>
                              <td className="py-3 px-3 uppercase font-mono text-[10px]">
                                {ord.fulfillment}
                              </td>
                              <td className="py-3 px-3 font-sans">
                                {ord.store.replace("Burgonomics ", "")}
                              </td>
                              <td className="py-3 px-3 text-center font-sans font-medium text-gray-500">
                                {ord.items}
                              </td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-[#0E4825] dark:text-emerald-400">
                                ₹{ord.total.toFixed(2)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-full font-mono text-[9px] bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-100">
                                  {ord.status.toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "payments" && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white">
                  Payments Settlement Log
                </h3>
                <span className="block text-[10px] text-gray-400 leading-normal mb-3">
                  Reconciliation payment gateway payloads matching Razorpay/PhonePe.
                </span>

                {profile.ordersCount === 0 ? (
                  <span className="block text-center py-10 text-gray-400 font-mono text-[10px]">
                    No payment records detected.
                  </span>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-50 dark:border-gray-800">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-gray-50/60 dark:bg-gray-900/40 border-b border-gray-50 text-[9px] uppercase font-bold text-gray-400 tracking-wider font-mono">
                          <th className="py-2.5 px-3">Gateway ID</th>
                          <th className="py-2.5 px-3">Associated Order</th>
                          <th className="py-2.5 px-3">Provider</th>
                          <th className="py-2.5 px-3 text-right">Settled Amount</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800/40">
                        {[
                          {
                            id: "pay_Rzp110294da189",
                            order: `BUR-${8200 + profile.ordersCount}`,
                            provider: "Razorpay (Cards)",
                            amount: profile.totalSpent / profile.ordersCount,
                            status: "CAPTURED",
                          },
                          {
                            id: "pay_UPI290141938bda",
                            order: `BUR-${7100 + profile.ordersCount}`,
                            provider: "PhonePe UPI",
                            amount: 420.0,
                            status: "CAPTURED",
                          },
                        ]
                          .slice(0, profile.ordersCount)
                          .map((p) => (
                            <tr
                              key={p.id}
                              className="text-[11px] font-semibold text-gray-700 dark:text-gray-300"
                            >
                              <td className="py-3 px-3">
                                <span className="font-mono font-bold text-gray-900 dark:text-white block">
                                  {p.id}
                                </span>
                                <span className="text-[9px] text-gray-400 font-mono">
                                  Captured: Instant
                                </span>
                              </td>
                              <td className="py-3 px-3 font-mono font-bold">{p.order}</td>
                              <td className="py-3 px-3 text-gray-500 font-mono">{p.provider}</td>
                              <td className="py-3 px-3 text-right font-mono font-bold text-gray-800 dark:text-gray-300">
                                ₹{p.amount.toFixed(2)}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="px-2 py-0.5 rounded-full font-mono text-[9px] bg-emerald-100 text-emerald-800 font-extrabold uppercase">
                                  {p.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === "coupons" && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Coupon directory */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white">
                      Promo & Coupons Available
                    </h3>
                    {profile.coupons.length === 0 ? (
                      <span className="block text-center py-8 text-gray-400 font-mono text-[10px]">
                        No coupons assigned.
                      </span>
                    ) : (
                      <div className="space-y-3">
                        {profile.coupons.map((cp) => (
                          <div
                            key={cp.code}
                            className={`p-3 rounded-xl border border-dashed flex justify-between items-center relative overflow-hidden ${
                              cp.status === "Available"
                                ? "bg-orange-50/10 border-orange-200 dark:border-orange-950/40"
                                : "bg-gray-50/50 border-gray-150 text-gray-400 dark:border-gray-850"
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`font-mono font-black text-xs px-2 py-0.5 rounded ${
                                    cp.status === "Available"
                                      ? "bg-orange-100 text-[#FF6600]"
                                      : "bg-gray-100 text-gray-400"
                                  }`}
                                >
                                  {cp.code}
                                </span>
                                <span className="text-[9px] font-mono text-gray-400">
                                  ({cp.source})
                                </span>
                              </div>
                              <span className="text-xs font-black block text-gray-900 dark:text-white">
                                {cp.discount}
                              </span>
                              {cp.status === "Used" && (
                                <span className="text-[9px] text-gray-400 block font-mono">
                                  Used on: {cp.usedAt}
                                </span>
                              )}
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase font-black tracking-wide ${
                                cp.status === "Available"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                  : cp.status === "Used"
                                    ? "bg-slate-50 text-slate-500 border border-slate-100"
                                    : "bg-red-50 text-red-500 border border-red-100"
                              }`}
                            >
                              {cp.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Coupon issuer */}
                  <form
                    onSubmit={handleIssueCouponSubmit}
                    className="space-y-4 border-l border-gray-50 dark:border-gray-800/40 pl-6"
                  >
                    <h3 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white flex items-center gap-1">
                      <Gift size={12} className="text-[#FF6600]" />
                      <span>Issue Custom Coupon Promo</span>
                    </h3>
                    <p className="text-[10px] text-gray-400 leading-normal">
                      Manually issue direct discount promotions applicable onto checkout carts
                      instantly.
                    </p>

                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                        Unique Promo Code
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="E.g. SORRY200, ARJUNVIP"
                        value={couponCode}
                        onChange={(e) => setCouponCode(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-150 p-2 rounded-lg font-mono font-bold focus:outline-none dark:bg-gray-900 dark:border-gray-800 dark:text-white uppercase"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                        Discount Structure Value
                      </label>
                      <select
                        value={couponDiscount}
                        onChange={(e) => setCouponDiscount(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-150 p-2 rounded-lg focus:outline-none text-xs font-bold dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                      >
                        <option value="₹150 FLAT OFF">₹150 Flat Off (Cart min ₹350)</option>
                        <option value="20% FLAT OFF">20% Flat Discount (Max cap ₹100)</option>
                        <option value="100% OFF (FREE MEAL)">
                          100% Coupon (Free burger reward)
                        </option>
                        <option value="FREE SHIPPING">Free Shipping (Fulfillment rebate)</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                        Distribution source tagging
                      </label>
                      <select
                        value={couponSource}
                        onChange={(e) => setCouponSource(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-150 p-2 rounded-lg focus:outline-none text-xs font-bold dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                      >
                        <option value="Service Recovery">
                          Service Recovery (Manual intervention)
                        </option>
                        <option value="Loyalty Reward">Loyalty reward override</option>
                        <option value="Birthday Gift">Birthday hospitality offering</option>
                        <option value="Referral reward">Referral campaign incentive</option>
                      </select>
                    </div>

                    <AdminButton type="submit" variant="primary" size="sm" className="w-full">
                      Issue Coupon Code
                    </AdminButton>
                  </form>
                </div>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white">
                  Notification & Messaging Logs
                </h3>
                <span className="block text-[10px] text-gray-400 leading-normal">
                  Outgoing communication history pushed over Burgonomics server gateways.
                </span>

                {profile.notifications.length === 0 ? (
                  <span className="block text-center py-8 text-gray-400 font-mono text-[10px]">
                    No notification dispatches registered.
                  </span>
                ) : (
                  <div className="space-y-3.5">
                    {profile.notifications.map((n) => (
                      <div
                        key={n.id}
                        className="p-3.5 rounded-xl border border-gray-50 bg-gray-50/30 dark:border-gray-850 dark:bg-gray-900/5"
                      >
                        <div className="flex justify-between items-start mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.2 rounded font-mono text-[8.5px] uppercase font-black bg-[#0E4825] text-white">
                              {n.type}
                            </span>
                            <span className="font-mono text-gray-400 text-[9px]">{n.id}</span>
                          </div>
                          <span className="text-[9px] font-mono text-gray-400">{n.sentAt}</span>
                        </div>
                        <h4 className="font-extrabold text-gray-900 dark:text-white text-xs mb-1">
                          {n.title}
                        </h4>
                        <p className="text-gray-600 dark:text-gray-300 leading-relaxed font-semibold font-sans">
                          {n.body}
                        </p>
                        <div className="mt-2 text-right">
                          <span className="text-[8.5px] font-mono font-bold uppercase text-emerald-600 dark:text-emerald-400">
                            ● {n.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "support" && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white">
                  Support Compliance Desk
                </h3>
                <span className="block text-[10px] text-gray-400 leading-normal mb-3">
                  Auditing guest grievance claims, resolution logs, and delay reimbursements.
                </span>

                {profile.supportHistory.length === 0 ? (
                  <div className="text-center py-10 font-mono space-y-1.5">
                    <CheckCircle size={20} className="mx-auto text-emerald-600" />
                    <span className="block text-gray-400 text-[10px]">
                      Pristine Record: 0 Active complaints logged
                    </span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {profile.supportHistory.map((sup) => (
                      <div
                        key={sup.id}
                        className="p-4 rounded-xl border border-red-50/60 bg-red-50/5 dark:border-red-950/20 dark:bg-red-950/5"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-mono text-[9px] text-gray-400">
                            {sup.id} · {sup.date}
                          </span>
                          <span
                            className={`px-2 py-0.2 rounded-full font-mono text-[9px] font-black uppercase ${
                              sup.status === "Resolved"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                                : "bg-red-50 text-red-700 border border-red-100 animate-pulse"
                            }`}
                          >
                            {sup.status}
                          </span>
                        </div>
                        <h4 className="text-xs font-extrabold text-gray-900 dark:text-white font-mono uppercase tracking-tight">
                          {sup.type}
                        </h4>
                        <p className="text-gray-700 dark:text-gray-300 font-sans mt-1.5 leading-relaxed font-semibold">
                          {sup.description}
                        </p>

                        {sup.resolution && (
                          <div className="mt-3.5 p-2.5 bg-emerald-50/20 border border-emerald-100/50 rounded-lg dark:bg-emerald-950/10">
                            <span className="text-[8px] font-bold text-emerald-700 uppercase font-mono tracking-widest block mb-1">
                              CRM Resolution Plan
                            </span>
                            <p className="text-gray-600 dark:text-gray-300 font-sans font-semibold">
                              {sup.resolution}
                            </p>
                          </div>
                        )}

                        {sup.internalNotes && (
                          <div className="mt-2 p-2 bg-gray-50/50 rounded-lg text-gray-500 border border-gray-100 dark:bg-gray-900/40">
                            <span className="text-[8px] font-bold uppercase font-mono tracking-wider block">
                              Internal Agent Note
                            </span>
                            <p className="font-sans mt-0.5 font-semibold text-[10px]">
                              {sup.internalNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "audit" && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-black font-mono text-gray-900 uppercase dark:text-white">
                  CRM Operator Audit Trail
                </h3>
                <span className="block text-[10px] text-gray-400 leading-normal mb-3">
                  Cryptographically logged audit history of point modifications, profile
                  adjustments, blocks, and note saves.
                </span>

                {profile.auditLogs.length === 0 ? (
                  <span className="block text-center py-8 text-gray-400 font-mono text-[10px]">
                    No admin operations recorded.
                  </span>
                ) : (
                  <div className="space-y-2 font-mono text-[10px] text-gray-600">
                    {profile.auditLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-lg border border-gray-50 bg-gray-50/20 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 dark:border-gray-850 dark:bg-gray-900/5"
                      >
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-gray-400 font-bold">
                            [{log.id}] {log.date}
                          </span>
                          <p className="font-sans font-bold text-gray-800 dark:text-gray-200 text-xs">
                            {log.action}
                          </p>
                        </div>
                        <div className="text-right text-[9px] text-gray-400">
                          <span className="font-bold text-gray-700 dark:text-gray-300 block">
                            {log.operator}
                          </span>
                          <span>
                            {log.ipAddress} · {log.device.split("/")[0]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message Compose Modal */}
      <AnimatePresence>
        {showMessageModal && (
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
                    Direct Client Notification
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    Trigger message push to {profile.fullName}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSendMessageSubmit} className="space-y-4">
                <div className="grid grid-cols-4 gap-1 bg-gray-50 dark:bg-gray-900 p-0.5 rounded-lg">
                  {(["SMS", "Push", "WhatsApp", "Email"] as const).map((gw) => (
                    <button
                      key={gw}
                      type="button"
                      onClick={() => setMsgGateway(gw)}
                      className={`py-1 rounded text-[8.5px] font-black uppercase font-mono ${
                        msgGateway === gw
                          ? "bg-[#0E4825] text-white"
                          : "text-gray-400 hover:text-gray-900"
                      }`}
                    >
                      {gw}
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                    Message Heading
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="E.g. Table reservation confirmation, VIP offer update"
                    value={msgTitle}
                    onChange={(e) => setMsgTitle(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-150 p-2 rounded-lg focus:outline-none text-xs font-bold dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[8px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                    Body Content
                  </label>
                  <textarea
                    required
                    rows={4}
                    placeholder="Hi there! Your loyalty tier Gold has been adjusted manually by admin..."
                    value={msgBody}
                    onChange={(e) => setMsgBody(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-150 p-2 rounded-lg focus:outline-none text-xs font-semibold placeholder-gray-400 dark:bg-gray-900 dark:border-gray-800 dark:text-white leading-relaxed"
                  />
                </div>

                <div className="flex gap-2 pt-3 border-t border-gray-50 dark:border-gray-800/60">
                  <button
                    type="button"
                    onClick={() => setShowMessageModal(false)}
                    className="flex-1 py-2 text-center font-bold border border-gray-100 dark:border-gray-850 rounded-xl hover:bg-gray-50 text-gray-400"
                  >
                    Cancel
                  </button>
                  <AdminButton type="submit" variant="primary" className="flex-1 py-2 rounded-xl">
                    Dispatch Msg
                  </AdminButton>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Account Block confirmation dialog */}
      {showBlockDialog && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setShowBlockDialog(false)}
          onConfirm={handleToggleBlock}
          isDestructive={profile.status === "Active"}
          title={
            profile.status === "Active" ? "Suspend Account Access?" : "Reinstate Profile Access?"
          }
          description={
            profile.status === "Active"
              ? `Are you sure you want to suspend customer ${profile.fullName}? They will be blocked from checking out, logged out of active app sessions, and all automated marketing campaigns to this profile will be suspended.`
              : `Are you sure you want to reinstate customer ${profile.fullName}? This will restore checkout capabilities instantly.`
          }
          confirmLabel={profile.status === "Active" ? "Suspend Customer" : "Reinstate Customer"}
        />
      )}
    </div>
  );
};

export default AdminCustomerProfilePage;
