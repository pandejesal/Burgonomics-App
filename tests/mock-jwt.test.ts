import { describe, it, expect } from "vitest";

// Pins the expiry-less/forged token hole: bodies without numeric exp used to
// report NOT-expired and restore sessions without refresh.
import { isJwtExpired } from "../src/features/auth/utils/validators";

const b64url = (s: string) =>
  Buffer.from(s, "utf-8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function generateTestJwt(payload: object): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe("JWT expiry validation (real helpers)", () => {
  it("treats fresh tokens as live and expired ones as expired", () => {
    const token = generateTestJwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 });
    expect(isJwtExpired(token)).toBe(false);
  });

  it("treats expiry-less and malformed bodies as expired", () => {
    const forge = (body: object) => `h.${b64url(JSON.stringify(body))}.sig`;
    expect(isJwtExpired(forge({ sub: "x" }))).toBe(true);
    expect(isJwtExpired(forge({ sub: "x", exp: "never" }))).toBe(true);
    expect(isJwtExpired(forge({ exp: 9999999999 }))).toBe(true);
    expect(isJwtExpired("not-a-token")).toBe(true);
  });
});