# Architecture Overview

## Style

Modular monolith following DDD-lite:

```
src/
├── common/       cross-cutting: guards, filters, interceptors, DTOs, errors
├── config/       Zod-validated env + namespaced ConfigService providers
├── infra/        prisma, redis, cache, queue, events, storage, observability, security
└── modules/      bounded contexts (auth, catalog, commerce, payments, petpooja, …)
```

Every module owns: `controllers/`, `services/`, `repositories/{interfaces,prisma}`,
`entities/`, `dto/`, `events/`, `mappers/`, `validators/`, `specifications/`.

## Rules (enforced by review)

1. **Repository Pattern** — no service touches Prisma directly. Interfaces
   live under `repositories/interfaces/*`; Prisma classes bind via DI tokens.
2. **DTO isolation** — external DTOs (PETPOOJA, Razorpay) never leak past the
   integration module's mapper.
3. **Event-driven cross-module communication** — modules communicate via
   `EventEmitter2` on the domain event bus, never by importing each other's
   services.
4. **Config via ConfigService** — no `process.env` reads outside `config/`.
5. **Security-definer boundaries** — auth guards, RBAC guards, and webhook
   signature guards are the only paths that mutate the request `user` /
   `principal` context.

## Request lifecycle

```
Client ──► Helmet ──► CORS ──► CorrelationIdMiddleware ──► RequestLogger
       ──► ValidationPipe ──► JwtAuthGuard ──► PermissionsGuard
       ──► Controller ──► Service ──► Repository ──► Prisma ──► Postgres
                                              │
                                              └► Cache / Queue / EventBus
```

Every response is wrapped by `TransformInterceptor`; failures pass through
`AllExceptionsFilter` which maps to RFC-7807-ish problem responses and emits
`error` + `latency` metrics tagged with `route`, `method`, `status`.

## External integrations

| Provider | Direction | Transport | Security                                | Failure mode                                  |
| -------- | --------- | --------- | --------------------------------------- | --------------------------------------------- |
| PETPOOJA | out+in    | HTTPS     | HMAC (in), token (out), circuit breaker | Queue-and-retry; breaker opens on 5xx         |
| Razorpay | out+in    | HTTPS     | HMAC-SHA256 (in), Basic (out)           | Idempotent verify with Redis distributed lock |
| Firebase | out       | HTTPS     | Service-account JWT                     | Retry with backoff; invalid-token cleanup     |

## Observability

- **Logs**: pino JSON with correlation IDs, redacted secrets.
- **Metrics**: Prometheus `/metrics`, RED per route + custom business counters (`orders_created_total`, `payments_captured_total`, …).
- **Traces**: OpenTelemetry, sampled 10 % in prod, 100 % in staging; Jaeger backend.
- **Health**: Terminus with DB, Redis, PETPOOJA, Razorpay, Firebase indicators.

## Scalability model

- Stateless pods behind an L7 load balancer.
- Sticky sessions NOT required — SSE fan-out uses Redis pub/sub, so any pod can serve any client.
- BullMQ workers can be scaled independently from API pods via a separate Deployment on the same image with `WORKER_MODE=true`.
- Postgres pool sized per pod; use PgBouncer transaction pooling for > 20 pods.
