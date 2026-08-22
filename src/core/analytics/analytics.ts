/**
 * Typed analytics event catalogue and dispatcher.
 *
 * Every user-observable moment the product cares about is declared here
 * as a discriminated union so call sites cannot fire misspelled or
 * malformed events. A provider (Segment, GA4, Amplitude, custom) can be
 * registered via `analytics.setProvider(...)`; until
 * then events are buffered and dropped in production, logged in dev.
 */
import { logger } from "@/core/logging";
import { appConfig } from "@/core/config";

export type AnalyticsEvent =
  | { name: "app_opened"; properties?: { referrer?: string } }
  | { name: "login_started"; properties: { method: "otp" | "google" | "apple" } }
  | { name: "login_success"; properties: { method: "otp" | "google" | "apple"; userId: string } }
  | { name: "store_selected"; properties: { storeId: string } }
  | { name: "menu_viewed"; properties: { storeId: string; categoryId?: string } }
  | { name: "product_viewed"; properties: { productId: string; storeId: string } }
  | {
      name: "product_customized";
      properties: { productId: string; variantId?: string; addOns?: string[] };
    }
  | { name: "add_to_cart"; properties: { productId: string; qty: number; price: number } }
  | { name: "remove_from_cart"; properties: { productId: string; qty: number } }
  | { name: "checkout_started"; properties: { cartValue: number; itemCount: number } }
  | { name: "payment_success"; properties: { orderId: string; amount: number; method: string } }
  | { name: "payment_failed"; properties: { orderId?: string; reason: string } }
  | { name: "order_placed"; properties: { orderId: string; total: number } }
  | { name: "order_cancelled"; properties: { orderId: string; reason?: string } }
  | { name: "order_delivered"; properties: { orderId: string } }
  | { name: "profile_updated"; properties: { fields: string[] } };

export type AnalyticsEventName = AnalyticsEvent["name"];

export interface AnalyticsProvider {
  name: string;
  identify(userId: string, traits?: Record<string, unknown>): void;
  track(event: AnalyticsEvent): void;
  reset(): void;
}

class AnalyticsService {
  private provider: AnalyticsProvider | null = null;
  private buffer: AnalyticsEvent[] = [];

  setProvider(provider: AnalyticsProvider) {
    this.provider = provider;
    for (const evt of this.buffer) provider.track(evt);
    this.buffer = [];
  }

  identify(userId: string, traits?: Record<string, unknown>) {
    if (!appConfig.analytics.enabled) return;
    this.provider?.identify(userId, traits);
  }

  track(event: AnalyticsEvent) {
    if (!appConfig.analytics.enabled) {
      logger.debug(
        `[analytics:noop] ${event.name}`,
        (event as { properties?: Record<string, unknown> }).properties,
      );
      return;
    }
    if (!this.provider) {
      this.buffer.push(event);
      return;
    }
    this.provider.track(event);
  }

  reset() {
    this.buffer = [];
    this.provider?.reset();
  }
}

export const analytics = new AnalyticsService();
