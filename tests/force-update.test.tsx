// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "../src/core/config/env";
import { Route, resolveForceUpdateAction } from "../src/routes/force-update";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const boundary = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => boundary.navigate,
}));

vi.mock("../src/shared/layouts/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../src/shared/components/feedback/EmptyState", () => ({
  EmptyState: ({
    title,
    description,
    actionLabel,
    onAction,
  }: {
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
  }) => (
    <section>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      {actionLabel && onAction ? <button onClick={onAction}>{actionLabel}</button> : null}
    </section>
  ),
}));

const Page = Route.options.component as React.ComponentType;

const ANDROID_URL =
  "https://play.google.com/store/apps/details?id=com.burgonomics.customer";
const IOS_URL = "https://apps.apple.com/in/app/burgonomics/id1234567890";

describe("force-update recovery action", () => {
  let container: HTMLDivElement;
  let root: Root;
  let originalAndroid: string;
  let originalIos: string;

  beforeEach(() => {
    boundary.navigate.mockReset();
    originalAndroid = appConfig.integrations.androidStoreUrl;
    originalIos = appConfig.integrations.iosStoreUrl;
    appConfig.integrations.androidStoreUrl = "";
    appConfig.integrations.iosStoreUrl = "";
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    appConfig.integrations.androidStoreUrl = originalAndroid;
    appConfig.integrations.iosStoreUrl = originalIos;
    vi.restoreAllMocks();
  });

  it("shows a real support action when no store listing is configured", async () => {
    await act(async () => root.render(<Page />));
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Contact support");
    await act(async () => button!.click());
    expect(boundary.navigate).toHaveBeenCalledWith({ to: "/support" });
  });

  it("opens a configured official Play listing", async () => {
    appConfig.integrations.androidStoreUrl = ANDROID_URL;
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    await act(async () => root.render(<Page />));
    const button = container.querySelector("button");
    expect(button?.textContent).toBe("Open app store");
    await act(async () => button!.click());
    expect(open).toHaveBeenCalledWith(ANDROID_URL, "_blank", "noopener,noreferrer");
    expect(boundary.navigate).not.toHaveBeenCalled();
  });

  it("rejects non-official or non-HTTPS URLs instead of fabricating a store", async () => {
    appConfig.integrations.androidStoreUrl = "https://evil.example/app.apk";
    appConfig.integrations.iosStoreUrl = "http://apps.apple.com/app/burgonomics/id1234567890";
    await act(async () => root.render(<Page />));
    expect(container.querySelector("button")?.textContent).toBe("Contact support");
    expect(resolveForceUpdateAction(appConfig.integrations.androidStoreUrl, "", "Android").kind).toBe(
      "support",
    );
  });

  it("selects the iOS listing on an iPhone user agent", () => {
    expect(resolveForceUpdateAction("", IOS_URL, "Mozilla/5.0 (iPhone)")).toEqual({
      kind: "store",
      label: "Open app store",
      url: IOS_URL,
    });
  });
});
