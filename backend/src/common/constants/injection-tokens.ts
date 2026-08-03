/**
 * Central registry of DI tokens for repository interfaces and provider
 * ports. Feature modules should import from here — never inline strings.
 */
export const INJECTION_TOKENS = {
  // Storage
  STORAGE_PROVIDER: Symbol('STORAGE_PROVIDER'),

  // Notifications
  FCM_GATEWAY: Symbol('FCM_GATEWAY'),
  SMS_GATEWAY: Symbol('SMS_GATEWAY'),

  // Feature flags
  FEATURE_FLAG_PROVIDER: Symbol('FEATURE_FLAG_PROVIDER'),

  // Search
  SEARCH_PROVIDER: Symbol('SEARCH_PROVIDER'),
} as const;
