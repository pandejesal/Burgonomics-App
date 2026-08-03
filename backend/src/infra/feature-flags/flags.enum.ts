/**
 * Canonical feature flag registry. Adding a new flag requires:
 *   1. Adding a key here.
 *   2. Adding a default in `feature-flags.config.ts` + `.env.example`.
 *   3. Optionally creating a DB row for runtime toggling.
 */
export const Flags = {
  OFFERS: 'OFFERS',
  DELIVERY: 'DELIVERY',
  TAKEAWAY: 'TAKEAWAY',
  DINE_IN: 'DINE_IN',
  NEW_CHECKOUT: 'NEW_CHECKOUT',
  FESTIVAL_CAMPAIGNS: 'FESTIVAL_CAMPAIGNS',
  BETA: 'BETA',
} as const;

export type FlagKey = (typeof Flags)[keyof typeof Flags];
