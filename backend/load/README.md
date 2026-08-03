# Load & Resilience Testing

Scripts for k6 and Artillery covering smoke, stress, spike, and soak profiles.

## Target thresholds (per env)

| SLI                            | Target (prod) |
| ------------------------------ | ------------- |
| Menu read p95                  | < 400 ms      |
| Menu read p99                  | < 800 ms      |
| Checkout quote p95             | < 800 ms      |
| Order create p95               | < 1200 ms     |
| Payment verify p95             | < 600 ms      |
| Webhook processing (async) p95 | < 2 s         |
| SSE connection open p95        | < 250 ms      |
| Error rate (5xx)               | < 0.1 %       |
| BullMQ job success rate        | > 99.5 %      |

## Running

```bash
# smoke (1 min)
k6 run -e BASE_URL=http://localhost:3000 backend/load/k6/smoke.js

# stress (~26 min)
k6 run -e BASE_URL=https://api.staging.burgonomics.com backend/load/k6/stress.js

# spike
k6 run backend/load/k6/spike.js

# soak (4 h) — run against staging only
k6 run backend/load/k6/soak.js

# artillery — realistic checkout mix
BASE_URL=https://api.staging.burgonomics.com TEST_JWT=... \
  artillery run backend/load/artillery/checkout.yml
```

## Chaos scenarios

Run these against staging to validate graceful degradation:

1. **Redis outage** — `docker compose stop redis`; expect menu reads to fall back to Postgres, writes to queue locally, SSE to degrade.
2. **PETPOOJA outage** — block `api.petpooja.com` via iptables; expect circuit breaker to open, orders to queue for retry, admins to receive alert.
3. **Razorpay 5xx storm** — use toxiproxy to inject 50 % 5xx; expect payment verification retries with exponential backoff, no double charges.
4. **Database failover** — force RDS failover; expect Prisma to reconnect within 30 s, in-flight queries retried by BullMQ.
5. **Worker pod kill** — kill BullMQ worker mid-job; expect job to be re-delivered after visibility timeout.

Document observed behaviour in the runbook after each drill.
