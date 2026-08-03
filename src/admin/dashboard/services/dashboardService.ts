import { useAdminAuthStore } from "../../store/adminAuthStore";
import {
  DashboardCounts,
  RevenueSummary,
  OrderStatusBreakdown,
  TopProduct,
  CustomerInsight,
  QueueStats,
  MenuSyncLog,
  SystemHealthResponse,
  AuditLogEntry,
  StoreResponse,
  PaymentStats,
  RefundStats,
  DuplicatePayment,
} from "../types";

class DashboardService {
  private baseUrl = "/api/v1";

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = useAdminAuthStore.getState().accessToken;

    const headers = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Administrative operations request failed");
    }

    return response.json();
  }

  // Live Operations Counts
  async getLiveCounts(): Promise<DashboardCounts> {
    return this.request<DashboardCounts>("/admin/dashboard/live");
  }

  // Composite snapshot
  async getDashboardSnapshot(params: { from: string; to: string; storeId?: string }): Promise<{
    counts: DashboardCounts;
    revenue: RevenueSummary;
    topProducts: TopProduct[];
    statusBreakdown: OrderStatusBreakdown[];
  }> {
    const query = new URLSearchParams({
      from: params.from,
      to: params.to,
      ...(params.storeId ? { storeId: params.storeId } : {}),
    });
    return this.request<{
      counts: DashboardCounts;
      revenue: RevenueSummary;
      topProducts: TopProduct[];
      statusBreakdown: OrderStatusBreakdown[];
    }>(`/admin/dashboard/snapshot?${query.toString()}`);
  }

  // System Health Terminus
  async getSystemHealth(): Promise<SystemHealthResponse> {
    return this.request<SystemHealthResponse>("/admin/dashboard/system-health");
  }

  // Analytics summary
  async getAnalyticsSummary(params: { from: string; to: string; storeId?: string }): Promise<{
    revenue: RevenueSummary;
    statusBreakdown: OrderStatusBreakdown[];
    topProducts: TopProduct[];
    customers: CustomerInsight;
    offerRedemptions: number;
  }> {
    const query = new URLSearchParams({
      from: params.from,
      to: params.to,
      ...(params.storeId ? { storeId: params.storeId } : {}),
    });
    return this.request<any>(`/admin/analytics/summary?${query.toString()}`);
  }

  // Time-series
  async getRevenueSeries(params: {
    from: string;
    to: string;
    granularity: "hour" | "day" | "week" | "month";
    storeId?: string;
  }): Promise<Array<{ bucket: string; value: number }>> {
    const query = new URLSearchParams({
      from: params.from,
      to: params.to,
      granularity: params.granularity,
      ...(params.storeId ? { storeId: params.storeId } : {}),
    });
    return this.request<Array<{ bucket: string; value: number }>>(
      `/admin/analytics/revenue/series?${query.toString()}`,
    );
  }

  async getOrderSeries(params: {
    from: string;
    to: string;
    granularity: "hour" | "day" | "week" | "month";
    storeId?: string;
  }): Promise<Array<{ bucket: string; value: number }>> {
    const query = new URLSearchParams({
      from: params.from,
      to: params.to,
      granularity: params.granularity,
      ...(params.storeId ? { storeId: params.storeId } : {}),
    });
    return this.request<Array<{ bucket: string; value: number }>>(
      `/admin/analytics/orders/series?${query.toString()}`,
    );
  }

  // Queues Management
  async getQueues(): Promise<QueueStats[]> {
    return this.request<QueueStats[]>("/admin/ops/queues");
  }

  async pauseQueue(name: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/ops/queues/${name}/pause`, {
      method: "POST",
    });
  }

  async resumeQueue(name: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/ops/queues/${name}/resume`, {
      method: "POST",
    });
  }

  async retryQueueFailed(name: string, jobIds?: string[]): Promise<{ retried: number }> {
    return this.request<{ retried: number }>(`/admin/ops/queues/${name}/retry-failed`, {
      method: "POST",
      body: JSON.stringify({ jobIds }),
    });
  }

  async replayQueueDlq(name: string): Promise<{ replayed: number }> {
    return this.request<{ replayed: number }>(`/admin/ops/queues/${name}/replay-dlq`, {
      method: "POST",
    });
  }

  // Payments & Refunds
  async getPayments(
    params: {
      status?: string;
      page?: number;
      pageSize?: number;
      from?: string;
      to?: string;
    } = {},
  ): Promise<{ results: PaymentStats[]; total: number }> {
    const query = new URLSearchParams();
    if (params.status) query.append("status", params.status);
    if (params.page) query.append("page", String(params.page));
    if (params.pageSize) query.append("pageSize", String(params.pageSize));
    if (params.from) query.append("from", params.from);
    if (params.to) query.append("to", params.to);

    return this.request<any>(`/admin/ops/payments?${query.toString()}`);
  }

  async retryPaymentVerification(
    paymentId: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/admin/ops/payments/${paymentId}/verify`,
      {
        method: "POST",
      },
    );
  }

  async issueRefund(
    paymentId: string,
    amountPaise: number,
    reason: string,
    isPartial?: boolean,
  ): Promise<{ success: boolean; refundId: string }> {
    return this.request<any>(`/admin/ops/payments/${paymentId}/refund`, {
      method: "POST",
      body: JSON.stringify({ amountPaise, reason, isPartial }),
    });
  }

  async approveRefund(refundId: string): Promise<{ success: boolean }> {
    return this.request<any>(`/admin/ops/refunds/${refundId}/approve`, {
      method: "POST",
    });
  }

  async rejectRefund(refundId: string, reason: string): Promise<{ success: boolean }> {
    return this.request<any>(`/admin/ops/refunds/${refundId}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
  }

  async retryRefund(refundId: string): Promise<{ success: boolean }> {
    return this.request<any>(`/admin/ops/refunds/${refundId}/retry`, {
      method: "POST",
    });
  }

  async resolveDuplicate(
    orderId: string,
    action: "merge" | "ignore" | "investigate",
  ): Promise<{ success: boolean }> {
    return this.request<any>(`/admin/ops/payments/duplicates/${orderId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
  }

  async getDuplicatePayments(windowMinutes = 60): Promise<DuplicatePayment[]> {
    return this.request<DuplicatePayment[]>(
      `/admin/ops/payments/duplicates?windowMinutes=${windowMinutes}`,
    );
  }

  async getPaymentReconciliation(
    from: string,
    to: string,
  ): Promise<{
    count: number;
    totalPaise: number;
    refundedPaise: number;
    discrepancies: Array<{ paymentId: string; reason: string }>;
  }> {
    return this.request<any>(`/admin/ops/payments/reconcile?from=${from}&to=${to}`);
  }

  async getRecentRefunds(limit = 50): Promise<RefundStats[]> {
    return this.request<RefundStats[]>(`/admin/ops/refunds?limit=${limit}`);
  }

  // Petpooja Live Integration & Catalog sync
  async getSyncHistory(): Promise<MenuSyncLog[]> {
    return this.request<MenuSyncLog[]>("/admin/catalog/sync/history");
  }

  async getSyncHealth(): Promise<any> {
    return this.request<any>("/admin/catalog/sync/health");
  }

  async triggerSync(scope: string, storeId?: string): Promise<any> {
    const query = new URLSearchParams({
      scope,
      ...(storeId ? { storeId } : {}),
    });
    return this.request<any>(`/admin/catalog/sync/trigger?${query.toString()}`, {
      method: "POST",
    });
  }

  // Menu specific operations
  async refreshMenuCache(storeId?: string): Promise<{ ok: boolean }> {
    const query = new URLSearchParams(storeId ? { storeId } : {});
    return this.request<{ ok: boolean }>(`/admin/menu/cache/refresh?${query.toString()}`, {
      method: "POST",
    });
  }

  async triggerPetpoojaSync(storeId?: string): Promise<any> {
    const query = new URLSearchParams(storeId ? { storeId } : {});
    return this.request<any>(`/admin/menu/sync?${query.toString()}`, {
      method: "POST",
    });
  }

  // Webhook Ops
  async getWebhooks(gateway: string): Promise<any[]> {
    return this.request<any[]>(`/admin/ops/webhooks/${gateway}`);
  }

  async replayWebhook(gateway: string, id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/admin/ops/webhooks/${gateway}/${id}/replay`, {
      method: "POST",
    });
  }

  // Audit Logs
  async getAuditLogs(
    params: {
      page?: number;
      pageSize?: number;
      action?: string;
      resourceType?: string;
      q?: string;
    } = {},
  ): Promise<{ results: AuditLogEntry[]; total: number }> {
    const query = new URLSearchParams();
    if (params.page) query.append("page", String(params.page));
    if (params.pageSize) query.append("pageSize", String(params.pageSize));
    if (params.action) query.append("action", params.action);
    if (params.resourceType) query.append("resourceType", params.resourceType);
    if (params.q) query.append("q", params.q);

    return this.request<any>(`/admin/audit?${query.toString()}`);
  }

  // Stores list
  async getStores(params: { city?: string; query?: string } = {}): Promise<StoreResponse[]> {
    const query = new URLSearchParams();
    if (params.city) query.append("city", params.city);
    if (params.query) query.append("query", params.query);

    return this.request<StoreResponse[]>(`/stores?${query.toString()}`);
  }
}

export const dashboardService = new DashboardService();
