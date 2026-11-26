import type { PushPermission } from "@/shared/platform/pushNotifications";

/**
 * The one-time "Get live order updates" card on the order-confirmation screen.
 *
 * WHY IT EXISTS: before this, the customer app only INSPECTED permission at
 * boot (pushNotifications.ts init) and prompted solely from a Settings toggle.
 * On Android 13+ / iOS that means a customer who never opens Settings never
 * grants POST_NOTIFICATIONS, so no order update is ever delivered. The card
 * asks at the natural moment — right after a confirmed order — and the OS
 * dialog only appears after an explicit "Turn on" tap.
 *
 * The customer's answer is remembered PERMANENTLY: "Not now" must not nag on
 * later orders, and a granted permission is never asked again. The choice is
 * device-local (like the analytics/ads consent flags in settingsStore) and
 * deliberately NOT part of AppSettings: `settingsRepository.update` rejects
 * unvalidated keys, and this is not a preference the customer edits.
 *
 * Settings keeps working: it calls requestPushPermissions directly and is not
 * gated by this record.
 */

/** Storage key for the recorded answer. */
export const PUSH_PROMPT_DECISION_KEY = "burg.pushPrompt.v1";

export type PushPromptDecision = "dismissed" | "granted";

const memoryFallback = new Map<string, string>();

/**
 * localStorage is authoritative when it is usable; the memory copy exists ONLY
 * for environments where it is not (private mode, blocked/quota errors).
 *
 * The distinction matters: a cleared localStorage must read as "never asked"
 * even in a tab that wrote the answer earlier through the fallback. Treating
 * the memory copy as a first-class value made a sign-out/cleared-storage
 * install keep answering "already asked" from a stale in-memory entry.
 */
function storageGet(key: string): string | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const value = window.localStorage.getItem(key);
      // Storage is readable: it is the truth, including "absent".
      memoryFallback.delete(key);
      return value;
    }
  } catch {
    // private mode / blocked storage: use the session copy below
  }
  return memoryFallback.get(key) ?? null;
}

function storageSet(key: string, value: string): void {
  memoryFallback.set(key, value);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Quota/private mode: this session still remembers the answer.
  }
}

function isDecision(value: unknown): value is PushPromptDecision {
  return value === "dismissed" || value === "granted";
}

/** The recorded answer, or null when the customer has never been asked. */
export function readPushPromptDecision(): PushPromptDecision | null {
  const raw = storageGet(PUSH_PROMPT_DECISION_KEY);
  return isDecision(raw) ? raw : null;
}

/** Records the answer once. A later write never downgrades "granted". */
export function recordPushPromptDecision(decision: PushPromptDecision): void {
  if (readPushPromptDecision() === "granted") return;
  storageSet(PUSH_PROMPT_DECISION_KEY, decision);
}

export interface PushPromptVisibilityInput {
  platform: string;
  /** OS/browser state from getPushStatusSnapshot().permission. */
  permission: PushPermission;
  decision: PushPromptDecision | null;
  /** The confirmed order this card would sit beside. */
  hasConfirmedOrder: boolean;
  /**
   * `getPushStatusSnapshot().enabled` — the build's push feature flag.
   *
   * A6-c11 item 6: with push disabled, "Turn on" can only fail, and recording
   * that failure as "dismissed" burned the one-time prompt for ever. A
   * disabled build must never show (or consume) the card.
   */
  enabled?: boolean;
}

/**
 * Should the card render?
 *
 * - native only: the web flow (boot-time enable, Settings toggle) is unchanged
 *   and a push prompt there must stay an explicit Settings action;
 * - never while the build's push flag is off (an unanswerable prompt is not a
 *   question);
 * - only while the OS has not decided (`default` = Android 13+ `prompt`);
 * - never after an answer;
 * - and only next to a real, paid, confirmed order.
 *
 * Fails closed on anything unexpected — a wrong card is worse than no card.
 * `enabled` defaults to false so a caller that forgets it cannot burn the
 * prompt.
 */
export function shouldOfferPushPrompt(input: PushPromptVisibilityInput): boolean {
  if (input.platform !== "ios" && input.platform !== "android") return false;
  if (input.enabled !== true) return false;
  if (input.permission !== "default") return false;
  if (input.decision !== null) return false;
  return input.hasConfirmedOrder === true;
}

/**
 * What may be RECORDED after the customer tapped "Turn on".
 *
 * A6-c11 item 6: only an OBSERVED `denied` is a real refusal. A thrown error, a
 * disabled build, a dismissed system dialog left undecided (`default`) or an
 * unsupported runtime are all "no answer yet" — recording them wrote
 * `dismissed` permanently and the card never returned. `null` means: write
 * nothing, and keep offering the card.
 */
export function decidePushPromptAnswer(result: {
  granted: boolean;
  /** `getPushStatusSnapshot().permission` read AFTER the attempt. */
  permission: PushPermission;
}): PushPromptDecision | null {
  if (result.granted === true) return "granted";
  if (result.permission === "denied") return "dismissed";
  return null;
}
