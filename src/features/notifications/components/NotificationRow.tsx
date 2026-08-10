import { Bell, Gift, Package, Megaphone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Text } from "@/shared/components/common/Text";
import { formatDistanceToNow } from "@/features/notifications/utils/formatDate";
import type {
  AppNotification,
  NotificationCategory,
} from "@/features/notifications/state/notificationsStore";

const iconFor: Record<NotificationCategory, typeof Bell> = {
  offer: Gift,
  order: Package,
  general: Megaphone,
};

interface Props {
  notification: AppNotification;
  onRead?: () => void;
  onRemove?: () => void;
}

export function NotificationRow({ notification, onRead, onRemove }: Props) {
  const Icon = iconFor[notification.category] ?? Bell;
  return (
    <article
      onClick={onRead}
      className={cn(
        "group flex gap-3 rounded-[var(--radius-large)] border bg-surface p-3 transition-colors",
        notification.read ? "border-divider" : "border-primary/30 bg-primary/[0.03]",
      )}
    >
      <div
        aria-hidden
        className={cn(
          "grid h-10 w-10 flex-none place-items-center rounded-full",
          notification.read ? "bg-bg-secondary text-text-secondary" : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2 min-w-0">
          <Text variant="titleMedium" className="flex-1 truncate">
            {notification.title}
          </Text>
          {!notification.read && (
            <span
              aria-label="Unread"
              className="mt-1.5 h-2 w-2 flex-none rounded-full bg-primary"
            />
          )}
        </div>
        <Text variant="bodyMedium" tone="secondary" className="line-clamp-2">
          {notification.body}
        </Text>
        <Text variant="caption" tone="secondary" className="mt-1">
          {formatDistanceToNow(notification.createdAt)}
        </Text>
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label="Delete notification"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="grid h-8 w-8 flex-none place-items-center rounded-full text-text-secondary transition-colors hover:bg-error/10 hover:text-error"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </article>
  );
}
