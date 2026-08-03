# Deployment Guide

## Targets

| Env        | Cluster        | Domain                      | DB              | Redis              |
| ---------- | -------------- | --------------------------- | --------------- | ------------------ |
| dev        | local Docker   | localhost:3000              | local Postgres  | local Redis        |
| staging    | AWS EKS `stg`  | api.staging.burgonomics.com | RDS `burg-stg`  | ElastiCache `stg`  |
| production | AWS EKS `prod` | api.burgonomics.com         | RDS `burg-prod` | ElastiCache `prod` |

## Image

Built by CI, pushed to `ghcr.io/<org>/burgonomics/backend:<version>`. Distroless-adjacent
alpine base, non-root user, dumb-init as PID 1, healthcheck on
`/health/liveness`. See `Dockerfile`.

## Secrets

Managed by AWS Secrets Manager, mounted via External Secrets Operator into
`Secret/backend-env`. Rotate quarterly, plus immediately on compromise:

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (rotate together, invalidates sessions)
- `PETPOOJA_APP_KEY`, `PETPOOJA_APP_SECRET`, `PETPOOJA_ACCESS_TOKEN`, `PETPOOJA_WEBHOOK_SECRET`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`
- `FIREBASE_PRIVATE_KEY`
- `DATABASE_URL`, `REDIS_PASSWORD`
- `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`

## Kubernetes manifest sketch

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: backend }
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  template:
    spec:
      terminationGracePeriodSeconds: 45
      containers:
        - name: backend
          image: ghcr.io/burgonomics/backend:1.0.0
          ports: [{ containerPort: 3000 }]
          envFrom: [{ secretRef: { name: backend-env } }]
          resources:
            requests: { cpu: 250m, memory: 512Mi }
            limits: { cpu: 1000m, memory: 1Gi }
          livenessProbe:
            httpGet: { path: /health/liveness, port: 3000 }
            initialDelaySeconds: 20
            periodSeconds: 15
            failureThreshold: 3
          readinessProbe:
            httpGet: { path: /health/readiness, port: 3000 }
            initialDelaySeconds: 10
            periodSeconds: 5
            failureThreshold: 3
          lifecycle:
            preStop:
              exec: { command: ['sh', '-c', 'sleep 15'] }
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: backend }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: backend }
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 65 } }
    - type: Resource
      resource: { name: memory, target: { type: Utilization, averageUtilization: 75 } }
```

Preserve `maxUnavailable: 0` and a `preStop` sleep — SSE connections and
in-flight BullMQ jobs need graceful drain before SIGTERM.

## Migrations

```bash
# Job runs BEFORE new pods are rolled
kubectl create job --from=cronjob/prisma-migrate-deploy migrate-$(date +%s)
```

- Additive-only per release (add columns/tables/indexes).
- Destructive changes ship one release later, after code stops referencing them.
- Long-running index builds must use `CREATE INDEX CONCURRENTLY` in raw SQL migrations.

## Rollback

1. Pin previous image tag in the Deployment.
2. If a migration is at fault, follow `DISASTER_RECOVERY.md § Migration rollback`.
3. Invalidate Redis menu cache after rollback to avoid stale JSON.

## Post-deploy checklist

- [ ] `/health` returns green
- [ ] p95 latency within SLO for 15 min
- [ ] Error rate < 0.1 %
- [ ] No DLQ growth
- [ ] Synthetic checkout succeeds in staging clone
