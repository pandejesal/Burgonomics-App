/**
 * Diagnostic-safety contract for the Customer logger (DIAGNOSTIC-CONTRACT.md).
 *
 * The gap this file had to prove: the Customer logger registered no default
 * sink outside development, so every `logger.warn(...)` / `logger.error(...)`
 * from a shipped bundle disappeared. Adding a sink is only safe if the value
 * handed to it cannot carry what a native or remote capture would love to
 * receive — tokens, uids, order ids, URLs, provider payloads, stacks, arbitrary
 * context.
 *
 * Therefore the assertions cover:
 * 1. warn/error/critical emit once the production severity threshold is in
 *    effect, and debug/info do not;
 * 2. every emitted value is exactly ONE bounded JSON string, redacted, with a
 *    source-owned event id or `app.log`;
 * 3. allowlisted scalars (code/type/status/attempt/retryable) only;
 * 4. hostile input (getters, proxies, toJSON, toString, cycles, BigInt) can
 *    neither leak nor throw;
 * 5. a throwing console or a throwing sink cannot break the caller, and sinks
 *    registered after a throwing one still receive the event;
 * 6. sink registration/removal semantics are preserved.
 *
 * Scope limit — read before adding cases here. `vitest.setup.ts` pins
 * `import.meta.env.DEV = true` for every test file, so a logger constructed in
 * this suite always takes the development default level. The cases below reach
 * the production threshold by CALLING `setMinLevel("warn")` — the exact level
 * `isDev() ? "debug" : "warn"` selects in a release bundle — and clamp identity
 * by calling `appIdentity()` directly. That is threshold and helper behaviour,
 * NOT proof that a freshly constructed logger emits in a release build.
 * The production-initialisation proof lives in `logger.production.test.ts`,
 * which mocks only the `@/core/config` boundary (`isDev: () => false`) and calls
 * neither `setMinLevel` nor `addSink`.
 *
 * All fixtures are synthetic. No credential, token, identifier, phone number,
 * email or provider response used below is real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/core/config";
import { appIdentity, GENERIC_EVENT_ID, sanitizeEvent, toDiagnosticLine } from "./safeLog";
import type { LogEvent } from "./logger";

type ConsoleLevel = "debug" | "info" | "warn" | "error";

/** Synthetic secret/PII markers that must never appear in output. */
const SENSITIVE = {
  token: "SYNTHETIC_FCM_TOKEN_do_not_log",
  uid: "SYNTHETIC_UID_0001",
  email: "synthetic.person@example.invalid",
  phone: "+910000000000",
  orderId: "ORDER_SYNTHETIC_0001",
  url: "https://provider.invalid/v1/orders?key=SYNTHETIC_KEY",
  message: "Synthetic provider said: card declined for synthetic.person@example.invalid",
  stack: "Error: synthetic\n    at syntheticFunction (file.ts:1:1)",
} as const;

/** The identity the logger resolves from validated config at module load. */
const IDENTITY = appIdentity(appConfig.env, appConfig.appVersion);

let consoleCalls: Array<{ level: ConsoleLevel; args: unknown[] }> = [];
const spies: Partial<Record<ConsoleLevel, ReturnType<typeof vi.spyOn>>> = {};

function installConsoleSpies(): void {
  consoleCalls = [];
  for (const level of ["debug", "info", "warn", "error"] as const) {
    spies[level] = vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      consoleCalls.push({ level, args });
    });
  }
}

function callsFor(level: ConsoleLevel) {
  return consoleCalls.filter((call) => call.level === level);
}

/** Parse the single argument of every captured call of one console level. */
function parsed(level: ConsoleLevel): Array<Record<string, unknown>> {
  return callsFor(level).map((call) => {
    expect(call.args).toHaveLength(1);
    expect(typeof call.args[0]).toBe("string");
    return JSON.parse(call.args[0] as string) as Record<string, unknown>;
  });
}

/** Fresh module instance per case: no leaked sinks or level overrides. */
async function loadLogger() {
  vi.resetModules();
  const { logger } = await import("./logger");
  return logger;
}

