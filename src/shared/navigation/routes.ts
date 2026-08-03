/**
 * Typed navigation surface.
 *
 * This is the single source of truth for route paths. UI code (menus,
 * redirects, deep-links) MUST import `ROUTES` or `routePath()` from
 * this module rather than typing route strings inline. TanStack
 * Router's `<Link to="…">` still uses its own generated types — the
 * exported `RoutePath` union is a superset of routes registered in
 * `src/routes/`.
 *
 * When adding a screen: add its file under `src/routes/`, then add a
 * matching entry here so navigation call sites stay strongly typed.
 */
import { SCREENS } from "@/core/constants/screens";

export const ROUTES = SCREENS;

export type RouteId = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteId];

type ExtractParams<T extends string> = T extends `${string}$${infer Param}/${infer Rest}`
  ? { [K in Param | keyof ExtractParams<`/${Rest}`>]: string }
  : T extends `${string}$${infer Param}`
    ? { [K in Param]: string }
    : Record<string, never>;

/**
 * Substitute `$param` placeholders in a route path. Feature code should
 * call this instead of concatenating strings manually.
 */
export const routePath = <T extends RoutePath>(
  path: T,
  params: ExtractParams<T> = {} as ExtractParams<T>,
): string => {
  let out: string = path;
  for (const [key, value] of Object.entries(params)) {
    out = out.replace(`$${key}`, encodeURIComponent(String(value)));
  }
  return out;
};

/** Bottom-tab surface, ordered as they appear in `BottomTabBar`. */
export const PRIMARY_TABS = [
  { id: "HOME", path: ROUTES.HOME, label: "Home" },
  { id: "MENU", path: ROUTES.MENU, label: "Menu" },
  { id: "OFFERS", path: ROUTES.OFFERS, label: "Offers" },
  { id: "CART", path: ROUTES.CART, label: "Cart" },
  { id: "PROFILE", path: ROUTES.PROFILE, label: "Profile" },
] as const satisfies ReadonlyArray<{ id: string; path: string; label: string }>;

export type PrimaryTabId = (typeof PRIMARY_TABS)[number]["id"];
