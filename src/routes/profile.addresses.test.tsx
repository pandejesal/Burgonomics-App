/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";

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
    createFileRoute: (path: string) => (opts: Record<string, unknown>) => ({
      ...opts,
      options: opts,
      _$path: path,
    }),
  };
});

vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="protected-route">{children}</div>
  ),
}));

vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/shared/components/common/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    open ? (
      <button type="button" onClick={() => onConfirm()}>
        confirm-delete
      </button>
    ) : null,
}));

vi.mock("@/features/addresses/components/AddressCard", () => ({
  AddressCard: ({ address, actionSlot }: Record<string, unknown>) => (
    <div data-testid={`address-card-${(address as { id: string }).id}`}>
      <span>{(address as { line1: string }).line1}</span>
      {actionSlot as React.ReactNode}
    </div>
  ),
}));

vi.mock("@/features/profile/components/AddressFormModal", () => ({
  AddressFormModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="address-form-modal" role="dialog" /> : null,
}));

vi.mock("@/features/addresses/state/addressStore", () => ({
  selectAddresses: (s: { items: unknown }) => s.items,
  useAddressStore: (selector: (s: { items: unknown[] }) => unknown) =>
    selector({
      items: [
        {
          id: "addr_syn_1",
          label: "home",
          line1: "B-42, Sunshine Heights",
          city: "Ahmedabad",
          pincode: "380001",
          lat: 23.02,
          lng: 72.57,
          isDefault: true,
        },
        {
          id: "addr_syn_2",
          label: "work",
          line1: "C-7, Office Park",
          city: "Ahmedabad",
          pincode: "380015",
          lat: 23.03,
          lng: 72.56,
          isDefault: false,
        },
      ],
    }),
}));

vi.mock("@/features/addresses/repositories/AddressRepository", () => ({
  addressRepository: {
    remove: vi.fn(),
    setDefault: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}));

import { Route } from "./profile.addresses";
import { addressRepository } from "@/features/addresses/repositories/AddressRepository";

const Page = (Route as unknown as { options: { component: React.ComponentType } })
  .options.component;

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

function buttonWithText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

it("gates the saved-addresses screen behind ProtectedRoute", async () => {
  const { container, unmount } = await mount();
  const gate = container.querySelector<HTMLElement>("[data-testid=protected-route]");
  const shell = container.querySelector<HTMLElement>("[data-testid=app-shell]");
  // Regression: the screen imported ProtectedRoute but never rendered it, so
  // the addresses list was reachable without auth.
  expect(gate).not.toBeNull();
  expect(shell).not.toBeNull();
  // The gate is the OUTER wrapper — content only exists inside it.
  expect(gate!.contains(shell!)).toBe(true);
  expect(container.textContent).toContain("B-42, Sunshine Heights");
  await unmount();
});

it("opens the add-address modal from the list action", async () => {
  const { container, unmount } = await mount();
  expect(container.querySelector("[data-testid=address-form-modal]")).toBeNull();
  const addBtn = buttonWithText(container, "Add new address")!;
  expect(addBtn).toBeTruthy();
  await act(async () => addBtn.click());
  expect(container.querySelector("[data-testid=address-form-modal]")).not.toBeNull();
  await unmount();
});

it("keeps the address and shows an inline alert when the remote delete fails", async () => {
  vi.mocked(addressRepository.remove).mockResolvedValueOnce({
    success: false,
    error: {
      code: "WRITE_FAILED",
      message: "We couldn't delete your address. Please try again.",
      retryable: true,
    },
  } as never);

  const { container, unmount } = await mount();
  await act(async () => buttonWithText(container, "Delete")!.click());
  await act(async () => buttonWithText(container, "confirm-delete")!.click());

  // No false success: the row is still there and the failure is announced on
  // the screen itself, not only in a toast that vanishes.
  expect(container.textContent).toContain("B-42, Sunshine Heights");
  const alert = container.querySelector<HTMLElement>('[role="alert"]');
  expect(alert?.textContent).toContain("delete your address");
  expect(toast.success).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalled();
  await unmount();
});

it("shows an inline alert when set-default fails without claiming success", async () => {
  vi.mocked(addressRepository.setDefault).mockResolvedValueOnce({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "That address is no longer in your saved addresses.",
      retryable: false,
    },
  } as never);

  const { container, unmount } = await mount();
  await act(async () => buttonWithText(container, "Set default")!.click());

  const alert = container.querySelector<HTMLElement>('[role="alert"]');
  expect(alert?.textContent).toContain("no longer in your saved addresses");
  expect(container.textContent).toContain("C-7, Office Park");
  expect(toast.success).not.toHaveBeenCalled();
  await unmount();
});
