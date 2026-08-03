import { toast } from "sonner";

export interface AddressSnapshot {
  id: string;
  label: "Home" | "Office" | "Other";
  contactName: string;
  contactPhone: string;
  line1: string;
  line2: string;
  city: string;
  pincode: string;
  coords: string;
  lastUsed: boolean;
  isDefault: boolean;
}

export interface LoyaltyHistoryItem {
  id: string;
  date: string;
  action: "ADD" | "REMOVE" | "EXPIRE" | "REDEEM" | "REWARD_ISSUED" | "TIER_ADJUST";
  points: number;
  description: string;
  operator: string;
}

export interface CouponItem {
  code: string;
  discount: string;
  status: "Available" | "Used" | "Expired";
  usedAt?: string;
  source: string;
}

export interface NotificationLog {
  id: string;
  type: "SMS" | "Push" | "WhatsApp" | "Email";
  title: string;
  body: string;
  sentAt: string;
  status: "Delivered" | "Opened" | "Clicked" | "Failed";
}

export interface SupportCase {
  id: string;
  date: string;
  type: "Refund Complaint" | "Delivery Delay" | "Incorrect Order" | "App Feedback";
  description: string;
  status: "Resolved" | "Under Investigation" | "Open";
  resolution?: string;
  internalNotes?: string;
}

export interface CustomerAuditLog {
  id: string;
  date: string;
  action: string;
  operator: string;
  ipAddress: string;
  device: string;
}

export interface CustomerProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  avatar: string;
  city: string;
  preferredStore: string;
  ordersCount: number;
  totalSpent: number;
  loyaltyTier: "Bronze" | "Silver" | "Gold" | "Platinum" | "VIP";
  lastOrderDate: string;
  status: "Active" | "Blocked";
  joinedAt: string;
  gender: "Male" | "Female" | "Other" | "Prefer not to say";
  birthday: string;
  preferredLanguage: string;
  notes: string;
  addresses: AddressSnapshot[];
  loyalty: {
    currentPoints: number;
    lifetimePoints: number;
    pointsExpiring: number;
    expiringDate: string;
    tierProgress: number; // 0 to 100
    history: LoyaltyHistoryItem[];
  };
  coupons: CouponItem[];
  notifications: NotificationLog[];
  supportHistory: SupportCase[];
  auditLogs: CustomerAuditLog[];
}

export interface SavedSegment {
  id: string;
  name: string;
  description: string;
  filters: {
    city?: string;
    minSpend?: number;
    minOrders?: number;
    lastOrderDays?: number;
    loyaltyTier?: string;
  };
  isCustom?: boolean;
}

