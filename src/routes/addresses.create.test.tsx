/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";

// React act() needs this flag outside of Jest.
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// Standalone mount: TanStack's route object dereferences the router context,
// which does not exist outside a <RouterProvider>.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearch: () => ({ editId: undefined, returnTo: "/checkout" }),
    createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      _$path: path,
    }),
  };
});

// The regression under test: this route rendered its body bare, so the
// add/edit address form was reachable without a signed-in session. The gate
// must be the OUTER wrapper — everything else renders only inside it.
vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-route">{children}</div>
  ),
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children, title }: { children: React.ReactNode; title?: string }) => (
    <div data-testid="app-shell" data-title={title}>
      {children}
    </div>
  ),
}));

vi.mock("@/features/addresses/components/AddressForm", () => ({
  AddressForm: () => <div data-testid="address-form" />,
}));

vi.mock("@/features/addresses/state/addressStore", () => ({
  selectAddresses: (s: { items: unknown }) => s.items,
  useAddressStore: (selector: (s: { items: unknown[] }) => unknown) => selector({ items: [] }),
}));

import { Route } from "./addresses.create";

const Page = (Route as unknown as { options: { component: React.ComponentType } }).options
  .component;

async function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(<Page />));
  return {
    container,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it("gates the add-address screen behind ProtectedRoute", async () => {
  const { container, unmount } = await mount();
  const gate = container.querySelector<HTMLElement>("[data-testid=protected-route]");
  const shell = container.querySelector<HTMLElement>("[data-testid=app-shell]");
  const form = container.querySelector<HTMLElement>("[data-testid=address-form]");
  expect(gate).not.toBeNull();
  expect(shell).not.toBeNull();
  expect(form).not.toBeNull();
  // The gate is the OUTER wrapper: shell and form exist only within it.
  expect(gate!.contains(shell!)).toBe(true);
  expect(gate!.contains(form!)).toBe(true);
  await unmount();
});

it("labels the create screen as adding an address when no editId is present", async () => {
  const { container, unmount } = await mount();
  const shell = container.querySelector<HTMLElement>("[data-testid=app-shell]");
  expect(shell?.getAttribute("data-title")).toBe("Add address");
  await unmount();
});
