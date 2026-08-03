/**
 * Mock JWT helpers. Produces a base64url-encoded token that mimics the
 * shape of a real HS256 JWT (`header.payload.signature`).
 *
 * SECURITY WARNING:
 * The signature here is a random opaque string — this is NEVER cryptographically
 * valid. Client-side expiration checks (like `isJwtExpired`) are purely for UX
 * convenience. In production, the backend API gateway MUST enforce cryptographically
 * secure JWT signature validation and proper rate-limiting to prevent forged tokens.
 */
import { isProd } from "@/core/config/env";
import { generateSecureId } from "@/shared/utils/cryptoUtils";

const b64url = (input: string): string => {
  const bytes =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(input)))
      : Buffer.from(input, "utf-8").toString("base64");
  return bytes.replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};

const randomOpaque = (len = 32): string => {
  return generateSecureId(len);
};

export interface MockJwtPayload {
  sub: string;
  phone: string;
  iat: number;
  exp: number;
}

export const ACCESS_TOKEN_TTL_SEC = 15 * 60; // 15 min per API spec §3.1
export const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60; // 30 days

export function generateMockJwt(
  userId: string,
  phone: string,
): {
  accessToken: string;
  refreshToken: string;
  payload: MockJwtPayload;
} {
  const now = Math.floor(Date.now() / 1000);
  const payload: MockJwtPayload = {
    sub: userId,
    phone,
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SEC,
  };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const signature = b64url(randomOpaque(32));
  return {
    accessToken: `${header}.${body}.${signature}`,
    refreshToken: randomOpaque(48),
    payload,
  };
}

export function decodeMockJwt(token: string): MockJwtPayload | null {
  try {
    const [, body] = token.split(".");
    if (!body) return null;
    const padded = body.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? decodeURIComponent(escape(atob(padded)))
        : Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as MockJwtPayload;
  } catch {
    return null;
  }
}

export function isJwtExpired(token: string): boolean {
  if (isProd()) {
    console.warn(
      "[SECURITY WARN] Client-side JWT expiration check running in production! Do not rely on this for true security.",
    );
  }
  const p = decodeMockJwt(token);
  if (!p) return true;
  return Math.floor(Date.now() / 1000) >= p.exp;
}
