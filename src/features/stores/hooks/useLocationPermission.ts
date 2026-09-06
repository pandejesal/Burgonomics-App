import { useCallback, useState, useEffect, useRef } from "react";

import { isNative } from "@/shared/platform/platform";
import { logger } from "@/core/logging/logger";

/**
 * Location-permission hook.
 *
 * On native (Capacitor Android/iOS) uses `@capacitor/geolocation` for a real
 * OS permission prompt and coordinates. On web, falls back to the browser
 * Geolocation API.
 */

export type PermissionStatus =
  "idle" | "prompting" | "granted" | "denied" | "blocked" | "unavailable";

export interface Coords {
  lat: number;
  lng: number;
}

async function requestNative(): Promise<{
  status: PermissionStatus;
  coords?: Coords;
  error?: string;
}> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    let perm = await Geolocation.checkPermissions();

    if (perm.location !== "granted") {
      perm = await Geolocation.requestPermissions({ permissions: ["location"] });
    }

    if (perm.location === "denied") {
      return { status: "blocked", error: "Location permission blocked in system settings." };
    }

    if (perm.location !== "granted") {
      return { status: "denied", error: "Location permission was denied." };
    }

    // In production, real GPS is used with high accuracy.
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    return {
      status: "granted",
      coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
    };
  } catch (err: unknown) {
    logger.error("location.native_error", err, {
      message: (err as { message?: string } | null)?.message,
    });
    const errorObj = err as { message?: string; code?: string } | null;
    // Determine if it was a timeout / GPS disabled
    if (errorObj?.message?.includes("Location services") || errorObj?.code === "3") {
      return { status: "unavailable", error: "GPS is disabled or location signal is unavailable." };
    }
    return { status: "unavailable", error: errorObj?.message || "Location request failed." };
  }
}

async function requestBrowser(): Promise<{
  status: PermissionStatus;
  coords?: Coords;
  error?: string;
}> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { status: "unavailable", error: "Geolocation is not supported by this browser." };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          status: "granted",
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        }),
      (err) => {
        console.warn("Browser Geolocation error code:", err.code);
        if (err.code === err.PERMISSION_DENIED) {
          resolve({ status: "blocked", error: "Location permission blocked by browser settings." });
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          resolve({
            status: "unavailable",
            error: "GPS / location services are disabled on your device.",
          });
        } else if (err.code === err.TIMEOUT) {
          resolve({ status: "unavailable", error: "Location search timed out. Please try again." });
        } else {
          resolve({ status: "unavailable", error: "Location signal unavailable." });
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

export function useLocationPermission() {
  const [status, setStatus] = useState<PermissionStatus>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("burg.cached_coords");
      if (saved) return "granted";
    }
    return "idle";
  });

  const [coords, setCoords] = useState<Coords | null>(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("burg.cached_coords");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  });

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Background continuous watching when permission is granted.
  // Watch errors are sampled (max 1/min): an active denial/timeout loop
  // would otherwise spam the log on every fire. UI state stays real-time.
  const lastWatchWarnAt = useRef(0);
  const noteWatchError = (code: unknown, message: unknown) => {
    const now = Date.now();
    if (now - lastWatchWarnAt.current < 60_000) return;
    lastWatchWarnAt.current = now;
    logger.warn("location.watch_error", { code, message });
  };

  useEffect(() => {
    let watchId: string | number | null = null;
    let isCancelled = false;

    if (status === "granted" && coords) {
      const startWatching = async () => {
        try {
          if (isNative()) {
            const { Geolocation } = await import("@capacitor/geolocation");
            watchId = await Geolocation.watchPosition(
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000,
              },
              (position, err) => {
                if (isCancelled) return;
                if (position) {
                  const newCoords = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                  };
                  setCoords(newCoords);
                  window.localStorage.setItem("burg.cached_coords", JSON.stringify(newCoords));
                }
              },
            );
          } else if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(
              (position) => {
                if (isCancelled) return;
                const newCoords = {
                  lat: position.coords.latitude,
                  lng: position.coords.longitude,
                };
                setCoords(newCoords);
                window.localStorage.setItem("burg.cached_coords", JSON.stringify(newCoords));
              },
              (err) => {
                setError(err?.message || "Location watch failed.");
                noteWatchError(err?.code, err?.message);
              },
              {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000,
              },
            );
          }
        } catch (e: unknown) {
          logger.error("location.watcher_setup_failed", e, {
            message: e instanceof Error ? e.message : String(e),
          });
        }
      };
      void startWatching();
    }

    return () => {
      isCancelled = true;
      if (watchId !== null) {
        if (isNative()) {
          import("@capacitor/geolocation").then(({ Geolocation }) => {
            Geolocation.clearWatch({ id: String(watchId) });
          });
        } else {
          navigator.geolocation.clearWatch(Number(watchId));
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const request = useCallback(async (): Promise<{
    status: PermissionStatus;
    coords?: Coords;
    error?: string;
  }> => {
    setStatus("prompting");
    setIsLoading(true);
    setError(null);

    // Try real GPS first
    const result = isNative() ? await requestNative() : await requestBrowser();

    setIsLoading(false);
    setStatus(result.status);

    if (result.status === "granted" && result.coords) {
      setCoords(result.coords);
      window.localStorage.setItem("burg.cached_coords", JSON.stringify(result.coords));
      setError(null);
    } else {
      setError(result.error || "Unable to acquire location.");
    }

    return result;
  }, []);

  return { status, coords, error, isLoading, request };
}
