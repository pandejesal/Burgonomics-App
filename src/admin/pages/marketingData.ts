import { toast } from "sonner";
import { customerStorage } from "./customersData";

export interface MarketingCampaign {
  id: string;
  name: string;
  description: string;
  objective:
    "Brand Awareness" | "Sales Conversion" | "User Retention" | "Re-engagement" | "Feedback Survey";
  channels: Array<"Push" | "SMS" | "WhatsApp" | "Email" | "In-App">;
  status: "Draft" | "Scheduled" | "Active" | "Paused" | "Completed" | "Archived";
  audienceType:
    | "Entire Base"
    | "Store Specific"
    | "City Specific"
    | "Custom Segment"
    | "VIP"
    | "Inactive"
    | "New Profiles"
    | "High Value"
    | "Birthday"
    | "Manual Selection";
  audienceFilterValue?: string; // stores segmentId, storeName, city etc.
  messageTitle: string;
  messageBody: string;
  messageImage?: string;
  deepLink?: string;
  couponCode?: string;
  createdAt: string;
  createdBy: string;
  scheduledTime?: string;
  stats: {
    sent: number;
    delivered: number;
    clicked: number;
    failed: number;
    revenue: number;
  };
  abTesting?: {
    enabled: boolean;
    subjectA: string;
    subjectB: string;
    splitPercent: number; // e.g. 20% test, 80% winner
    winner?: "A" | "B";
    metricsA: { sent: number; opened: number; revenue: number };
    metricsB: { sent: number; opened: number; revenue: number };
  };
}

export interface MarketingTemplate {
  id: string;
  name: string;
  category:
    | "Promotions"
    | "Birthday"
    | "Order Follow-up"
    | "Festival"
    | "Offers"
    | "New Store"
    | "Coupons"
    | "Loyalty"
    | "Feedback"
    | "Referral";
  channels: Array<"Push" | "SMS" | "WhatsApp" | "Email" | "In-App">;
  title: string;
  body: string;
  imageUrl?: string;
  deepLink?: string;
  variables: string[];
}

export interface MarketingOffer {
  id: string;
  name: string;
  description: string;
  type:
    | "BOGO"
    | "Combo Offer"
    | "Flat Discount"
    | "Percentage Discount"
    | "Free Delivery"
    | "Limited Time"
    | "Festival Offer"
    | "Store Specific";
  discountValue?: number;
  minOrderValue?: number;
  stores?: string[];
  status: "Active" | "Inactive";
  validFrom: string;
  validTo: string;
}

export interface AutomationNode {
  id: string;
  type: "trigger" | "action" | "wait" | "condition";
  label: string;
  config: Record<string, any>;
}

export interface AutomationEdge {
  id: string;
  from: string;
  to: string;
}

export interface MarketingAutomation {
  id: string;
  name: string;
  triggerType:
    | "Registration"
    | "Birthday"
    | "Anniversary"
    | "Order Completed"
    | "First Order"
    | "Nth Order"
    | "No Orders"
    | "Coupon Expiring"
    | "Points Expiring"
    | "Store Opened"
    | "Festival"
    | "Manual";
  status: "Active" | "Inactive";
  description: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  stats: {
    triggered: number;
    completed: number;
    conversions: number;
  };
}

export interface NotificationHistoryItem {
  id: string;
  customerName: string;
  customerId: string;
  channel: "Push" | "SMS" | "WhatsApp" | "Email" | "In-App";
  title: string;
  body: string;
  status: "Delivered" | "Read" | "Clicked" | "Failed";
  sentAt: string;
  retryCount: number;
  campaignId?: string;
  errorMessage?: string;
}