const SEED_CUSTOMERS: CustomerProfile[] = [
  {
    id: "CUST-1001",
    fullName: "Arjun Kapoor",
    phone: "+91 98210 12345",
    email: "arjun.kapoor@gmail.com",
    avatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    city: "Ahmedabad",
    preferredStore: "Burgonomics Navrangpura",
    ordersCount: 24,
    totalSpent: 8430.0,
    loyaltyTier: "Gold",
    lastOrderDate: "2026-07-15",
    status: "Active",
    joinedAt: "2026-03-12",
    gender: "Male",
    birthday: "1994-08-22",
    preferredLanguage: "English",
    notes: "VIP regular customer. Prefers extra peri-peri sprinkles. Appreciate hand-delivery.",
    addresses: [
      {
        id: "addr-101",
        label: "Home",
        contactName: "Arjun Kapoor",
        contactPhone: "+91 98210 12345",
        line1: "A-502, Shivalik Residency",
        line2: "Navrangpura",
        city: "Ahmedabad",
        pincode: "380009",
        coords: "23.0366, 72.5612",
        lastUsed: true,
        isDefault: true,
      },
      {
        id: "addr-102",
        label: "Office",
        contactName: "Arjun Kapoor",
        contactPhone: "+91 98210 12345",
        line1: "8th Floor, Pinnacle Business Park",
        line2: "Prahlad Nagar",
        city: "Ahmedabad",
        pincode: "380015",
        coords: "23.0132, 72.5085",
        lastUsed: false,
        isDefault: false,
      },
    ],
    loyalty: {
      currentPoints: 850,
      lifetimePoints: 2450,
      pointsExpiring: 120,
      expiringDate: "2026-12-31",
      tierProgress: 70,
      history: [
        {
          id: "L-1001",
          date: "2026-07-15",
          action: "ADD",
          points: 84,
          description: "Earned on order BUR-8201",
          operator: "System",
        },
        {
          id: "L-1002",
          date: "2026-07-02",
          action: "REDEEM",
          points: 200,
          description: "Redeemed for free Beverage Combo",
          operator: "POS Terminal Navrangpura",
        },
        {
          id: "L-1003",
          date: "2026-06-25",
          action: "ADD",
          points: 150,
          description: "Referral campaign reward trigger",
          operator: "Marketing Campaign",
        },
        {
          id: "L-1004",
          date: "2026-05-18",
          action: "TIER_ADJUST",
          points: 0,
          description: "Upgraded to Gold Tier automatically",
          operator: "System",
        },
      ],
    },
    coupons: [
      { code: "BURGERGOLD20", discount: "20% OFF", status: "Available", source: "Loyalty Reward" },
      {
        code: "HELLOSUMMER",
        discount: "₹100 FLAT OFF",
        status: "Used",
        usedAt: "2026-06-12",
        source: "Campaign",
      },
    ],
    notifications: [
      {
        id: "N-101",
        type: "WhatsApp",
        title: "Order Confirmed!",
        body: "Hi Arjun, your delicious double cheese burger is on the grill!",
        sentAt: "2026-07-15 19:12:02",
        status: "Opened",
      },
      {
        id: "N-102",
        type: "SMS",
        title: "Gold Tier Upgrade!",
        body: "Congratulations! You've unlocked Gold status.",
        sentAt: "2026-05-18 11:30:15",
        status: "Delivered",
      },
      {
        id: "N-103",
        type: "Push",
        title: "Craving Fries?",
        body: "Get a free portion of Peri-Peri Fries today only!",
        sentAt: "2026-07-04 12:00:00",
        status: "Clicked",
      },
    ],
    supportHistory: [
      {
        id: "SUP-101",
        date: "2026-04-10",
        type: "Delivery Delay",
        description: "Delivery delayed by 40 minutes due to heavy monsoon downpour.",
        status: "Resolved",
        resolution: "Issued ₹150 credit coupon manually.",
        internalNotes: "Delivery delays during rainstorm.",
      },
    ],
    auditLogs: [
      {
        id: "A-1001",
        date: "2026-07-16 11:04:12",
        action: "Internal Profile Notes updated",
        operator: "Jesal Pande (Super Admin)",
        ipAddress: "157.34.82.112",
        device: "Chrome / macOS",
      },
    ],
  },
  {
    id: "CUST-1002",
    fullName: "Aarav Mehta",
    phone: "+91 98765 43210",
    email: "aarav.mehta@gmail.com",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    city: "Delhi",
    preferredStore: "Connaught Place, Delhi",
    ordersCount: 42,
    totalSpent: 16900.0,
    loyaltyTier: "VIP",
    lastOrderDate: "2026-07-19",
    status: "Active",
    joinedAt: "2025-10-04",
    gender: "Male",
    birthday: "1989-11-05",
    preferredLanguage: "English",
    notes:
      "Top 1% spender. Extreme advocate, orders every Friday evening. Loves Veg Cheese Burger. Always pays online.",
    addresses: [
      {
        id: "addr-201",
        label: "Home",
        contactName: "Aarav Mehta",
        contactPhone: "+91 98765 43210",
        line1: "B-402, Shivam Apartments",
        line2: "Outer Ring Road, Pitampura",
        city: "New Delhi",
        pincode: "110034",
        coords: "28.7032, 77.1345",
        lastUsed: true,
        isDefault: true,
      },
    ],
    loyalty: {
      currentPoints: 2450,
      lifetimePoints: 7850,
      pointsExpiring: 450,
      expiringDate: "2026-10-15",
      tierProgress: 100,
      history: [
        {
          id: "L-2001",
          date: "2026-07-19",
          action: "ADD",
          points: 180,
          description: "Earned on order BUR-8201",
          operator: "System",
        },
        {
          id: "L-2002",
          date: "2026-07-10",
          action: "ADD",
          points: 250,
          description: "VIP Birthday bonus points",
          operator: "System",
        },
      ],
    },
    coupons: [
      {
        code: "VIPFREEBURGER",
        discount: "100% OFF (Free Premium)",
        status: "Available",
        source: "Loyalty Reward",
      },
    ],
    notifications: [
      {
        id: "N-201",
        type: "Push",
        title: "Fresh Buns Alert!",
        body: "Your favorite Veg Cheese Burger is calling.",
        sentAt: "2026-07-19 13:00:00",
        status: "Clicked",
      },
    ],
    supportHistory: [],
    auditLogs: [],
  },
  {
    id: "CUST-1003",
    fullName: "Shalini Nair",
    phone: "+91 91100 56789",
    email: "shalini.nair@hotmail.com",
    avatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    city: "Ahmedabad",
    preferredStore: "Burgonomics Science City",
    ordersCount: 15,
    totalSpent: 4210.0,
    loyaltyTier: "Silver",
    lastOrderDate: "2026-07-01",
    status: "Active",
    joinedAt: "2026-04-18",
    gender: "Female",
    birthday: "1997-03-14",
    preferredLanguage: "Hindi",
    notes: "Prefers pickup options. Strict vegetarian, double-checks if mayo is eggless.",
    addresses: [
      {
        id: "addr-301",
        label: "Home",
        contactName: "Shalini Nair",
        contactPhone: "+91 91100 56789",
        line1: "Flat 404, Dev Castle, Science City Road",
        line2: "Sola",
        city: "Ahmedabad",
        pincode: "380060",
        coords: "23.0768, 72.5122",
        lastUsed: true,
        isDefault: true,
      },
    ],
    loyalty: {
      currentPoints: 340,
      lifetimePoints: 1240,
      pointsExpiring: 0,
      expiringDate: "2027-04-18",
      tierProgress: 35,
      history: [
        {
          id: "L-3001",
          date: "2026-07-01",
          action: "ADD",
          points: 42,
          description: "Earned on order BUR-7988",
          operator: "System",
        },
      ],
    },
    coupons: [],
    notifications: [],
    supportHistory: [],
    auditLogs: [],
  },
  {
    id: "CUST-1004",
    fullName: "Devendra Gowda",
    phone: "+91 88800 11223",
    email: "dev.gowda@techcorp.in",
    avatar:
      "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    city: "Ahmedabad",
    preferredStore: "Burgonomics Navrangpura",
    ordersCount: 38,
    totalSpent: 12900.0,
    loyaltyTier: "Platinum",
    lastOrderDate: "2026-07-18",
    status: "Active",
    joinedAt: "2026-01-05",
    gender: "Male",
    birthday: "1985-02-28",
    preferredLanguage: "English",
    notes:
      "Late night ordering cohort. Often orders large family bundles containing Pizza Burgers.",
    addresses: [
      {
        id: "addr-401",
        label: "Home",
        contactName: "Devendra Gowda",
        contactPhone: "+91 88800 11223",
        line1: "House No 12, Swati Society",
        line2: "C G Road, Navrangpura",
        city: "Ahmedabad",
        pincode: "380009",
        coords: "23.0315, 72.5630",
        lastUsed: true,
        isDefault: true,
      },
    ],
    loyalty: {
      currentPoints: 1380,
      lifetimePoints: 4890,
      pointsExpiring: 220,
      expiringDate: "2026-11-30",
      tierProgress: 88,
      history: [
        {
          id: "L-4001",
          date: "2026-07-18",
          action: "ADD",
          points: 129,
          description: "Earned on order BUR-8199",
          operator: "System",
        },
      ],
    },
    coupons: [],
    notifications: [],
    supportHistory: [],
    auditLogs: [],
  },
  {
    id: "CUST-1005",
    fullName: "Kriti Deshmukh",
    phone: "+91 77766 55443",
    email: "kriti.deshmukh@yahoo.com",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    city: "Ahmedabad",
    preferredStore: "Burgonomics Science City",
    ordersCount: 2,
    totalSpent: 390.0,
    loyaltyTier: "Bronze",
    lastOrderDate: "2026-07-15",
    status: "Active",
    joinedAt: "2026-07-15",
    gender: "Female",
    birthday: "2002-12-01",
    preferredLanguage: "Marathi",
    notes: "Newly acquired customer. Discovered us via Instagram campaigns.",
    addresses: [],
    loyalty: {
      currentPoints: 20,
      lifetimePoints: 20,
      pointsExpiring: 0,
      expiringDate: "2027-07-15",
      tierProgress: 10,
      history: [],
    },
    coupons: [
      { code: "FIRSTBITE", discount: "50% OFF up to ₹150", status: "Available", source: "Sign-up" },
    ],
    notifications: [],
    supportHistory: [],
    auditLogs: [],
  },
  {
    id: "CUST-1006",
    fullName: "Sameer Sen",
    phone: "+91 99999 88888",
    email: "sameer.sen@outlook.com",
    avatar:
      "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    city: "Noida",
    preferredStore: "Sector 62, Noida",
    ordersCount: 9,
    totalSpent: 2800.0,
    loyaltyTier: "Bronze",
    lastOrderDate: "2026-05-30",
    status: "Blocked",
    joinedAt: "2026-05-30",
    gender: "Other",
    birthday: "1991-04-10",
    preferredLanguage: "Hindi",
    notes: "Blocked due to high refund dispute rate and duplicate order chargebacks.",
    addresses: [],
    loyalty: {
      currentPoints: 50,
      lifetimePoints: 280,
      pointsExpiring: 0,
      expiringDate: "2027-05-30",
      tierProgress: 25,
      history: [],
    },
    coupons: [],
    notifications: [],
    supportHistory: [
      {
        id: "SUP-601",
        date: "2026-05-30",
        type: "Refund Complaint",
        description: "Claimed meal was spoiled. Demanded full immediate cash refund.",
        status: "Resolved",
        resolution: "Processed refund, but flagged account for suspicious repeat claims.",
        internalNotes: "Refund rate: 45%. Suspicious.",
      },
    ],
    auditLogs: [
      {
        id: "A-6001",
        date: "2026-06-01 15:44:10",
        action: "Account Blocked due to payment abuse logs",
        operator: "Finance Team / Auto-policy",
        ipAddress: "System Rule Engine",
        device: "Automated Policy",
      },
    ],
  },
];

