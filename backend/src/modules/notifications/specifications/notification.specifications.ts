import type { Notification, NotificationStatus } from '@prisma/client';

/**
 * Read-model specifications for the Notification aggregate.
 * Encapsulates lifecycle predicates so services and mappers don't
 * duplicate business rules.
 */
export const NotificationSpecs = {
  isDeliverable(n: Notification, now = new Date()): boolean {
    if (n.status === 'FAILED' || n.status === 'EXPIRED' || n.status === 'ARCHIVED') return false;
    if (n.expiresAt && n.expiresAt.getTime() <= now.getTime()) return false;
    if (n.scheduledAt && n.scheduledAt.getTime() > now.getTime()) return false;
    return true;
  },
  isRead(n: Notification): boolean {
    return n.readAt !== null;
  },
  isArchived(n: Notification): boolean {
    return n.archivedAt !== null;
  },
  isTerminal(status: NotificationStatus): boolean {
    return (
      status === 'DELIVERED' ||
      status === 'READ' ||
      status === 'FAILED' ||
      status === 'EXPIRED' ||
      status === 'ARCHIVED'
    );
  },
} as const;
