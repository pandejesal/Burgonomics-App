import { describe, it, expect } from "vitest";
import {
  toUserMessage,
  userMessageFor,
  userMessageForText,
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

/**
 * P1-13: the auth store flattens `ApiFailure`s to `error.message`, so the auth
 * screens only ever hold a string — raw Firebase text in the failure case,
 * store-authored copy ("Please wait 12s…") in the throttle case. The string
 * path must map the first and preserve the second.
 */
describe("userMessageForText / store result shape (P1-13)", () => {
  it("maps a Firebase auth code recovered from raw SDK text", () => {
    expect(
      userMessageForText("Firebase: Error (auth/invalid-verification-code).")
    ).toBe("That code isn't right. Please check it and try again.");
    expect(userMessageForText("Firebase: Error (auth/too-many-requests).")).toBe(
      "Too many attempts. Please wait a few minutes and try again."
    );
    expect(userMessageForText("Firebase: Error (auth/network-request-failed).")).toBe(
      "We couldn't reach our servers. Check your connection and try again."
    );
  });

  it("falls back to generic for Firebase text with an unmapped code", () => {
    const out = userMessageForText("Firebase: Error (auth/some-new-code).");
    expect(out).toBe(GENERIC_ERROR_MESSAGE);
    expect(out).not.toContain("auth/");
  });

  it("falls back to generic for raw non-Firebase exception text", () => {
    expect(userMessageForText("fetch failed")).toBe(GENERIC_ERROR_MESSAGE);
    expect(userMessageForText("TypeError: x is not a function")).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("preserves store-authored copy", () => {
    expect(userMessageForText("Please wait 12s before requesting a new code.")).toBe(
      "Please wait 12s before requesting a new code."
    );
    expect(userMessageForText("No active OTP request.")).toBe("No active OTP request.");
    expect(userMessageForText("Please request an OTP first.")).toBe(
      "Please request an OTP first."
    );
  });

  it("preserves the curated authService fallbacks", () => {
    // These are the strings authService itself authors when Firebase supplies
    // no code — they must survive the text path intact.
    expect(userMessageForText("Invalid verification code. Please check and try again.")).toBe(
      "Invalid verification code. Please check and try again."
    );
    expect(
      userMessageForText(
        "Verification check failed to load. Please refresh the page and try again."
      )
    ).toBe("Verification check failed to load. Please refresh the page and try again.");
    expect(
      userMessageForText("No active verification session found. Please request a new code.")
    ).toBe("No active verification session found. Please request a new code.");
  });

  it("handles empty input", () => {
    expect(userMessageForText("")).toBe(GENERIC_ERROR_MESSAGE);
    expect(userMessageForText("   ")).toBe(GENERIC_ERROR_MESSAGE);
    expect(userMessageForText(null)).toBe(GENERIC_ERROR_MESSAGE);
    expect(userMessageForText(undefined)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("preserves every authored allow-listed string verbatim", () => {
    const AUTHORED = [
      "Please request an OTP first.",
      "No active OTP request.",
      "Verification check failed to load. Please refresh the page and try again.",
      "Failed to send SMS verification code. Please check the number and try again.",
      "No active verification session found. Please request a new code.",
      "Invalid verification code. Please check and try again.",
    ];
    for (const copy of AUTHORED) expect(userMessageForText(copy)).toBe(copy);
  });

  it("passes numeric cooldown copy through, by text and envelope", () => {
    expect(userMessageForText("Please wait 30s before requesting a new code.")).toBe(
      "Please wait 30s before requesting a new code."
    );
    expect(
      toUserMessage({ ok: false, error: "Please wait 45s before requesting a new code." })
    ).toBe("Please wait 45s before requesting a new code.");
  });

  it("maps `{ ok: false, error: '<raw text>' }` through the string path", () => {
    expect(
      toUserMessage({ ok: false, error: "Firebase: Error (auth/invalid-verification-code)." })
    ).toBe("That code isn't right. Please check it and try again.");
    expect(toUserMessage({ ok: false, error: "fetch failed" })).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage({ ok: false, error: "Please wait 12s before requesting a new code." }))
      .toBe("Please wait 12s before requesting a new code.");
  });

  it("keeps structured ApiFailure precedence over the error string", () => {
    // A structured code wins even when the same failure also carries text.
    expect(
      toUserMessage({
        success: false,
        error: { code: "WRITE_FAILED", message: "recaptcha is not defined" },
      })
    ).toBe("We couldn't save your changes. Please try again.");
    // A codeless structured failure never echoes its message.
    expect(
      toUserMessage({ success: false, error: { message: "recaptcha is not defined" } })
    ).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("leaves AppError kind mapping unchanged", () => {
    expect(toUserMessage({ kind: "SESSION_EXPIRED", message: "recaptcha is not defined" })).toBe(
      "Your session expired. Please sign in again."
    );
  });
});

/**
 * P1-13 (revision): the string path must fail closed. Any string that is not
 * copy this app authored — including recognizable-but-unlisted provider text
 * like `recaptcha is not defined`, `Failed to fetch`, or a Firestore
 * `PERMISSION_DENIED` — must resolve to the generic constant, both directly
 * (userMessageForText) and through the `{ ok: false, error }` store envelope
 * that authService/authStore hand to the auth screens.
 */
describe("userMessageForText fails closed (P1-13 revision)", () => {
  const UNRECOGNIZED = [
    "recaptcha is not defined",
    "Failed to fetch",
    "PERMISSION_DENIED: Missing or insufficient permissions.",
  ];

  it.each(UNRECOGNIZED)("userMessageForText(%p) → generic", (text) => {
    const out = userMessageForText(text);
    expect(out).toBe(GENERIC_ERROR_MESSAGE);
    expect(out).not.toContain(text);
  });

  it.each(UNRECOGNIZED)("toUserMessage({ ok: false, error: %p }) → generic", (text) => {
    const out = toUserMessage({ ok: false, error: text });
    expect(out).toBe(GENERIC_ERROR_MESSAGE);
    expect(out).not.toContain(text);
  });

  it("maps an arbitrary unknown sentence to generic", () => {
    expect(userMessageForText("The widget exploded while parsing the response.")).toBe(
      GENERIC_ERROR_MESSAGE
    );
  });

  it("maps a plain URL to generic", () => {
    expect(userMessageForText("https://api.burgonomics.example/v1/orders")).toBe(
      GENERIC_ERROR_MESSAGE
    );
  });

  it("does not let a non-numeric wait string through the cooldown pattern", () => {
    expect(userMessageForText("Please wait a moment before requesting a new code.")).toBe(
      GENERIC_ERROR_MESSAGE
    );
    expect(userMessageForText("Please wait 0s before requesting a new code.")).toBe(
      GENERIC_ERROR_MESSAGE
    );
  });

  it.each([
    "Please wait 12s before requesting a new code. <injected>",
    "Please wait 12s before requesting a new code. suffix",
    "prefix Please wait 12s before requesting a new code.",
  ])("rejects cooldown lookalike %p", (raw) => {
    expect(userMessageForText(raw)).toBe(GENERIC_ERROR_MESSAGE);
    expect(toUserMessage({ ok: false, error: raw })).toBe(GENERIC_ERROR_MESSAGE);
  });
});
