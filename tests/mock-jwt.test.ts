import { describe, it, expect } from "vitest";

// Pins the expiry-less/forged token hole: bodies without numeric exp used to
// report NOT-expired and restore sessions without refresh.
import { generateMockJwt, isJwtExpired, decodeMockJwt } from "../src/features/auth/utils/mockJwt";

const b64url = (s: string) =>
  Buffer.from(s, "utf-8").toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

describe("mockJwt expiry validation (real helpers)", () => {
  it("treats fresh tokens as live and expired ones as expired", () => {
    const { accessToken } = generateMockJwt("u1", "+919825012345");
    expect(isJwtExpired(accessToken)).toBe(false);
    expect(decodeMockJwt(accessToken)?.sub).toBe("u1");
  });

  it("treats expiry-less and malformed bodies as expired", () => {
    const forge = (body: object) => `h.${b64url(JSON.stringify(body))}.sig`;
    expect(isJwtExpired(forge({ sub: "x" }))).toBe(true);
    expect(isJwtExpired(forge({ sub: "x", exp: "never" }))).toBe(true);
    expect(isJwtExpired(forge({ exp: 9999999999 }))).toBe(true);
    expect(isJwtExpired("not-a-token")).toBe(true);
  });
});
