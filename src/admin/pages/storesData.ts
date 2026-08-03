import type { Store } from "@/features/stores/models/Store";
import { MOCK_STORES } from "@/features/stores/data/mockStores";

export interface RichStoreHours {
  open: string;
  close: string;
  secondShiftOpen?: string;
  secondShiftClose?: string;
  closed?: boolean;
}

export interface WeeklySchedule {
  monday: RichStoreHours;
  tuesday: RichStoreHours;
  wednesday: RichStoreHours;
  thursday: RichStoreHours;
  friday: RichStoreHours;
  saturday: RichStoreHours;
  sunday: RichStoreHours;
}

export interface StaffMember {
  id: string;
  name: string;
  role: "Manager" | "Assistant Manager" | "Chef" | "Cashier" | "Delivery";
  phone: string;
  email: string;
  isOnline: boolean;
}

export interface StoreDocument {
  id: string;
  name: string;
  type: "GST" | "FSSAI" | "License" | "Agreement" | "Insurance" | "PDF";
  expiryDate: string;
  status: "active" | "expiring" | "expired";
}

export interface RichStore extends Store {
  richHours: WeeklySchedule;
  email: string;
  managerName: string;
  managerPhone: string;

  // Petpooja parameters
  webhookUrl: string;
  webhookStatus: "active" | "failed" | "disabled";
  circuitBreaker: "closed" | "open" | "half-open";
  lastSyncTime: string;
  menuVersion: string;
  webhookFailures: number;
  retryCount: number;

  // Queue parameters
  queueOrdersWaiting: number;
  queueOrdersActive: number;
  queueFailedJobs: number;
  queueDeadLetters: number;
  queueWorkerStatus: "healthy" | "paused" | "down";

  // Analytics
  todayRevenue: number;
  todayOrders: number;
  avgOrderValue: number;
  popularItem: string;
  peakHour: string;
  customerCount: number;
  repeatCustomerPercentage: number;
  weeklyRevenueTrend: number[];
  monthlyRevenueTrend: number[];

  // Settings Toggles
  autoAcceptOrders: boolean;
  kitchenDisplayEnabled: boolean;
  onlinePaymentEnabled: boolean;
  cashOnDeliveryEnabled: boolean;

  // Staff
  staff: StaffMember[];

  // Delivery
  deliveryRadiusKm: number;
  deliveryMinOrder: number;
  deliveryMaxDistance: number;
  deliveryPolygonCoords?: { lat: number; lng: number }[];

  // Media Gallery
  media: {
    heroBanner: string;
    logo: string;
    gallery: string[];
  };

  // Documents
  documents: StoreDocument[];
}

// Generate rich schedules
const DEFAULT_WEEKLY_SCHEDULE: WeeklySchedule = {
  monday: { open: "11:00", close: "15:00", secondShiftOpen: "18:00", secondShiftClose: "23:00" },
  tuesday: { open: "11:00", close: "15:00", secondShiftOpen: "18:00", secondShiftClose: "23:00" },
  wednesday: { open: "11:00", close: "15:00", secondShiftOpen: "18:00", secondShiftClose: "23:00" },
  thursday: { open: "11:00", close: "15:00", secondShiftOpen: "18:00", secondShiftClose: "23:00" },
  friday: { open: "11:00", close: "23:59" }, // Extended continuous shift
  saturday: { open: "11:00", close: "23:59" },
  sunday: { open: "11:00", close: "23:59" },
};

// Generates staff members
const generateStaff = (storeId: string, managerName: string): StaffMember[] => [
  {
    id: `STF-${storeId}-01`,
    name: managerName,
    role: "Manager",
    phone: "+91 98765 43210",
    email: `${managerName.toLowerCase().replace(/\s/g, "")}@burgonomics.com`,
    isOnline: true,
  },
  {
    id: `STF-${storeId}-02`,
    name: "Arun Patel",
    role: "Assistant Manager",
    phone: "+91 98765 43211",
    email: `arun.${storeId}@burgonomics.com`,
    isOnline: true,
  },
  {
    id: `STF-${storeId}-03`,
    name: "Sanjay Joshi",
    role: "Chef",
    phone: "+91 98765 43212",
    email: `sanjay.kitchen@burgonomics.com`,
    isOnline: true,
  },
  {
    id: `STF-${storeId}-04`,
    name: "Priya Shah",
    role: "Cashier",
    phone: "+91 98765 43213",
    email: `priya.${storeId}@burgonomics.com`,
    isOnline: false,
  },
  {
    id: `STF-${storeId}-05`,
    name: "Vikram Rathod",
    role: "Delivery",
    phone: "+91 98765 43214",
    email: `vikram.courier@burgonomics.com`,
    isOnline: true,
  },
];

