import { NotificationSpecs } from './notification.specifications';
import type { Notification } from '@prisma/client';

function make(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    userId: 'u1',
    type: 'system',
    category: 'GENERAL',
    title: 't',
    body: 'b',
    data: null,
    deeplink: null,
    imageUrl: null,
    channel: 'PUSH',
    priority: 'NORMAL',
    status: 'PENDING',
    readAt: null,
    archivedAt: null,
    templateCode: null,
    templateVersion: null,
    correlationId: null,
    refType: null,
    refId: null,
    scheduledAt: null,
    expiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Notification;
}

describe('NotificationSpecs', () => {
  it('rejects archived notifications', () => {
    expect(NotificationSpecs.isDeliverable(make({ status: 'ARCHIVED' }))).toBe(false);
  });
  it('rejects expired notifications', () => {
    expect(NotificationSpecs.isDeliverable(make({ expiresAt: new Date(Date.now() - 1000) }))).toBe(
      false,
    );
  });
  it('rejects notifications scheduled in the future', () => {
    expect(
      NotificationSpecs.isDeliverable(make({ scheduledAt: new Date(Date.now() + 60_000) })),
    ).toBe(false);
  });
  it('accepts pending, unscheduled notifications', () => {
    expect(NotificationSpecs.isDeliverable(make())).toBe(true);
  });
});
