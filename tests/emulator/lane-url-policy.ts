/**
 * EMULATOR TEST LANE — browser URL allowlist.
 *
 * Pure and dependency-free so it can be pinned by unit tests. The rule is an
 * exact origin match: loopback host, explicit lane port, no userinfo. Prefix
 * tricks (`127.0.0.1.evil.com`), path tricks (`evil.com/127.0.0.1:5199`),
 * userinfo tricks (`127.0.0.1:5199@evil.com`), default ports, other schemes and
 * redirect targets are all rejected. A trailing dot is canonicalized by WHATWG
 * URL to `127.0.0.1`, so it remains loopback (pinned by tests).
 */
export const VITE_PORT = 5199;
export const FIRESTORE_PORT = 8099;

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]"]);
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

export function isLoopbackLaneUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;
  // Credentials in a URL are never part of this lane.
  if (url.username !== "" || url.password !== "") return false;
  if (!LOOPBACK_HOSTS.has(url.hostname)) return false;
  // Require the explicit lane port: `http://127.0.0.1` (default 80) is not allowed.
  if (url.port === "") return false;
  return url.port === String(VITE_PORT) || url.port === String(FIRESTORE_PORT);
}

/** True for an http(s) request that must be aborted before egress. */
export function isNonLoopbackHttpUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return !isLoopbackLaneUrl(url.toString());
}
