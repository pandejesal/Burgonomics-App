import React, { useState, useMemo, useEffect } from "react";
import {
  Store as StoreIcon,
  MapPin,
  Phone,
  Clock,
  Settings,
  Activity,
  FileText,
  Image as ImageIcon,
  Users,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  ExternalLink,
  Copy,
  RotateCw,
  Play,
  Check,
  Lock,
  ShieldAlert,
  Trash2,
  Calendar,
  ChevronRight,
  Download,
  Compass,
  Eye,
  Layers,
  Trash,
  CheckCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as ChartTooltip,
  BarChart,
  Bar,
} from "recharts";
import { PageHeader } from "../components/Headers";
import { StatCard } from "../components/Cards";
import { StatusBadge, HealthBadge } from "../components/Badges";
import { ConfirmDialog } from "../components/Utilities";
import {
  INITIAL_RICH_STORES,
  RichStore,
  StaffMember,
  StoreDocument,
  RichStoreHours,
  WeeklySchedule,
} from "./storesData";
import { useAdminAuthStore } from "@/admin/store/adminAuthStore";
import { adminStoresService } from "../services/adminStoresService";

type ViewTab = "list" | "grid" | "radar";
type RoleType = "Developer" | "Operations" | "Store Manager" | "Finance";

export const AdminStoresPage: React.FC<{ defaultStoreId?: string; isCreate?: boolean }> = ({
  defaultStoreId,
  isCreate: initialIsCreate,
}) => {
  // Persistence state
  const [stores, setStores] = useState<RichStore[]>([]);
  const [isLoadingStores, setIsLoadingStores] = useState(true);

  useEffect(() => {
    async function loadStores() {
      setIsLoadingStores(true);
      const res = await adminStoresService.listStores();
      if (res.success && res.data.length > 0) {
        setStores(res.data);
      } else {
        setStores([]);
      }
      setIsLoadingStores(false);
    }
    void loadStores();
  }, []);

  const saveStores = async (updated: RichStore[]) => {
    setStores(updated);
    // In a real app we'd update specific stores, but for this prototype we'll bulk update
    // or we can just update the ones that changed. Let's do bulk for now since it mirrors the localstorage behavior
    await adminStoresService.bulkUpsert(updated);
  };

  // Use real Admin Auth Role
  const { admin } = useAdminAuthStore();
  const selectedRole = (admin?.role?.name as RoleType) || "Developer";
  
  // Real apps might store the assigned store in the user profile/claims
  const managerAssignedStoreId = admin?.assignedStoreId || "str_001";

  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [selectedSync, setSelectedSync] = useState("All");
  const [viewTab, setViewTab] = useState<ViewTab>("grid");

  // Selected store detail route tracking
  const [activeStoreId, setActiveStoreId] = useState<string | null>(defaultStoreId || null);
  const [isCreating, setIsCreating] = useState(!!initialIsCreate);

  // Edit store settings form state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingPetpoojaId, setEditingPetpoojaId] = useState<string>("");

  // Active sync states
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingStoreId, setSyncingStoreId] = useState<string | null>(null);

  // Modals / Overlays
  const [confirmToggleStore, setConfirmToggleStore] = useState<RichStore | null>(null);
  const [viewDoc, setViewDoc] = useState<StoreDocument | null>(null);
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);

  // New Store Form State
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreCity, setNewStoreCity] = useState("Ahmedabad");
  const [newStoreArea, setNewStoreArea] = useState("");
  const [newStoreAddress, setNewStoreAddress] = useState("");
  const [newStorePhone, setNewStorePhone] = useState("");
  const [newStorePetpoojaId, setNewStorePetpoojaId] = useState("");
  const [newStoreLat, setNewStoreLat] = useState("23.034362");
  const [newStoreLng, setNewStoreLng] = useState("72.5548094");

  // New Staff Form State
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<StaffMember["role"]>("Chef");
  const [newStaffPhone, setNewStaffPhone] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");

  // Sync route param with state
  useEffect(() => {
    if (defaultStoreId) setActiveStoreId(defaultStoreId);
  }, [defaultStoreId]);

  // Sync editing ID with active store
  useEffect(() => {
    if (activeStoreId) {
      const store = stores.find((s) => s.id === activeStoreId);
      if (store) setEditingPetpoojaId(store.petpoojaRestId || "");
    }
  }, [activeStoreId, stores]);

  // Handle RBAC View Filtering
  const isReadOnly = selectedRole === "Finance";
  const isStoreManager = selectedRole === "Store Manager";

  // Visible stores matching filters and RBAC constraints
  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      // 1. RBAC Check: Store Manager can only see their assigned store
      if (isStoreManager && store.id !== managerAssignedStoreId) {
        return false;
      }

      // 2. City Filter
      if (selectedCity !== "All" && store.city !== selectedCity) {
        return false;
      }

      // 3. Status Filter
      if (selectedStatus !== "All") {
        if (selectedStatus === "Open" && !store.isOpen) return false;
        if (selectedStatus === "Closed" && store.isOpen) return false;
        if (selectedStatus === "Busy" && !store.isBusy) return false;
      }

      // 4. Sync Filter
      if (selectedSync !== "All") {
        if (selectedSync === "Healthy" && store.webhookStatus !== "active") return false;
        if (selectedSync === "Degraded" && store.webhookStatus === "active") return false;
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          store.name.toLowerCase().includes(q) ||
          store.area.toLowerCase().includes(q) ||
          store.address.toLowerCase().includes(q) ||
          (store.petpoojaRestId && store.petpoojaRestId.toLowerCase().includes(q)) ||
          store.managerName.toLowerCase().includes(q) ||
          store.id.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [
    stores,
    managerAssignedStoreId,
    selectedCity,
    selectedStatus,
    selectedSync,
    searchQuery,
    isStoreManager,
  ]);

  const activeStore = useMemo(() => {
    if (!activeStoreId) return null;
    return stores.find((s) => s.id === activeStoreId) || null;
  }, [stores, activeStoreId]);

  // Unique cities list
  const cities = useMemo(() => {
    return ["All", ...Array.from(new Set(stores.map((s) => s.city)))];
  }, [stores]);

  // Global KPIs based on filtered set
  const stats = useMemo(() => {
    const visible = filteredStores;
    const total = visible.length;
    const open = visible.filter((s) => s.isOpen).length;
    const busy = visible.filter((s) => s.isBusy).length;
    const rev = visible.reduce((sum, s) => sum + s.todayRevenue, 0);
    const ords = visible.reduce((sum, s) => sum + s.todayOrders, 0);
    const healthySyncs = visible.filter((s) => s.webhookStatus === "active").length;

    return { total, open, busy, rev, ords, healthySyncs };
  }, [filteredStores]);

  // Copy helpers
  const handleCopyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  // Multi-action simulator handlers
  const handleToggleStoreActiveState = (storeId: string) => {
    if (isReadOnly) {
      toast.error("Access Denied: Read-only role cannot alter store operations.");
      return;
    }
    const target = stores.find((s) => s.id === storeId);
    if (target) {
      setConfirmToggleStore(target);
    }
  };

  const handleConfirmToggleStoreState = () => {
    if (!confirmToggleStore) return;
    const updated = stores.map((s) => {
      if (s.id === confirmToggleStore.id) {
        const nextOpen = !s.isOpen;
        return {
          ...s,
          isOpen: nextOpen,
          isBusy: nextOpen ? s.isBusy : false,
          webhookStatus: nextOpen ? ("active" as const) : ("failed" as const),
          circuitBreaker: nextOpen ? ("closed" as const) : ("open" as const),
          lastSyncTime: new Date().toISOString(),
        };
      }
      return s;
    });
    void saveStores(updated);
    toast.success(
      `Store "${confirmToggleStore.name}" is now ${!confirmToggleStore.isOpen ? "OPEN" : "CLOSED"}`,
    );
    setConfirmToggleStore(null);
  };

  const handleToggleBusyState = (storeId: string) => {
    if (isReadOnly) {
      toast.error("Access Denied: Read-only role.");
      return;
    }
    const updated = stores.map((s) => {
      if (s.id === storeId) {
        if (!s.isOpen) {
          toast.warning("Cannot toggle busy state on a closed store.");
          return s;
        }
        return { ...s, isBusy: !s.isBusy };
      }
      return s;
    });
    void saveStores(updated);
    const target = updated.find((s) => s.id === storeId);
    if (target) {
      toast.success(
        `Store status updated: ${target.isBusy ? "BUSY (Queue Overloaded)" : "NORMAL"}`,
      );
    }
  };

  // Run synchronization for single store
  const handleSyncStore = async (storeId: string) => {
    if (isReadOnly) {
      toast.error("Access Denied: Read-only role.");
      return;
    }
    setSyncingStoreId(storeId);
    toast.loading("Pinging Petpooja server and pulling menu version...");

    setTimeout(() => {
      const updated = stores.map((s) => {
        if (s.id === storeId) {
          return {
            ...s,
            lastSyncTime: new Date().toISOString(),
            webhookStatus: "active" as const,
            circuitBreaker: "closed" as const,
            webhookFailures: 0,
            retryCount: 0,
            menuVersion: `v3.12.${Math.floor(Math.random() * 90) + 10}`,
          };
        }
        return s;
      });
      void saveStores(updated);
      setSyncingStoreId(null);
      toast.dismiss();
      toast.success("Petpooja Menu synced successfully!");
    }, 1200);
  };

  // Global sync
  const handleSyncAllStores = () => {
    if (isReadOnly) {
      toast.error("Access Denied: Read-only role.");
      return;
    }
    setIsSyncingAll(true);
    toast.loading("Starting batch sync for all active stores...");
    setTimeout(() => {
      const updated = stores.map((s) => {
        if (s.isOpen) {
          return {
            ...s,
            lastSyncTime: new Date().toISOString(),
            webhookStatus: "active" as const,
            circuitBreaker: "closed" as const,
            webhookFailures: 0,
          };
        }
        return s;
      });
      void saveStores(updated);
      setIsSyncingAll(false);
      toast.dismiss();
      toast.success(`Batch synchronization completed for ${filteredStores.length} stores.`);
    }, 1800);
  };

  // Edit / Save Store Settings Form
  const handleUpdateStoreSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (isReadOnly) return;
    setIsEditMode(false);
    toast.success("Store configurations updated successfully!");
  };

  // Create Store
  const handleCreateStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName || !newStoreArea || !newStoreAddress) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const newId = `str_0${stores.length + 1}`;
    const newStore: RichStore = {
      id: newId,
      name: newStoreName,
      address: newStoreAddress,
      city: newStoreCity,
      area: newStoreArea,
      lat: parseFloat(newStoreLat),
      lng: parseFloat(newStoreLng),
      phone: newStorePhone || "+91 98765 00000",
      imageUrl: null,
      hours: { open: "10:00", close: "23:00" },
      isOpen: true,
      isBusy: false,
      isRecentlyOpened: true,
      supports: { delivery: true, takeaway: true, dineIn: true },
      etaMinutes: 30,
      pickupEtaMinutes: 15,
      deliveryFee: 29,
      petpoojaRestId: newStorePetpoojaId || `rest_${newStoreArea.toLowerCase().replace(/\s/g, "")}`,
      richHours: {
        monday: { open: "10:00", close: "23:00" },
        tuesday: { open: "10:00", close: "23:00" },
        wednesday: { open: "10:00", close: "23:00" },
        thursday: { open: "10:00", close: "23:00" },
        friday: { open: "10:00", close: "23:59" },
        saturday: { open: "10:00", close: "23:59" },
        sunday: { open: "10:00", close: "23:59" },
      },
      email: `${newStoreName.toLowerCase().replace(/\s/g, "")}@burgonomics.com`,
      managerName: "Operational Lead",
      managerPhone: newStorePhone || "+91 98765 00000",
      webhookUrl: `https://api.burgonomics.com/webhooks/petpooja/v1/${newId}`,
      webhookStatus: "active",
      circuitBreaker: "closed",
      lastSyncTime: new Date().toISOString(),
      menuVersion: "v3.12.1",
      webhookFailures: 0,
      retryCount: 0,
      queueOrdersWaiting: 0,
      queueOrdersActive: 0,
      queueFailedJobs: 0,
      queueDeadLetters: 0,
      queueWorkerStatus: "healthy",
      todayRevenue: 0,
      todayOrders: 0,
      avgOrderValue: 0,
      popularItem: "Classic Cheese Overload",
      peakHour: "19:00 - 21:00",
      customerCount: 0,
      repeatCustomerPercentage: 40,
      weeklyRevenueTrend: [0, 0, 0, 0, 0, 0, 0],
      monthlyRevenueTrend: Array.from({ length: 30 }).map(() => 0),
      autoAcceptOrders: true,
      kitchenDisplayEnabled: true,
      onlinePaymentEnabled: true,
      cashOnDeliveryEnabled: true,
      staff: [
        {
          id: `STF-${newId}-01`,
          name: "Operational Lead",
          role: "Manager",
          phone: newStorePhone || "+91 98765 00000",
          email: "manager@burgonomics.com",
          isOnline: true,
        },
      ],
      documents: [
        {
          id: `DOC-${newId}-01`,
          name: "FSSAI Food License.pdf",
          type: "FSSAI",
          expiryDate: "2027-12-31",
          status: "active",
        },
      ],
      deliveryRadiusKm: 5,
      deliveryMinOrder: 150,
      deliveryMaxDistance: 7,
      media: {
        heroBanner:
          "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80",
        logo: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=150&q=80",
        gallery: [],
      },
    };

    const updated = [newStore, ...stores];
    void saveStores(updated);
    setIsCreating(false);
    setActiveStoreId(newId);
    toast.success(`Store "${newStoreName}" successfully registered on Petpooja mapping!`);

    // Reset Form
    setNewStoreName("");
    setNewStoreArea("");
    setNewStoreAddress("");
    setNewStorePhone("");
    setNewStorePetpoojaId("");
  };

  // Staff management
  const handleAddStaffMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffPhone) {
      toast.error("Please fill in name and phone.");
      return;
    }
    if (!activeStore) return;

    const newStaff: StaffMember = {
      id: `STF-${activeStore.id}-${Date.now().toString().slice(-4)}`,
      name: newStaffName,
      role: newStaffRole,
      phone: newStaffPhone,
      email: newStaffEmail || `${newStaffName.toLowerCase().replace(/\s/g, "")}@burgonomics.com`,
      isOnline: true,
    };

    const updated = stores.map((s) => {
      if (s.id === activeStore.id) {
        return {
          ...s,
          staff: [...s.staff, newStaff],
        };
      }
      return s;
    });

    void saveStores(updated);
    setShowAddStaffModal(false);
    setNewStaffName("");
    setNewStaffPhone("");
    setNewStaffEmail("");
    toast.success(`Staff member "${newStaffName}" assigned to kitchen roster.`);
  };

  const handleRemoveStaffMember = (staffId: string) => {
    if (!activeStore) return;
    const updated = stores.map((s) => {
      if (s.id === activeStore.id) {
        return {
          ...s,
          staff: s.staff.filter((m) => m.id !== staffId),
        };
      }
      return s;
    });
    void saveStores(updated);
    toast.success("Staff member unassigned from store roster.");
  };

  // Export Directory Simulator
  const handleExportDirectory = (format: "csv" | "xlsx" | "pdf") => {
    toast.info(
      `Generating ${format.toUpperCase()} export containing ${filteredStores.length} stores...`,
    );
    setTimeout(() => {
      const dataStr = JSON.stringify(filteredStores, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `burgonomics-stores-export.${format === "pdf" ? "pdf" : format}`;
      link.click();
      toast.success(`Directory exported successfully in ${format.toUpperCase()}!`);
    }, 1000);
  };

  // Spatial Radar Positioning Centering on current filter average
  const avgLat = useMemo(() => {
    const list = filteredStores;
    return list.length > 0 ? list.reduce((sum, s) => sum + s.lat, 0) / list.length : 23.034362;
  }, [filteredStores]);

  const avgLng = useMemo(() => {
    const list = filteredStores;
    return list.length > 0 ? list.reduce((sum, s) => sum + s.lng, 0) / list.length : 72.5548094;
  }, [filteredStores]);

  const getRadarCoordinates = (storeLat: number, storeLng: number) => {
    const dLat = storeLat - avgLat;
    const dLng = storeLng - avgLng;

    // Boundary normalization
    const maxDiff = Math.max(
      ...filteredStores.map((s) => Math.abs(s.lat - avgLat)),
      ...filteredStores.map((s) => Math.abs(s.lng - avgLng)),
      0.015,
    );

    const scale = 150 / maxDiff;
    const x = 200 + dLng * scale;
    const y = 200 - dLat * scale;

    return { x, y };
  };

  return (
    <div className="space-y-6 font-sans">

      <PageHeader
        title="Burgonomics Enterprise Outlets"
        description="Operational command, Petpooja rest mapping parameters, live operating shifts, API link status tracking, and performance queue logs."
        breadcrumbs={[{ label: "Stores", to: "/admin/stores" }]}
      />

      <AnimatePresence mode="wait">
        {!activeStoreId && !isCreating ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {isLoadingStores ? (
              <div className="flex h-64 items-center justify-center">
                <RotateCw className="animate-spin text-orange-500" size={32} />
              </div>
            ) : (
              <>
                {/* KPI STATS ROW */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Active Directory Locations"
                value={`${stats.open} / ${stats.total}`}
                icon={StoreIcon}
                subtext={`${stats.busy} busy outlets currently`}
              />
              <StatCard
                title="Consolidated Revenue (Today)"
                value={`₹${stats.rev.toLocaleString()}`}
                icon={TrendingUp}
                subtext="Simulated from connected POS APIs"
              />
              <StatCard
                title="Petpooja API Link Health"
                value={`${Math.floor((stats.healthySyncs / (stats.total || 1)) * 100)}%`}
                icon={Activity}
                subtext={`${stats.healthySyncs} healthy webhook links`}
              />
              <StatCard
                title="Pending Order Queues"
                value={stats.ords.toString()}
                icon={Users}
                subtext="Total delivery & dine-in orders"
              />
            </div>

            {/* VIEWS, FILTERS & MAIN LIST BAR */}
            <div className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-sm border border-gray-100 dark:bg-[#1C1C1E] dark:border-gray-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    size={18}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, area, city, petpoojaRestId..."
                    className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800 focus:ring-1 focus:ring-[#0E4825]"
                  />
                </div>

                {/* View Toggles */}
                <div className="flex items-center gap-2 self-end md:self-auto">
                  <div className="flex rounded-xl bg-gray-50 p-1 border border-gray-100 dark:bg-gray-900 dark:border-gray-800">
                    {(["list", "grid", "radar"] as ViewTab[]).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setViewTab(tab)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-black capitalize transition-all ${
                          viewTab === tab
                            ? "bg-white text-[#0E4825] shadow-sm dark:bg-[#1A1A1A] dark:text-emerald-400"
                            : "text-gray-500 hover:text-gray-900 dark:hover:text-white"
                        }`}
                      >
                        {tab === "radar" ? "Logistics Radar" : `${tab} View`}
                      </button>
                    ))}
                  </div>

                  {/* Actions */}
                  {!isReadOnly && (
                    <button
                      onClick={() => setIsCreating(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-[#0E4825] hover:bg-[#082E17] text-white px-4 py-2.5 text-xs font-black shadow-md transition-all shrink-0"
                    >
                      <Plus size={16} />
                      <span>REGISTER STORE</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Advanced Filter Pills */}
              <div className="flex flex-wrap items-center gap-3 border-t border-gray-50 pt-4 dark:border-gray-800">
                {/* City select */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase text-gray-400">City:</span>
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold dark:border-gray-700 dark:bg-gray-800 outline-none"
                  >
                    {cities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase text-gray-400">POS State:</span>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold dark:border-gray-700 dark:bg-gray-800 outline-none"
                  >
                    <option value="All">All States</option>
                    <option value="Open">Active / Open</option>
                    <option value="Closed">Closed</option>
                    <option value="Busy">Busy / Overloaded</option>
                  </select>
                </div>

                {/* Sync Status Filter */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black uppercase text-gray-400">
                    Petpooja Sync:
                  </span>
                  <select
                    value={selectedSync}
                    onChange={(e) => setSelectedSync(e.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-bold dark:border-gray-700 dark:bg-gray-800 outline-none"
                  >
                    <option value="All">All Sync Status</option>
                    <option value="Healthy">Healthy (Linked)</option>
                    <option value="Degraded">Connection Fault</option>
                  </select>
                </div>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={handleSyncAllStores}
                    disabled={isSyncingAll}
                    className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                  >
                    <RotateCw size={12} className={isSyncingAll ? "animate-spin" : ""} />
                    <span>POS Batch Sync</span>
                  </button>
                  <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-800" />
                  <button
                    onClick={() => handleExportDirectory("csv")}
                    className="rounded-lg bg-gray-50 p-1 text-gray-400 hover:text-[#0E4825] dark:bg-gray-900"
                    title="Export CSV"
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
            </div>

            {/* NO RESULTS VIEW */}
            {filteredStores.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-[20px] bg-white py-16 px-4 text-center border border-dashed border-gray-200 dark:bg-[#1C1C1E] dark:border-gray-800">
                <StoreIcon size={48} className="text-gray-300 dark:text-gray-700 animate-pulse" />
                <h3 className="mt-4 text-lg font-bold text-gray-900 dark:text-white">
                  No Burgonomics Outlets Found
                </h3>
                <p className="mt-1 max-w-md text-sm text-gray-500 font-semibold">
                  No stores match the active search criteria or your RBAC permission assignment
                  boundaries. Try clearing your filters.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCity("All");
                    setSelectedStatus("All");
                    setSelectedSync("All");
                  }}
                  className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black shadow-sm hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                >
                  Reset Active Filters
                </button>
              </div>
            )}

            {/* TAB RENDERS */}
            {filteredStores.length > 0 && (
              <div className="transition-all duration-300">
                {/* 1. GRID BOARD VIEW */}
                {viewTab === "grid" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredStores.map((store) => (
                      <div
                        key={store.id}
                        className="group relative flex flex-col justify-between overflow-hidden rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md dark:border-gray-800/50 dark:bg-[#1C1C1E]"
                      >
                        {/* Card Header */}
                        <div>
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <span className="font-mono text-[10px] font-black tracking-widest text-[#FF6600]">
                                {store.id}
                              </span>
                              <h3
                                onClick={() => setActiveStoreId(store.id)}
                                className="cursor-pointer text-base font-black tracking-tight text-gray-900 hover:text-[#0E4825] dark:text-white dark:hover:text-emerald-400"
                              >
                                {store.name}
                              </h3>
                              <p className="mt-1 text-xs font-bold text-gray-400">
                                {store.city}, {store.area}
                              </p>
                            </div>

                            {/* Status toggles */}
                            <div className="flex flex-col items-end gap-2">
                              <span
                                onClick={() => handleToggleStoreActiveState(store.id)}
                                className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black border ${
                                  store.isOpen
                                    ? "bg-emerald-50 text-[#16A34A] border-emerald-200/50"
                                    : "bg-red-50 text-[#DC2626] border-red-200/50"
                                }`}
                              >
                                <span className="h-1 w-1 rounded-full bg-current" />
                                <span>{store.isOpen ? "OPEN" : "CLOSED"}</span>
                              </span>

                              {store.isOpen && (
                                <span
                                  onClick={() => handleToggleBusyState(store.id)}
                                  className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black border ${
                                    store.isBusy
                                      ? "bg-amber-50 text-amber-600 border-amber-200"
                                      : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800"
                                  }`}
                                >
                                  <span>
                                    {store.isBusy ? "BUSY (Queue Limit)" : "NORMAL QUEUE"}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="my-4 border-t border-gray-50 dark:border-gray-800" />

                          {/* Quick Metrics */}
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="block text-[10px] font-black uppercase text-gray-400">
                                Revenue (Today)
                              </span>
                              <span className="font-mono text-base font-black text-gray-900 dark:text-white">
                                ₹{store.todayRevenue.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px] font-black uppercase text-gray-400">
                                Total POS Orders
                              </span>
                              <span className="font-mono text-base font-black text-gray-900 dark:text-white">
                                {store.todayOrders} orders
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer controls */}
                        <div className="mt-5 border-t border-gray-50 pt-4 dark:border-gray-800">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1 text-gray-500">
                              <HealthBadge
                                system="petpooja"
                                status={store.webhookStatus === "active" ? "healthy" : "degraded"}
                              />
                              <span className="font-mono text-[10px] font-bold text-gray-400">
                                {store.menuVersion}
                              </span>
                            </div>

                            <button
                              onClick={() => setActiveStoreId(store.id)}
                              className="flex items-center gap-1 font-black text-[#0E4825] hover:text-[#082E17] dark:text-emerald-400"
                            >
                              <span>ENTER CONSOLE</span>
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 2. DIRECTORY LIST TABLE VIEW */}
                {viewTab === "list" && (
                  <div className="overflow-x-auto rounded-[20px] bg-white shadow-sm border border-gray-100 dark:bg-[#1C1C1E] dark:border-gray-800">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-gray-50 bg-gray-50/50 text-[10px] font-black uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:bg-gray-900/55">
                          <th className="py-4 px-6">Outlet ID</th>
                          <th className="py-4 px-6">Store Name & Address</th>
                          <th className="py-4 px-6">POS Revenue</th>
                          <th className="py-4 px-6">Fulfillment API Sync</th>
                          <th className="py-4 px-6">POS State</th>
                          <th className="py-4 px-6 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-sm font-semibold text-gray-700 dark:divide-gray-800 dark:text-gray-300">
                        {filteredStores.map((store) => (
                          <tr
                            key={store.id}
                            className="hover:bg-gray-50/50 dark:hover:bg-gray-900/30"
                          >
                            <td className="py-4 px-6 font-mono text-xs font-black text-gray-400">
                              {store.id}
                            </td>
                            <td className="py-4 px-6">
                              <div>
                                <span
                                  onClick={() => setActiveStoreId(store.id)}
                                  className="cursor-pointer block text-sm font-black text-gray-900 hover:text-[#0E4825] dark:text-white dark:hover:text-emerald-400"
                                >
                                  {store.name}
                                </span>
                                <span className="block text-xs font-bold text-gray-400">
                                  {store.address.slice(0, 50)}...
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="font-mono">
                                <span className="block font-black text-gray-900 dark:text-white">
                                  ₹{store.todayRevenue.toLocaleString()}
                                </span>
                                <span className="block text-[10px] text-gray-400 font-bold">
                                  {store.todayOrders} live orders
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    store.webhookStatus === "active"
                                      ? "bg-emerald-500"
                                      : "bg-red-500"
                                  }`}
                                />
                                <span className="font-mono text-xs font-bold">
                                  {store.petpoojaRestId || "No mapping"}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-6">
                              <span
                                onClick={() => handleToggleStoreActiveState(store.id)}
                                className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black border ${
                                  store.isOpen
                                    ? "bg-emerald-50 text-[#16A34A] border-emerald-200/50"
                                    : "bg-red-50 text-[#DC2626] border-red-200/50"
                                }`}
                              >
                                {store.isOpen ? "OPEN" : "CLOSED"}
                              </span>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleSyncStore(store.id)}
                                  disabled={syncingStoreId === store.id}
                                  className="rounded-lg p-1.5 text-gray-400 hover:text-[#0E4825]"
                                  title="Sync Menu"
                                >
                                  <RotateCw
                                    size={14}
                                    className={syncingStoreId === store.id ? "animate-spin" : ""}
                                  />
                                </button>
                                <button
                                  onClick={() => setActiveStoreId(store.id)}
                                  className="rounded-lg bg-gray-50 px-2.5 py-1 text-xs font-black text-[#0E4825] hover:bg-gray-100 dark:bg-gray-800 dark:text-emerald-400"
                                >
                                  CONSOLE
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 3. LOGISTICS RADAR VIEW (SVG Spatial Grid) */}
                {viewTab === "radar" && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Radar Screen Card */}
                    <div className="lg:col-span-2 flex flex-col items-center justify-center rounded-[20px] bg-[#121214] p-6 text-white border border-gray-800 relative overflow-hidden">
                      {/* Grid background styling */}
                      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-20" />

                      {/* Header indicators */}
                      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
                        <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-500/20">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        </span>
                        <span className="font-mono text-[10px] font-black tracking-widest text-emerald-400 uppercase">
                          Burgonomics Spatial Radar (Live Tracking)
                        </span>
                      </div>

                      <div className="absolute top-4 right-4 z-10 text-right font-mono text-[9px] text-gray-500">
                        <span>
                          CENTER COORDS: {avgLat.toFixed(4)}N, {avgLng.toFixed(4)}E
                        </span>
                      </div>

                      {/* Radar SVG Circle */}
                      <div className="relative h-96 w-96 max-w-full my-6 flex items-center justify-center">
                        {/* Interactive SVG overlay */}
                        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 400">
                          {/* Concentric rings */}
                          <circle
                            cx="200"
                            cy="200"
                            r="160"
                            fill="none"
                            stroke="#0E4825"
                            strokeWidth="1"
                            strokeDasharray="4 6"
                            opacity="0.4"
                          />
                          <circle
                            cx="200"
                            cy="200"
                            r="110"
                            fill="none"
                            stroke="#0E4825"
                            strokeWidth="1"
                            strokeDasharray="3 4"
                            opacity="0.5"
                          />
                          <circle
                            cx="200"
                            cy="200"
                            r="60"
                            fill="none"
                            stroke="#0E4825"
                            strokeWidth="1"
                            opacity="0.6"
                          />

                          {/* Radar axes */}
                          <line
                            x1="200"
                            y1="40"
                            x2="200"
                            y2="360"
                            stroke="#0E4825"
                            strokeWidth="0.5"
                            opacity="0.4"
                          />
                          <line
                            x1="40"
                            y1="200"
                            x2="360"
                            y2="200"
                            stroke="#0E4825"
                            strokeWidth="0.5"
                            opacity="0.4"
                          />

                          {/* Concentric rings tags */}
                          <text
                            x="205"
                            y="55"
                            fill="#16A34A"
                            fontSize="8"
                            fontFamily="monospace"
                            opacity="0.6"
                          >
                            8KM RADAR
                          </text>
                          <text
                            x="205"
                            y="105"
                            fill="#16A34A"
                            fontSize="8"
                            fontFamily="monospace"
                            opacity="0.6"
                          >
                            5KM RADAR
                          </text>
                          <text
                            x="205"
                            y="155"
                            fill="#16A34A"
                            fontSize="8"
                            fontFamily="monospace"
                            opacity="0.6"
                          >
                            2KM RADAR
                          </text>

                          {/* Dynamic sweep line (CSS rotate) */}
                          <line
                            x1="200"
                            y1="200"
                            x2="341"
                            y2="59"
                            stroke="url(#radarSweepGradient)"
                            strokeWidth="2.5"
                            className="origin-[200px_200px] animate-[spin_5s_linear_infinite]"
                          />

                          {/* Gradients */}
                          <defs>
                            <linearGradient
                              id="radarSweepGradient"
                              x1="0%"
                              y1="0%"
                              x2="100%"
                              y2="100%"
                            >
                              <stop offset="0%" stopColor="#16A34A" stopOpacity="0" />
                              <stop offset="100%" stopColor="#16A34A" stopOpacity="0.8" />
                            </linearGradient>
                          </defs>

                          {/* Plot Stores on Radar Map */}
                          {filteredStores.map((store) => {
                            const { x, y } = getRadarCoordinates(store.lat, store.lng);
                            const isStoreOpen = store.isOpen;
                            const isStoreBusy = store.isBusy;

                            return (
                              <g
                                key={store.id}
                                className="cursor-pointer group"
                                onClick={() => setActiveStoreId(store.id)}
                              >
                                {/* Pulsing rings for open stores */}
                                {isStoreOpen && (
                                  <circle
                                    cx={x}
                                    cy={y}
                                    r={isStoreBusy ? "12" : "8"}
                                    fill="none"
                                    stroke={isStoreBusy ? "#F59E0B" : "#10B981"}
                                    strokeWidth="1"
                                    className="animate-ping origin-center"
                                    style={{ transformOrigin: `${x}px ${y}px` }}
                                    opacity="0.5"
                                  />
                                )}

                                {/* Main pin point */}
                                <circle
                                  cx={x}
                                  cy={y}
                                  r="4.5"
                                  fill={
                                    !isStoreOpen ? "#EF4444" : isStoreBusy ? "#F59E0B" : "#10B981"
                                  }
                                />

                                {/* Text Label shown when visible/hovered */}
                                <text
                                  x={x + 8}
                                  y={y + 3}
                                  fill="#E2E8F0"
                                  fontSize="8"
                                  fontFamily="sans-serif"
                                  fontWeight="bold"
                                  className="opacity-65 group-hover:opacity-100 transition-all font-mono"
                                >
                                  {store.name.replace("Burgonomics ", "")}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                      </div>
                    </div>

                    {/* Sidebar: Selected Store on radar list */}
                    <div className="flex flex-col rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider mb-4">
                        Plotting visible outlets ({filteredStores.length})
                      </h3>
                      <div className="flex-1 overflow-y-auto space-y-3 max-h-[360px] pr-2">
                        {filteredStores.map((store) => (
                          <div
                            key={store.id}
                            onClick={() => setActiveStoreId(store.id)}
                            className="cursor-pointer group flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/40 p-3 hover:border-[#0E4825]/35 hover:bg-[#0E4825]/5 dark:border-gray-800 dark:bg-gray-900/30 dark:hover:bg-emerald-950/10"
                          >
                            <div>
                              <span className="block font-black text-sm text-gray-900 group-hover:text-[#0E4825] dark:text-white dark:group-hover:text-emerald-400">
                                {store.name}
                              </span>
                              <span className="block font-mono text-[9px] text-gray-400 font-bold">
                                COORDS: {store.lat.toFixed(4)}, {store.lng.toFixed(4)}
                              </span>
                            </div>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                !store.isOpen
                                  ? "bg-red-500"
                                  : store.isBusy
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
              </>
            )}
          </motion.div>
        ) : isCreating ? (
          /* CREATE STORE COMPONENT */
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-[20px] bg-white p-6 shadow-sm border border-gray-100 dark:bg-[#1C1C1E] dark:border-gray-800 max-w-4xl mx-auto"
          >
            <div className="flex items-center justify-between border-b border-gray-50 pb-4 dark:border-gray-800">
              <h2 className="text-lg font-black text-gray-900 dark:text-white">
                REGISTER NEW BURGONOMICS OUTLET
              </h2>
              <button
                onClick={() => setIsCreating(false)}
                className="rounded-lg bg-gray-50 p-1.5 text-gray-500 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-400"
              >
                <XCircle size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateStore} className="mt-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Outlet Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStoreName}
                    onChange={(e) => setNewStoreName(e.target.value)}
                    placeholder="e.g. Burgonomics Satellite"
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Outlet City *
                  </label>
                  <select
                    value={newStoreCity}
                    onChange={(e) => setNewStoreCity(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  >
                    <option value="Ahmedabad">Ahmedabad</option>
                    <option value="Vadodara">Vadodara</option>
                    <option value="Surat">Surat</option>
                    <option value="Rajkot">Rajkot</option>
                    <option value="Lucknow">Lucknow</option>
                    <option value="Kota">Kota</option>
                    <option value="Ayodhya">Ayodhya</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Outlet Area *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStoreArea}
                    onChange={(e) => setNewStoreArea(e.target.value)}
                    placeholder="e.g. Satellite"
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Contact Phone Number
                  </label>
                  <input
                    type="text"
                    value={newStorePhone}
                    onChange={(e) => setNewStorePhone(e.target.value)}
                    placeholder="e.g. +91 78781 82109"
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                  Full Street Address *
                </label>
                <textarea
                  required
                  rows={2}
                  value={newStoreAddress}
                  onChange={(e) => setNewStoreAddress(e.target.value)}
                  placeholder="e.g. Shop GF-7 Saaman Complex, Near Mansi Circle, Satellite, Ahmedabad 380015"
                  className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Petpooja Restaurant ID
                  </label>
                  <input
                    type="text"
                    value={newStorePetpoojaId}
                    onChange={(e) => setNewStorePetpoojaId(e.target.value)}
                    placeholder="e.g. rest_satellite_pos"
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Latitude Coordinate
                  </label>
                  <input
                    type="text"
                    value={newStoreLat}
                    onChange={(e) => setNewStoreLat(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold font-mono outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase mb-1.5">
                    Longitude Coordinate
                  </label>
                  <input
                    type="text"
                    value={newStoreLng}
                    onChange={(e) => setNewStoreLng(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 py-2.5 px-4 text-sm font-semibold font-mono outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-gray-50 pt-4 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-black text-gray-500 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0E4825] px-5 py-2.5 text-xs font-black text-white hover:bg-[#082E17]"
                >
                  SAVE OUTLET REGISTRATION
                </button>
              </div>
            </form>
          </motion.div>
        ) : (
          /* DEEP DIVE STORE CONSOLE (SPLIT LAYOUT) */
          activeStore && (
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-6"
            >
              {/* Back controls navigation header bar */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <button
                  onClick={() => setActiveStoreId(null)}
                  className="flex items-center gap-1 text-xs font-black uppercase text-gray-500 hover:text-gray-900 dark:hover:text-white"
                >
                  <Compass size={16} />
                  <span>← Back to Outlets Directory</span>
                </button>

                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-gray-400">
                    CONSOLE LINKED TO:{" "}
                    <span className="font-black text-gray-900 dark:text-white">
                      {activeStore.id}
                    </span>
                  </span>
                  <div className="h-4 w-[1px] bg-gray-200 dark:bg-gray-800" />
                  <button
                    onClick={() => handleSyncStore(activeStore.id)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-black hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
                  >
                    <RotateCw
                      size={12}
                      className={syncingStoreId === activeStore.id ? "animate-spin" : ""}
                    />
                    <span>Sync POS Settings</span>
                  </button>
                </div>
              </div>

              {/* SPLIT LAYOUT COLUMNS */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* COLUMN LEFT (General info, schedule, documents, media) - Span 5 */}
                <div className="lg:col-span-5 space-y-6">
                  {/* General Info Card */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-start gap-4">
                      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0E4825] text-white font-black text-2xl shrink-0">
                        B
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[#FF6600]">
                          <Sparkles size={10} />
                          Burgonomics Outlet
                        </span>
                        <h2 className="text-lg font-black text-gray-900 dark:text-white truncate">
                          {activeStore.name}
                        </h2>
                        <span className="block text-xs font-bold text-gray-400">
                          {activeStore.city} Directory
                        </span>
                      </div>
                    </div>

                    <div className="my-5 border-t border-gray-50 dark:border-gray-800" />

                    <div className="space-y-3 text-sm font-semibold text-gray-600 dark:text-gray-300">
                      <div className="flex items-start gap-2">
                        <MapPin size={16} className="text-gray-400 shrink-0 mt-0.5" />
                        <span className="text-xs">{activeStore.address}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone size={16} className="text-gray-400" />
                        <span className="text-xs">{activeStore.phone}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText size={16} className="text-gray-400" />
                        <span className="text-xs">{activeStore.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={16} className="text-gray-400" />
                        <span className="text-xs font-mono">
                          OPERATING HOURS: {activeStore.hours.open} - {activeStore.hours.close}
                        </span>
                      </div>
                    </div>

                    <div className="my-5 border-t border-gray-50 dark:border-gray-800" />

                    {/* Quick navigation and external map triggers */}
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${activeStore.lat},${activeStore.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-black hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        <Compass size={12} />
                        <span>Google Maps</span>
                      </a>
                      <button
                        onClick={() =>
                          handleCopyText(`${activeStore.lat}, ${activeStore.lng}`, "Coordinates")
                        }
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-2 text-xs font-black hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                      >
                        <Copy size={12} />
                        <span>Coords</span>
                      </button>
                    </div>
                  </div>

                  {/* WEEKLY OPERATING SCHEDULE COMPONENT */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        Operating Shifts Weekly Schedule
                      </h3>
                      <Calendar size={16} className="text-[#0E4825]" />
                    </div>

                    <div className="divide-y divide-gray-50 dark:divide-gray-800 text-xs font-semibold">
                      {Object.entries(activeStore.richHours).map(([day, shift]) => {
                        const s = shift as RichStoreHours;
                        return (
                          <div
                            key={day}
                            className="flex py-2.5 items-center justify-between text-gray-600 dark:text-gray-300"
                          >
                            <span className="capitalize font-black text-gray-900 dark:text-white w-20">
                              {day}
                            </span>
                            <div className="flex-1 flex items-center gap-2 justify-end">
                              <span className="font-mono bg-gray-50 dark:bg-gray-900 px-2 py-0.5 rounded border border-gray-100 dark:border-gray-800">
                                Shift 1: {s.open} - {s.close}
                              </span>
                              {s.secondShiftOpen && (
                                <span className="font-mono bg-[#0E4825]/5 text-[#0E4825] px-2 py-0.5 rounded border border-[#0E4825]/10">
                                  Shift 2: {s.secondShiftOpen} - {s.secondShiftClose}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* STAFF ROSTER COMPONENT */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                          Assigned Kitchen Staff Roster
                        </h3>
                        <span className="text-[10px] font-black text-gray-400">
                          Total staff: {activeStore.staff.length}
                        </span>
                      </div>
                      {!isReadOnly && (
                        <button
                          onClick={() => setShowAddStaffModal(true)}
                          className="flex items-center gap-1 rounded-lg bg-[#0E4825] px-2 py-1 text-[10px] font-black text-white hover:bg-[#082E17]"
                        >
                          <Plus size={10} />
                          <span>ASSIGN STAFF</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-2">
                      {activeStore.staff.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between rounded-xl border border-gray-50 bg-gray-50/40 p-2.5 dark:border-gray-800/50 dark:bg-gray-900/10"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-[#FF6600] font-black text-xs">
                                {member.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1C1C1E] ${
                                  member.isOnline ? "bg-emerald-500" : "bg-gray-300"
                                }`}
                              />
                            </div>
                            <div>
                              <span className="block text-xs font-black text-gray-900 dark:text-white">
                                {member.name}
                              </span>
                              <span className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                {member.role}
                              </span>
                            </div>
                          </div>

                          {!isReadOnly && member.role !== "Manager" && (
                            <button
                              onClick={() => handleRemoveStaffMember(member.id)}
                              className="rounded p-1 text-gray-400 hover:text-red-500"
                              title="Unassign Staff"
                            >
                              <Trash size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* DOCUMENTS VAULT COMPONENT */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        Compliance Documents Vault
                      </h3>
                      <FileText size={16} className="text-[#0E4825]" />
                    </div>

                    <div className="space-y-2">
                      {activeStore.documents.map((doc) => (
                        <div
                          key={doc.id}
                          onClick={() => setViewDoc(doc)}
                          className="cursor-pointer flex items-center justify-between rounded-xl border border-gray-50 bg-gray-50/20 p-2.5 hover:border-[#0E4825]/20 dark:border-gray-800 dark:bg-gray-900/10"
                        >
                          <div className="flex items-center gap-2">
                            <FileText size={16} className="text-orange-500 shrink-0" />
                            <div>
                              <span className="block text-xs font-black text-gray-900 dark:text-white truncate max-w-[200px]">
                                {doc.name}
                              </span>
                              <span className="block text-[9px] text-gray-400 font-bold">
                                EXPIRY: {doc.expiryDate}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase border ${
                              doc.status === "active"
                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                : "bg-amber-50 text-amber-600 border-amber-200"
                            }`}
                          >
                            {doc.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* COLUMN RIGHT (Operations, POS panel, queues, settings, charts) - Span 7 */}
                <div className="lg:col-span-7 space-y-6">
                  {/* REAL-TIME OPERATIONS PANEL AND CONTROLS */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        Immediate Operations & Status Controls
                      </h3>
                      <Activity size={16} className="text-[#FF6600]" />
                    </div>

                    {/* Status switches */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Active Toggle operating status */}
                      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40 border border-gray-50 dark:border-gray-800">
                        <div>
                          <span className="block text-xs font-black text-gray-900 dark:text-white uppercase">
                            POS Live State
                          </span>
                          <span className="block text-[10px] text-gray-400 font-bold">
                            Override opening status
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggleStoreActiveState(activeStore.id)}
                          disabled={isReadOnly}
                          className={`rounded-xl px-4 py-1.5 text-xs font-black border transition-all ${
                            activeStore.isOpen
                              ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                              : "bg-red-50 text-red-600 border-red-200"
                          }`}
                        >
                          {activeStore.isOpen ? "OPEN" : "CLOSED"}
                        </button>
                      </div>

                      {/* Toggle busy status */}
                      <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40 border border-gray-50 dark:border-gray-800">
                        <div>
                          <span className="block text-xs font-black text-gray-900 dark:text-white uppercase">
                            Queue Circuit
                          </span>
                          <span className="block text-[10px] text-gray-400 font-bold">
                            Throttles incoming orders
                          </span>
                        </div>
                        <button
                          onClick={() => handleToggleBusyState(activeStore.id)}
                          disabled={isReadOnly || !activeStore.isOpen}
                          className={`rounded-xl px-4 py-1.5 text-xs font-black border transition-all ${
                            activeStore.isBusy
                              ? "bg-amber-50 text-amber-600 border-amber-200"
                              : "bg-white text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                          }`}
                        >
                          {activeStore.isBusy ? "BUSY" : "NORMAL"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* PETPOOJA SYNC MANAGEMENT PANEL */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div>
                        <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                          Petpooja POS API Integration Link
                        </h3>
                        <span className="text-[10px] font-black text-gray-400">
                          Active restaurant petpoojaRestId mapping settings
                        </span>
                      </div>
                      <HealthBadge
                        system="petpooja"
                        status={activeStore.webhookStatus === "active" ? "healthy" : "degraded"}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                      <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900/30">
                        <div className="flex flex-col justify-between">
                          <span className="text-gray-400 mb-1">POS Rest ID:</span>
                          <input
                            type="text"
                            value={editingPetpoojaId}
                            onChange={(e) => setEditingPetpoojaId(e.target.value)}
                            onBlur={() => {
                              if (editingPetpoojaId !== activeStore.petpoojaRestId) {
                                const updated = stores.map((s) => {
                                  if (s.id === activeStore.id) return { ...s, petpoojaRestId: editingPetpoojaId };
                                  return s;
                                });
                                void saveStores(updated);
                                toast.success("Petpooja Rest ID updated!");
                              }
                            }}
                            disabled={isReadOnly}
                            placeholder="Not Linked"
                            className="w-full bg-transparent font-mono font-black border-b border-dashed border-gray-300 dark:border-gray-700 focus:border-[#0E4825] outline-none px-0 py-0.5 text-gray-900 dark:text-white focus:ring-0"
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Circuit Breaker:</span>
                          <span className="font-mono text-emerald-500 font-bold">
                            {activeStore.circuitBreaker.toUpperCase()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Last Synced POS:</span>
                          <span className="font-mono text-gray-500">
                            {new Date(activeStore.lastSyncTime).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900/30">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Menu Version:</span>
                          <span className="font-mono font-bold text-[#FF6600]">
                            {activeStore.menuVersion}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Webhook Errors:</span>
                          <span className="font-mono text-red-500">
                            {activeStore.webhookFailures} failures
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Sync Retries:</span>
                          <span className="font-mono text-gray-500">
                            {activeStore.retryCount} times
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 border-t border-gray-50 pt-3 dark:border-gray-800">
                      <span className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                        Webhook Endpoint URL
                      </span>
                      <div className="flex items-center justify-between rounded-lg bg-gray-50 p-2 font-mono text-[10px] dark:bg-gray-900/50">
                        <span className="truncate text-gray-500">{activeStore.webhookUrl}</span>
                        <button
                          onClick={() => handleCopyText(activeStore.webhookUrl, "Webhook URL")}
                          className="text-[#0E4825] dark:text-emerald-400 hover:underline shrink-0 ml-2"
                        >
                          COPY
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        onClick={() => handleSyncStore(activeStore.id)}
                        disabled={syncingStoreId === activeStore.id || isReadOnly}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-[#0E4825] text-white py-2 text-xs font-black hover:bg-[#082E17] disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <RotateCw
                          size={12}
                          className={syncingStoreId === activeStore.id ? "animate-spin" : ""}
                        />
                        <span>Run Full Sync</span>
                      </button>
                      <button
                        onClick={() => {
                          toast.success("CDN edge caches cleared and rebuilt successfully.");
                        }}
                        disabled={isReadOnly}
                        className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-xs font-black text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300"
                      >
                        Purge CDN Cache
                      </button>
                    </div>
                  </div>

                  {/* QUEUE MONITOR PANEL (DEVELOPER ONLY) */}
                  {selectedRole === "Developer" && (
                    <div className="rounded-[20px] border border-red-200 bg-red-50/20 p-5 shadow-sm dark:border-red-950/25 dark:bg-red-950/5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-black text-red-950 dark:text-red-400 uppercase tracking-wider">
                            Real-time Node Queue Worker Monitor
                          </h3>
                          <span className="text-[10px] font-black text-red-600/70 dark:text-red-500">
                            Developer Privilege Access Only
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                            activeStore.queueWorkerStatus === "healthy"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {activeStore.queueWorkerStatus}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-2 text-center text-xs font-semibold">
                        <div className="rounded-lg bg-white p-2.5 dark:bg-gray-900 border border-red-100/50 dark:border-red-950/20">
                          <span className="block text-[9px] font-black text-gray-400 uppercase">
                            Waiting
                          </span>
                          <span className="font-mono text-sm font-black text-gray-800 dark:text-gray-200">
                            {activeStore.queueOrdersWaiting}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white p-2.5 dark:bg-gray-900 border border-red-100/50 dark:border-red-950/20">
                          <span className="block text-[9px] font-black text-gray-400 uppercase">
                            Processing
                          </span>
                          <span className="font-mono text-sm font-black text-gray-800 dark:text-gray-200">
                            {activeStore.queueOrdersActive}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white p-2.5 dark:bg-gray-900 border border-red-100/50 dark:border-red-950/20">
                          <span className="block text-[9px] font-black text-gray-400 uppercase">
                            Failed
                          </span>
                          <span className="font-mono text-sm font-black text-red-600">
                            {activeStore.queueFailedJobs}
                          </span>
                        </div>
                        <div className="rounded-lg bg-white p-2.5 dark:bg-gray-900 border border-red-100/50 dark:border-red-950/20">
                          <span className="block text-[9px] font-black text-gray-400 uppercase">
                            Dead Letter
                          </span>
                          <span className="font-mono text-sm font-black text-red-700">
                            {activeStore.queueDeadLetters}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => {
                            if (activeStore.queueFailedJobs === 0) {
                              toast.info("No failed jobs present in queue.");
                              return;
                            }
                            toast.loading("Re-enqueuing failed sync payload sessions...");
                            setTimeout(() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id) {
                                  return {
                                    ...s,
                                    queueFailedJobs: 0,
                                    queueOrdersWaiting: s.queueOrdersWaiting + s.queueFailedJobs,
                                  };
                                }
                                return s;
                              });
                              saveStores(updated);
                              toast.dismiss();
                              toast.success("All failed synchronization jobs re-queued.");
                            }, 1000);
                          }}
                          className="flex-1 rounded-lg bg-white border border-red-200 py-1.5 text-xs font-black text-red-800 hover:bg-red-50 dark:bg-gray-800 dark:border-red-950/30 dark:text-red-400"
                        >
                          Retry Failed Jobs
                        </button>
                        <button
                          onClick={() => {
                            if (activeStore.queueDeadLetters === 0) {
                              toast.info("Dead Letter Queue is empty.");
                              return;
                            }
                            toast.loading("Replaying DLQ envelopes into active channel...");
                            setTimeout(() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id) {
                                  return {
                                    ...s,
                                    queueDeadLetters: 0,
                                    queueOrdersWaiting: s.queueOrdersWaiting + s.queueDeadLetters,
                                  };
                                }
                                return s;
                              });
                              saveStores(updated);
                              toast.dismiss();
                              toast.success("Dead letter envelopes replayed.");
                            }, 1000);
                          }}
                          className="flex-1 rounded-lg bg-white border border-red-200 py-1.5 text-xs font-black text-red-800 hover:bg-red-50 dark:bg-gray-800 dark:border-red-950/30 dark:text-red-400"
                        >
                          Replay Dead Letters
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ANALYTICS CHARTS DASHBOARD */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        Outlet Sales & Traffic Analytics
                      </h3>
                      <TrendingUp size={16} className="text-[#0E4825]" />
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4 text-xs font-semibold">
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40">
                        <span className="block text-gray-400">AOV (Average Basket):</span>
                        <span className="font-mono text-sm font-black text-gray-900 dark:text-white">
                          ₹{activeStore.avgOrderValue}
                        </span>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900/40">
                        <span className="block text-gray-400">Peak Ordering Hour:</span>
                        <span className="font-mono text-sm font-black text-gray-900 dark:text-white truncate">
                          {activeStore.peakHour}
                        </span>
                      </div>
                    </div>

                    {/* Weekly Sales Chart */}
                    <div className="h-44 w-full">
                      <span className="block text-[10px] font-black text-gray-400 uppercase mb-2">
                        Weekly Revenue Trend (INR)
                      </span>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={activeStore.weeklyRevenueTrend.map((val, idx) => ({
                            day: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][idx],
                            revenue: val,
                          }))}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0E4825" stopOpacity={0.2} />
                              <stop offset="95%" stopColor="#0E4825" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="day" stroke="#94a3b8" fontSize={9} />
                          <YAxis stroke="#94a3b8" fontSize={9} />
                          <ChartTooltip />
                          <Area
                            type="monotone"
                            dataKey="revenue"
                            stroke="#0E4825"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#revenueGrad)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* CONFIGURATIONS & SETTINGS TOGGLES */}
                  <div className="rounded-[20px] border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#1C1C1E]">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
                        POS Webhook Toggles & Settings
                      </h3>
                      <Settings size={16} className="text-gray-400" />
                    </div>

                    <form onSubmit={handleUpdateStoreSettings} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/30">
                          <div>
                            <span className="block text-gray-700 dark:text-gray-300">
                              Auto Accept Orders
                            </span>
                            <span className="block text-[8px] text-gray-400 font-bold">
                              POS bypass mode
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={activeStore.autoAcceptOrders}
                            onChange={() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id)
                                  return { ...s, autoAcceptOrders: !s.autoAcceptOrders };
                                return s;
                              });
                              saveStores(updated);
                            }}
                            className="h-4 w-4 text-[#0E4825]"
                          />
                        </div>

                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/30">
                          <div>
                            <span className="block text-gray-700 dark:text-gray-300">
                              Kitchen Display Link
                            </span>
                            <span className="block text-[8px] text-gray-400 font-bold">
                              KDS screen syncing
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={activeStore.kitchenDisplayEnabled}
                            onChange={() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id)
                                  return { ...s, kitchenDisplayEnabled: !s.kitchenDisplayEnabled };
                                return s;
                              });
                              saveStores(updated);
                            }}
                            className="h-4 w-4 text-[#0E4825]"
                          />
                        </div>

                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/30">
                          <div>
                            <span className="block text-gray-700 dark:text-gray-300">
                              Online Payments
                            </span>
                            <span className="block text-[8px] text-gray-400 font-bold">
                              Card, UPI, Netbanking
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={activeStore.onlinePaymentEnabled}
                            onChange={() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id)
                                  return { ...s, onlinePaymentEnabled: !s.onlinePaymentEnabled };
                                return s;
                              });
                              saveStores(updated);
                            }}
                            className="h-4 w-4 text-[#0E4825]"
                          />
                        </div>

                        <div className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-gray-900/30">
                          <div>
                            <span className="block text-gray-700 dark:text-gray-300">
                              Cash on Delivery
                            </span>
                            <span className="block text-[8px] text-gray-400 font-bold">
                              Allow pay-at-doorstep
                            </span>
                          </div>
                          <input
                            type="checkbox"
                            disabled={isReadOnly}
                            checked={activeStore.cashOnDeliveryEnabled}
                            onChange={() => {
                              const updated = stores.map((s) => {
                                if (s.id === activeStore.id)
                                  return { ...s, cashOnDeliveryEnabled: !s.cashOnDeliveryEnabled };
                                return s;
                              });
                              saveStores(updated);
                            }}
                            className="h-4 w-4 text-[#0E4825]"
                          />
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* CONFIRM TOGGLE STORE MODAL */}
      {confirmToggleStore && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setConfirmToggleStore(null)}
          onConfirm={handleConfirmToggleStoreState}
          title={`${confirmToggleStore.isOpen ? "CLOSE" : "OPEN"} Burgonomics Outlet POS?`}
          description={`Are you sure you want to toggle POS operating state of ${confirmToggleStore.name}? Customers using Swiggy/Zomgy/Petpooja channels will receive immediate routing state adjustments.`}
          confirmLabel="Confirm Toggle State"
        />
      )}

      {/* COMPLIANCE SECURE DOCUMENT VIEWER MODAL */}
      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-5 dark:bg-[#1C1C1E] shadow-xl border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-[#FF6600]" />
                <h3 className="font-black text-sm text-gray-900 dark:text-white">{viewDoc.name}</h3>
              </div>
              <button
                onClick={() => setViewDoc(null)}
                className="rounded-lg bg-gray-50 p-1 text-gray-400 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300"
              >
                <XCircle size={16} />
              </button>
            </div>

            {/* Document visual preview content */}
            <div className="my-6 rounded-lg bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-800 p-8 text-center">
              <FileText size={48} className="mx-auto text-gray-300" />
              <span className="block mt-4 text-xs font-black text-gray-700 dark:text-gray-200">
                BURGONOMICS ENVELOPE SECURE DOCUMENT ARCHIVE
              </span>
              <p className="mt-1 text-[10px] text-gray-400 font-mono">
                DOCUMENT METADATA HASH: MD5_{viewDoc.id.replace(/-/g, "_")}_CERT_SECURE
              </p>

              <div className="mt-6 flex flex-wrap justify-center gap-4 text-xs">
                <div className="text-left bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 p-3 rounded-lg">
                  <span className="block text-[8px] font-black text-gray-400 uppercase">
                    Document Type
                  </span>
                  <span className="font-bold">{viewDoc.type}</span>
                </div>
                <div className="text-left bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-gray-800 p-3 rounded-lg">
                  <span className="block text-[8px] font-black text-gray-400 uppercase">
                    Compliance Expiry
                  </span>
                  <span className="font-bold text-emerald-600">{viewDoc.expiryDate}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                onClick={() => setViewDoc(null)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-500 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700"
              >
                CLOSE VAULT
              </button>
              <button
                onClick={() => {
                  toast.success("Document downloaded securely onto administration terminal.");
                  setViewDoc(null);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-[#0E4825] px-4 py-2 text-xs font-black text-white hover:bg-[#082E17]"
              >
                <Download size={14} />
                <span>SECURE DOWNLOAD</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN STAFF MODAL */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-[1px]">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-5 dark:bg-[#1C1C1E] shadow-xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between border-b border-gray-50 pb-3 dark:border-gray-800">
              <h3 className="font-black text-sm text-gray-900 dark:text-white">
                ASSIGN NEW KITCHEN STAFF
              </h3>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="rounded-lg bg-gray-50 p-1 text-gray-400 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-300"
              >
                <XCircle size={16} />
              </button>
            </div>

            <form onSubmit={handleAddStaffMember} className="mt-4 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                  Full Staff Name *
                </label>
                <input
                  type="text"
                  required
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="e.g. Ramesh Prajapati"
                  className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                    Operational Role
                  </label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as StaffMember["role"])}
                    className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  >
                    <option value="Chef">Chef / Cook</option>
                    <option value="Cashier">Cashier</option>
                    <option value="Delivery">Delivery Executive</option>
                    <option value="Assistant Manager">Assistant Manager</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    placeholder="e.g. +91 98321 04221"
                    className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">
                  Corporate Email Address
                </label>
                <input
                  type="email"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  placeholder="e.g. ramesh@burgonomics.com"
                  className="w-full rounded-xl border border-gray-200 py-2 px-3 text-xs font-semibold outline-none focus:border-[#0E4825] dark:border-gray-700 dark:bg-gray-800"
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-50 pt-3 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-500 dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0E4825] px-4 py-2 text-xs font-black text-white hover:bg-[#082E17]"
                >
                  ASSIGN MEMBER
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
