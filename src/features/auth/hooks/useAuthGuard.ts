/**
 * Client-side route guards.
 *
 * The Burgonomics app supports three session states — `guest`,
 * `authenticated`, `session_expired` — and browsing is unauthenticated
 * by default. Guards therefore fall into three families:
 *
 *   - Public routes: no guard at all (home, menu, cart, stores, …).
 *   - Guest-only routes: `useGuestOnly` (login/OTP) — blocks entry
 *     once the user is already authenticated.
 *   - Protected routes: `useRequireAuth` — captures the current URL
 *     as a `redirect` search param and bounces to `/auth/login`, so
 *     the user is returned to the exact same screen after signing in.
 *
 * When SSR + a real bearer flow lands, migrate these to a
 * `_authenticated` layout route with `beforeLoad` — no screen
 * changes required.
 */
import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuthStore } from "@/features/auth/state/authStore";

interface GuardOptions {
  /** Redirect target when the guard blocks entry. */
  redirectTo: string;
}

/**
 * Blocks the route unless a valid session exists. Preserves the current
 * URL (path + search) as `?redirect=…` so post-login navigation can
 * restore the exact screen the user was aiming for — including the
 * checkout guard flow described in the PRD.
 */
export function useRequireAuth({ redirectTo = "/auth/login" }: Partial<GuardOptions> = {}) {
  const navigate = useNavigate();
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const status = useAuthStore((s) => s.status);
  const currentHref = useRouterState({
    select: (s) => s.location.href,
  });

  useEffect(() => {
    if (!isBootstrapped) return;
    if (status !== "authenticated") {
      void navigate({
        to: redirectTo,
        replace: true,
        search: { redirect: currentHref },
      });
    }
  }, [isBootstrapped, status, navigate, redirectTo, currentHref]);

  return { isBootstrapped, isAuthenticated: status === "authenticated" };
}

/**
 * Blocks the route once the user is already authenticated (login/OTP).
 * Guests are allowed through — this is not a "require sign-out" guard.
 */
export function useGuestOnly({ redirectTo = "/home" }: Partial<GuardOptions> = {}) {
  const navigate = useNavigate();
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (!isBootstrapped) return;
    if (status === "authenticated") {
      void navigate({ to: redirectTo, replace: true });
    }
  }, [isBootstrapped, status, navigate, redirectTo]);

  return { isBootstrapped, isGuest: status !== "authenticated" };
}
