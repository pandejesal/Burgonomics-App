export const REPORT_TYPES = {
  SALES: 'sales',
  ORDERS: 'orders',
  REFUNDS: 'refunds',
  TAX: 'tax',
  OFFERS: 'offers',
  STORES: 'stores',
  CUSTOMERS: 'customers',
  INVENTORY: 'inventory',
} as const;

export type ReportType = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];

export const REPORT_FORMATS = ['csv', 'xlsx', 'pdf'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];