// Initial Templates
const INITIAL_TEMPLATES: MarketingTemplate[] = [
  {
    id: "TMP-101",
    name: "Classic Welcome Promotion",
    category: "Promotions",
    channels: ["Push", "WhatsApp"],
    title: "Welcome to BURGONOMICS, {{customer_name}}!",
    body: "Craving something damn good? Grab a FREE portion of Crispy Peri-Peri Fries on your next order from {{store_name}}. Use code {{coupon_code}} at checkout!",
    imageUrl:
      "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=60",
    deepLink: "burgonomics://menu/fries",
    variables: ["customer_name", "store_name", "coupon_code"],
  },
  {
    id: "TMP-102",
    name: "VIP Birthday Blast",
    category: "Birthday",
    channels: ["WhatsApp", "Email"],
    title: "Happy Birthday, {{customer_name}}! 🎂🍔",
    body: "Today is all about you! Enjoy a free Premium Double Cheese Burger combo on us. We've credited 500 bonus points to your account (Current Balance: {{points}} pts). Head over to {{store_name}} or order online!",
    imageUrl:
      "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=500&auto=format&fit=crop&q=60",
    variables: ["customer_name", "store_name", "points"],
  },
  {
    id: "TMP-103",
    name: "Inactive Win-back Hook",
    category: "Referral",
    channels: ["SMS", "Push"],
    title: "We miss you in {{city}}! 🥺",
    body: "It's been a while, {{customer_name}}. We've loaded an exclusive 40% discount voucher {{coupon_code}} onto your account. Valid at {{store_name}} for the next 48 hours!",
    imageUrl:
      "https://images.unsplash.com/photo-1550547660-d9450f859349?w=500&auto=format&fit=crop&q=60",
    variables: ["customer_name", "city", "coupon_code", "store_name"],
  },
  {
    id: "TMP-104",
    name: "Festival Weekend Feast",
    category: "Festival",
    channels: ["Email", "Push", "WhatsApp"],
    title: "Celebrate this Weekend with BURGONOMICS! 🎉",
    body: "Hi {{customer_name}}, make your celebrations extra juicy with our Family Burger Fest combo! Get Flat 25% off + Free Delivery across all outlets. Order now!",
    imageUrl:
      "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=500&auto=format&fit=crop&q=60",
    variables: ["customer_name"],
  },
];

// Initial Campaigns
const INITIAL_CAMPAIGNS: MarketingCampaign[] = [
  {
    id: "CAM-201",
    name: "Monsoon BOGO Fries Extravaganza",
    description:
      "Monsoon rainy-day special pushing dynamic BOGO coupons over push notification and WhatsApp channels.",
    objective: "Sales Conversion",
    channels: ["Push", "WhatsApp"],
    status: "Active",
    audienceType: "City Specific",
    audienceFilterValue: "Ahmedabad",
    messageTitle: "Rainy Day Burger Combo BOGO! 🌧️🍔",
    messageBody:
      "Hi {{customer_name}}! Rain outside? We have the warmth inside. Order any premium Burger at {{store_name}} and get a large Fries + Shake absolutely FREE! Use code RAINBOGO.",
    messageImage:
      "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500&auto=format&fit=crop&q=60",
    couponCode: "RAINBOGO",
    createdAt: "2026-07-10 11:20:00",
    createdBy: "Jesal Pande (Super Admin)",
    stats: {
      sent: 2450,
      delivered: 2390,
      clicked: 412,
      failed: 60,
      revenue: 78500,
    },
    abTesting: {
      enabled: true,
      subjectA: "Rainy Day Burger Combo BOGO! 🌧️🍔",
      subjectB: "Hot Burgers on a Rainy Day? Buy 1 Get 1 FREE! 🔥",
      splitPercent: 20,
      winner: "B",
      metricsA: { sent: 245, opened: 32, revenue: 6400 },
      metricsB: { sent: 245, opened: 54, revenue: 10800 },
    },
  },
  {
    id: "CAM-202",
    name: "Delhi VIP Friday Dinner Rush",
    description:
      "Targeted push notification to top-tier VIP customers in Delhi ahead of Friday evening peak hours.",
    objective: "User Retention",
    channels: ["Push"],
    status: "Paused",
    audienceType: "VIP",
    audienceFilterValue: "VIP Rank",
    messageTitle: "Your VIP Friday Treat Awaits!",
    messageBody:
      "Hi {{customer_name}}, treat yourself after a long week! Get double loyalty cashback (2x points) on all orders above ₹499 today at {{store_name}}.",
    messageImage:
      "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60",
    createdAt: "2026-07-14 09:30:15",
    createdBy: "Naman Gupta (Marketing Manager)",
    stats: {
      sent: 580,
      delivered: 578,
      clicked: 184,
      failed: 2,
      revenue: 42100,
    },
  },
  {
    id: "CAM-203",
    name: "Welcome Onboarding Automation Campaign",
    description:
      "Triggered onboarding campaign dispatching transactional discount FIRSTBITE to new signups.",
    objective: "Brand Awareness",
    channels: ["Email", "SMS"],
    status: "Active",
    audienceType: "New Profiles",
    messageTitle: "Welcome to the Burgonomics Family!",
    messageBody:
      "Hi {{customer_name}}, we're thrilled to have you! Enjoy 50% OFF up to ₹150 on your very first checkout. Apply {{coupon_code}} at checkout.",
    couponCode: "FIRSTBITE",
    createdAt: "2026-06-01 08:00:00",
    createdBy: "System",
    stats: {
      sent: 1540,
      delivered: 1520,
      clicked: 890,
      failed: 20,
      revenue: 148900,
    },
  },
  {
    id: "CAM-204",
    name: "Festival Season Family Combo Blast",
    description:
      "National broad promotional email and WhatsApp blast ahead of festival weekend peak.",
    objective: "Sales Conversion",
    channels: ["WhatsApp", "Email"],
    status: "Scheduled",
    audienceType: "Entire Base",
    messageTitle: "Feast with your Fam! Flat 25% Off combos!",
    messageBody:
      "Hi {{customer_name}}, gather the family! Order our Jumbo Family Buckets containing 4 Burgers, 2 Fries, 2 Dips, and 4 Drinks at flat 25% off. Use code FAMFEAST.",
    messageImage:
      "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=500&auto=format&fit=crop&q=60",
    couponCode: "FAMFEAST",
    scheduledTime: "2026-07-22 18:00:00",
    createdAt: "2026-07-18 16:45:00",
    createdBy: "Jesal Pande (Super Admin)",
    stats: {
      sent: 0,
      delivered: 0,
      clicked: 0,
      failed: 0,
      revenue: 0,
    },
  },
  {
    id: "CAM-205",
    name: "At-Risk Churn Prevention Win-back",
    description:
      "Win-back campaign targeting inactive customers who have not placed orders in over 60 days.",
    objective: "Re-engagement",
    channels: ["SMS"],
    status: "Completed",
    audienceType: "Inactive",
    messageTitle: "We Miss You! Grab ₹150 FLAT OFF!",
    messageBody:
      "Hi {{customer_name}}, its been a while! We've loaded ₹150 flat cash discount to your wallet. Use code WEBACK. Valid only for 48 hours!",
    couponCode: "WEBACK",
    createdAt: "2026-05-10 10:00:00",
    createdBy: "System",
    stats: {
      sent: 890,
      delivered: 840,
      clicked: 142,
      failed: 50,
      revenue: 22400,
    },
  },
];

