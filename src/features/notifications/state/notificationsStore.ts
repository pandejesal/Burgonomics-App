import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  scopedNamespacedStorage,
  browserOrMemoryStorage,
  onAuthUidChange,
  readScopedPersisted,
} from "@/features/auth/utils/scopedPersistence";

export type NotificationCategory = "offer" | "order" | "general";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  createdAt: number;
  read: boolean;
  /** Optional deep-link into the app (e.g. `/orders/$id`). */
  deeplink?: string;
  /** Repo-driven CTA label (e.g. "View order"). */
  ctaLabel?: string;
}

interface NotificationsState {
  items: AppNotification[];
  unreadCount: number;

  hydrate: (items: AppNotification[]) => void;
  push: (n: AppNotification) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clear: () => void;
}

const recount = (items: AppNotification[]) => items.reduce((n, i) => n + (i.read ? 0 : 1), 0);

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set) => ({
      items: [],
      unreadCount: 0,

      hydrate: (items) => set({ items, unreadCount: recount(items) }),
      push: (n) =>
        set((s) => {
          // Dedupe by id (double-registered foreground handlers used to
          // inflate unreadCount) and cap the tray at 50.
          const items = [n, ...s.items.filter((i) => i.id !== n.id)].slice(0, 50);
          return { items, unreadCount: recount(items) };
        }),
      markRead: (id) =>
        set((s) => {
          const items = s.items.map((n) => (n.id === id ? { ...n, read: true } : n));
          return { items, unreadCount: recount(items) };
        }),
      markAllRead: () =>
        set((s) => ({
          items: s.items.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        })),
      remove: (id) =>
        set((s) => {
          const items = s.items.filter((n) => n.id !== id);
          return { items, unreadCount: recount(items) };
        }),
      clear: () => set({ items: [], unreadCount: 0 }),
    }),
    {
      name: "burg.notifications",
      version: 1,
      storage: createJSONStorage(() => scopedNamespacedStorage(browserOrMemoryStorage())),
      skipHydration: true,
      partialize: (s) => ({ items: s.items, unreadCount: s.unreadCount }),
    },
  ),
);

// Loop 36/120 (finding 6): the tray is per-user. On identity change the
// in-memory list resets and rehydrates from the new scope — signed-in user
// B must never see user A's notifications on a shared device. STRICT
// scoping: the legacy key may hold another account's rows, so no fallback.
interface ScopedNotifications {
  items: AppNotification[];
  unreadCount: number;
}

const NOTIFICATIONS_EMPTY: ScopedNotifications = { items: [], unreadCount: 0 };

function readNotificationsScope(uid: string | null): ScopedNotifications {
  return readScopedPersisted<ScopedNotifications>(
    "burg.notifications",
    uid,
    (state) => {
      const items = Array.isArray(state.items) ? (state.items as AppNotification[]) : [];
      return { items, unreadCount: recount(items) };
    },
    NOTIFICATIONS_EMPTY,
  );
}

onAuthUidChange((uid) => {
  useNotificationsStore.setState(readNotificationsScope(uid));
});
