import React, { useState, useEffect, useMemo } from "react";
import { useAdmin } from "../hooks/useAdmin";
import { RoleChip } from "../components/Badges";
import { PageHeader } from "../components/Headers";
import { KpiSection } from "../dashboard/components/widgets/KpiSection";
import { LiveOperations } from "../dashboard/components/widgets/LiveOperations";
import { StoreOverview } from "../dashboard/components/widgets/StoreOverview";
import { PetpoojaStatus } from "../dashboard/components/widgets/PetpoojaStatus";
import { PaymentOverview } from "../dashboard/components/widgets/PaymentOverview";
import { CustomerInsights } from "../dashboard/components/widgets/CustomerInsights";
import { MenuInsights } from "../dashboard/components/widgets/MenuInsights";
import { DashboardCharts } from "../dashboard/components/charts/DashboardCharts";
import { Store, MapPin, RefreshCw, Download, CheckCircle, Info } from "lucide-react";

import { INITIAL_RICH_STORES, RichStore } from "./storesData";

export const AdminDashboardPlaceholder: React.FC = () => {
  const { role } = useAdmin();

  // Load actual stores from local storage or INITIAL_RICH_STORES
  const [stores] = useState<RichStore[]>(() => {
    const cached = localStorage.getItem("burgonomics_rich_stores_directory");
    return cached ? JSON.parse(cached) : INITIAL_RICH_STORES;
  });

  // Selected filters state
  const [selectedRange, setSelectedRange] = useState<"today" | "yesterday" | "7days" | "30days">(
    "today",
  );
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [selectedCity, setSelectedCity] = useState<string>("all");

  // Dynamic lists from loaded stores
  const cities = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (s.city) set.add(s.city);
    });
    return Array.from(set).sort();
  }, [stores]);

  // Filter stores based on selected city
  const filteredStoresList = useMemo(() => {
    if (selectedCity === "all") return stores;
    return stores.filter((s) => s.city.toLowerCase() === selectedCity.toLowerCase());
  }, [stores, selectedCity]);

  // Handle city change
  const handleCityChange = (city: string) => {
    setSelectedCity(city);
    // If current selected store is not in this city, reset store selection
    if (selectedStore !== "all") {
      const currentStore = stores.find((s) => s.id === selectedStore);
      if (
        currentStore &&
        currentStore.city.toLowerCase() !== city.toLowerCase() &&
        city !== "all"
      ) {
        setSelectedStore("all");
      }
    }
  };

  // Handle store change
  const handleStoreChange = (storeId: string) => {
    setSelectedStore(storeId);
    if (storeId !== "all") {
      const currentStore = stores.find((s) => s.id === storeId);
      if (currentStore && currentStore.city) {
        setSelectedCity(currentStore.city.toLowerCase());
      }
    }
  };

  // Computed ISO dates for dateRange filter
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>({
    from: "",
    to: "",
  });

  const [lastUpdated, setLastUpdated] = useState<string>("");

  // Re-compute dates on range change
  useEffect(() => {
    const now = new Date();
    const fromDate = new Date();
    let toDate = new Date();

    if (selectedRange === "today") {
      fromDate.setHours(0, 0, 0, 0);
      toDate = now;
    } else if (selectedRange === "yesterday") {
      fromDate.setDate(now.getDate() - 1);
      fromDate.setHours(0, 0, 0, 0);
      toDate.setDate(now.getDate() - 1);
      toDate.setHours(23, 59, 59, 999);
    } else if (selectedRange === "7days") {
      fromDate.setDate(now.getDate() - 7);
      fromDate.setHours(0, 0, 0, 0);
      toDate = now;
    } else if (selectedRange === "30days") {
      fromDate.setDate(now.getDate() - 30);
      fromDate.setHours(0, 0, 0, 0);
      toDate = now;
    }

    setDateRange({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    });

    setLastUpdated(
      new Date().toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
    );
  }, [selectedRange]);

  // Handle 15 seconds continuous polling and update trigger
  useEffect(() => {
    const interval = setInterval(() => {
      // Re-trigger calculation which updates dates
      setSelectedRange((prev) => prev);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleManualTrigger = () => {
    setSelectedRange((prev) => prev);
    alert("Operations dashboard metrics refetched from main ledger!");
  };

  const handleExportData = () => {
    const dataToExport = {
      timestamp: new Date().toISOString(),
      filters: { selectedRange, selectedStore, selectedCity, dateRange },
      operatorRole: role,
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `burgonomics-ops-export-${selectedRange}-${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Title Bar with Breadcrumbs & Role */}
      <PageHeader
        title="Operations Dashboard"
        description="Consolidated direct operations control room, real-time franchise monitoring metrics, and secure systems diagnostic indicators."
        breadcrumbs={[]}
        badge={<RoleChip role={role} />}
      />

      {/* Main Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-[20px] border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] shadow-[0_4px_16px_rgba(0,0,0,0.01)] shrink-0">
        <div className="flex flex-wrap items-center gap-3">
          {/* Date range picker */}
          <div className="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-900 p-1 rounded-xl border border-gray-100 dark:border-gray-800/80">
            <button
              onClick={() => setSelectedRange("today")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                selectedRange === "today"
                  ? "bg-white dark:bg-gray-800 text-[#0E4825] dark:text-emerald-400 shadow-sm border border-gray-100 dark:border-gray-700/50"
                  : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setSelectedRange("yesterday")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                selectedRange === "yesterday"
                  ? "bg-white dark:bg-gray-800 text-[#0E4825] dark:text-emerald-400 shadow-sm border border-gray-100 dark:border-gray-700/50"
                  : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              Yesterday
            </button>
            <button
              onClick={() => setSelectedRange("7days")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                selectedRange === "7days"
                  ? "bg-white dark:bg-gray-800 text-[#0E4825] dark:text-emerald-400 shadow-sm border border-gray-100 dark:border-gray-700/50"
                  : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              7 Days
            </button>
            <button
              onClick={() => setSelectedRange("30days")}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                selectedRange === "30days"
                  ? "bg-white dark:bg-gray-800 text-[#0E4825] dark:text-emerald-400 shadow-sm border border-gray-100 dark:border-gray-700/50"
                  : "text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              30 Days
            </button>
          </div>

          {/* Store selector */}
          <div className="relative">
            <select
              value={selectedStore}
              onChange={(e) => handleStoreChange(e.target.value)}
              className="appearance-none pl-8 pr-8 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 font-bold text-xs text-gray-700 dark:text-gray-300 focus:outline-none cursor-pointer"
            >
              <option value="all">All Store Outlets</option>
              {filteredStoresList.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
            <Store className="absolute left-2.5 top-2.5 text-gray-400" size={13} />
          </div>

          {/* City selector */}
          <div className="relative">
            <select
              value={selectedCity}
              onChange={(e) => handleCityChange(e.target.value)}
              className="appearance-none pl-8 pr-8 py-2 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 font-bold text-xs text-gray-700 dark:text-gray-300 focus:outline-none cursor-pointer"
            >
              <option value="all">All Cities</option>
              {cities.map((city) => (
                <option key={city} value={city.toLowerCase()}>
                  {city}
                </option>
              ))}
            </select>
            <MapPin className="absolute left-2.5 top-2.5 text-gray-400" size={13} />
          </div>
        </div>

        {/* Toolbar action buttons */}
        <div className="flex items-center gap-3 self-end md:self-auto">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            Last Updated: {lastUpdated || "Loading..."}
          </span>

          <button
            onClick={handleManualTrigger}
            className="p-2.5 rounded-xl border border-gray-100 dark:border-gray-800 hover:border-[#0E4825] dark:hover:border-emerald-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-all cursor-pointer bg-gray-50/50 dark:bg-gray-900/30"
            title="Force refresh all modules"
          >
            <RefreshCw size={13} />
          </button>

          <button
            onClick={handleExportData}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0E4825] hover:bg-[#0E4825]/90 text-white font-bold text-xs shadow-sm cursor-pointer transition-all"
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Top KPI Metric Cards Grid */}
      <KpiSection
        dateRange={dateRange}
        storeId={selectedStore !== "all" ? selectedStore : undefined}
        lastUpdatedTime={lastUpdated ? lastUpdated.split(" ")[0] : "just now"}
      />

      {/* Main split: Analytics & Live pipeline grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Time-series charts curves */}
        <div className="lg:col-span-2">
          <DashboardCharts
            dateRange={dateRange}
            storeId={selectedStore !== "all" ? selectedStore : undefined}
          />
        </div>

        {/* Live POS integrations monitoring details */}
        <div className="lg:col-span-1">
          <PetpoojaStatus />
        </div>
      </div>

      {/* Live active order pipeline metrics */}
      <LiveOperations dateRange={dateRange} />

      {/* Bottom core split: Stores list and Petpooja Integration architecture note */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <StoreOverview />
        </div>

        <div className="lg:col-span-1 flex flex-col gap-4">
          <div className="rounded-[20px] border border-[#0E4825]/15 dark:border-emerald-900/30 bg-emerald-50/40 dark:bg-[#1A1A1A] p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0E4825] text-white">
                <Info size={18} />
              </div>
              <div>
                <h4 className="text-sm font-black text-[#0E4825] dark:text-emerald-400 font-sans uppercase">
                  Petpooja POS Architecture
                </h4>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Source of Truth Division
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="flex items-start gap-2">
                <CheckCircle
                  size={14}
                  className="text-[#0E4825] dark:text-emerald-400 shrink-0 mt-0.5"
                />
                <span>
                  <strong>Petpooja POS:</strong> Handles store billing, kitchen display (KDS),
                  master item prices, and item stock levels.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle
                  size={14}
                  className="text-[#0E4825] dark:text-emerald-400 shrink-0 mt-0.5"
                />
                <span>
                  <strong>Burgonomics Admin:</strong> Manages online customer app orders, store
                  online/offline availability, webhooks, and app banners/offers.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Final operations row: Payment gateways, Cohorts and menu performers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <PaymentOverview dateRange={dateRange} />
        </div>
        <div className="lg:col-span-1">
          <CustomerInsights dateRange={dateRange} />
        </div>
        <div className="lg:col-span-1">
          <MenuInsights dateRange={dateRange} />
        </div>
      </div>
    </div>
  );
};