// Initial Offers
const INITIAL_OFFERS: MarketingOffer[] = [
  {
    id: "OFF-301",
    name: "Buy 1 Get 1 Free Premium Burger",
    description: "BOGO offer on any premium chicken or veg burger purchased on Friday evenings.",
    type: "BOGO",
    status: "Active",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
  },
  {
    id: "OFF-302",
    name: "Jumbo Student Combo discount",
    description: "Flat 15% off for student ID verifications. Applies to standard veg meals only.",
    type: "Combo Offer",
    discountValue: 15,
    minOrderValue: 200,
    status: "Active",
    validFrom: "2026-04-01",
    validTo: "2026-09-30",
  },
  {
    id: "OFF-303",
    name: "Free Delivery over ₹350",
    description:
      "Completely free home delivery on checkouts exceeding ₹350, sponsored across Ahmedabad stores.",
    type: "Free Delivery",
    minOrderValue: 350,
    stores: ["Burgonomics Navrangpura", "Burgonomics Science City"],
    status: "Active",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
  },
  {
    id: "OFF-304",
    name: "Diwali Fest Percentage Splash",
    description: "Flat 30% discount on all family combos during the festive week.",
    type: "Festival Offer",
    discountValue: 30,
    minOrderValue: 599,
    status: "Inactive",
    validFrom: "2026-10-18",
    validTo: "2026-10-25",
  },
];

