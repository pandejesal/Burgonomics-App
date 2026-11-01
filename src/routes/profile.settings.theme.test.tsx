/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockSettingsResult = {
  success: boolean;
  data?: undefined;
  error?: { code: string; message: string };
};

const settingsRepositoryMock = vi.hoisted(() => ({
  update: vi.fn(async (_patch: Record<string, unknown>): Promise<MockSettingsResult> => ({
    success: true,
    data: undefined,
  })),
  updateNotifications: vi.fn(
    async (_patch: Record<string, unknown>): Promise<MockSettingsResult> => ({
      success: true,
      data: undefined,
    }),
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
}));
vi.mock("@/features/auth/components/ProtectedRoute", () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/features/settings/repositories/SettingsRepository", () => ({
  settingsRepository: settingsRepositoryMock,
}));
vi.mock("@/features/profile/repositories/ProfileRepository", () => ({
  profileRepository: { requestAccountDeletion: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { Page, ThemePreferenceControl } from "./profile.settings";
import { useSettingsStore } from "@/features/settings/state/settingsStore";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let container: HTMLDivElement;
let root: Root;

function radios(): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
}

beforeEach(() => {
  localStorage.clear();
  settingsRepositoryMock.update.mockReset();
  settingsRepositoryMock.update.mockImplementation(async (patch) => {
    useSettingsStore.getState().update(patch as { theme: "system" | "light" | "dark" });
    return { success: true as const, data: undefined };
  });
  settingsRepositoryMock.updateNotifications.mockReset();
  settingsRepositoryMock.updateNotifications.mockResolvedValue({
    success: true as const,
    data: undefined,
  });
  useSettingsStore.getState().reset();

  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("Settings appearance control", () => {
  it("renders System, Light and Dark with System selected by default", () => {
    act(() => {
      root.render(<ThemePreferenceControl value="system" onChange={vi.fn()} />);
    });

    expect(radios().map((radio) => radio.value)).toEqual(["system", "light", "dark"]);
    expect(radios()[0].checked).toBe(true);
    expect(container.textContent).toContain("System");
    expect(container.textContent).toContain("Light");
    expect(container.textContent).toContain("Dark");
  });

  it("keeps the full settings screen and preserves notification / privacy controls", () => {
    act(() => {
      root.render(<Page />);
    });

    expect(container.textContent).toContain("Appearance");
    expect(container.textContent).toContain("Notifications");
    expect(container.textContent).toContain("Privacy & Analytics");
    expect(container.textContent).toContain("Offers & promotions");
    expect(container.textContent).toContain("Order updates");
    expect(container.textContent).toContain("Announcements");
    expect(container.textContent).toContain("Product analytics");
    expect(container.textContent).toContain("Personalised recommendations");
    expect(radios()).toHaveLength(3);
  });

  it("writes an explicit Dark choice through the settings repository", async () => {
    act(() => {
      root.render(<Page />);
    });

    const darkRadio = container.querySelector<HTMLInputElement>('input[value="dark"]');
    expect(darkRadio).not.toBeNull();

    await act(async () => {
      darkRadio!.click();
      await Promise.resolve();
    });

    expect(settingsRepositoryMock.update).toHaveBeenCalledWith({ theme: "dark" });
    expect(useSettingsStore.getState().theme).toBe("dark");
  });

  it("returns to System and surfaces the repository error accessibly", async () => {
    // Start from an explicit choice so clicking System is a real change event,
    // not a click on an already-checked native radio.
    useSettingsStore.getState().update({ theme: "dark" });

    act(() => {
      root.render(<Page />);
    });

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[value="system"]')!.click();
      await Promise.resolve();
    });
    expect(settingsRepositoryMock.update).toHaveBeenLastCalledWith({ theme: "system" });

    settingsRepositoryMock.update.mockResolvedValueOnce({
      success: false,
      error: { code: "invalid_theme", message: "nope" },
    });

    await act(async () => {
      container.querySelector<HTMLInputElement>('input[value="light"]')!.click();
      await Promise.resolve();
    });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't save your appearance choice");
  });
});
