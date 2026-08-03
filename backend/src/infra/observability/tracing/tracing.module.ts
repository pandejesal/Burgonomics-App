import { Module } from '@nestjs/common';

/**
 * Placeholder module. OpenTelemetry is bootstrapped imperatively in
 * `main.ts` before Nest starts (`bootstrapTracing`) so auto-
 * instrumentation can patch modules on import.
 */
@Module({})
export class TracingModule {}
