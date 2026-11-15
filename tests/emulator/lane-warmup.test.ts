// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { warmUpVite } from "./lane-warmup";

const ENTRY = "/tests/emulator/emulator-entry.tsx";
const INDEX = `<script type="module" src="${ENTRY}"></script>`;

interface Reply {
  status: number;
  body?: string;
  headers?: Record<string, string>;
}

const servers: Server[] = [];

/** A real loopback HTTP server that records every request path it receives. */
async function serve(
  handler: (url: string) => Reply,
): Promise<{ base: string; requests: string[] }> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url ?? "");
    const reply = handler(req.url ?? "");
    res.writeHead(reply.status, reply.headers);
    res.end(reply.body ?? "");
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, requests };
}

const sameOrigin = (base: string) => (url: string) => url.startsWith(`${base}/`);

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

describe("lane-warmup", () => {
  it("waits for an optimized dependency imported by the lane entry", async () => {
    const dep = "/@fs/C:/lane/vite-cache/deps/react-dom_client.js?v=abc123";
    const vite = await serve((url) =>
      url === "/"
        ? { status: 200, body: INDEX }
        : url === ENTRY
          ? { status: 200, body: `import "${dep}";` }
          : { status: 200, body: "export {};" },
    );

    await expect(warmUpVite(vite.base, sameOrigin(vite.base))).resolves.toBeGreaterThanOrEqual(0);
    expect(vite.requests).toEqual(["/", ENTRY, dep]);
  });

  it("re-reads the entry when the optimizer reports an outdated dependency", async () => {
    let bundles = 0;
    const vite = await serve((url) => {
      if (url === "/") return { status: 200, body: INDEX };
      if (url === ENTRY) return { status: 200, body: `import "/deps/react.js?v=${bundles}";` };
      bundles += 1;
      return bundles === 1 ? { status: 504 } : { status: 200, body: "export {};" };
    });

    await expect(warmUpVite(vite.base, sameOrigin(vite.base))).resolves.toBeGreaterThanOrEqual(0);
    expect(vite.requests).toEqual(["/", ENTRY, "/deps/react.js?v=0", ENTRY, "/deps/react.js?v=1"]);
  });

  it("refuses a redirect instead of following it off the checked origin", async () => {
    const outside = await serve(() => ({ status: 200, body: INDEX }));
    const vite = await serve(() => ({ status: 302, headers: { location: `${outside.base}/` } }));

    await expect(warmUpVite(vite.base, sameOrigin(vite.base))).rejects.toThrow();
    expect(vite.requests).toEqual(["/"]);
    expect(outside.requests).toEqual([]);
  });

  it("refuses a URL outside the allowed origin before sending anything", async () => {
    const vite = await serve(() => ({ status: 200, body: INDEX }));

    await expect(warmUpVite(vite.base, () => false)).rejects.toThrow(/refusing non-loopback/);
    expect(vite.requests).toEqual([]);
  });

  it("fails when the lane entry imports no optimized dependency", async () => {
    const vite = await serve((url) =>
      url === "/" ? { status: 200, body: INDEX } : { status: 200, body: "export {};" },
    );

    await expect(warmUpVite(vite.base, sameOrigin(vite.base))).rejects.toThrow(
      /imports no optimized dependency/,
    );
  });

  it("fails instead of looping when every dependency response is outdated", async () => {
    const vite = await serve((url) =>
      url === "/"
        ? { status: 200, body: INDEX }
        : url === ENTRY
          ? { status: 200, body: 'import "/deps/react.js?v=stale";' }
          : { status: 504 },
    );

    await expect(warmUpVite(vite.base, sameOrigin(vite.base))).rejects.toThrow(/still outdated/);
    expect(vite.requests.filter((url) => url === ENTRY)).toHaveLength(5);
  });
});
