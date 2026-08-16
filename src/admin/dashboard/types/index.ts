export interface DashboardCounts {
  ordersLast24h: number;
  ordersActive: number;
  paymentsCapturedLast24h: number;
  refundsPendingCount: number;
  petpoojaWebhooksPending: number;
  paymentWebhooksPending: number;
  realtimeSessionsActive: number;
  storesActive: number;
}

export interface RevenueSummary {
  totalRevenuePaise: number;
  netRevenuePaise: number;
  refundsPaise: number;
  orderCount: number;
  aov: number;
}

export interface OrderStatusBreakdown {
  status: string;
  count: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  units: number;
  revenuePaise: number;
}

export interface CustomerInsight {
  newCustomers: number;
  returningCustomers: number;
  totalActive: number;
}

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}

export interface MenuSyncLog {
  id: string;
  storeId: string | null;
  syncType: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  version: string | null;
  itemsCreated: number;
  itemsUpdated: number;
  itemsDeleted: number;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SystemHealthInfo {
  status: "up" | "down";
  latency?: number;
  message?: string;
}

export interface SystemHealthResponse {
  status: "ok" | "error" | "shutting_down" | "standby";
  info: Record<string, SystemHealthInfo>;
  error?: Record<string, any>;
  details: Record<string, SystemHealthInfo>;
}

export interface PetpoojaSyncHealth {
  status: "standby" | "connected" | "disconnected";
  connected: boolean;
  message: string;
  api?: "up" | "down";
  webhooks?: "up" | "down";
  circuitBreaker?: "OPEN" | "CLOSED";
  lastSyncAt?: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorId?: string;
  actorEmail?: string;
  actorName?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: any;
  ipAddress?: string;
  createdAt: string;
}

export interface StoreResponse {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status: "OPEN" | "CLOSED" | "PAUSED";
  turnOnAt?: string | null;
  minPrepMinutes?: number | null;
  distanceKm?: number;
}

export interface PaymentStats {
  id: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  gateway: string;
  gatewayPaymentId?: string;
  status: "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";
  capturedAt?: string;
  createdAt: string;
}

export interface RefundStats {
  id: string;
  paymentId: string;
  amountPaise: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
  reason?: string;
  createdAt: string;
}

export interface DuplicatePayment {
  orderId: string;
  count: number;
}
