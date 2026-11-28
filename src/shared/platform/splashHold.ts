/**
 * Branded splash hold lengths.
 *
 * Split out of `splash.tsx` so the route module exports only its route and
 * component (the repo's fast-refresh lint rule) and so the numbers are unit
 * testable without mounting a route.
 *
 * Startup context (EMULATOR audit 2026-11-26: 20-23 s cold start on a
 * saturated host): on native the Capacitor splash has ALREADY shown the brand
 * while the bundle loaded, so holding the in-app brand frame for the full web
 * length is duplicated startup time. It is shortened, not removed — the native
 * splash keeps `launchAutoHide: false`, so the user never sees a blank frame.
 */
import { isNative } from "@/shared/platform/platform";

/** Web hold: the branded frame is the first thing the customer sees. */
export const SPLASH_HOLD_MS = 1500;

/** Native hold: a short hand-off from the native splash, not a second pause. */
export const SPLASH_HOLD_MS_NATIVE = 250;

/** The hold this runtime should use. */
export function splashHoldMs(native: boolean = isNative()): number {
  return native ? SPLASH_HOLD_MS_NATIVE : SPLASH_HOLD_MS;
}