const SEED_SEGMENTS: SavedSegment[] = [
  {
    id: "S-01",
    name: "VIP",
    description: "Spenders on top tier (Platinum, VIP)",
    filters: { loyaltyTier: "VIP" },
    isCustom: false,
  },
  {
    id: "S-02",
    name: "High Value",
    description: "Spenders with ₹5,000+ total billing",
    filters: { minSpend: 5000 },
    isCustom: false,
  },
  {
    id: "S-03",
    name: "At Risk",
    description: "Inactive spenders who ordered 60+ days ago",
    filters: { lastOrderDays: 60 },
    isCustom: false,
  },
  {
    id: "S-04",
    name: "New Customers",
    description: "Newly joined customer profiles within 30 days",
    filters: { minOrders: 2 },
    isCustom: false,
  },
  {
    id: "S-05",
    name: "Vegetarian Cohort",
    description: "Customers matching high-volume eggless menus",
    filters: {},
    isCustom: false,
  },
  {
    id: "S-06",
    name: "Late Night Customers",
    description: "Fulfillment hours skewed after 11:00 PM",
    filters: {},
    isCustom: false,
  },
  {
    id: "S-07",
    name: "Ahmedabad Loyalists",
    description: "Ahmedabad location store checkouts skewing 90%",
    filters: { city: "Ahmedabad" },
    isCustom: false,
  },
];