beforeEach(() => {
  installConsoleSpies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("production visibility — the missing default sink", () => {
  it("emits a warning with the production threshold and no sink registered", async () => {
    const logger = await loadLogger();
    logger.setMinLevel("warn");

    logger.warn("push.webPushNoVapidKey");

    const calls = callsFor("warn");
    expect(calls).toHaveLength(1);
    const [event] = parsed("warn");
    expect(event.level).toBe("warn");
    expect(event.event).toBe("push.webPushNoVapidKey");
    expect(typeof event.timestamp).toBe("string");
  });

  it("emits error and critical with the production threshold", async () => {
    const logger = await loadLogger();
    logger.setMinLevel("warn");

    logger.error("payments.create_order_failed", new Error("synthetic"));
    logger.critical("GlobalErrorBoundary.caught", new Error("synthetic"));

    const events = parsed("error");
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.level)).toEqual(["error", "critical"]);
    expect(events.map((event) => event.event)).toEqual([
      "payments.create_order_failed",
      "GlobalErrorBoundary.caught",
    ]);
  });

  it("keeps debug and info below the warn threshold but emits them at debug", async () => {
    const logger = await loadLogger();

    logger.setMinLevel("warn");
    logger.debug("razorpay.zero_charge_complete");
    logger.info("push.registered");
    expect(callsFor("debug")).toHaveLength(0);
    expect(callsFor("info")).toHaveLength(0);

    logger.setMinLevel("debug");
    logger.debug("razorpay.zero_charge_complete");
    logger.info("push.registered");
    expect(parsed("debug")[0]).toMatchObject({
      level: "debug",
      event: "razorpay.zero_charge_complete",
    });
    expect(parsed("info")[0]).toMatchObject({ level: "info", event: "push.registered" });
  });

  it("ties its default level to isDev(), the same expression a release build uses", async () => {
    // `vitest.setup.ts` replaces the whole `import.meta.env` object with a
    // pinned DEV=true snapshot, so this suite can never boot a true release
    // environment. What is verifiable here is the contract itself: a fresh
    // logger's default threshold matches `isDev()`, which is "debug" in a dev
    // build and "warn" in a release one. The release side is then exercised by
    // setting exactly that level in the cases above.
    const { isDev } = await import("@/core/config");
    const logger = await loadLogger();
    const expectedDefault: "debug" | "warn" = isDev() ? "debug" : "warn";

    logger.debug("razorpay.zero_charge_complete");
    logger.warn("push.webPushNoVapidKey");

    expect(callsFor("debug")).toHaveLength(expectedDefault === "debug" ? 1 : 0);
    // warn is at or above both possible defaults, so it always emits.
    expect(callsFor("warn")).toHaveLength(1);
  });
});

