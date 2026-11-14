/**
 * Production-*initialisation* proof for the Customer logger.
 *
 * `logger.test.ts` exercises the severity threshold by calling
 * `setMinLevel("warn")`, and its identity clamping against `appIdentity()`
 * directly — because `vitest.setup.ts` pins `import.meta.env.DEV = true` for the
 * whole suite. Neither of those proves what a freshly constructed logger does in
 * a release build: that `isDev() === false` alone yields a warning-emitting
 * default sink.
 *
 * This file closes that gap without touching global setup: the ONLY mocked
 * boundary is `@/core/config`, whose `isDev`/`appConfig` the real logger reads
 * at module load. Everything else — `@/core/logging/logger` and `safeLog` — is
 * the real implementation imported fresh through `vi.resetModules()` +
 * `vi.doMock()`.
 *
 * No `setMinLevel(...)` and no `addSink(...)` is called: if the production
 * default were still missing, warn/error/critical would produce no console
 * call and these assertions would fail.
 *
 * All metadata below is synthetic.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

interface ConsoleCall {
  level: "debug" | "info" | "warn" | "error";
  args: unknown[];
}

let consoleCalls: ConsoleCall[] = [];

function installConsoleSpies(): void {
  consoleCalls = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleCalls.push({ level, args });
    });
  }
}

function callsFor(level: ConsoleCall["level"]): ConsoleCall[] {
  return consoleCalls.filter((call) => call.level === level);
}

/** Each captured call must be ONE parseable JSON string, and nothing else. */
function parsed(level: ConsoleCall["level"]): Array<Record<string, unknown>> {
  return callsFor(level).map((call) => {
    expect(call.args).toHaveLength(1);
    expect(typeof call.args[0]).toBe("string");
    return JSON.parse(call.args[0] as string) as Record<string, unknown>;
  });
}

/**
 * Mock only the config boundary and import the real logger on top of it.
 * `vi.doMock` is not hoisted, so it applies to the next dynamic import — the
 * pattern Vitest documents for per-test module substitution.
 */
async function importRealLogger(options: {
  appConfig: { env: unknown; appVersion: unknown; appName: unknown };
  isDev: () => boolean;
}) {
  vi.resetModules();
  vi.doMock("@/core/config", () => ({
    appConfig: options.appConfig,
    isDev: options.isDev,
  }));
  const loggerModule = await import("./logger");
  return loggerModule.logger;
}

afterEach(() => {
  vi.doUnmock("@/core/config");
  vi.resetModules();
  vi.restoreAllMocks();
  consoleCalls = [];
});

describe("a freshly constructed logger in a production build", () => {
  it("takes its default level from isDev() === false, not from setMinLevel", async () => {
    installConsoleSpies();
    const isDev = (): boolean => false;
    const logger = await importRealLogger({
      appConfig: { env: "production", appVersion: "1.4.2", appName: "Burgonomics" },
      isDev,
    });

    // The boundary really is the false branch this test claims to cover.
    expect(isDev()).toBe(false);

    logger.debug("razorpay.zero_charge_complete");
    logger.info("push.registered");
    logger.warn("push.webPushNoVapidKey");
    logger.error("payments.verify_failed", new Error("synthetic"));
    logger.critical("route.error", new Error("synthetic"));

    // Below-threshold levels stay silent with no per-test override in play.
    expect(callsFor("debug")).toHaveLength(0);
    expect(callsFor("info")).toHaveLength(0);

    // Above-threshold levels reach the console because the default sink exists.
    const warnings = parsed("warn");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      v: 1,
      level: "warn",
      event: "push.webPushNoVapidKey",
      app: { name: "Burgonomics", version: "1.4.2", env: "production" },
    });

    const errors = parsed("error");
    expect(errors).toHaveLength(2);
    expect(errors.map((event) => event.level)).toEqual(["error", "critical"]);
    expect(errors.map((event) => event.event)).toEqual(["payments.verify_failed", "route.error"]);
    for (const event of errors) {
      expect(event.app).toEqual({ name: "Burgonomics", version: "1.4.2", env: "production" });
    }
  });

  it("clamps invalid synthetic metadata through the real logger, not just the helper", async () => {
    installConsoleSpies();
    const logger = await importRealLogger({
      appConfig: {
        env: "SYNTHETIC_injected_environment",
        appVersion: "9.9.9-SYNTHETIC-injected-build-metadata-$SECRET",
        appName: "SyntheticFakeCustomerApp",
      },
      isDev: () => false,
    });

    logger.warn("push.webPushNoVapidKey");

    const [event] = parsed("warn");
    expect(event.app).toEqual({ name: "Burgonomics", version: "0.0.0", env: "unknown" });
    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain("SYNTHETIC_injected_environment");
    expect(serialised).not.toContain("SYNTHETIC-injected-build-metadata");
    expect(serialised).not.toContain("SyntheticFakeCustomerApp");
  });
});
