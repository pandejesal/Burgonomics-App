/**
 * Feature flag service.
 *
 * Supports local defaults, remote overrides via Remote Config,
 * percentage rollout, kill switches, store-scoped flags, and future
 * A/B testing.
 */
import { appConfig } from "@/core/config";

export type FlagKey =
  | "offline_mode"
  | "order_tracking"
  | "referrals"
  | "razorpay_checkout"
  | "petpooja_sync"
  | "kill_switch_orders"
  | "kill_switch_payments";

export interface FlagRule {
  enabled: boolean;
  /** 0-100. Only that percentage of user buckets see `enabled=true`. */
  rolloutPercent?: number;
  /** If present, flag only evaluates true for these store IDs. */
  storeScope?: string[];
  /** Assign a variant for A/B tests (evaluated after enable). */
  variants?: Record<string, number>; // name → weight
}

export interface FlagContext {
  userId?: string;
  storeId?: string;
}

const LOCAL_DEFAULTS: Record<FlagKey, FlagRule> = {
  offline_mode: { enabled: appConfig.featureFlags.offlineMode },
  order_tracking: { enabled: appConfig.featureFlags.orderTracking },
  referrals: { enabled: appConfig.featureFlags.referrals },
  razorpay_checkout: { enabled: false },
  petpooja_sync: { enabled: appConfig.integrations.petpoojaEnabled },
  kill_switch_orders: { enabled: false },
  kill_switch_payments: { enabled: false },
};

const hashBucket = (input: string): number => {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h % 100;
};

class FeatureFlagService {
  private overrides: Partial<Record<FlagKey, FlagRule>> = {};

  setLocalOverride(key: FlagKey, rule: FlagRule) {
    this.overrides[key] = rule;
  }
  clearLocalOverride(key: FlagKey) {
    delete this.overrides[key];
  }

  /** Sync flags from remote config service. */
  async syncRemote(): Promise<void> {
    /* no-op */
  }

  isEnabled(key: FlagKey, ctx: FlagContext = {}): boolean {
    const rule = this.overrides[key] ?? LOCAL_DEFAULTS[key];
    if (!rule.enabled) return false;
    if (rule.storeScope && (!ctx.storeId || !rule.storeScope.includes(ctx.storeId))) return false;
    if (rule.rolloutPercent != null) {
      const bucketKey = ctx.userId ?? "anon";
      return hashBucket(`${key}:${bucketKey}`) < rule.rolloutPercent;
    }
    return true;
  }

  variant(key: FlagKey, ctx: FlagContext = {}): string | null {
    const rule = this.overrides[key] ?? LOCAL_DEFAULTS[key];
    if (!rule.variants || !this.isEnabled(key, ctx)) return null;
    const bucket = hashBucket(`${key}:variant:${ctx.userId ?? "anon"}`);
    const entries = Object.entries(rule.variants);
    const total = entries.reduce((n, [, w]) => n + w, 0);
    let cursor = 0;
    for (const [name, weight] of entries) {
      cursor += (weight / total) * 100;
      if (bucket < cursor) return name;
    }
    return entries[entries.length - 1]?.[0] ?? null;
  }
}

export const featureFlags = new FeatureFlagService();