// Initial Automations
const INITIAL_AUTOMATIONS: MarketingAutomation[] = [
  {
    id: "AUT-401",
    name: "New User Welcome Series",
    triggerType: "Registration",
    status: "Active",
    description:
      "Triggered on registration. Dispatches a welcome push instantly, waits 2 days, and emails a discount code.",
    nodes: [
      {
        id: "node-1",
        type: "trigger",
        label: "Customer Registered",
        config: { trigger: "Registration" },
      },
      {
        id: "node-2",
        type: "action",
        label: "Send Welcome Push Notification",
        config: { channel: "Push", templateId: "TMP-101" },
      },
      { id: "node-3", type: "wait", label: "Wait 2 Days", config: { duration: 2, unit: "days" } },
      {
        id: "node-4",
        type: "action",
        label: "Send Coupon code WhatsApp",
        config: { channel: "WhatsApp", coupon: "FIRSTBITE" },
      },
      { id: "node-5", type: "wait", label: "Wait 7 Days", config: { duration: 7, unit: "days" } },
      {
        id: "node-6",
        type: "condition",
        label: "Has placed order?",
        config: { condition: "orders_count >= 1" },
      },
    ],
    edges: [
      { id: "edge-1", from: "node-1", to: "node-2" },
      { id: "edge-2", from: "node-2", to: "node-3" },
      { id: "edge-3", from: "node-3", to: "node-4" },
      { id: "edge-4", from: "node-4", to: "node-5" },
      { id: "edge-5", from: "node-5", to: "node-6" },
    ],
    stats: {
      triggered: 412,
      completed: 380,
      conversions: 184,
    },
  },
  {
    id: "AUT-402",
    name: "Inactive Customer Win-Back",
    triggerType: "No Orders",
    status: "Active",
    description:
      "Triggered when a customer has no orders for 60 days. Sends SMS, waits 5 days, and issues a backup discount.",
    nodes: [
      {
        id: "node-201",
        type: "trigger",
        label: "No Orders for 60 Days",
        config: { trigger: "No Orders", days: 60 },
      },
      {
        id: "node-202",
        type: "action",
        label: "Send Win-back SMS",
        config: { channel: "SMS", templateId: "TMP-103" },
      },
      { id: "node-203", type: "wait", label: "Wait 5 Days", config: { duration: 5, unit: "days" } },
      {
        id: "node-204",
        type: "action",
        label: "Send Winback Coupon Email",
        config: { channel: "Email", coupon: "WEBACK" },
      },
    ],
    edges: [
      { id: "edge-201", from: "node-201", to: "node-202" },
      { id: "edge-202", from: "node-202", to: "node-203" },
      { id: "edge-203", from: "node-203", to: "node-204" },
    ],
    stats: {
      triggered: 185,
      completed: 124,
      conversions: 42,
    },
  },
];

// Initial Notification Logs
const INITIAL_HISTORY: NotificationHistoryItem[] = [
  {
    id: "LOG-501",
    customerName: "Arjun Kapoor",
    customerId: "CUST-1001",
    channel: "Push",
    title: "Craving Fries? 🍟",
    body: "Hi Arjun, get a free portion of Peri-Peri Fries today only at Navrangpura!",
    status: "Clicked",
    sentAt: "2026-07-19 15:40:12",
    retryCount: 0,
    campaignId: "CAM-201",
  },
  {
    id: "LOG-502",
    customerName: "Aarav Mehta",
    customerId: "CUST-1002",
    channel: "WhatsApp",
    title: "VIP Order Shipped! 🚴‍♂️🍔",
    body: "Hi Aarav, your double cheese burger has been dispatched from Connaught Place!",
    status: "Read",
    sentAt: "2026-07-19 14:12:00",
    retryCount: 0,
  },
  {
    id: "LOG-503",
    customerName: "Shalini Nair",
    customerId: "CUST-1003",
    channel: "SMS",
    title: "Double Points Weekend!",
    body: "Shalini, get double points on your next checkout at Science City!",
    status: "Delivered",
    sentAt: "2026-07-18 11:30:15",
    retryCount: 0,
  },
  {
    id: "LOG-504",
    customerName: "Kriti Deshmukh",
    customerId: "CUST-1005",
    channel: "Email",
    title: "Onboarding Burger Gift Inside!",
    body: "Hi Kriti, complete your signup profile and grab a 50% discount coupon...",
    status: "Failed",
    sentAt: "2026-07-15 09:45:00",
    retryCount: 3,
    errorMessage: "SMTP Connection Timed Out - Retries exhausted",
  },
];

