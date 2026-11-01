/**
 * EMULATOR TEST LANE — safe child-lifecycle helpers.
 *
 * Only the exact `ChildProcess` this lane spawned is ever signalled, and only
 * while it is still alive and its OS start-time token still matches the token
 * captured at spawn. This closes the PID-reuse window: `taskkill /T /F <pid>` is
 * never issued for an exited child whose PID may belong to an unrelated process.
 *
 * Nothing here enumerates or kills unknown node/java processes.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { decideKill } from "./lane-gates.mjs";

/** Benign env needed by the OS helper process only (no credential variables). */
function probeEnv() {
  const env = {};
  for (const key of ["SystemRoot", "windir", "PATH", "Path", "ComSpec", "COMSPEC"]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

/**
 * OS start-time identity for a PID, or null when it cannot be read.
 * Windows: process StartTime ticks. Linux: /proc/<pid>/stat field 22.
 * macOS/other: `ps -o lstart=`.
 */
export function readStartToken(pid) {
  if (!pid) return null;
  try {
    if (process.platform === "win32") {
      const probe = spawnSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `(Get-Process -Id ${Number(pid)} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`,
        ],
        { encoding: "utf8", timeout: 5_000, windowsHide: true, env: probeEnv() },
      );
      if (probe.status !== 0) return null;
      const token = (probe.stdout ?? "").trim();
      return token.length > 0 ? token : null;
    }

    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const tail = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      // After "comm) state", field 22 (starttime) is index 19.
      const token = tail[19];
      return token && token.length > 0 ? token : null;
    }

    const probe = spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 5_000,
      env: probeEnv(),
    });
    if (probe.status !== 0) return null;
    const token = (probe.stdout ?? "").trim();
    return token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

/** Retry briefly: the child may not be visible to the OS helper immediately. */
export async function captureStartToken(pid, deadlineMs = 1_200) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const token = readStartToken(pid);
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

/**
 * Kill the spawned child tree only when it is alive and identity-verified.
 * `hasExited()` must reflect the ChildProcess exit event (not a guess).
 */
export function killTracked({ pid, exitCode, hasExited, capturedToken }) {
  if (!pid) return { killed: false, reason: "missing-pid", mode: "none" };
  const effectiveExitCode = hasExited ? 0 : exitCode;
  const observedToken = readStartToken(pid);
  const decision = decideKill({ exitCode: effectiveExitCode, capturedToken, observedToken });
  if (!decision.kill) {
    return { killed: false, ...decision, pid, observedToken };
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      env: probeEnv(),
    });
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        return { killed: false, reason: "signal-failed", mode: decision.mode, pid };
      }
    }
  }
  return { killed: true, ...decision, pid, observedToken };
}