// Generates documents
const generateDocuments = (storeId: string): StoreDocument[] => [
  {
    id: `DOC-${storeId}-01`,
    name: "FSSAI Food License.pdf",
    type: "FSSAI",
    expiryDate: "2027-12-31",
    status: "active",
  },
  {
    id: `DOC-${storeId}-02`,
    name: "GST Registration Certificate.pdf",
    type: "GST",
    expiryDate: "2029-06-15",
    status: "active",
  },
  {
    id: `DOC-${storeId}-03`,
    name: "Commercial Rental Agreement.pdf",
    type: "Agreement",
    expiryDate: "2026-10-31",
    status: "expiring",
  },
  {
    id: `DOC-${storeId}-04`,
    name: "Fire Safety Clearance License.pdf",
    type: "License",
    expiryDate: "2026-04-18",
    status: "active",
  },
];

// Seed managers
const MANAGERS = [
  "Rajesh Sharma",
  "Milind Sawant",
  "Karthik Kumar",
  "Anil Tyagi",
  "Subhash Sen",
  "Hardik Patel",
  "Amit Mehta",
  "Nirav Shah",
  "Sandeep Vyas",
  "Gaurav Dave",
  "Hitesh Trivedi",
  "Mayur Solanki",
  "Kunal Vaghela",
  "Dhaval Darji",
  "Jigar Rana",
  "Pankaj Mishra",
];

// Populate Rich Store Directory from MOCK_STORES
export const INITIAL_RICH_STORES: RichStore[] = MOCK_STORES.map((store, idx) => {
  const managerName = MANAGERS[idx] || "Operational Lead";
  const revenueSeed = 30000 + Math.random() * 45000;
  const ordersSeed = Math.floor(revenueSeed / 320);

  // Custom bounding coordinates for visual delivery area
  const angleStep = (Math.PI * 2) / 5;
  const polyCoords = Array.from({ length: 5 }).map((_, i) => {
    const angle = i * angleStep;
    const r = 0.02 + Math.random() * 0.01; // roughly 2-3km bounding coordinates
    return {
      lat: store.lat + Math.sin(angle) * r,
      lng: store.lng + Math.cos(angle) * r,
    };
  });

  return {
    ...store,
    richHours: { ...DEFAULT_WEEKLY_SCHEDULE },
    email: `${store.name.toLowerCase().replace(/\s/g, "")}@burgonomics.com`,
    managerName,
    managerPhone: store.phone || "+91 79403 98120",

    // Petpooja Integration Details
    webhookUrl: `https://api.burgonomics.com/webhooks/petpooja/v1/${store.id}`,
    webhookStatus: store.isOpen ? "active" : "failed",
    circuitBreaker: store.isOpen ? "closed" : "open",
    lastSyncTime: new Date(Date.now() - Math.random() * 120000).toISOString(),
    menuVersion: `v3.12.${idx + 5}`,
    webhookFailures: store.isOpen ? 0 : 4,
    retryCount: store.isOpen ? 0 : 2,

    // Queues
    queueOrdersWaiting: store.isOpen ? Math.floor(Math.random() * 6) : 0,
    queueOrdersActive: store.isOpen ? Math.floor(Math.random() * 4) + 1 : 0,
    queueFailedJobs: store.isOpen ? Math.floor(Math.random() * 2) : 0,
    queueDeadLetters: store.isOpen ? Math.floor(Math.random() * 1.2) : 0,
    queueWorkerStatus: store.isOpen ? "healthy" : "down",

    // Operations Analytics
    todayRevenue: store.isOpen ? Math.floor(revenueSeed) : 0,
    todayOrders: store.isOpen ? ordersSeed : 0,
    avgOrderValue: store.isOpen ? Math.floor(revenueSeed / ordersSeed) : 0,
    popularItem:
      idx % 3 === 0
        ? "Classic Cheese Overload"
        : idx % 3 === 1
          ? "Crispy Paneer Supreme"
          : "Vibe-Check Veggie Burger",
    peakHour: idx % 2 === 0 ? "19:00 - 21:00" : "13:00 - 14:30",
    customerCount: store.isOpen ? Math.floor(ordersSeed * 1.4) : 0,
    repeatCustomerPercentage: 35 + Math.floor(Math.random() * 25),
    weeklyRevenueTrend: Array.from({ length: 7 }).map(() =>
      Math.floor(40000 + Math.random() * 40000),
    ),
    monthlyRevenueTrend: Array.from({ length: 30 }).map(() =>
      Math.floor(35000 + Math.random() * 50000),
    ),

    // Active Toggle Controls
    autoAcceptOrders: idx % 4 !== 0,
    kitchenDisplayEnabled: true,
    onlinePaymentEnabled: true,
    cashOnDeliveryEnabled: idx % 5 !== 0,

    // Relations
    staff: generateStaff(store.id, managerName),
    documents: generateDocuments(store.id),
    deliveryRadiusKm: 5,
    deliveryMinOrder: 150,
    deliveryMaxDistance: 7,
    deliveryPolygonCoords: polyCoords,

    // Assets
    media: {
      heroBanner:
        "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=800&q=80",
      logo: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=150&q=80",
      gallery: [
        "https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80",
        "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=400&q=80",
      ],
    },
  };
});
