/**
 * Android hardware / gesture BACK handling.
 *
 * Before this module the shell registered a `backButton` listener inside
 * `mobileBootstrap`, but it decided from `isEntry` + `window.history` alone:
 * an open Radix dialog (role="dialog") was only closed if a close button
 * happened to match one of three selectors, and the entry set included only
 * `/`, `/splash` and `/home`. The EMULATOR audit (2026-11-26) pressed BACK on
 * the first screen and observed no exit and no navigation.
 *
 * The decision itself lives in the pure {@link decideBackAction} function so it
 * is unit-testable without a Capacitor shell; {@link initAndroidBackButton}
 * only wires plugin events and performs the chosen side effect.
 *
 * Precedence, in order:
 *   1. an open sheet / modal / dialog is dismissed first (never navigate
 *      underneath a modal);
 *   2. a path with router history pops that history;
 *   3. at an entry screen the first press arms "press back again to exit" and
 *      the second press inside {@link EXIT_ARM_WINDOW_MS} exits the app.
 */
import { getPlatform, isNative } from "./platform";

export type BackAction = "close-overlay" | "history-back" | "go-home" | "arm-exit" | "exit";

/** How long the first "press back again to exit" press stays armed. */
export const EXIT_ARM_WINDOW_MS = 2000;

/**
 * Entry screens: BACK here does not navigate, it leaves the app (twice).
 * Query strings and fragments are already stripped by the caller.
 */
export const ENTRY_PATHS: readonly string[] = Object.freeze(["/", "/splash", "/home"]);

/** True for an entry screen, ignoring a trailing slash. */
export function isEntryPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return ENTRY_PATHS.includes(path);
}

