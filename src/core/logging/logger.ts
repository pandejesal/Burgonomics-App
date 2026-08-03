/**
 * Centralised structured logger.
 *
 * Feature and infrastructure code MUST use this instead of `console.*`
 * directly. The default sink writes to the browser console in
 * development and no-ops in production; future prompts will register
 * additional sinks (Sentry, Crashlytics, backend log ingest) via
 * `logger.addSink(...)` without any changes to call sites.
 */
import { appConfig, isDev } from "@/core/config";

export type LogLevel = "debug" | "info" | "warn" | "error" | "critical";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  critical: 50,
};

export interface LogEvent {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: unknown;
  timestamp: string;
  app: { name: string; version: string; env: string };
}

export interface LogSink {
  name: string;
  write(event: LogEvent): void;
}

const consoleSink: LogSink = {
  name: "console",
  write(event) {
    if (typeof console === "undefined") return;
    const payload = event.context ? [event.message, event.context] : [event.message];
    switch (event.level) {
      case "debug":
        console.debug(...payload);
        break;
      case "info":
        console.info(...payload);
        break;
      case "warn":
        console.warn(...payload);
        break;
      case "error":
      case "critical":
        if (event.error) console.error(...payload, event.error);
        else console.error(...payload);
        break;
    }
  },
};

class Logger {
  private sinks: LogSink[] = [];
  private minLevel: LogLevel = isDev() ? "debug" : "warn";

  constructor() {
    if (isDev()) this.sinks.push(consoleSink);
  }

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

  private emit(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: unknown,
  ) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return;
    const event: LogEvent = {
      level,
      message,
      context,
      error,
      timestamp: new Date().toISOString(),
      app: { name: appConfig.appName, version: appConfig.appVersion, env: appConfig.env },
    };
    for (const sink of this.sinks) {
      try {
        sink.write(event);
      } catch {
        /* sinks must never break the app */
      }
    }
  }

  debug(msg: string, ctx?: Record<string, unknown>) {
    this.emit("debug", msg, ctx);
  }
  info(msg: string, ctx?: Record<string, unknown>) {
    this.emit("info", msg, ctx);
  }
  warn(msg: string, ctx?: Record<string, unknown>) {
    this.emit("warn", msg, ctx);
  }
  error(msg: string, error?: unknown, ctx?: Record<string, unknown>) {
    this.emit("error", msg, ctx, error);
  }
  critical(msg: string, error?: unknown, ctx?: Record<string, unknown>) {
    this.emit("critical", msg, ctx, error);
  }
}

export const logger = new Logger();
