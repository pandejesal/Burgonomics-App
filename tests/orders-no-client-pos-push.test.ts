import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** Customer order creation is a server call; POS push remains server-owned. */
const sources = [
  "src/features/orders/repositories/OrderRepository.ts",
  "src/features/orders/services/ordersService.ts",
  "src/features/payments/services/onlineDraftService.ts",
  "src/routes/checkout.tsx",
]
  .map((path) => readFileSync(resolve(__dirname, "..", path), "utf8"))
  .join("\n");

describe("customer client never pushes a KOT", () => {
  it("contains no Petpooja gateway call or client POS outbox in order creation", () => {
    expect(sources).not.toContain("petpoojaGateway.pushOrder");
    expect(sources).not.toContain('from "@/core/integrations/petpooja"');
  });

  it("uses only the server cash and online draft creators", () => {
    expect(sources).toContain("createCashOrderOnServer");
    expect(sources).toContain("createOnlineDraftOnServer");
    expect(sources).not.toContain("createFromCurrentContext");
  });
});