describe("redaction — one bounded JSON argument, allowlisted fields only", () => {
  it("preserves a source-owned event id and an allowlisted Firebase code", async () => {
    const logger = await loadLogger();
    const error = Object.assign(new Error(SENSITIVE.message), {
      code: "auth/too-many-requests",
      stack: SENSITIVE.stack,
    });

    logger.error("auth.otp_verify_failed", error);

    const [event] = parsed("error");
    expect(event.event).toBe("auth.otp_verify_failed");
    expect(event.code).toBe("auth/too-many-requests");
    expect(event.type).toBe("Error");
    // Free text and stack never travel.
    expect(JSON.stringify(event)).not.toContain("synthetic.person@example.invalid");
    expect(JSON.stringify(event)).not.toContain("syntheticFunction");
  });

  it("collapses unknown, dynamic and template messages to the generic identity", async () => {
    const logger = await loadLogger();

    logger.warn("Something provider-specific happened");
    logger.warn(`[analytics] razorpay_click`);
    logger.warn(`[PorterLogistics] quote unavailable for ${SENSITIVE.orderId}`);
    logger.warn(SENSITIVE.message);

    const events = parsed("warn");
    expect(events).toHaveLength(4);
    for (const event of events) {
      expect(event.event).toBe(GENERIC_EVENT_ID);
      const serialised = JSON.stringify(event);
      expect(serialised).not.toContain("provider-specific");
      expect(serialised).not.toContain("razorpay_click");
      expect(serialised).not.toContain("PorterLogistics");
      expect(serialised).not.toContain(SENSITIVE.orderId);
      expect(serialised).not.toContain("synthetic.person@example.invalid");
    }
  });

  it("omits nested secrets, PII, identifiers, headers and URLs from error and context", async () => {
    const logger = await loadLogger();
    const error = {
      name: "Error",
      code: "unavailable",
      message: SENSITIVE.message,
      stack: SENSITIVE.stack,
      config: { headers: { authorization: `Bearer ${SENSITIVE.token}` }, url: SENSITIVE.url },
      request: { token: SENSITIVE.token },
      response: { data: { phone: SENSITIVE.phone } },
    };
    const context = {
      uid: SENSITIVE.uid,
      orderId: SENSITIVE.orderId,
      email: SENSITIVE.email,
      phone: SENSITIVE.phone,
      url: SENSITIVE.url,
      message: SENSITIVE.message,
      headers: { authorization: `Bearer ${SENSITIVE.token}` },
      nested: { deep: { token: SENSITIVE.token } },
      status: 503,
      attempt: 3,
      retryable: true,
    };

    logger.error("ordersService.firestore_sync_failed", error, context);

    const [event] = parsed("error");
    const serialised = JSON.stringify(event);
    for (const secret of Object.values(SENSITIVE)) {
      expect(serialised).not.toContain(secret);
    }
    expect(event).toEqual({
      v: 1,
      level: "error",
      event: "ordersService.firestore_sync_failed",
      timestamp: expect.any(String),
      app: IDENTITY,
      code: "unavailable",
      type: "Error",
      status: 503,
      attempt: 3,
      retryable: true,
    });
  });

  it("rejects out-of-range or non-standard codes and scalars", async () => {
    const logger = await loadLogger();

    logger.warn("payment.totals_failed", {
      status: 99,
      attempt: 1000,
      code: "SYNTHETIC_CUSTOM_CODE",
      type: "ProviderAuthError",
      retryable: "yes",
    });
    logger.warn("payment.totals_failed", {
      status: 600,
      attempt: -1,
      code: "not a known code",
      type: "SyntheticError",
    });

    for (const event of parsed("warn")) {
      expect(event.event).toBe("payment.totals_failed");
      for (const field of ["status", "attempt", "code", "type", "retryable"]) {
        expect(event).not.toHaveProperty(field);
      }
    }
  });

  it("never forwards an arbitrary app name, environment or non-semver version", () => {
    const injected = appIdentity(
      "SYNTHETIC_injected_environment",
      "9.9.9-SYNTHETIC-injected-build-metadata-$SECRET",
    );
    expect(injected).toEqual({ name: "Burgonomics", version: "0.0.0", env: "unknown" });

    const longVersion = appIdentity("production", "1".repeat(200));
    expect(longVersion.version).toBe("0.0.0");

    const accepted = appIdentity("production", "2.14.3-rc.1+build.9");
    expect(accepted).toEqual({
      name: "Burgonomics",
      version: "2.14.3-rc.1+build.9",
      env: "production",
    });

    const unknownEnv = appIdentity(undefined, 42);
    expect(unknownEnv).toEqual({ name: "Burgonomics", version: "0.0.0", env: "unknown" });
  });

  it("bounds the single argument far under 2 KiB even with oversized input", async () => {
    const logger = await loadLogger();
    const huge = "S".repeat(64 * 1024);

    logger.error(
      "GlobalErrorBoundary.caught",
      { code: "internal", message: huge, stack: huge },
      { message: huge, url: huge },
    );

    const [call] = callsFor("error");
    expect(call.args).toHaveLength(1);
    expect((call.args[0] as string).length).toBeLessThan(2048);
    expect(call.args[0] as string).not.toContain(huge.slice(0, 128));
  });

  it("does not let an extra event field widen the console argument", () => {
    const base = sanitizeEvent("warn", "push.webPushNoVapidKey", IDENTITY);
    const widened = { ...base, message: SENSITIVE.message, extra: SENSITIVE.token };

    const line = toDiagnosticLine(widened);

    expect(line).not.toContain(SENSITIVE.message);
    expect(line).not.toContain(SENSITIVE.token);
    expect(Object.keys(JSON.parse(line) as object)).toEqual([
      "v",
      "level",
      "event",
      "timestamp",
      "app",
    ]);
  });
});