/** Strips query string and fragment so `/home?from=x` still counts as Home. */
export function normalisePath(raw: string): string {
  const path = (raw || "").split(/[?#]/)[0] || raw || "";
  return path.startsWith("/") ? path : `/${path}`;
}

export interface BackDecisionInput {
  /** A sheet, drawer or dialog is on screen. */
  hasOpenOverlay: boolean;
  /** The router reports at least one previous entry. */
  canGoBack: boolean;
  /** Current in-app path (hash route or pathname), query/fragment allowed. */
  pathname: string;
  /** Timestamp of the previous armed press, or null when not armed. */
  armedAt: number | null;
  /** Current timestamp — injected so the exit arming is testable. */
  now: number;
}

/**
 * Pure precedence table for BACK.
 *
 * `arm-exit` is returned once at an entry screen; the caller shows a toast and
 * stores the timestamp. A second press within the window returns `exit`.
 */
export function decideBackAction(input: BackDecisionInput): BackAction {
  if (input.hasOpenOverlay) return "close-overlay";

  const path = normalisePath(input.pathname);
  const atEntry = isEntryPath(path);

  if (!atEntry) {
    // History when the router has it; a deep link / cold start on a sub-route
    // has nothing to pop, and BACK must land on Home rather than terminate.
    return input.canGoBack ? "history-back" : "go-home";
  }

  if (input.armedAt !== null && input.now - input.armedAt <= EXIT_ARM_WINDOW_MS) {
    return "exit";
  }
  return "arm-exit";
}

/**
 * True when a rendered overlay should swallow the BACK press.
 *
 * Radix Dialog / AlertDialog / Drawer (and vaul) all mark themselves with
 * `data-state="open"` and a dismissable layer; `aria-modal` is checked too so a
 * custom sheet that only declares semantics still counts.
 *
 * `[data-vaul-drawer]` alone is not enough: vaul keeps that attribute on the
 * closed drawer container, so a merely-mounted drawer would swallow BACK.
 */
export function findOpenOverlay(doc: Document): Element | null {
  const candidates = Array.from(
    doc.querySelectorAll(
      '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [aria-modal="true"], [data-vaul-drawer][data-state="open"]',
    ),
  );
  for (const candidate of candidates) {
    const closed =
      candidate.getAttribute("aria-hidden") === "true" ||
      candidate.hasAttribute("hidden") ||
      (candidate as HTMLElement).style?.display === "none";
    if (!closed) return candidate;
  }
  return null;
}

/** Typed access to the window's own event constructors (jsdom provides them). */
type WindowWithEvents = Window & {
  KeyboardEvent: typeof KeyboardEvent;
  PopStateEvent: typeof PopStateEvent;
  CustomEvent: typeof CustomEvent;
};

function escapeEvent(win: Window): KeyboardEvent {
  return new (win as WindowWithEvents).KeyboardEvent("keydown", {
    key: "Escape",
    code: "Escape",
    keyCode: 27,
    which: 27,
    bubbles: true,
    cancelable: true,
  });
}

/**
 * Asks the open overlay to close.
 *
 * Order: (1) a component that opted into the hardware-back contract by
 * cancelling `burg:hardware-back`; (2) the overlay's own close button when it
 * declares one; (3) an Escape keydown, which Radix DismissableLayer and vaul
 * both honour.
 *
 * Returns true when something was asked to close. It cannot prove the overlay
 * actually unmounted — the next BACK press simply re-evaluates.
 */
export function dismissOpenOverlay(win: Window, overlay: Element): boolean {
  const backEvent = new (win as WindowWithEvents).CustomEvent("burg:hardware-back", {
    bubbles: true,
    cancelable: true,
    detail: { source: "hardware-back" },
  });
  overlay.dispatchEvent(backEvent);
  if (backEvent.defaultPrevented) return true;

  const closeButton = overlay.querySelector<HTMLElement>(
    'button[aria-label*="close" i], button[data-testid*="close" i], [data-dialog-close], [data-drawer-close]',
  );
  if (closeButton) {
    closeButton.click();
    return true;
  }

  (overlay.ownerDocument || win.document).dispatchEvent(escapeEvent(win));
  return true;
}

/**
 * Minimal router surface so this module never imports TanStack.
 *
 * `goHome` MUST come from the router (`router.navigate`), never from a raw
 * `history.pushState({}, ...)`: that call drops the idx/key/__TSR_index fields
 * TanStack keeps in history.state, after which BACK can no longer pop.
 */
export interface RouterHistoryLike {
  back: () => void;
  canGoBack?: () => boolean;
  goHome: () => void;
}

/** Minimal `@capacitor/app` surface. */
export interface AppPluginLike {
  addListener: (
    event: "backButton",
    listener: (event: { canGoBack: boolean }) => void | Promise<void>,
  ) => Promise<unknown> | unknown;
  exitApp?: () => Promise<void> | void;
  minimizeApp?: () => Promise<void> | void;
}

export interface BackHandlerOptions {
  app: AppPluginLike;
  /** Router bridge; required so go-home can never bypass the router. */
  history: RouterHistoryLike;
  win?: Window;
  /** Injected clock (tests). */
  now?: () => number;
  /** Feedback for the first exit-arming press. Fire-and-forget. */
  onArmExit?: () => void;
}

/** Path lookup that works for both hash history and pathname routing. */
function currentPath(win: Window): string {
  const hash = win.location.hash.replace(/^#/, "");
  return normalisePath(hash || win.location.pathname);
}

/**
 * Builds the BACK handler. Returned so tests (and callers that need to detach)
 * can invoke the exact logic the plugin listener runs.
 */
export function createBackHandler(
  options: BackHandlerOptions,
): (event: { canGoBack: boolean }) => BackAction {
  const win = options.win ?? window;
  const now = options.now ?? (() => Date.now());
  let armedAt: number | null = null;

  return (event) => {
    const overlay = findOpenOverlay(win.document);
    const historyCanGoBack = options.history?.canGoBack?.() ?? Boolean(event?.canGoBack);
    const action = decideBackAction({
      hasOpenOverlay: Boolean(overlay),
      canGoBack: historyCanGoBack,
      pathname: currentPath(win),
      armedAt,
      now: now(),
    });

    switch (action) {
      case "close-overlay":
        if (overlay) dismissOpenOverlay(win, overlay);
        armedAt = null;
        return action;
      case "history-back":
        armedAt = null;
        options.history.back();
        return action;
      case "go-home":
        // Sub-route with no history behind it (deep link / cold start): keep
        // the app alive on Home through TanStack's own navigate() call so the
        // router's history state (idx/key/__TSR_index) stays intact.
        armedAt = null;
        options.history.goHome();
        return action;
      case "arm-exit":
        armedAt = now();
        options.onArmExit?.();
        return action;
      case "exit":
        armedAt = null;
        void options.app.exitApp?.();
        return action;
      default:
        return action;
    }
  };
}

/**
 * Registers the handler on the Android shell. Native-only; a no-op in the
 * browser so a plain web session keeps the browser's own BACK behaviour.
 */
export function initAndroidBackButton(options: BackHandlerOptions): () => void {
  if (!isNative() || getPlatform() !== "android") return () => undefined;
  const handler = createBackHandler(options);
  let handle: { remove: () => void } | null = null;
  let disposed = false;
  try {
    void Promise.resolve(
      options.app.addListener("backButton", (event) => {
        handler(event);
      }),
    )
      .then((registered) => {
        const candidate = registered as { remove?: () => void } | null;
        if (!candidate || typeof candidate.remove !== "function") return;
        // The plugin handle resolves asynchronously; dispose may already have
        // run, so remove it immediately rather than leaving a live listener.
        if (disposed) candidate.remove();
        else handle = candidate as { remove: () => void };
      })
      .catch(() => undefined);
  } catch {
    // Shell without the App plugin: the OS default BACK handling stays in
    // place, which is better than throwing inside native bootstrap.
  }
  return () => {
    disposed = true;
    handle?.remove();
    handle = null;
  };
}
