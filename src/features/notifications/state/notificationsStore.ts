import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
      storage: createJSONStorage(() => {
        if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
        const memoryStorage = new Map<string, string>();
        return {
          getItem: (key: string) => memoryStorage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            memoryStorage.set(key, value);
          },
          removeItem: (key: string) => {
            memoryStorage.delete(key);
          },
          clear: () => {
            memoryStorage.clear();
          },
          length: memoryStorage.size,
          key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
        } as Storage;
      }),
      skipHydration: true,
      partialize: (s) => ({ items: s.items, unreadCount: s.unreadCount }),
    },
  ),
);
