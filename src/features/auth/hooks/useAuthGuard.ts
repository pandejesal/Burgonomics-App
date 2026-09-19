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
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const currentHref = useRouterState({
    select: (s) => s.location.href,
  });

  // Fail-closed: an "authenticated" status without a user identity (unknown
  // role / empty scope) is never a session — sign out and deny entry.
  const hasIdentity = !!user?.id && !!user?.phone;

  // The effect below depends on `currentHref`, which the router updates to
  // the *pending* location as soon as a navigation starts. Without this
  // guard, our own redirect changes `currentHref`, refires the effect, and
  // triggers another redirect — an infinite navigate loop that surfaces as
  // React error #185 (too many re-renders) via rejected load promises.
  const alreadyAtTarget = (target: string) =>
    currentHref === target || currentHref.startsWith(`${target}?`) || currentHref.startsWith(`${target}/`);

  useEffect(() => {
    if (!isBootstrapped) return;
    if (status === "authenticated" && !hasIdentity) {
      if (alreadyAtTarget("/auth/login")) return;
      void (async () => {
        await logout();
        await navigate({
          to: "/auth/login",
          replace: true,
          search: { redirect: currentHref },
        });
      })();
      return;
    }
    if (status !== "authenticated") {
      if (alreadyAtTarget(redirectTo)) return;
      void navigate({
        to: redirectTo,
        replace: true,
        search: { redirect: currentHref },
      });
    }
  }, [isBootstrapped, status, hasIdentity, logout, navigate, redirectTo, currentHref]);

  return { isBootstrapped, isAuthenticated: status === "authenticated" && hasIdentity };
}

/**
 * Blocks the route once the user is already authenticated (login/OTP).
 * Guests are allowed through — this is not a "require sign-out" guard.
 */
export function useGuestOnly({ redirectTo = "/home" }: Partial<GuardOptions> = {}) {
  const navigate = useNavigate();
  const isBootstrapped = useAuthStore((s) => s.isBootstrapped);
  const status = useAuthStore((s) => s.status);
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  useEffect(() => {
    if (!isBootstrapped) return;
    // Same anti-loop guard as useRequireAuth: the router exposes the pending
    // location immediately, so navigating and then refiring on the location
    // change would ping-pong without this early return.
    if (currentPath === redirectTo) return;
    if (status === "authenticated") {
      void navigate({ to: redirectTo, replace: true });
    }
  }, [isBootstrapped, status, navigate, redirectTo, currentPath]);

  return { isBootstrapped, isGuest: status !== "authenticated" };
}
