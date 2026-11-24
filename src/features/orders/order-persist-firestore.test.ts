import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Client order birth is gone. Behavioural proof lives in the server-draft and
 * checkout integration suites; this structural guard prevents the old
 * setDoc/createFromCurrentContext path from being reintroduced.
 */
const service = readFileSync(resolve(__dirname, "services/ordersService.ts"), "utf8");
const repository = readFileSync(resolve(__dirname, "repositories/OrderRepository.ts"), "utf8");

describe("order creation is server-only", () => {
  it("ordersService exposes no client createOrder or orders setDoc", () => {
    expect(service).not.toContain("async createOrder(");
    expect(service).not.toContain('const orderRef = doc(db, "orders"');
  });

  it("OrderRepository exposes no legacy current-context creator or Firestore import", () => {
    expect(repository).not.toContain("createFromCurrentContext");
    expect(repository).not.toContain('from "firebase/firestore"');
    expect(repository).toContain("createOnlineDraftOnServer");
    expect(repository).toContain("createCashOrderOnServer");
  });
});