class CustomerDataStorage {
  private customers: CustomerProfile[] = [];
  private segments: SavedSegment[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window !== "undefined") {
      const storedCust = localStorage.getItem("burg_crm_customers");
      const storedSeg = localStorage.getItem("burg_crm_segments");

      if (storedCust) {
        try {
          this.customers = JSON.parse(storedCust);
        } catch {
          this.customers = SEED_CUSTOMERS;
        }
      } else {
        this.customers = SEED_CUSTOMERS;
        this.saveToStorage();
      }

      if (storedSeg) {
        try {
          this.segments = JSON.parse(storedSeg);
        } catch {
          this.segments = SEED_SEGMENTS;
        }
      } else {
        this.segments = SEED_SEGMENTS;
        this.saveToStorage();
      }
    } else {
      this.customers = SEED_CUSTOMERS;
      this.segments = SEED_SEGMENTS;
    }
  }

  private saveToStorage() {
    if (typeof window !== "undefined") {
      localStorage.setItem("burg_crm_customers", JSON.stringify(this.customers));
      localStorage.setItem("burg_crm_segments", JSON.stringify(this.segments));
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((listener) => listener());
  }

  // Getters
  getCustomers(): CustomerProfile[] {
    return this.customers;
  }

  getCustomersCount(): number {
    return this.customers.length;
  }

  getCustomerById(id: string): CustomerProfile | undefined {
    return this.customers.find((c) => c.id === id);
  }

  getSegments(): SavedSegment[] {
    return this.segments;
  }

  // Setters & Actions
  updateCustomerNotes(id: string, notes: string, operator: string) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    cust.notes = notes;
    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: "Profile internal notes updated",
      operator,
      ipAddress: "157.34.82.112",
      device: "Admin Panel / Chrome",
    });

    toast.success("Customer internal file notes updated successfully.");
    this.notify();
    return true;
  }

  toggleBlockStatus(id: string, operator: string) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    cust.status = cust.status === "Active" ? "Blocked" : "Active";
    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: `Account status toggled to ${cust.status.toUpperCase()}`,
      operator,
      ipAddress: "157.34.82.112",
      device: "Admin Panel / Chrome",
    });

    toast.success(`Customer profile status changed to ${cust.status}.`);
    this.notify();
    return true;
  }

  adjustLoyaltyPoints(
    id: string,
    action: "ADD" | "REMOVE" | "EXPIRE",
    amount: number,
    description: string,
    operator: string,
  ) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    const change = amount;
    if (action === "ADD") {
      cust.loyalty.currentPoints += change;
      cust.loyalty.lifetimePoints += change;
    } else if (action === "REMOVE" || action === "EXPIRE") {
      cust.loyalty.currentPoints = Math.max(0, cust.loyalty.currentPoints - change);
    }

    // Recalculate progress to next tier (hypothetically)
    const points = cust.loyalty.lifetimePoints;
    if (points >= 5000) {
      cust.loyaltyTier = "VIP";
      cust.loyalty.tierProgress = 100;
    } else if (points >= 3000) {
      cust.loyaltyTier = "Platinum";
      cust.loyalty.tierProgress = Math.round(((points - 3000) / 2000) * 100);
    } else if (points >= 1500) {
      cust.loyaltyTier = "Gold";
      cust.loyalty.tierProgress = Math.round(((points - 1500) / 1500) * 100);
    } else if (points >= 500) {
      cust.loyaltyTier = "Silver";
      cust.loyalty.tierProgress = Math.round(((points - 500) / 1000) * 100);
    } else {
      cust.loyaltyTier = "Bronze";
      cust.loyalty.tierProgress = Math.round((points / 500) * 100);
    }

    cust.loyalty.history.unshift({
      id: `L-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 10),
      action,
      points: change,
      description,
      operator,
    });

    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: `Adjusted Loyalty: ${action} ${change} points. Reason: ${description}`,
      operator,
      ipAddress: "157.34.82.112",
      device: "Admin Panel / Chrome",
    });

    toast.success(`Successfully adjusted customer loyalty points balance.`);
    this.notify();
    return true;
  }

  adjustLoyaltyTier(
    id: string,
    tier: "Bronze" | "Silver" | "Gold" | "Platinum" | "VIP",
    operator: string,
  ) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    const oldTier = cust.loyaltyTier;
    cust.loyaltyTier = tier;

    // Auto-align lifetime points to lower-bound if forced upgrade
    const tierBaselines = { Bronze: 0, Silver: 500, Gold: 1500, Platinum: 3000, VIP: 5000 };
    if (cust.loyalty.lifetimePoints < tierBaselines[tier]) {
      cust.loyalty.lifetimePoints = tierBaselines[tier];
    }
    cust.loyalty.tierProgress = 100; // Stabilize progression metric

    cust.loyalty.history.unshift({
      id: `L-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 10),
      action: "TIER_ADJUST",
      points: 0,
      description: `Manual override of loyalty tier from ${oldTier} to ${tier}`,
      operator,
    });

    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: `Forced loyalty tier upgrade/adjustment to ${tier}`,
      operator,
      ipAddress: "157.34.82.112",
      device: "Admin Panel / Chrome",
    });

    toast.success(`Successfully updated customer loyalty tier to ${tier}.`);
    this.notify();
    return true;
  }

  issueCoupon(
    id: string,
    coupon: { code: string; discount: string; source: string },
    operator: string,
  ) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    cust.coupons.unshift({
      code: coupon.code.toUpperCase(),
      discount: coupon.discount,
      status: "Available",
      source: coupon.source,
    });

    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: `Issued Coupon: ${coupon.code} (${coupon.discount})`,
      operator,
      ipAddress: "157.34.82.112",
      device: "Admin Panel / Chrome",
    });

    toast.success(`Issued promotional coupon ${coupon.code} to customer.`);
    this.notify();
    return true;
  }

  sendDirectNotification(
    id: string,
    notification: { type: "SMS" | "Push" | "WhatsApp" | "Email"; title: string; body: string },
    operator: string,
  ) {
    const cust = this.customers.find((c) => c.id === id);
    if (!cust) return false;

    const notifId = `N-${Date.now().toString().slice(-4)}`;
    cust.notifications.unshift({
      id: notifId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      sentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      status: "Delivered",
    });

    cust.auditLogs.unshift({
      id: `AUD-${Date.now().toString().slice(-4)}`,
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      action: `Sent custom direct notification (${notification.type}): ${notification.title}`,
      operator,
      ipAddress: "157.34.82.112",
      device: "Admin Panel / Chrome",
    });

    toast.success(`Direct message pushed over ${notification.type} gateway.`);
    this.notify();
    return true;
  }

  createCustomSegment(segment: SavedSegment) {
    this.segments.push(segment);
    toast.success(`Reusable segment "${segment.name}" saved to customer marketing filter-vault.`);
    this.notify();
    return true;
  }

  deleteSegment(id: string) {
    this.segments = this.segments.filter((s) => s.id !== id);
    toast.info("Reusable customer segment deleted.");
    this.notify();
    return true;
  }

  // Broad dispatch notifications (e.g. Campaign broadcasts)
  broadcastCampaign(
    type: "SMS" | "Push" | "WhatsApp" | "Email",
    title: string,
    body: string,
    recipientIds: string[],
    operator: string,
  ) {
    let successCount = 0;
    this.customers.forEach((cust) => {
      if (recipientIds.includes(cust.id)) {
        cust.notifications.unshift({
          id: `N-${Date.now().toString().slice(-4)}`,
          type,
          title,
          body,
          sentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          status: "Delivered",
        });
        cust.auditLogs.unshift({
          id: `AUD-${Date.now().toString().slice(-4)}`,
          date: new Date().toISOString().slice(0, 19).replace("T", " "),
          action: `Received broadcast campaign: "${title}"`,
          operator,
          ipAddress: "157.34.82.112",
          device: "Admin Panel / Chrome",
        });
        successCount++;
      }
    });

    toast.success(
      `Campaign broadcasted! Dispatched ${successCount} messages over ${type} gateway.`,
    );
    this.notify();
    return true;
  }
}

export const customerStorage = new CustomerDataStorage();