class MarketingDataStorage {
  private campaigns: MarketingCampaign[] = [];
  private templates: MarketingTemplate[] = [];
  private offers: MarketingOffer[] = [];
  private automations: MarketingAutomation[] = [];
  private history: NotificationHistoryItem[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window !== "undefined") {
      const storedCampaigns = localStorage.getItem("burg_mkt_campaigns");
      const storedTemplates = localStorage.getItem("burg_mkt_templates");
      const storedOffers = localStorage.getItem("burg_mkt_offers");
      const storedAutomations = localStorage.getItem("burg_mkt_automations");
      const storedHistory = localStorage.getItem("burg_mkt_history");

      this.campaigns = storedCampaigns ? JSON.parse(storedCampaigns) : INITIAL_CAMPAIGNS;
      this.templates = storedTemplates ? JSON.parse(storedTemplates) : INITIAL_TEMPLATES;
      this.offers = storedOffers ? JSON.parse(storedOffers) : INITIAL_OFFERS;
      this.automations = storedAutomations ? JSON.parse(storedAutomations) : INITIAL_AUTOMATIONS;
      this.history = storedHistory ? JSON.parse(storedHistory) : INITIAL_HISTORY;

      if (
        !storedCampaigns ||
        !storedTemplates ||
        !storedOffers ||
        !storedAutomations ||
        !storedHistory
      ) {
        this.saveToStorage();
      }
    } else {
      this.campaigns = INITIAL_CAMPAIGNS;
      this.templates = INITIAL_TEMPLATES;
      this.offers = INITIAL_OFFERS;
      this.automations = INITIAL_AUTOMATIONS;
      this.history = INITIAL_HISTORY;
    }
  }

  private saveToStorage() {
    if (typeof window !== "undefined") {
      localStorage.setItem("burg_mkt_campaigns", JSON.stringify(this.campaigns));
      localStorage.setItem("burg_mkt_templates", JSON.stringify(this.templates));
      localStorage.setItem("burg_mkt_offers", JSON.stringify(this.offers));
      localStorage.setItem("burg_mkt_automations", JSON.stringify(this.automations));
      localStorage.setItem("burg_mkt_history", JSON.stringify(this.history));
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
  getCampaigns(): MarketingCampaign[] {
    return this.campaigns;
  }

  getTemplates(): MarketingTemplate[] {
    return this.templates;
  }

  getOffers(): MarketingOffer[] {
    return this.offers;
  }

  getAutomations(): MarketingAutomation[] {
    return this.automations;
  }

  getHistory(): NotificationHistoryItem[] {
    return this.history;
  }

  // Campaign Actions
  createCampaign(campaign: Omit<MarketingCampaign, "id" | "createdAt" | "createdBy" | "stats">) {
    const id = `CAM-${Date.now().toString().slice(-4)}`;
    const newCampaign: MarketingCampaign = {
      ...campaign,
      id,
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      createdBy: "Jesal Pande (Super Admin)",
      stats: {
        sent: campaign.status === "Active" ? 1200 : 0,
        delivered: campaign.status === "Active" ? 1180 : 0,
        clicked: campaign.status === "Active" ? 148 : 0,
        failed: campaign.status === "Active" ? 20 : 0,
        revenue: campaign.status === "Active" ? 15400 : 0,
      },
    };

    this.campaigns.unshift(newCampaign);

    // If campaign is immediately launched, append notification history entries for simulated base
    if (newCampaign.status === "Active") {
      const customers = customerStorage.getCustomers();
      customers.slice(0, 3).forEach((cust, index) => {
        this.history.unshift({
          id: `LOG-${Date.now().toString().slice(-4)}-${index}`,
          customerName: cust.fullName,
          customerId: cust.id,
          channel: newCampaign.channels[0] || "Push",
          title: newCampaign.messageTitle,
          body: newCampaign.messageBody,
          status: index === 0 ? "Clicked" : "Delivered",
          sentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
          retryCount: 0,
          campaignId: id,
        });
      });
    }

    toast.success(`Campaign "${campaign.name}" created and saved.`);
    this.notify();
    return newCampaign;
  }

  updateCampaignStatus(id: string, status: MarketingCampaign["status"]) {
    const campaign = this.campaigns.find((c) => c.id === id);
    if (campaign) {
      campaign.status = status;

      // If activated, trigger delivery
      if (status === "Active" && campaign.stats.sent === 0) {
        campaign.stats = {
          sent: 1420,
          delivered: 1390,
          clicked: 224,
          failed: 30,
          revenue: 32400,
        };
      }

      toast.success(`Campaign "${campaign.name}" status updated to ${status}.`);
      this.notify();
      return true;
    }
    return false;
  }

  duplicateCampaign(id: string) {
    const original = this.campaigns.find((c) => c.id === id);
    if (original) {
      const copy: MarketingCampaign = {
        ...original,
        id: `CAM-${Date.now().toString().slice(-4)}`,
        name: `${original.name} (Copy)`,
        status: "Draft",
        createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        stats: { sent: 0, delivered: 0, clicked: 0, failed: 0, revenue: 0 },
      };
      this.campaigns.unshift(copy);
      toast.success(`Duplicated campaign as "${copy.name}".`);
      this.notify();
      return copy;
    }
    return null;
  }

  deleteCampaign(id: string) {
    this.campaigns = this.campaigns.filter((c) => c.id !== id);
    toast.info("Campaign removed from repository.");
    this.notify();
    return true;
  }

  // Offer Actions
  createOffer(offer: Omit<MarketingOffer, "id">) {
    const newOffer: MarketingOffer = {
      ...offer,
      id: `OFF-${Date.now().toString().slice(-3)}`,
    };
    this.offers.unshift(newOffer);
    toast.success(`Promotional Offer "${offer.name}" activated.`);
    this.notify();
    return newOffer;
  }

  updateOfferStatus(id: string, status: MarketingOffer["status"]) {
    const offer = this.offers.find((o) => o.id === id);
    if (offer) {
      offer.status = status;
      toast.success(`Offer state adjusted to ${status}.`);
      this.notify();
      return true;
    }
    return false;
  }

  deleteOffer(id: string) {
    this.offers = this.offers.filter((o) => o.id !== id);
    toast.info("Offer deleted.");
    this.notify();
    return true;
  }

  // Template Actions
  createTemplate(template: Omit<MarketingTemplate, "id">) {
    const newTemplate: MarketingTemplate = {
      ...template,
      id: `TMP-${Date.now().toString().slice(-3)}`,
    };
    this.templates.unshift(newTemplate);
    toast.success(`Template "${template.name}" added to assets.`);
    this.notify();
    return newTemplate;
  }

  deleteTemplate(id: string) {
    this.templates = this.templates.filter((t) => t.id !== id);
    toast.info("Message template deleted.");
    this.notify();
    return true;
  }

  // Automation Actions
  createAutomation(automation: Omit<MarketingAutomation, "id" | "stats">) {
    const newAutomation: MarketingAutomation = {
      ...automation,
      id: `AUT-${Date.now().toString().slice(-3)}`,
      stats: { triggered: 0, completed: 0, conversions: 0 },
    };
    this.automations.unshift(newAutomation);
    toast.success(`Journey Automation "${automation.name}" configured.`);
    this.notify();
    return newAutomation;
  }

  updateAutomationStatus(id: string, status: MarketingAutomation["status"]) {
    const aut = this.automations.find((a) => a.id === id);
    if (aut) {
      aut.status = status;
      toast.success(`Journey flow "${aut.name}" toggled to ${status}.`);
      this.notify();
      return true;
    }
    return false;
  }

  deleteAutomation(id: string) {
    this.automations = this.automations.filter((a) => a.id !== id);
    toast.info("Journey flow deleted.");
    this.notify();
    return true;
  }

  // Simulated Trigger Action
  simulateAutomationTrigger(id: string) {
    const aut = this.automations.find((a) => a.id === id);
    if (aut) {
      aut.stats.triggered += 1;
      aut.stats.completed += Math.random() > 0.3 ? 1 : 0;
      aut.stats.conversions += Math.random() > 0.5 ? 1 : 0;

      const customers = customerStorage.getCustomers();
      const randomCust = customers[Math.floor(Math.random() * customers.length)];

      this.history.unshift({
        id: `LOG-FLOW-${Date.now().toString().slice(-4)}`,
        customerName: randomCust.fullName,
        customerId: randomCust.id,
        channel: "Push",
        title: `Journey Flow: ${aut.name}`,
        body: `Step 1 Triggered successfully for ${randomCust.fullName}. Welcome series dispatched.`,
        status: "Delivered",
        sentAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        retryCount: 0,
      });

      toast.success(`Simulated customer journey trigger for ${randomCust.fullName}!`);
      this.notify();
      return true;
    }
    return false;
  }
}

export const marketingStorage = new MarketingDataStorage();
