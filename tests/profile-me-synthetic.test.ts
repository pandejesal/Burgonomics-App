import { describe, it, expect } from "vitest";
import { sanitizeProfileDoc } from "../src/features/profile/services/profileService";

/**
 * P1-4 reviewer blocker coverage: the backend READ boundary
 * (profileService.me() → refresh() → ProfileHeader) must never let a legacy
 * fabricated `<phone>@burgonomics.in` address through. sanitizeProfileDoc is
 * the single filter applied on that path; importing profileService pulls no
 * firebase at module scope (config is dynamically imported inside methods).
 */
describe("sanitizeProfileDoc — synthetic-email read boundary (P1-4)", () => {
  it("nulls a legacy fabricated phone@burgonomics.in address", () => {
    const out = sanitizeProfileDoc({
      id: "u1",
      phone: "+919876543210",
      fullName: "Test User",
      email: "9876543210@burgonomics.in",
      membershipTier: "silver",
    });
    expect(out.email).toBeNull();
    expect(out.id).toBe("u1");
    expect(out.phone).toBe("+919876543210");
  });

  it("leaves a real stored email untouched", () => {
    const out = sanitizeProfileDoc({ id: "u1", email: "real@example.com" });
    expect(out.email).toBe("real@example.com");
  });

  it("leaves an absent email absent (undefined is 'don't touch')", () => {
    const out = sanitizeProfileDoc({ id: "u1" });
    expect(out.email).toBeUndefined();
  });

  it("passes null and undefined profiles through", () => {
    expect(sanitizeProfileDoc(null)).toBeNull();
    expect(sanitizeProfileDoc(undefined)).toBeUndefined();
  });

  it("does not mutate the input document", () => {
    const doc = { id: "u1", email: "9876543210@burgonomics.in" };
    sanitizeProfileDoc(doc);
    expect(doc.email).toBe("9876543210@burgonomics.in");
  });
});
