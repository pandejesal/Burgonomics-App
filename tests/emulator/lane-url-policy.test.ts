/**
 * UNIT — browser URL allowlist. Pure; no request is made to any endpoint.
 *
 * Pins the security boundary that decides what may egress: exact loopback host,
 * explicit lane port, no userinfo. Prefix/path/userinfo/redirect/default-port/
 * scheme tricks must all be rejected so a future refactor cannot degrade the
 * guard to a naive `includes("127.0.0.1")`.
 */
import { describe, expect, it } from "vitest";

import { isLoopbackLaneUrl, isNonLoopbackHttpUrl } from "./lane-url-policy";

const ALLOWED = [
  "http://127.0.0.1:5199",
  "http://127.0.0.1:5199/",
  "http://127.0.0.1:5199/index.html?x=1#y",
  "https://127.0.0.1:5199/x",
  "http://127.0.0.1:8099/google.firestore.v1.Firestore/Listen/channel?VER=8",
  "ws://127.0.0.1:5199/?token=abc",
  "wss://127.0.0.1:5199/?token=abc",
  "http://[::1]:5199/",
  "HTTP://127.0.0.1:5199/",
  // WHATWG URL canonicalizes the trailing dot to 127.0.0.1; still loopback.
  "http://127.0.0.1.:5199/",
];

const REJECTED = [
  // userinfo / credential tricks
  "http://127.0.0.1:5199@evil.com/",
  "http://user:pass@127.0.0.1:5199/",
  "http://127.0.0.1:5199:pass@evil.com/",
  // hostname prefix / suffix tricks
  "http://127.0.0.1.evil.com:5199/",
  "http://127.0.0.1evil.com:5199/",
  "http://evil.com/127.0.0.1:5199",
  // redirect target / external
  "http://evil.com/?next=http://127.0.0.1:5199",
  "https://firestore.googleapis.com/v1/projects/demo/databases/(default)/documents",
  "https://127.0.0.1:8099.evil.com/",
  // scheme
  "ftp://127.0.0.1:5199/",
  "file:///C:/Windows/win.ini",
  "javascript:alert(1)",
  "data:text/html,<h1>x</h1>",
  "blob:http://127.0.0.1:5199/x",
  // wrong/default/omitted ports
  "http://127.0.0.1:5198/",
  "http://127.0.0.1:8080/",
  "http://127.0.0.1/",
  "https://127.0.0.1:443/",
  "https://127.0.0.1/",
  // not absolute
  "//127.0.0.1:5199",
  "",
];

describe("isLoopbackLaneUrl", () => {
  it.each(ALLOWED)("allows %s", (url) => {
    expect(isLoopbackLaneUrl(url)).toBe(true);
  });

  it.each(REJECTED)("rejects %s", (url) => {
    expect(isLoopbackLaneUrl(url)).toBe(false);
  });
});

describe("isNonLoopbackHttpUrl (route-abort predicate)", () => {
  it("aborts every non-loopback http(s) URL", () => {
    for (const url of [
      "https://evil.com/",
      "https://firestore.googleapis.com/v1/x",
      "https://evil.com/?next=http://127.0.0.1:5199",
    ]) {
      expect(isNonLoopbackHttpUrl(new URL(url))).toBe(true);
    }
  });

  it("does not abort allowed loopback http(s) requests", () => {
    expect(isNonLoopbackHttpUrl(new URL("http://127.0.0.1:5199/"))).toBe(false);
    expect(isNonLoopbackHttpUrl(new URL("http://127.0.0.1:8099/x"))).toBe(false);
  });

  it("leaves websocket handling to the separate websocket assertion", () => {
    expect(isNonLoopbackHttpUrl(new URL("ws://127.0.0.1:5199/"))).toBe(false);
    expect(isNonLoopbackHttpUrl(new URL("wss://evil.com/"))).toBe(false);
  });
});
