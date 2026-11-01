/**
 * UNIT / MOCK-BOUNDARY TEST — not an E2E proof.
 *
 * This exercises the pure target guard in `connect-emulators.ts` and the
 * dependency seam around `connectEmulator`. The stub `loadDb`/`connect` here are
 * the mock boundary: they prove the guard runs BEFORE any app load or connect,
 * which is the "reject before network" guarantee. The real SDK path is covered by
 * `emulator-catalog.spec.ts` against a live emulator — this file proves nothing
 * about the emulator, rules, or UI.
 */
import type { Firestore } from "firebase/firestore";
import { describe, expect, it, vi } from "vitest";

import {
  EMULATOR_FIRESTORE_HOST,
  EMULATOR_FIRESTORE_PORT,
  EMULATOR_PROJECT_ID,
  EmulatorTargetError,
  assertEmulatorTarget,
  connectEmulator,
  type EmulatorConnectDeps,
  type EmulatorTarget,
} from "./connect-emulators";

const VALID_TARGET: EmulatorTarget = {
  projectId: EMULATOR_PROJECT_ID,
  host: EMULATOR_FIRESTORE_HOST,
  port: EMULATOR_FIRESTORE_PORT,
};

function fakeDb(projectId: string): Firestore {
  return { app: { options: { projectId } } } as unknown as Firestore;
}

function guardedDeps(projectId = EMULATOR_PROJECT_ID): {
  deps: EmulatorConnectDeps;
  loadDb: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
} {
  const loadDb = vi.fn(async () => fakeDb(projectId));
  const connect = vi.fn();
  return { deps: { loadDb, connect }, loadDb, connect };
}

function rejectionOf(target: Partial<EmulatorTarget>): string {
  try {
    assertEmulatorTarget(target);
  } catch (error) {
    if (error instanceof EmulatorTargetError) return error.rejection;
    throw error;
  }
  throw new Error(`expected ${JSON.stringify(target)} to be rejected`);
}

describe("assertEmulatorTarget", () => {
  it("accepts the fixed demo/loopback/8099 target", () => {
    expect(() => assertEmulatorTarget(VALID_TARGET)).not.toThrow();
    expect(() => assertEmulatorTarget({ ...VALID_TARGET, host: "::1" })).not.toThrow();
  });

  it("rejects a missing project id", () => {
    expect(rejectionOf({ ...VALID_TARGET, projectId: "" })).toBe("project-missing");
  });

  it("rejects a real (non-demo) project id", () => {
    expect(rejectionOf({ ...VALID_TARGET, projectId: "burgonomics-prod" })).toBe(
      "project-not-demo",
    );
    expect(rejectionOf({ ...VALID_TARGET, projectId: "demo" })).toBe("project-not-demo");
  });

  it("rejects a different demo project so the lane cannot attach to a sibling db", () => {
    expect(rejectionOf({ ...VALID_TARGET, projectId: "demo-someone-else" })).toBe(
      "project-not-lane-project",
    );
  });

  it("rejects every non-loopback host, including DNS names that resolve locally", () => {
    for (const host of ["localhost", "0.0.0.0", "10.0.0.5", "firestore.googleapis.com", ""]) {
      expect(rejectionOf({ ...VALID_TARGET, host })).toMatch(/^host-/);
    }
  });

  it("rejects the rules-suite port, the reserved auth port and non-numbers", () => {
    expect(rejectionOf({ ...VALID_TARGET, port: 8080 })).toBe("port-not-lane-port");
    expect(rejectionOf({ ...VALID_TARGET, port: 9098 })).toBe("port-not-lane-port");
    expect(rejectionOf({ ...VALID_TARGET, port: Number.NaN })).toBe("port-missing");
    expect(rejectionOf({ ...VALID_TARGET, port: "8099" as unknown as number })).toBe(
      "port-missing",
    );
  });
});

describe("connectEmulator (dependency seam)", () => {
  it("rejects a bad target BEFORE loading the app db or connecting", async () => {
    const { deps, loadDb, connect } = guardedDeps();

    await expect(
      connectEmulator({ projectId: "burgonomics-prod", host: "127.0.0.1", port: 8099 }, deps),
    ).rejects.toBeInstanceOf(EmulatorTargetError);

    expect(loadDb).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("rejects an unreachable-looking non-loopback host before any network attempt", async () => {
    const { deps, loadDb, connect } = guardedDeps();

    await expect(
      connectEmulator({ projectId: EMULATOR_PROJECT_ID, host: "firestore.googleapis.com", port: 8099 }, deps),
    ).rejects.toBeInstanceOf(EmulatorTargetError);

    expect(loadDb).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it("connects exactly once to loopback:8099 for the valid target", async () => {
    const { deps, loadDb, connect } = guardedDeps();

    const info = await connectEmulator(VALID_TARGET, deps);

    expect(loadDb).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(connect).toHaveBeenCalledWith(expect.anything(), "127.0.0.1", 8099);
    expect(info).toMatchObject({
      projectId: EMULATOR_PROJECT_ID,
      host: "127.0.0.1",
      port: 8099,
      lane: "guest-catalog-browser",
    });
  });

  it("refuses when the app's configured project disagrees with the target", async () => {
    const { deps, connect } = guardedDeps("burgonomics-prod");

    await expect(connectEmulator(VALID_TARGET, deps)).rejects.toThrow(
      /does not match validated target/,
    );
    expect(connect).not.toHaveBeenCalled();
  });
});
