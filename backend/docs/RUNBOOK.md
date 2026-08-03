# Burgonomics Backend — Operational Runbook

On-call reference for the Burgonomics BFF. Read the top of each section during
an incident; the linked dashboards and queries assume the standard Grafana
folder `Burgonomics / Backend`.

## 1. Service overview

- **Runtime**: NestJS 10 on Node 20, single container, stateless.
- **Datastores**: PostgreSQL 15 (primary), Redis 7 (cache, pub/sub, BullMQ).
- **External**: PETPOOJA (menu + order push), Razorpay (payments), Firebase FCM (push).
- **Entrypoints**: `/api/v1/*` REST, `/api/v1/realtime/*` SSE, `/api/v1/webhooks/*` external callbacks, `/metrics` Prometheus, `/health/*` probes.

## 2. Health probes

| Probe       | Path                    | SLO       |
| ----------- | ----------------------- | --------- |
| Liveness    | `GET /health/liveness`  | < 100 ms  |
| Readiness   | `GET /health/readiness` | < 300 ms  |
| Full health | `GET /health`           | on-demand |

Liveness must NEVER depend on downstream systems — only process health.
Readiness checks Postgres + Redis; failing readiness pulls the pod out of the
load balancer without restarting it.

## 3. Alert triage

### 3.1 `HighErrorRate` (5xx > 1 % for 5 min)

1. Check Grafana `Backend / Errors by route`.
2. `kubectl logs -l app=backend --tail=200 | grep '"level":50'`.
3. If concentrated on one route, disable via feature flag (`system-config` module).
4. Escalate if error is in payment or order paths — those are revenue-critical.

### 3.2 `PetpoojaCircuitOpen`

1. Confirm PETPOOJA status page.
2. Check `petpooja_http_requests_total{status="5xx"}`.
3. Orders queue automatically; verify `bullmq_jobs_waiting{queue="petpooja.save-order"}` growing but not stuck.
4. When PETPOOJA recovers, breaker half-opens on its own — no action.

### 3.3 `RazorpayWebhookLag` (queue depth > 500)

1. Inspect DLQ: `bullmq_jobs_failed{queue="payments.webhook.process"}`.
2. Replay via admin: `POST /api/v1/admin/queues/payments.webhook.process/replay`.
3. Check Razorpay dashboard for signing-secret rotation.

### 3.4 `RedisDown`

1. Menu reads degrade to Postgres, cart writes fail-fast, SSE fan-out stops.
2. Scale up managed Redis or fail over.
3. After recovery, warm menu cache: `POST /api/v1/admin/cache/menu/warm`.

### 3.5 `DatabaseConnectionsExhausted`

1. Inspect `pg_stat_activity` for long-running queries.
2. Bounce the offending pod; Prisma pool defaults to 10/instance.
3. If chronic, raise pool size via `DATABASE_URL?connection_limit=20` and scale RDS.

## 4. Deployments

- **Blue/green** via ECS/EKS.
- Run `prisma migrate deploy` in a one-shot job BEFORE rolling app pods.
- Migrations must be additive (expand → migrate → contract).
- Roll back by pinning the previous image tag; do not roll back migrations without a written recovery plan (see `DISASTER_RECOVERY.md`).

## 5. Common operations

```bash
# Follow live logs
kubectl logs -f -l app=backend --max-log-requests=6

# Trigger PETPOOJA menu resync for a store
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
  https://api.burgonomics.com/api/v1/admin/petpooja/sync/menu \
  -d '{"storeId":"STORE_ID"}'

# Pause a queue (drain in-flight only)
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
  https://api.burgonomics.com/api/v1/admin/queues/notifications.send/pause

# Force refresh menu cache
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
  https://api.burgonomics.com/api/v1/admin/cache/menu/invalidate
```

## 6. Escalation

| Severity | First responder | Escalate after    |
| -------- | --------------- | ----------------- |
| SEV-1    | Primary on-call | 15 min            |
| SEV-2    | Primary on-call | 30 min            |
| SEV-3    | Team channel    | Next business day |

Payment integrity issues are always SEV-1. Page the payments lead directly.
