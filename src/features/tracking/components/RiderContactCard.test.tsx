/** @vitest-environment jsdom */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { RiderContactCard } from "./RiderContactCard";
import type { PorterTrackingState } from "../hooks/usePorterLiveTracking";

const tracking = (over: Partial<PorterTrackingState> = {}) =>
  ({
    riderName: "Asha Patel",
    riderPhone: "+919876543210",
    riderVehicleNumber: undefined,
    partnerName: "Borzo",
    currentStage: 3,
    isTakeawayOrDineIn: false,
    isDelivered: false,
    trackingUrl: undefined,
    ...over,
  }) as PorterTrackingState;

afterEach(() => {
  document.body.innerHTML = "";
});

async function mount(state: PorterTrackingState) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(<RiderContactCard tracking={state} storePhone="+919800000000" />),
  );
  return { host, root };
}

const riderLink = (host: HTMLElement) => host.querySelector('a[href="tel:+919876543210"]');

describe("RiderContactCard rider contact", () => {
  it("offers Call Rider while the order is on its way", async () => {
    const { host, root } = await mount(tracking());
    expect(riderLink(host), "rider tel link").not.toBeNull();
    expect(host.textContent).toContain("Assigned rider");
    await act(async () => root.unmount());
  });

  it("removes the rider's number once the order is delivered", async () => {
    // A delivered customer has no reason to keep a one-tap line to the rider's
    // personal phone. Call Store stays for anything that goes wrong afterwards.
    const { host, root } = await mount(tracking({ currentStage: 4, isDelivered: true }));
    expect(riderLink(host), "rider tel link").toBeNull();
    expect(host.textContent).not.toContain("Call Rider");
    expect(host.textContent).not.toContain("Contact available upon dispatch");
    expect(host.textContent).toContain("Delivered by");
    expect(host.textContent).toContain("Asha Patel");
    expect(host.querySelector('a[href="tel:+919800000000"]'), "store link").not.toBeNull();
    await act(async () => root.unmount());
  });
});

describe("RiderContactCard partner heading", () => {
  it("shows the label above a named courier", async () => {
    const { host, root } = await mount(tracking({ partnerName: "Borzo" }));
    expect(host.textContent).toContain("Delivery partner");
    expect(host.textContent).toContain("Borzo");
    await act(async () => root.unmount());
  });

  it("does not repeat 'Delivery partner' when the order names no courier", async () => {
    const { host, root } = await mount(tracking({ partnerName: "Delivery partner" }));
    const repeats = host.textContent!.match(/Delivery partner/g) ?? [];
    expect(repeats).toHaveLength(1);
    await act(async () => root.unmount());
  });
});