describe("custom sinks receive sanitised events", () => {
  it("forwards an allowlisted identity and no raw message, stack or context", async () => {
    const logger = await loadLogger();
    const events: LogEvent[] = [];
    logger.addSink({
      name: "test-sanitised",
      write(event) {
        events.push(event);
      },
    });

    try {
      logger.error(
        "auth.session_persist_failed",
        Object.assign(new Error(SENSITIVE.message), {
          code: "unavailable",
          stack: SENSITIVE.stack,
        }),
        { uid: SENSITIVE.uid, token: SENSITIVE.token },
      );

      expect(events).toHaveLength(1);
      const serialised = JSON.stringify(events);
      for (const secret of Object.values(SENSITIVE)) {
        expect(serialised).not.toContain(secret);
      }
      expect(events[0]).toMatchObject({
        level: "error",
        message: "auth.session_persist_failed",
        event: "auth.session_persist_failed",
        code: "unavailable",
        type: "Error",
        timestamp: expect.any(String),
        app: IDENTITY,
      });
    } finally {
      logger.removeSink("test-sanitised");
    }
  });

  it("gives an unknown message the generic identity in the sink too", async () => {
    const logger = await loadLogger();
    const events: LogEvent[] = [];
    logger.addSink({
      name: "test-generic",
      write(event) {
        events.push(event);
      },
    });

    try {
      logger.warn(`[payment] gateway onFailure: ${SENSITIVE.message}`, {
        description: SENSITIVE.message,
      });
      expect(events).toHaveLength(1);
      expect(events[0].message).toBe(GENERIC_EVENT_ID);
      expect(JSON.stringify(events[0])).not.toContain("gateway onFailure");
    } finally {
      logger.removeSink("test-generic");
    }
  });

  it("stops delivering after removeSink", async () => {
    const logger = await loadLogger();
    const events: LogEvent[] = [];
    logger.addSink({
      name: "test-removable",
      write(event) {
        events.push(event);
      },
    });

    logger.warn("push.webPushNoVapidKey");
    logger.removeSink("test-removable");
    logger.warn("push.webPushNoVapidKey");

    expect(events).toHaveLength(1);
  });

  /**
   * Regression: the logger used to hand every sink the SAME mutable `app`
   * object it had validated at module load. A sink that wrote to
   * `event.app.version` contaminated every later console event, bypassing the
   * identity validation entirely. Each delivery must therefore be isolated.
   */
  it("keeps future console events validated after a sink mutates its app metadata", async () => {
    const logger = await loadLogger();
    logger.addSink({
      name: "test-mutating-app",
      write(event) {
        event.app.name = "SYNTHETIC_MUTATED_APP";
        event.app.version = SENSITIVE.token;
        event.app.env = SENSITIVE.uid;
      },
    });

    try {
      logger.warn("push.webPushNoVapidKey");
      logger.warn("push.webPushNoVapidKey");

      const events = parsed("warn");
      expect(events).toHaveLength(2);
      for (const event of events) {
        expect(event.app).toEqual(IDENTITY);
        const serialised = JSON.stringify(event);
        expect(serialised).not.toContain("SYNTHETIC_MUTATED_APP");
        expect(serialised).not.toContain(SENSITIVE.token);
        expect(serialised).not.toContain(SENSITIVE.uid);
      }
    } finally {
      logger.removeSink("test-mutating-app");
    }
  });

  it("does not let a mutating sink rewrite the event a later sink receives", async () => {
    const logger = await loadLogger();
    const later: LogEvent[] = [];
    logger.addSink({
      name: "test-mutator-first",
      write(event) {
        event.app.version = SENSITIVE.token;
        event.event = "SYNTHETIC_MUTATED_EVENT";
        event.level = "debug";
      },
    });
    logger.addSink({
      name: "test-observer-after-mutator",
      write(event) {
        later.push(event);
      },
    });

    try {
      logger.warn("push.webPushNoVapidKey");

      expect(later).toHaveLength(1);
      expect(later[0]).toMatchObject({
        level: "warn",
        event: "push.webPushNoVapidKey",
        message: "push.webPushNoVapidKey",
        app: IDENTITY,
      });
      expect(JSON.stringify(later[0])).not.toContain(SENSITIVE.token);
      expect(JSON.stringify(later[0])).not.toContain("SYNTHETIC_MUTATED_EVENT");
    } finally {
      logger.removeSink("test-mutator-first");
      logger.removeSink("test-observer-after-mutator");
    }
  });

  it("keeps later sinks working when a sink both mutates and throws", async () => {
    const logger = await loadLogger();
    const later: LogEvent[] = [];
    logger.addSink({
      name: "test-mutate-and-throw",
      write(event) {
        event.app.env = "SYNTHETIC_MUTATED_ENV";
        throw new Error("sink mutated then exploded");
      },
    });
    logger.addSink({
      name: "test-after-mutating-thrower",
      write(event) {
        later.push(event);
      },
    });

    try {
      expect(() => logger.warn("push.webPushNoVapidKey")).not.toThrow();

      expect(later).toHaveLength(1);
      expect(later[0].app).toEqual(IDENTITY);
      expect(JSON.stringify(later[0])).not.toContain("SYNTHETIC_MUTATED_ENV");
    } finally {
      logger.removeSink("test-mutate-and-throw");
      logger.removeSink("test-after-mutating-thrower");
    }
  });
});

