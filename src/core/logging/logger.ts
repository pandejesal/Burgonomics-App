/**
 * Centralised structured logger.
 *
 * Feature and infrastructure code MUST use this instead of `console.*`
 * directly. Every emitted record is built by `safeLog.ts`, so a log call
 * produces exactly ONE bounded JSON string — never a raw Error, context
 * object, provider payload or free-text message. That matters because the
 * default sink writes to a console that native text capture and any future
 * remote sink both read.
 *
 * What is guaranteed:
 * - `warn`, `error` and `critical` always emit, in production too. Before this
 *   module had a production sink the whole severity class was silently lost in
 *   shipped builds.
 * - `debug` and `info` stay development-only unless a caller lowers
 *   `setMinLevel`, preserving the existing severity policy.
 * - Identity comes from the source-owned event IDs allowlisted in `safeLog.ts`;
 *   an unknown or dynamically built message reports as `app.log`.
 * - Custom sinks receive the same sanitised event, so registering a sink cannot
 *   reintroduce raw payloads. Sink failures are isolated per sink.
 *
 * Coverage limit: only code that calls this logger is shaped this way. Direct
 * `console.*` call sites elsewhere in the app are not covered by this module.
 */
import { appConfig, isDev } from "@/core/config";
import {
  appIdentity,
  cloneEvent,
  sanitizeEvent,
  toDiagnosticLine,
  type AppIdentity,
  type LogLevel,
  type SanitizedEvent,
} from "./safeLog";

export type { LogLevel };

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  critical: 50,
};

/**
 * The sanitised record handed to every sink.
 *
 * Payload-schema change, stated precisely: `LogEvent` no longer carries the
 * caller's raw `context`/`error`. What it carries is the validated identity in
 * `event`/`message` plus allowlisted top-level scalars (`code`, `type`,
 * `status`, `attempt`, `retryable`) and the validated `app`. A sink that used
 * to read `context`/`error` would find nothing — that is the point, and it is
 * why no raw payload can leave through a sink. Each delivery is a defensive
 * copy, so a sink cannot rewrite what later sinks or later events see.
 */
export interface LogEvent extends SanitizedEvent {
  /** Sanitised identity: the allowlisted event ID or `app.log`. */
  message: string;
}

export interface LogSink {
  name: string;
  write(event: LogEvent): void;
}

type ConsoleMethod = "debug" | "info" | "warn" | "error";

const CONSOLE_METHOD: Record<LogLevel, ConsoleMethod> = {
  debug: "debug",
  info: "info",
  warn: "warn",
  error: "error",
  critical: "error",
};

/** Fixed, validated build identity. Never a raw configuration string. */
const IDENTITY: AppIdentity = appIdentity(appConfig.env, appConfig.appVersion);

/** The sink that makes production diagnostics visible at all. */
const consoleSink: LogSink = {
  name: "console",
  write(event) {
    try {
      if (typeof console === "undefined") return;
      const method = console[CONSOLE_METHOD[event.level]];
      if (typeof method === "function") method.call(console, toDiagnosticLine(event));
    } catch {
      // An instrumented/throwing console must never break the caller.
    }
  },
};

class Logger {
  private sinks: LogSink[] = [consoleSink];
  private minLevel: LogLevel = isDev() ? "debug" : "warn";

  addSink(sink: LogSink) {
    this.sinks.push(sink);
    return this;
  }
  removeSink(name: string) {
    this.sinks = this.sinks.filter((s) => s.name !== name);
  }
  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }

  private emit(level: LogLevel, message: string, error?: unknown, context?: unknown) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;

    let event: LogEvent;
    try {
      const sanitized = sanitizeEvent(level, message, IDENTITY, error, context);
      // `message` mirrors the resolved identity, never the caller's raw text.
      event = { ...sanitized, message: sanitized.event };
    } catch {
      // Diagnostics must never become an application failure.
      return;
    }

    for (const sink of this.sinks) {
      try {
        // Each sink receives its own defensive copy: a mutating sink cannot
        // rewrite the record a later sink gets, nor the shared identity.
        sink.write(cloneEvent(event));
      } catch {
        /* one sink must never stop the others or the caller */
      }
    }
  }

  debug(msg: string, ctx?: unknown) {
    this.emit("debug", msg, undefined, ctx);
  }
  info(msg: string, ctx?: unknown) {
    this.emit("info", msg, undefined, ctx);
  }
  warn(msg: string, ctx?: unknown) {
    this.emit("warn", msg, undefined, ctx);
  }
  error(msg: string, error?: unknown, ctx?: unknown) {
    this.emit("error", msg, error, ctx);
  }
  critical(msg: string, error?: unknown, ctx?: unknown) {
    this.emit("critical", msg, error, ctx);
  }
}

export const logger = new Logger();
