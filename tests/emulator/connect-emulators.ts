/**
 * EMULATOR TEST LANE — Firestore connector.
 *
 * Contract: `polish-plan-20261025/stages/02_firebase_firestore/output/local-emulator-browser-contract.md`.
 *
 * This module is imported by `tests/emulator/emulator-entry.tsx` (browser) and by
 * `tests/emulator/connect-emulators.test.ts` (Node/Vitest). It must therefore stay
 * safe to import without `window`, `document`, or a configured Firebase app:
 *
 *  - `firebase/firestore` is imported for `connectFirestoreEmulator` only. It does
 *    NOT initialize an app, so importing this file performs no network I/O.
 *  - `@/core/config/firebase` (which *does* initialize the app and would throw on
 *    missing env) is loaded lazily inside `realEmulatorDeps()` — after the target
 *    has already been validated. A bad target therefore rejects before any app
 *    or socket exists.
 *
 * This file is outside `src/**` on purpose: the release bundle must never be able
 * to import the emulator connector.
 */
import { connectFirestoreEmulator, type Firestore } from "firebase/firestore";

import {
  EMULATOR_FIRESTORE_PORT,
  EMULATOR_LANE_MARKER,
  EMULATOR_PROJECT_ID,
} from "./lane-constants";

export {
  EMULATOR_FIRESTORE_HOST,
  EMULATOR_FIRESTORE_PORT,
  EMULATOR_LABEL,
  EMULATOR_LANE_MARKER,
  EMULATOR_PROJECT_ID,
} from "./lane-constants";

const DEMO_PROJECT_PATTERN = /^demo-[a-z0-9][a-z0-9-]*$/;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);

export type EmulatorTargetRejection =
  | "project-missing"
  | "project-not-demo"
  | "project-not-lane-project"
  | "host-missing"
  | "host-not-loopback"
  | "port-missing"
  | "port-not-lane-port";

/** Thrown for every rejected target. Carries a stable reason for the tests/report. */
export class EmulatorTargetError extends Error {
  readonly rejection: EmulatorTargetRejection;
  readonly target: Readonly<Partial<EmulatorTarget>>;

  constructor(rejection: EmulatorTargetRejection, target: Readonly<Partial<EmulatorTarget>>) {
    super(`[emulator-lane] refused target (${rejection}): ${describeTarget(target)}`);
    this.name = "EmulatorTargetError";
    this.rejection = rejection;
    this.target = Object.freeze({ ...target });
  }
}

export interface EmulatorTarget {
  readonly projectId: string;
  readonly host: string;
  readonly port: number;
}

export interface EmulatorLaneInfo extends EmulatorTarget {
  readonly connectedAt: string;
  readonly lane: "guest-catalog-browser";
}

function describeTarget(target: Readonly<Partial<EmulatorTarget>>): string {
  const project = target.projectId ? target.projectId : "<missing project>";
  const host = target.host ? target.host : "<missing host>";
  const port = typeof target.port === "number" ? String(target.port) : "<missing port>";
  return `project=${project} host=${host} port=${port}`;
}

/**
 * Fail-closed target guard. Pure: no imports beyond `firebase/firestore`'s module
 * body, no I/O, no mutation.
 *
 * Rejects, in order: missing/non-demo/mismatched project, missing/non-loopback
 * host, missing/wrong port. `demo-*` alone is not enough — this lane owns exactly
 * one project so a typo cannot silently attach to a sibling demo database.
 */
export function assertEmulatorTarget(target: Readonly<Partial<EmulatorTarget>>): asserts target is EmulatorTarget {
  const { projectId, host, port } = target;
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new EmulatorTargetError("project-missing", target);
  }
  if (!DEMO_PROJECT_PATTERN.test(projectId)) {
    throw new EmulatorTargetError("project-not-demo", target);
  }
  if (projectId !== EMULATOR_PROJECT_ID) {
    throw new EmulatorTargetError("project-not-lane-project", target);
  }
  if (typeof host !== "string" || host.length === 0) {
    throw new EmulatorTargetError("host-missing", target);
  }
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new EmulatorTargetError("host-not-loopback", target);
  }
  if (typeof port !== "number" || !Number.isInteger(port)) {
    throw new EmulatorTargetError("port-missing", target);
  }
  if (port !== EMULATOR_FIRESTORE_PORT) {
    throw new EmulatorTargetError("port-not-lane-port", target);
  }
}

/** Dependency seam so the pure unit test can prove "validate before load/connect". */
export interface EmulatorConnectDeps {
  /** Resolves the app's singleton Firestore instance. Real impl imports `@/core/config/firebase`. */
  readonly loadDb: () => Promise<Firestore>;
  /** Injectable for the unit test only. Production path uses the real SDK function. */
  readonly connect?: (db: Firestore, host: string, port: number) => void;
}

/** Bound to the real app singletons. Imported lazily so a bad target never boots Firebase. */
export function realEmulatorDeps(): EmulatorConnectDeps {
  return {
    loadDb: async () => {
      const { db } = await import("@/core/config/firebase");
      return db;
    },
  };
}

function installLaneMarker(info: EmulatorLaneInfo): void {
  const root = globalThis as typeof globalThis & {
    window?: Window & Record<string, unknown>;
    document?: Document;
  };
  if (root.window) {
    root.window[EMULATOR_LANE_MARKER] = info;
  }
  if (root.document?.documentElement) {
    root.document.documentElement.dataset.emulatorLane = "true";
  }
}

/**
 * Validate first, then (and only then) load the app database and point it at the
 * emulator. Any throw propagates to `ConfigErrorScreen`; there is no silent
 * fallback to a production endpoint.
 */
export async function connectEmulator(
  target: Readonly<Partial<EmulatorTarget>>,
  deps: EmulatorConnectDeps,
): Promise<EmulatorLaneInfo> {
  assertEmulatorTarget(target);

  const db = await deps.loadDb();

  // Defence in depth: the env that configured the app must agree with the
  // validated target, otherwise we would attach an emulator to a different
  // project's client and read an empty/foreign database.
  const appProjectId = db.app?.options?.projectId;
  if (appProjectId !== target.projectId) {
    throw new Error(
      `[emulator-lane] app project ${String(appProjectId)} does not match validated target ${target.projectId}`,
    );
  }

  const connect = deps.connect ?? connectFirestoreEmulator;
  connect(db, target.host, target.port);

  const info: EmulatorLaneInfo = {
    projectId: target.projectId,
    host: target.host,
    port: target.port,
    connectedAt: new Date().toISOString(),
    lane: "guest-catalog-browser",
  };
  installLaneMarker(info);
  return info;
}
