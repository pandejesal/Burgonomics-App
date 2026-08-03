import { useEffect } from "react";
import { useAppConfig } from "@/core/state/appConfigStore";
import { isNative } from "@/shared/platform/platform";

/**
 * React hook to synchronize network status (online/offline) between native Capacitor
 * plugins and browser events without async memory leaks.
 */
export function useOnlineStatus() {
  const setOnline = useAppConfig((state) => state.setOnline);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let isUnmounted = false;
    let listenerHandle: { remove: () => Promise<void> } | undefined;

    const handleStatusChange = () => setOnline(navigator.onLine);
    handleStatusChange();

    window.addEventListener("online", handleStatusChange);
    window.addEventListener("offline", handleStatusChange);

    if (isNative()) {
      import("@capacitor/network")
        .then(({ Network }) => {
          if (isUnmounted) return;

          Network.getStatus()
            .then((status) => {
              if (!isUnmounted) setOnline(status.connected);
            })
            .catch(() => undefined);

          return Network.addListener("networkStatusChange", (status) => {
            if (!isUnmounted) setOnline(status.connected);
          });
        })
        .then((handle) => {
          if (handle) {
            if (isUnmounted) {
              void handle.remove();
            } else {
              listenerHandle = handle;
            }
          }
        })
        .catch(() => undefined);
    }

    return () => {
      isUnmounted = true;
      window.removeEventListener("online", handleStatusChange);
      window.removeEventListener("offline", handleStatusChange);
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, [setOnline]);
}
