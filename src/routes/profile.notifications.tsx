import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CheckCheck, BellOff } from "lucide-react";
import { ProtectedRoute } from "@/features/auth/components/ProtectedRoute";
import { AppShell } from "@/shared/layouts/AppShell";
import { EmptyState } from "@/shared/components/feedback/EmptyState";
import { NotificationRow } from "@/features/notifications/components/NotificationRow";
import {
  useNotificationsStore,
  type NotificationCategory,
} from "@/features/notifications/state/notificationsStore";
import { notificationRepository } from "@/features/notifications/repositories/NotificationRepository";
import { parseNotificationRefSearch, parseStoredNotificationTarget } from "@/features/notifications/utils/notificationRouting";
import { resolveNotificationRefNavigation } from "@/features/notifications/services/notificationInbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/profile/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Burgonomics" },
      { name: "description", content: "Offers, order updates and announcements." },
    ],
  }),
  // Preserved through the signed-out redirect: `?ref=` is validated here and
  // resolved only after ProtectedRoute admits an authenticated session.
  validateSearch: parseNotificationRefSearch,
  component: Page,
});

function Page() {
  return (
    <ProtectedRoute>
      <Body />
    </ProtectedRoute>
  );
}

type Filter = "all" | NotificationCategory;

const TABS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "order", label: "Orders" },
  { id: "offer", label: "Offers" },
  { id: "general", label: "Announcements" },
];

function Body() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const ref = search.ref;
  const items = useNotificationsStore((s) => s.items);
  const unread = useNotificationsStore((s) => s.unreadCount);
  const [filter, setFilter] = React.useState<Filter>("all");
  const resolvedRef = React.useRef<string | null>(null);

  // Background tap contract (§11): the SW opens `?ref=<inbox doc id>`; the
  // app resolves the document AFTER auth. A missing/denied ref leaves the
  // customer on this screen — it never navigates to `/`.
  React.useEffect(() => {
    if (!ref || resolvedRef.current === ref) return;
    resolvedRef.current = ref;
    let cancelled = false;
    void resolveNotificationRefNavigation(ref).then((target) => {
      if (cancelled) return;
      if (target.to === "/support") {
        void navigate({ to: "/support", search: target.search });
      } else if (target.to === "/orders/$orderId/track") {
        void navigate({ to: "/orders/$orderId/track", params: target.params });
      }
      // The centre fallback leaves the customer on this screen.
    });
    return () => {
      cancelled = true;
    };
  }, [ref, navigate]);

  const visible = React.useMemo(
    () => (filter === "all" ? items : items.filter((n) => n.category === filter)),
    [items, filter],
  );

  return (
    <AppShell
      title="Notifications"
      backTo="/profile"
      showTabs
      showTopBar
      rightSlot={
        unread > 0 ? (
          <button
            type="button"
            onClick={() => void notificationRepository.markAllRead()}
            className="inline-flex items-center gap-1 type-label-large text-primary"
          >
            <CheckCheck className="h-4 w-4" aria-hidden />
            Mark all
          </button>
        ) : null
      }
    >
      <div className="mx-auto max-w-[520px] space-y-3 px-4 py-4">
        <div
          role="tablist"
          aria-label="Notification categories"
          className="flex gap-2 overflow-x-auto"
        >
          {TABS.map((t) => {
            const active = filter === t.id;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(t.id)}
                className={cn(
                  "whitespace-nowrap rounded-full px-3 py-1.5 type-label-large transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-divider bg-surface text-text-secondary hover:text-primary",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={<BellOff className="h-8 w-8" aria-hidden />}
            title={items.length === 0 ? "You're all caught up" : "Nothing here"}
            description={
              items.length === 0
                ? "Offers, order updates and Burgonomics announcements will appear here."
                : "No notifications match this filter yet."
            }
          />
        ) : (
          <ul className="space-y-2">
            {visible.map((n) => (
              <li key={n.id}>
                <NotificationRow
                  notification={n}
                  onRead={() => {
                    if (!n.read) void notificationRepository.markRead(n.id);
                    const target = n.deeplink
                      ? parseStoredNotificationTarget(n.deeplink)
                      : null;
                    if (!target) return;
                    if (target.to === "/support") {
                      void navigate({ to: "/support", search: target.search });
                    } else if (target.to === "/orders/$orderId/track") {
                      void navigate({ to: "/orders/$orderId/track", params: target.params });
                    } else {
                      void navigate({ to: target.to });
                    }
                  }}
                  onRemove={() => void notificationRepository.remove(n.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
