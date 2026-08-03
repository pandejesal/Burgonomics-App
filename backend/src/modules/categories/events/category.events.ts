export const CATEGORY_EVENTS = {
  CREATED: 'category.created',
  UPDATED: 'category.updated',
  DELETED: 'category.deleted',
  VISIBILITY_CHANGED: 'category.visibility_changed',
} as const;

export interface CategoryChangedEvent {
  categoryId: string;
  petpoojaId: string;
  source: 'PETPOOJA_SYNC' | 'SYSTEM';
  correlationId?: string;
}