describe("hostile input and failing sinks never break the caller", () => {
  it("does not invoke throwing getters, toJSON or toString", async () => {
    const logger = await loadLogger();
    const toJsonSpy = vi.fn(() => {
      throw new Error("toJSON must not run");
    });
    const toStringSpy = vi.fn(() => {
      throw new Error("toString must not run");
    });
    const hostile = {
      code: "unavailable",
      get message(): string {
        throw new Error("getter must not run");
      },
      get token(): string {
        throw new Error("getter must not run");
      },
      toJSON: toJsonSpy,
      toString: toStringSpy,
    };

    expect(() => logger.warn("secureStorage.nativeWriteFailedTokenKey", hostile)).not.toThrow();

    const [event] = parsed("warn");
    expect(event.event).toBe("secureStorage.nativeWriteFailedTokenKey");
    expect(event.code).toBe("unavailable");
    expect(toJsonSpy).not.toHaveBeenCalled();
    expect(toStringSpy).not.toHaveBeenCalled();
  });

  it("survives a proxy whose traps throw", async () => {
    const logger = await loadLogger();
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("trap: get");
        },
        getOwnPropertyDescriptor() {
          throw new Error("trap: getOwnPropertyDescriptor");
        },
        getPrototypeOf() {
          throw new Error("trap: getPrototypeOf");
        },
        ownKeys() {
          throw new Error("trap: ownKeys");
        },
      },
    );

    expect(() => logger.error("GlobalErrorBoundary.caught", hostile, hostile)).not.toThrow();

    const [event] = parsed("error");
    expect(event.event).toBe("GlobalErrorBoundary.caught");
    expect(event.code).toBeUndefined();
  });

  it("survives cyclic and BigInt payloads without recursive serialisation", async () => {
    const logger = await loadLogger();
    const cyclic: Record<string, unknown> = { code: "internal" };
    cyclic.self = cyclic;
    cyclic.token = SENSITIVE.token;

    expect(() => logger.warn("cart.revalidate_failed", { cyclic, big: 10n })).not.toThrow();

    const [event] = parsed("warn");
    const serialised = JSON.stringify(event);
    expect(serialised).not.toContain("[object Object]");
    expect(serialised).not.toContain(SENSITIVE.token);
    expect(() => JSON.parse(serialised)).not.toThrow();
  });

  it("never propagates a throwing console", async () => {
    const logger = await loadLogger();
    spies.warn?.mockImplementation(() => {
      throw new Error("console.warn exploded");
    });
    spies.error?.mockImplementation(() => {
      throw new Error("console.error exploded");
    });

    expect(() => logger.warn("push.webPushNoVapidKey")).not.toThrow();
    expect(() => logger.error("payments.verify_failed", new Error("synthetic"))).not.toThrow();
    expect(() => logger.critical("route.error", new Error("synthetic"))).not.toThrow();
    // Each call reached its (throwing) sink, so the guards really ran.
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(2);
  });

  it("still delivers to later sinks when an earlier sink throws", async () => {
    const logger = await loadLogger();
    const delivered: LogEvent[] = [];
    logger.addSink({
      name: "test-throwing",
      write() {
        throw new Error("sink exploded");
      },
    });
    logger.addSink({
      name: "test-after-throwing",
      write(event) {
        delivered.push(event);
      },
    });

    try {
      expect(() => logger.warn("push.webPushNoVapidKey")).not.toThrow();
      expect(delivered).toHaveLength(1);
      expect(delivered[0].event).toBe("push.webPushNoVapidKey");
    } finally {
      logger.removeSink("test-throwing");
      logger.removeSink("test-after-throwing");
    }
  });

  it("accepts a raw Error as the warn context and keeps only its code/type", async () => {
    const logger = await loadLogger();
    const nativeFailure = Object.assign(new Error(SENSITIVE.message), {
      code: "UNIMPLEMENTED",
      stack: SENSITIVE.stack,
    });

    expect(() => logger.warn("location.native_error", nativeFailure)).not.toThrow();

    const [event] = parsed("warn");
    expect(event).toEqual({
      v: 1,
      level: "warn",
      event: "location.native_error",
      timestamp: expect.any(String),
      app: IDENTITY,
      code: "UNIMPLEMENTED",
      type: "Error",
    });
    expect(JSON.stringify(event)).not.toContain("Synthetic provider said");
  });
});
