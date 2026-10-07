import { describe, it, expect } from "vitest";
import {
  toUserMessage,
  userMessageFor,
  GENERIC_ERROR_MESSAGE,
} from "../src/core/errors/userMessages";

/**
 * P1-8: raw exception text (`PERMISSION_DENIED: …`, `fetch failed`, Firebase
 * errors) must never reach customers. Every shape the app handles funnels
 * through toUserMessage and comes out as friendly copy.
 */
describe("toUserMessage (P1-8)", () => {
  it("maps an ApiFailure envelope by its code", () => {
    const res = {
      success: false as const,
      error: { code: "WRITE_FAILED", message: "PERMISSION_DENIED: sim/adb denied" },
    };
    expect(toUserMessage(res)).toBe("We couldn't save your changes. Please try again.");
  });

  it("maps a bare { code, message } object by its code", () => {
    expect(toUserMessage({ code: "NETWORK", message: "fetch failed" })).toBe(
      "We couldn't reach our servers. Please try again."
    );
  });

  it("falls back to the generic string for unknown codes", () => {
    expect(toUserMessage({ code: "SOMETHING_OBSCURE", message: "raw text" })).toBe(
      GENERIC_ERROR_MESSAGE
    );
  });

  it("drops the raw text of Error instances entirely", () => {
    expect(toUserMessage(new Error("Firebase: Error (auth/network-request-failed)"))).toBe(
      GENERIC_ERROR_MESSAGE
    );
  });

  it("drops raw strings", () => {
    expect(toUserMessage("ECONNREFUSED 127.0.0.1:8080")).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("handles null/undefined", () => {
    expect(toUserMessage(null)).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("never echoes the raw message even when a code maps", () => {
    const out = toUserMessage({ code: "SERVER_ERROR", message: "TypeError: x is not a function" });
    expect(out).not.toContain("TypeError");
    expect(out).toBe("Something went wrong on our end. Please try again.");
  });

  it("userMessageFor returns the generic fallback for empty/unknown codes", () => {
    expect(userMessageFor(undefined)).toBe(GENERIC_ERROR_MESSAGE);
    expect(userMessageFor("")).toBe(GENERIC_ERROR_MESSAGE);
    expect(userMessageFor("NOT_A_CODE")).toBe(GENERIC_ERROR_MESSAGE);
    expect(userMessageFor("OFFLINE")).toBe("You're offline. Check your connection and try again.");
  });
});
