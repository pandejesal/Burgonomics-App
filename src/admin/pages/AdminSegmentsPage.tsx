import React, { useState, useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  Sliders,
  PlusCircle,
  Users,
  TrendingUp,
  MapPin,
  Award,
  DollarSign,
  Calendar,
  Trash2,
  Filter,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  BookOpen,
} from "lucide-react";
import { PageHeader } from "../components/Headers";
import { AdminCard } from "../components/Cards";
import { AdminButton } from "../components/Buttons";
import { customerStorage, CustomerProfile, SavedSegment } from "./customersData";
import { toast } from "sonner";

export const AdminSegmentsPage: React.FC = () => {
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

  // Form State
  const [segmentName, setSegmentName] = useState("");
  const [segmentDesc, setSegmentDesc] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterMinSpend, setFilterMinSpend] = useState<number | "">("");
  const [filterMinOrders, setFilterMinOrders] = useState<number | "">("");
  const [filterLastOrderDays, setFilterLastOrderDays] = useState<number | "">("");
  const [filterTier, setFilterTier] = useState("");

  // Options
  const uniqueCities = useMemo(() => {
    return Array.from(new Set(customers.map((c) => c.city)));
  }, [customers]);

  // Calculate matching profiles for each segment
  const segmentStats = useMemo(() => {
    const statsMap: Record<string, number> = {};

    segments.forEach((seg) => {
      const matchCount = customers.filter((c) => {
        const { city, minSpend, minOrders, lastOrderDays, loyaltyTier } = seg.filters;
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
        return true;
      }).length;

      statsMap[seg.id] = matchCount;
    });

    return statsMap;
  }, [segments, customers]);

  // Live matching preview based on currently edited inputs
  const livePreviewCount = useMemo(() => {
    return customers.filter((c) => {
      if (filterCity && c.city !== filterCity) return false;
      if (filterMinSpend !== "" && c.totalSpent < (filterMinSpend as number)) return false;
      if (filterMinOrders !== "" && c.ordersCount < (filterMinOrders as number)) return false;
      if (filterTier && c.loyaltyTier !== filterTier) return false;

      if (filterLastOrderDays !== "") {
        const lastDate = new Date(c.lastOrderDate);
        const diffTime = Math.abs(new Date().getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < (filterLastOrderDays as number)) return false;
      }
      return true;
    }).length;
  }, [customers, filterCity, filterMinSpend, filterMinOrders, filterLastOrderDays, filterTier]);

  const handleSaveSegment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!segmentName.trim() || !segmentDesc.trim()) {
      toast.error("Please supply a Name and Description for the custom segment.");
      return;
    }

    const newSeg: SavedSegment = {
      id: `SEG-${Date.now().toString().slice(-4)}`,
      name: segmentName.trim(),
      description: segmentDesc.trim(),
      filters: {
        ...(filterCity && { city: filterCity }),
        ...(filterMinSpend !== "" && { minSpend: filterMinSpend as number }),
        ...(filterMinOrders !== "" && { minOrders: filterMinOrders as number }),
        ...(filterLastOrderDays !== "" && { lastOrderDays: filterLastOrderDays as number }),
        ...(filterTier && { loyaltyTier: filterTier }),
      },
      isCustom: true,
    };

    customerStorage.createCustomSegment(newSeg);

    // Reset Form
    setSegmentName("");
    setSegmentDesc("");
    setFilterCity("");
    setFilterMinSpend("");
    setFilterMinOrders("");
    setFilterLastOrderDays("");
    setFilterTier("");
  };

  const handleDeleteSeg = (id: string) => {
    customerStorage.deleteSegment(id);
  };

  return (
    <div className="space-y-6 font-sans text-xs">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title="Marketing Segments Workspace"
          description="Build reusable customer segment tags, monitor cohort statistics, and configure targeted marketing campaigns."
          breadcrumbs={[
            { label: "Customer CRM", to: "/admin/customers" },
            { label: "Segment Workspace" },
          ]}
        />

        <div className="flex items-center gap-2 self-start md:self-center">
          <Link to="/admin/customers">
            <AdminButton variant="outline" size="sm">
              <ArrowLeft size={13} className="mr-1.5" />
              <span>Back to Directory</span>
            </AdminButton>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Segment directory (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <AdminCard
            title="Customer Segment Repository"
            subtitle="Configured target customer lists matching demographic rules"
          >
            <div className="space-y-4">
              {segments.map((seg) => {
                const matches = segmentStats[seg.id] || 0;
                return (
                  <div
                    key={seg.id}
                    className="p-4 rounded-xl border border-gray-100 dark:border-gray-800/60 bg-gray-50/20 hover:bg-gray-50/50 dark:hover:bg-gray-900/10 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1 md:max-w-md">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[9px] font-bold text-gray-400">
                          [{seg.id}]
                        </span>
                        <h4 className="text-xs font-extrabold text-gray-900 dark:text-white font-mono uppercase tracking-tight">
                          {seg.name}
                        </h4>
                        <span
                          className={`px-2 py-0.2 rounded font-mono text-[8px] uppercase tracking-wide ${
                            seg.isCustom
                              ? "bg-orange-50 text-[#FF6600] border border-orange-100"
                              : "bg-emerald-50 text-[#0E4825] border border-emerald-100"
                          }`}
                        >
                          {seg.isCustom ? "Custom Segment" : "System Core"}
                        </span>
                      </div>
                      <p className="text-gray-500 font-sans font-semibold text-[11px] leading-relaxed">
                        {seg.description}
                      </p>

                      {/* Badge representation of filters */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-1.5 text-[9px] font-mono text-gray-400">
                        {seg.filters.city && (
                          <span className="bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">
                            City: {seg.filters.city}
                          </span>
                        )}
                        {seg.filters.minSpend && (
                          <span className="bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">
                            Spend ≥ ₹{seg.filters.minSpend}
                          </span>
                        )}
                        {seg.filters.minOrders && (
                          <span className="bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">
                            Orders ≥ {seg.filters.minOrders}
                          </span>
                        )}
                        {seg.filters.loyaltyTier && (
                          <span className="bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">
                            Tier = {seg.filters.loyaltyTier}
                          </span>
                        )}
                        {seg.filters.lastOrderDays && (
                          <span className="bg-gray-100 dark:bg-gray-900 px-2 py-0.5 rounded">
                            Inactive ≥ {seg.filters.lastOrderDays}d
                          </span>
                        )}
                        {Object.keys(seg.filters).length === 0 && (
                          <span className="italic text-gray-400">
                            Broad cohort clustering rules applied
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-800/40 pt-2 sm:pt-0">
                      <div className="text-right">
                        <span className="text-2xl font-mono font-black text-gray-900 dark:text-white block">
                          {matches}
                        </span>
                        <span className="text-[9px] text-gray-400 block font-bold font-mono uppercase tracking-wide">
                          MATCHING CUSTOMERS
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {seg.isCustom && (
                          <button
                            onClick={() => handleDeleteSeg(seg.id)}
                            title="Delete custom segment"
                            className="p-1 text-red-500 hover:bg-red-50 rounded border border-red-100 cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                        <Link to="/admin/customers">
                          <AdminButton variant="outline" size="sm" className="h-6">
                            <span>Target Campaign</span>
                          </AdminButton>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </AdminCard>
        </div>

        {/* RIGHT COLUMN: Builder panel (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <AdminCard
            title="Custom Query Segment Builder"
            subtitle="Build targeted rules to cluster customers automatically"
          >
            <form onSubmit={handleSaveSegment} className="space-y-4">
              <div className="space-y-1.5 p-3 rounded-xl border border-[#FF6600]/10 bg-[#FF6600]/5 flex items-center gap-2 text-orange-800">
                <Filter size={14} className="shrink-0" />
                <div className="space-y-0.5 leading-tight">
                  <span className="text-[9px] font-black uppercase font-mono tracking-wider">
                    Live Match Preview
                  </span>
                  <p className="text-xs font-black">
                    <span className="text-lg font-bold font-mono text-[#FF6600]">
                      {livePreviewCount}
                    </span>{" "}
                    profiles currently matching your criteria.
                  </p>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                  Segment Name
                </label>
                <input
                  type="text"
                  required
                  value={segmentName}
                  onChange={(e) => setSegmentName(e.target.value)}
                  placeholder="E.g. Ahmedabad Super Spenders"
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl py-2 px-3 text-xs font-bold text-gray-800 dark:text-white focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest font-mono">
                  Segment Description Criteria
                </label>
                <input
                  type="text"
                  required
                  value={segmentDesc}
                  onChange={(e) => setSegmentDesc(e.target.value)}
                  placeholder="E.g. VIP profiles from Ahmedabad with 10+ orders and ₹5,000 spend..."
                  className="w-full bg-gray-50 dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-xl py-2 px-3 focus:outline-none placeholder-gray-400 font-semibold"
                />
              </div>

              {/* Filtering rules */}
              <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-800/60 bg-gray-50/50 dark:bg-gray-950/20 space-y-3">
                <span className="block text-[8px] font-bold text-gray-400 uppercase tracking-wider font-mono">
                  Define Filter Parameters
                </span>

                {/* City */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1 font-mono">
                      Location City
                    </label>
                    <select
                      value={filterCity}
                      onChange={(e) => setFilterCity(e.target.value)}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-lg py-1 px-2 text-[11px] font-semibold"
                    >
                      <option value="">Any City</option>
                      {uniqueCities.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1 font-mono">
                      Loyalty Tier Rank
                    </label>
                    <select
                      value={filterTier}
                      onChange={(e) => setFilterTier(e.target.value)}
                      className="w-full bg-white dark:bg-gray-900 border border-gray-150 dark:border-gray-800 rounded-lg py-1 px-2 text-[11px] font-semibold"
                    >
                      <option value="">Any Tier</option>
                      <option value="Bronze">Bronze</option>
                      <option value="Silver">Silver</option>
                      <option value="Gold">Gold</option>
                      <option value="Platinum">Platinum</option>
                      <option value="VIP">VIP</option>
                    </select>
                  </div>
                </div>

                {/* Spend & Orders */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1 font-mono">
                      Min Spent (₹)
                    </label>
                    <input
                      type="number"
                      placeholder="E.g. 5000"
                      value={filterMinSpend}
                      onChange={(e) =>
                        setFilterMinSpend(e.target.value !== "" ? parseInt(e.target.value) : "")
                      }
                      className="w-full bg-white border border-gray-150 rounded-lg p-1 px-2 text-[11px] font-semibold dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1 font-mono">
                      Min Orders Count
                    </label>
                    <input
                      type="number"
                      placeholder="E.g. 10"
                      value={filterMinOrders}
                      onChange={(e) =>
                        setFilterMinOrders(e.target.value !== "" ? parseInt(e.target.value) : "")
                      }
                      className="w-full bg-white border border-gray-150 rounded-lg p-1 px-2 text-[11px] font-semibold dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                    />
                  </div>
                </div>

                {/* Last Order days inactive */}
                <div>
                  <label className="block text-[8px] font-bold text-gray-400 uppercase mb-1 font-mono">
                    Inactive Duration (Days Since Last Order)
                  </label>
                  <input
                    type="number"
                    placeholder="E.g. 60 days since last purchase"
                    value={filterLastOrderDays}
                    onChange={(e) =>
                      setFilterLastOrderDays(e.target.value !== "" ? parseInt(e.target.value) : "")
                    }
                    className="w-full bg-white border border-gray-150 rounded-lg p-1 px-2 text-[11px] font-semibold dark:bg-gray-900 dark:border-gray-800 dark:text-white"
                  />
                </div>
              </div>

              <AdminButton type="submit" variant="primary" className="w-full py-2.5 rounded-xl">
                <PlusCircle size={13} className="mr-1.5 inline" />
                <span>Save Reusable Segment</span>
              </AdminButton>
            </form>
          </AdminCard>
        </div>
      </div>
    </div>
  );
};

export default AdminSegmentsPage;
