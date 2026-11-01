/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = vi.hoisted(() => ({
  navigate: vi.fn(),
  ref: "ref_support" as string | null,
  resolve: vi.fn(),
  items: [] as Array<{
    id: string;
    category: "support";
    title: string;
    body: string;
    createdAt: number;
    read: boolean;
    deeplink?: string;
  }>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    options,
    useSearch: () => ({ ref: fixture.ref }),
  }),
  useNavigate: () => fixture.navigate,
}));

vi.mock("../src/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("../src/shared/layouts/AppShell", () => ({
  AppShell: ({
    children,
    rightSlot,
  }: {
    children: React.ReactNode;
    rightSlot?: React.ReactNode;
  }) => (
    <main>
      {rightSlot}
      {children}
    </main>
  ),
}));

vi.mock("../src/shared/components/feedback/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock("../src/features/notifications/state/notificationsStore", () => ({
  useNotificationsStore: (selector: (state: unknown) => unknown) =>
    selector({ items: fixture.items, unreadCount: 0 }),
}));

vi.mock("../src/features/notifications/repositories/NotificationRepository", () => ({
  notificationRepository: { markAllRead: vi.fn(), markRead: vi.fn(), remove: vi.fn() },
}));

vi.mock("../src/features/notifications/components/NotificationRow", () => ({
  NotificationRow: ({
    notification,
    onRead,
  }: {
    notification: { title: string };
    onRead?: () => void;
  }) => (
    <button type="button" onClick={onRead}>
      {notification.title}
    </button>
  ),
}));

vi.mock("../src/features/notifications/services/notificationInbox", () => ({
  resolveNotificationRefNavigation: fixture.resolve,
}));

import { Route } from "../src/routes/profile.notifications";

const Page = (Route as unknown as { options: { component: React.ComponentType } }).options.component;







let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  fixture.navigate.mockReset();
  fixture.resolve.mockReset();
  fixture.ref = "ref_support";
  fixture.items = [];
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

describe("C-05 profile.notifications ref navigation", () => {
  it("navigates to support with structured search params, not a query string in `to`", async () => {
    fixture.resolve.mockResolvedValue({
      to: "/support",
      search: { ticketId: "tkt_123" },
    });

    await act(async () => {
      root.render(<Page />);
      await Promise.resolve();
    });

    expect(fixture.resolve).toHaveBeenCalledWith("ref_support");
    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/support",
      search: { ticketId: "tkt_123" },
    });
    expect(fixture.navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringContaining("?") }),
    );
  });

  it("navigates to order tracking with structured params", async () => {
    fixture.resolve.mockResolvedValue({
      to: "/orders/$orderId/track",
      params: { orderId: "ord_42" },
    });

    await act(async () => {
      root.render(<Page />);
      await Promise.resolve();
    });

    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/orders/$orderId/track",
      params: { orderId: "ord_42" },
    });
  });

  it("stays on the centre when the ref is missing", async () => {
    fixture.resolve.mockResolvedValue({ to: "/profile/notifications" });

    await act(async () => {
      root.render(<Page />);
      await Promise.resolve();
    });

    expect(fixture.navigate).not.toHaveBeenCalled();
  });

  it("a tray row tap uses structured support search, not a raw ?ticketId string", async () => {
    fixture.ref = null;
    fixture.items = [
      {
        id: "notif_1",
        category: "support",
        title: "Support reply",
        body: "We replied",
        createdAt: Date.now(),
        read: true,
        deeplink: "/support?ticketId=tkt_123",
      },
    ];

    await act(async () => {
      root.render(<Page />);
      await Promise.resolve();
    });

    const row = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Support reply",
    );
    expect(row).toBeTruthy();

    await act(async () => {
      row!.click();
      await Promise.resolve();
    });

    expect(fixture.navigate).toHaveBeenCalledWith({
      to: "/support",
      search: { ticketId: "tkt_123" },
    });
    expect(fixture.navigate).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: expect.stringContaining("?") }),
    );
  });
});
