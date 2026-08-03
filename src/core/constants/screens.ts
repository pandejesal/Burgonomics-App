/**
 * Screen inventory — sourced from 04_UI_UX_Specification §7 and
 * 02_Master_PRD Screen Inventory (SCR-001…SCR-020).
 * Adds the operational screens listed in Frontend Architecture §6:
 * 404, Maintenance, Force Update.
 */
export const SCREENS = {
  SPLASH: "/",
  AUTH_LOGIN: "/auth/login",
  AUTH_OTP: "/auth/otp",
  STORE_SELECT: "/stores",
  HOME: "/home",
  SEARCH: "/search",
  MENU: "/menu",
  PRODUCT: "/menu/product/$productId",
  CART: "/cart",
  CHECKOUT: "/checkout",
  ORDERS: "/orders",
  ORDER_DETAILS: "/orders/$orderId",
  ORDER_TRACK: "/orders/$orderId/track",
  OFFERS: "/offers",
  PROFILE: "/profile",
  ADDRESSES: "/profile/addresses",
  NOTIFICATIONS: "/profile/notifications",
  SETTINGS: "/profile/settings",
  SUPPORT: "/support",
  ABOUT: "/about",
  PRIVACY: "/privacy",
  TERMS: "/terms",
  MAINTENANCE: "/maintenance",
  FORCE_UPDATE: "/force-update",
} as const;

export type ScreenKey = keyof typeof SCREENS;
