import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { HttpClient } from "@/core/network/httpClient";

/**
 * Cycle 10 staging (2026-11-24, Customer 67371ec): three checkout lanes posted
 * `Content-Type: application/json, application/json` to the deployed backend.
 *
 * Cause: `HttpClient` supplies a lowercase default
 * (`{"content-type": "application/json"}`) and the payment services passed a
 * capital override (`{"Content-Type": "application/json"}`). The plain-object
 * merge kept both keys, and Fetch joins duplicate header names with ", ".
 * `express.json()` matches neither value, so the body arrived as `{}` and every
 * checkout lane answered a field-level 400 before writing anything.
 *
 * These tests use the REAL client and Node's REAL fetch (undici) against a local
 * HTTP server that records the bytes that actually arrive, so the assertion is
 * on the wire rather than on an intermediate object.
 */
let server: Server;
let origin: string;
let lastHeaders: IncomingHttpHeaders = {};
let lastRawContentTypes: string[] = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      lastHeaders = req.headers;
      // rawHeaders keeps duplicates: this is what the backend's parser sees.
      lastRawContentTypes = [];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (req.rawHeaders[i].toLowerCase() === "content-type") {
          lastRawContentTypes.push(req.rawHeaders[i + 1]);
        }
      }
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ orderId: "ord_wire_captured" }));
    });
  });
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

afterEach(() => {
  lastHeaders = {};
  lastRawContentTypes = [];
});

/**
 * A client whose base URL is the loopback server. `HttpClient` refuses cleartext
 * outside dev, and `VITE` dev is not on here, so the URL is absolute HTTPS-shaped
 * and only the transport call is pointed at the loopback origin — the header
 * merge and the Fetch call are the product's own.
 */
function loopbackClient() {
  const client = new HttpClient({
    baseUrl: "https://api.staging.invalid",
    timeoutMs: 5000,
    retry: { attempts: 1, backoffMs: 0 },
  });
  const post = client.post.bind(client);
  return {
    post: (path: string, body: unknown, init?: { headers?: Record<string, string> }) =>
      post(`${origin}${path}`, body, init),
  };
}

describe("HttpClient wire Content-Type", () => {
  it.each(["cash", "online"] as const)(
    "emits exactly one JSON media type when a %s checkout service adds its own capital-cased header",
    async (lane) => {
      const client = loopbackClient();
      const path = lane === "cash" ? "/orders/createCashOrder" : "/orders/createOnlineDraft";
      // The shape the payment services used before this fix: a capital-cased
      // Content-Type on top of the client's lowercase default.
      await client.post(
        path,
        { orderId: `ord_wire_${lane}` },
        { headers: { "Content-Type": "application/json", authorization: "Bearer wire" } },
      );

      expect(lastRawContentTypes).toHaveLength(1);
      expect(lastRawContentTypes[0]).toBe("application/json");
      expect(String(lastHeaders["content-type"])).not.toContain(",");
    },
  );

  it("keeps the caller's own media type instead of appending the default", async () => {
    const client = loopbackClient();
    await client.post(
      "/orders/createCashOrder",
      { orderId: "ord_wire_override" },
      { headers: { "Content-Type": "application/charset-test" } },
    );

    expect(lastRawContentTypes).toEqual(["application/charset-test"]);
  });

  it("still sends the JSON default when the caller adds only auth", async () => {
    const client = loopbackClient();
    await client.post(
      "/checkout/fees",
      { storeId: "s1" },
      { headers: { authorization: "Bearer wire" } },
    );

    expect(lastRawContentTypes).toEqual(["application/json"]);
  });

  it("sends auth headers lowercase so they are never joined either", async () => {
    const client = loopbackClient();
    await client.post(
      "/orders/createCashOrder",
      { orderId: "ord_wire_auth" },
      { headers: { Authorization: "Bearer wire" } as Record<string, string> },
    );

    const values = Object.entries(lastHeaders)
      .filter(([name]) => name.toLowerCase() === "authorization")
      .map(([, value]) => value);
    expect(values).toEqual(["Bearer wire"]);
  });
});
