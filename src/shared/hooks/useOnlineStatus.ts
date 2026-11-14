import { useEffect } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import { useAppConfig } from "@/core/state/appConfigStore";
import { isNative } from "@/shared/platform/platform";
import {
  loadNativeNetworkClient,
  type NativeNetworkClient,
} from "@/shared/platform/networkClient";

/**
 * Connectivity synchronisation between the native Capacitor Network plugin and
 * browser events.
 *
 * Ordering contract, which is the whole point of this hook:
 * 1. The `networkStatusChange` listener is registered BEFORE the current-status
 *    probe is requested, so no event can be missed in between.
 * 2. Every signal carries a monotonically increasing revision. A probe result is
 *    written only if its captured revision is still the newest — so a slow
 *    `getStatus` can never overwrite a newer listener event or a newer resume
 *    probe, and can never resurrect a confirmed value after later evidence.
 * 3. Resume signals (`burg:appstate` bridged from mobileBootstrap, plus web
 *    `visibilitychange`/`pageshow`) each trigger exactly one bounded re-probe
 *    through the same fence. No extra native App listener is added here.
 * 4. Plugin failure degrades to browser evidence (an active connection — never a
 *    claim that the backend is reachable) and leaves later resume probes enabled.
 *
 * `Network.connected` reports an active connection, not API reachability; this
 * hook reflects the OS view and asserts nothing about server health.
 */

/**
 * The browser's active-connection view, or `true` when there is no such
 * evidence. Must return a real boolean: Node exposes a builtin `navigator`
 * without `onLine`, so a naive `typeof navigator` check yields `undefined`.
 */
function browserOnlineEvidence(): boolean {
  if (typeof window === "undefined") return true;
  if (typeof navigator === "undefined") return true;
  return typeof navigator.onLine === "boolean" ? navigator.onLine : true;
}

/** One bounded deadline per probe attempt (loader + probe). */
const ATTEMPT_DEADLINE_MS = 5000;

/** The slice of the plugin this hook uses; the SDK keeps the literal event name. */
type NetworkClient = NativeNetworkClient;

