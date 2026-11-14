import { create } from "zustand";
import { isNative } from "@/shared/platform/platform";

// Runtime feature flags / remote config. Populated by /config API sync.
interface AppConfigState {
  maintenance: boolean;
  forceUpdate: boolean;
  minimumAppVersion: string;
  isOnline: boolean;
  /**
   * Whether connectivity has actually been OBSERVED.
   *
   * A native cold start cannot know the network state before the plugin answers,
   * and `false` there means "not yet confirmed" — not "observed offline". This
   * flag separates the two so UI can avoid claiming an offline state (or emitting
   * a "back online" message) that was never observed. It is populated by the
   * first authoritative native signal; on web `navigator.onLine` is authoritative
   * from the start, so it is already true.
   *
   * Deliberately a separate boolean rather than a tri-state `isOnline`: every
   * existing consumer keeps reading a plain boolean, and PAY stays disabled while
   * the value is unknown.
   */
  connectionStatusKnown: boolean;
  /**
   * The browser's own view of active connectivity, or `null` when it has none.
   *
   * Plain state so selectors stay pure and testable — nothing in a selector may
   * read `navigator`. `navigator.onLine` reports an active interface, never
   * proof that the backend is reachable.
   */
  browserOnlineEvidence: boolean | null;
  /**
   * The last AUTHORITATIVE connectivity answer (`setOnline`), or `null` if none
   * has arrived yet. Distinct from the optimistic `isOnline`, because weak
   * browser evidence may disable `isOnline` without becoming truth.
   */
  lastConfirmedOnline: boolean | null;
  setMaintenance: (v: boolean) => void;
  setForceUpdate: (v: boolean) => void;
  /** Authoritative evidence (plugin probe/event, or browser on web). */
  setOnline: (v: boolean) => void;
  /**
   * Evidence-ONLY recording of the browser's view.
   *
   * Sets `browserOnlineEvidence` and nothing else: it never touches the
   * optimistic `isOnline`, never marks `connectionStatusKnown`, and never sets
   * `lastConfirmedOnline`. Used when a browser/resume signal merely OBSERVES the
   * browser's opinion — which is not a native verdict and must not weaken or
   * strengthen a confirmed native answer by itself.
   */
  recordBrowserEvidence: (v: boolean) => void;
  /**
   * Weak evidence that may also move `isOnline` (probe/loader failure or the
   * attempt deadline).
   *
   * Two distinct cases, matching the implementation:
   * - While connectivity is still UNCONFIRMED, an explicit fallback with a weak
   *   `true` is accepted, so the optimistic flag can follow the browser's view.
   * - Once native has CONFIRMED `false`, a weak `true` is refused and the
   *   optimistic flag stays down; a weak `false` may still disable.
   *
   * It never marks `connectionStatusKnown`.
   */
  setOnlineFromBrowserEvidence: (v: boolean) => void;
}

// Evaluated once at module load: this is the value the app boots with.
const nativeShell = isNative();

/**
 * The browser's own active-connection view, or `true` when there is no such
 * evidence.
 *
 * `typeof navigator === "undefined"` is NOT sufficient: Node (>=21) exposes a
 * builtin `navigator` with no `onLine`, so that check would return `undefined`
 * while the field is typed `boolean`. Guarding on the property's type keeps the
 * value a real boolean — SSR/no-DOM stays `true` (unchanged, non-browser), and a
 * browser without the property is treated the same way.
 */
function browserOnlineEvidence(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof navigator === "undefined") return true;
  return typeof navigator.onLine === "boolean" ? navigator.onLine : true;
}

/**
 * Boot-time browser evidence as plain state: the real boolean, or `null` when
 * the environment cannot supply one (SSR, or no `navigator.onLine`). Read once
 * at module load so selectors never touch `navigator`.
 */
function initialBrowserEvidence(): boolean | null {
  if (typeof window === "undefined") return null;
  if (typeof navigator === "undefined") return null;
  return typeof navigator.onLine === "boolean" ? navigator.onLine : null;
}

/**
 * Is connectivity genuinely OBSERVED as offline?
 *
 * Pure, so both the banner and the payment list agree on one definition:
 * - a confirmed native/browser answer (`connectionStatusKnown`) that is offline;
 * - or, while unconfirmed, the browser's own evidence reporting no connection.
 *
 * An unconfirmed native cold start with no browser evidence is NOT observed
 * offline — that is the false-offline regression this predicate exists to stop.
 */
export function selectObservedOffline(state: {
  isOnline: boolean;
  connectionStatusKnown: boolean;
  browserOnlineEvidence: boolean | null;
}): boolean {
  if (state.isOnline) return false;
  if (state.connectionStatusKnown) return true;
  return state.browserOnlineEvidence === false;
}

export const useAppConfig = create<AppConfigState>()((set) => ({
  maintenance: false,
  forceUpdate: false,
  minimumAppVersion: "1.0.0",
  // Native starts false so a cold start cannot enable PAY before the plugin
  // answers. This is "unconfirmed", not an offline observation — see
  // `connectionStatusKnown`. Web keeps the browser's honest answer.
  isOnline: nativeShell ? false : browserOnlineEvidence(),
  connectionStatusKnown: !nativeShell,
  browserOnlineEvidence: initialBrowserEvidence(),
  lastConfirmedOnline: nativeShell ? null : browserOnlineEvidence(),
  setMaintenance: (maintenance) => set({ maintenance }),
  setForceUpdate: (forceUpdate) => set({ forceUpdate }),
  setOnline: (isOnline) =>
    set({ isOnline, connectionStatusKnown: true, lastConfirmedOnline: isOnline }),
  recordBrowserEvidence: (v) => set({ browserOnlineEvidence: v }),
  setOnlineFromBrowserEvidence: (isOnline) =>
    set((state) => {
      // A confirmed native `false` still owns the optimistic flag.
      const blockedByNative =
        isOnline && state.lastConfirmedOnline === false && state.connectionStatusKnown;
      if (blockedByNative) return { browserOnlineEvidence: isOnline };
      // A weak `true` is also refused while a known-negative state stands
      // without any recorded native fact (legacy/negative fallback).
      const legacyNegative =
        isOnline &&
        state.connectionStatusKnown &&
        state.lastConfirmedOnline === null &&
        !state.isOnline;
      if (legacyNegative) return { browserOnlineEvidence: isOnline };
      return { isOnline, browserOnlineEvidence: isOnline };
    }),
}));
