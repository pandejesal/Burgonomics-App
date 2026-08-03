/**
 * Analytics provider integration slot.
 *
 * The real provider (Segment / GA4 / Amplitude / custom) implements
 * `AnalyticsProvider` from `@/core/analytics` and is registered via
 * `analytics.setProvider(...)` during app bootstrap.
 */
import type { AnalyticsProvider, AnalyticsEvent } from "@/core/analytics";
import { logger } from "@/core/logging";

export const noopAnalyticsProvider: AnalyticsProvider = {
  name: "noop",
  identify() {
    /* noop */
  },
  track(event: AnalyticsEvent) {
    logger.debug(`[analytics] ${event.name}`);
  },
  reset() {
    /* noop */
  },
};
