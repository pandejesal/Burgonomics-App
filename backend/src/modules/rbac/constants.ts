/**
 * Canonical RBAC permission and role catalog for the Burgonomics platform.
 *
 * Permissions follow the `resource.action` naming convention. Roles map to
 * business personas (SUPER_ADMIN, RESTAURANT_OWNER, etc.). System roles are
 * seeded automatically and cannot be deleted.
 */
export const PERMISSIONS = {
  // Admin surface
  ADMIN_DASHBOARD_READ: 'admin.dashboard.read',
  ADMIN_SYSTEM_HEALTH_READ: 'admin.system-health.read',

  // Orders
  ORDERS_READ: 'orders.read',
  ORDERS_WRITE: 'orders.write',
  ORDERS_CANCEL: 'orders.cancel',
  ORDERS_REFUND: 'orders.refund',

  // Customers
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_WRITE: 'customers.write',
  CUSTOMERS_SUSPEND: 'customers.suspend',

  // Stores
  STORES_READ: 'stores.read',
  STORES_WRITE: 'stores.write',
  STORES_TOGGLE: 'stores.toggle',

  // Menu / catalog
  MENU_READ: 'menu.read',
  MENU_SYNC: 'menu.sync',
  MENU_STOCK_TOGGLE: 'menu.stock.toggle',

  // Offers & coupons
  OFFERS_READ: 'offers.read',
  OFFERS_WRITE: 'offers.write',
  COUPONS_READ: 'coupons.read',
  COUPONS_WRITE: 'coupons.write',

  // Notifications
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_BROADCAST: 'notifications.broadcast',

  // Feature flags
  FEATURE_FLAGS_READ: 'feature-flags.read',
  FEATURE_FLAGS_WRITE: 'feature-flags.write',

  // Queues
  QUEUES_READ: 'queues.read',
  QUEUES_MANAGE: 'queues.manage',

  // Webhooks
  WEBHOOKS_READ: 'webhooks.read',
  WEBHOOKS_REPLAY: 'webhooks.replay',

  // Payments
  PAYMENTS_READ: 'payments.read',
  PAYMENTS_REFUND: 'payments.refund',
  PAYMENTS_RECONCILE: 'payments.reconcile',

  // Analytics & reports
  ANALYTICS_READ: 'analytics.read',
  REPORTS_READ: 'reports.read',
  REPORTS_GENERATE: 'reports.generate',

  // System configuration
  SYSTEM_CONFIG_READ: 'system-config.read',
  SYSTEM_CONFIG_WRITE: 'system-config.write',

  // Audit
  AUDIT_READ: 'audit.read',
  AUDIT_EXPORT: 'audit.export',

  // RBAC self-management
  RBAC_READ: 'rbac.read',
  RBAC_WRITE: 'rbac.write',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  RESTAURANT_OWNER: 'restaurant_owner',
  RESTAURANT_MANAGER: 'restaurant_manager',
  KITCHEN_MANAGER: 'kitchen_manager',
  KITCHEN_STAFF: 'kitchen_staff',
  CASHIER: 'cashier',
  CUSTOMER_SUPPORT: 'customer_support',
  FINANCE: 'finance',
  OPERATIONS: 'operations',
  READ_ONLY: 'read_only',
} as const;

export type RoleKey = (typeof ROLES)[keyof typeof ROLES];

/**
 * Default permission set attached to each system role. Loaded lazily
 * by the seeder; superseded by per-tenant custom roles once created.
 */
export const ROLE_DEFAULT_PERMISSIONS: Record<RoleKey, PermissionKey[]> = {
  [ROLES.SUPER_ADMIN]: Object.values(PERMISSIONS),
  [ROLES.RESTAURANT_OWNER]: Object.values(PERMISSIONS).filter((p) => !p.startsWith('rbac.')),
  [ROLES.RESTAURANT_MANAGER]: [
    PERMISSIONS.ADMIN_DASHBOARD_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_WRITE,
    PERMISSIONS.ORDERS_CANCEL,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.STORES_READ,
    PERMISSIONS.STORES_TOGGLE,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.MENU_SYNC,
    PERMISSIONS.MENU_STOCK_TOGGLE,
    PERMISSIONS.OFFERS_READ,
    PERMISSIONS.COUPONS_READ,
    PERMISSIONS.NOTIFICATIONS_READ,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.REPORTS_READ,
  ],
  [ROLES.KITCHEN_MANAGER]: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_WRITE,
    PERMISSIONS.MENU_READ,
    PERMISSIONS.MENU_STOCK_TOGGLE,
  ],
  [ROLES.KITCHEN_STAFF]: [PERMISSIONS.ORDERS_READ, PERMISSIONS.MENU_READ],
  [ROLES.CASHIER]: [PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_WRITE, PERMISSIONS.PAYMENTS_READ],
  [ROLES.CUSTOMER_SUPPORT]: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.NOTIFICATIONS_READ,
  ],
  [ROLES.FINANCE]: [
    PERMISSIONS.PAYMENTS_READ,
    PERMISSIONS.PAYMENTS_REFUND,
    PERMISSIONS.PAYMENTS_RECONCILE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.REPORTS_GENERATE,
  ],
  [ROLES.OPERATIONS]: [
    PERMISSIONS.ADMIN_DASHBOARD_READ,
    PERMISSIONS.ADMIN_SYSTEM_HEALTH_READ,
    PERMISSIONS.QUEUES_READ,
    PERMISSIONS.QUEUES_MANAGE,
    PERMISSIONS.WEBHOOKS_READ,
    PERMISSIONS.WEBHOOKS_REPLAY,
    PERMISSIONS.MENU_SYNC,
  ],
  [ROLES.READ_ONLY]: Object.values(PERMISSIONS).filter((p) => p.endsWith('.read')),
};

export const PERMISSION_CACHE_TTL_SECONDS = 300;
export const PERMISSION_CACHE_PREFIX = 'rbac:perm:';