export function useOnlineStatus() {
  const setOnline = useAppConfig((state) => state.setOnline);
  const recordBrowserEvidence = useAppConfig((state) => state.recordBrowserEvidence);
  const setOnlineFromBrowserEvidence = useAppConfig(
    (state) => state.setOnlineFromBrowserEvidence,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isUnmounted = false;
    let listenerHandle: { remove: () => Promise<void> } | undefined;
    let removeStarted = false;
    /**
     * Newest evidence wins. Incremented by every listener event, every resume
     * signal and every probe issue; a probe writes only while still current.
     */
    let revision = 0;
    /**
     * The native client once the dynamic import has succeeded.
     *
     * The import is retried from resume/browser signals until it succeeds, so
     * a plugin that was unavailable at mount (bridge not ready) recovers instead
     * of being written off for the life of the screen. After the first success
     * the cached reference is reused — no repeated re-import per event — and the
     * listener is registered exactly once.
     */
    let nativeClient: NetworkClient | null = null;
    /** Guards against registering a second listener during recovery. */
    let listenerRegistered = false;

    /** Remove the plugin listener exactly once, swallowing a rejected removal. */
    const detach = (handle: { remove: () => Promise<void> } | undefined) => {
      if (!handle || removeStarted) return;
      removeStarted = true;
      try {
        void Promise.resolve(handle.remove()).catch(() => undefined);
      } catch {
        // A synchronous throw from remove() must not escape cleanup either.
      }
    };

    const write = (connected: boolean) => {
      if (!isUnmounted) setOnline(connected);
    };

    const writeWeak = (connected: boolean) => {
      if (!isUnmounted) setOnlineFromBrowserEvidence(connected);
    };

    /** Record the browser's OWN view only; never the native verdict. */
    const recordBrowser = (connected: boolean) => {
      if (!isUnmounted) recordBrowserEvidence(connected);
    };

    /**
     * ONE deadline envelope per attempt, owned by the attempt's revision.
     *
     * The timer is created once per `ensureClientAndProbe` (before the loader,
     * and for cached-client attempts) and is only ever cleared by the attempt
     * that owns it. `probe` therefore never restarts the budget.
     */
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineOwner = -1;

    /** Clear the timer only when the caller owns the current attempt. */
    const clearOwnedDeadline = (owner: number) => {
      if (deadlineOwner !== owner) return;
      if (deadlineTimer !== null) clearTimeout(deadlineTimer);
      deadlineTimer = null;
      deadlineOwner = -1;
    };

    /** True when `owner` is still the newest attempt. */
    const isCurrentAttempt = (owner: number) => !isUnmounted && owner === revision;

    /**
     * Run the probe for an ALREADY-issued attempt. Does not touch the revision
     * or the deadline: the envelope belongs to the caller.
     */
    const probeForAttempt = (Network: NetworkClient, owner: number) => {
      const settle = (kind: "ok" | "fail", connected?: boolean) => {
        if (!isCurrentAttempt(owner)) return;
        clearOwnedDeadline(owner);
        if (kind === "ok" && typeof connected === "boolean") write(connected);
        else {
          // Nothing usable: fall back to the browser's active-connection view
          // without asserting reachability.
          writeWeak(browserOnlineEvidence());
        }
      };
      try {
        Network.getStatus()
          .then((status) => {
            // A non-boolean `connected` is not evidence.
            settle(
              typeof status?.connected === "boolean" ? "ok" : "fail",
              status?.connected,
            );
          })
          .catch(() => settle("fail"));
      } catch {
        // A native bridge may throw synchronously instead of rejecting.
        settle("fail");
      }
    };

    /** Register the change listener once, for the first client that loads. */
    const bindListener = (Network: NetworkClient) => {
      if (listenerRegistered) return;
      listenerRegistered = true;
      let registered: Promise<PluginListenerHandle>;
      try {
        registered = Network.addListener("networkStatusChange", (status) => {
          if (isUnmounted) return;
          // A malformed payload is ignored entirely: no revision bump, so any
          // in-flight probe/attempt keeps its own fence and deadline.
          if (typeof status?.connected !== "boolean") return;
          // A listener event is authoritative: bump the revision so any
          // in-flight probe is invalidated, and drop the deadline it owned.
          const previousOwner = revision;
          revision += 1;
          clearOwnedDeadline(previousOwner);
          write(status.connected);
        });
      } catch {
        // A bridge that throws synchronously must stay retryable.
        listenerRegistered = false;
        return;
      }

      void Promise.resolve(registered)
        .then((handle) => {
          if (!handle) return;
          if (isUnmounted) {
            // Registered after unmount: remove immediately, exactly once.
            detach(handle);
            return;
          }
          listenerHandle = handle;
        })
        .catch(() => {
          // Registration failed: allow a later attempt to try again.
          listenerRegistered = false;
        });
    };

    if (isNative()) {
      /**
       * Load the native client if needed, rebind a missing listener, then probe.
       *
       * The import attempt is fenced too: a stale success or failure cannot
       * overwrite evidence that arrived after it was issued.
       */
      const ensureClientAndProbe = () => {
        if (isUnmounted) return;

        // One attempt id for this whole attempt (loader -> bind -> probe).
        revision += 1;
        const attempt = revision;

        // ONE envelope, started here before any loader work, covering the
        // cached-client path too. Only this attempt may clear it.
        clearOwnedDeadline(deadlineOwner);
        deadlineTimer = setTimeout(() => {
          if (deadlineOwner !== attempt) return;
          deadlineTimer = null;
          deadlineOwner = -1;
          if (!isCurrentAttempt(attempt)) return;
          // Expiry is weak browser evidence only; it never marks known.
          writeWeak(browserOnlineEvidence());
        }, ATTEMPT_DEADLINE_MS);
        deadlineOwner = attempt;

        if (nativeClient) {
          // A previous registration may have failed; retry it here so change
          // events are not lost for the life of the screen. bindListener is
          // idempotent, so a successful bind never registers twice.
          bindListener(nativeClient);
          // The envelope already covers this attempt: do not restart it.
          probeForAttempt(nativeClient, attempt);
          return;
        }

        // Record the browser's own view for this attempt (evidence only).
        recordBrowser(browserOnlineEvidence());
        void loadNativeNetworkClient()
          .then((Network) => {
            if (isUnmounted) return;
            // Caching the client and binding the listener is not evidence, so it
            // is kept even if newer evidence landed meanwhile; only the probe
            // (which would write) is skipped.
            nativeClient = Network;
            bindListener(Network);
            if (isCurrentAttempt(attempt)) {
              // The loader consumed part of the SAME 5000 ms envelope.
              probeForAttempt(Network, attempt);
            }
            // A STALE attempt must not clear/restart the newer attempt's timer.
          })
          .catch(() => {
            if (!isCurrentAttempt(attempt)) return;
            clearOwnedDeadline(attempt);
            writeWeak(browserOnlineEvidence());
          });
      };

      // Browser events stay useful on native, but they are weak evidence: the
      // browser's view is RECORDED only, and the plugin is asked instead.
      const handleBrowserSignal = () => {
        recordBrowser(browserOnlineEvidence());
        ensureClientAndProbe();
      };

      window.addEventListener("online", handleBrowserSignal);
      window.addEventListener("offline", handleBrowserSignal);

      // Initial attempt: listener binds first (inside bindListener), then probes.
      ensureClientAndProbe();

      /** One bounded re-probe per resume signal, fenced by revision. */
      const reprobe = () => {
        recordBrowser(browserOnlineEvidence());
        ensureClientAndProbe();
      };

      const onAppState = (event: Event) => {
        const detail = (event as CustomEvent<{ isActive?: boolean }>).detail;
        if (detail?.isActive === true) reprobe();
      };
      const onVisibility = () => {
        if (document.visibilityState === "visible") reprobe();
      };
      const onPageShow = () => reprobe();

      window.addEventListener("burg:appstate", onAppState);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pageshow", onPageShow);

      return () => {
        isUnmounted = true;
        // Drop the owned attempt deadline: no late writes after unmount.
        clearOwnedDeadline(deadlineOwner);
        window.removeEventListener("online", handleBrowserSignal);
        window.removeEventListener("offline", handleBrowserSignal);
        window.removeEventListener("burg:appstate", onAppState);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pageshow", onPageShow);
        detach(listenerHandle);
      };
    }

    // Web: navigator.onLine is the authoritative signal.
    const handleStatusChange = () => write(browserOnlineEvidence());
    handleStatusChange();

    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);

    // Same resume signals as native, re-reading the browser's own view. A
    // backgrounded tab can otherwise keep a stale value across a network change
    // that fired no event.
    const onVisibility = () => {
      if (document.visibilityState === "visible") handleStatusChange();
    };
    const onPageShow = () => handleStatusChange();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      isUnmounted = true;
      window.removeEventListener("online", handleStatusChange);
      window.removeEventListener("offline", handleStatusChange);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [setOnline, setOnlineFromBrowserEvidence, recordBrowserEvidence]);
}
