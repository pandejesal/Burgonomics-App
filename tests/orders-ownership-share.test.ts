import { describe, it, expect } from "vitest";

// Pins the order-privacy backstop (real helper) and the canonical share URL
// (real builder): deleting the ownership check or typo'ing either track-URL
// copy used to stay green.

import { isOrderVisibleTo } from "../src/features/orders/services/ordersService";
import { buildTrackUrl } from "../src/features/orders/utils/trackUrl";

describe("Order privacy + share URL (real code)", () => {
  it("hides another user's order from a signed-in caller", () => {
    expect(isOrderVisibleTo({ userId: "uid_victim" }, "uid_attacker")).toBe(false);
    expect(isOrderVisibleTo({ customerId: "uid_victim" }, "uid_attacker")).toBe(false);
  });

  it("fails closed on no owner field and on unknown caller uid (matches rules + money paths)", () => {
    expect(isOrderVisibleTo({ userId: "uid_me" }, "uid_me")).toBe(true);
    // A doc that cannot prove an owner is visible to no one (was fail-open
    // before — a doc lacking userId/customerId served to any signed-in user).
    expect(isOrderVisibleTo({}, "uid_me")).toBe(false);
    // A signed-out caller (uid unknown) cannot validate ownership either way.
    expect(isOrderVisibleTo({ userId: "uid_x" }, null)).toBe(false);
  });

  it("builds the canonical track URL both share call sites must use", () => {
    expect(buildTrackUrl("ord_123", "https://burgonomics.com")).toBe(
      "https://burgonomics.com/orders/ord_123/track",
    );
    expect(buildTrackUrl("ord_123", "https://burgonomics.com/")).toBe(
      "https://burgonomics.com/orders/ord_123/track",
    );
  });
});
