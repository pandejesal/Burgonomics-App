# Disaster Recovery & Backup

## RTO / RPO

| Component      | RTO    | RPO                       |
| -------------- | ------ | ------------------------- |
| API            | 5 min  | n/a                       |
| PostgreSQL     | 30 min | 5 min                     |
| Redis (cache)  | 5 min  | best-effort (rebuildable) |
| Redis (BullMQ) | 15 min | 1 min                     |
| Object storage | 1 h    | 24 h                      |

## Backups

- **Postgres**: RDS automated snapshots daily, 30-day retention. PITR enabled with 5-minute granularity. Weekly logical dump (`pg_dump --format=custom`) copied to versioned S3 (`s3://burg-backups/pg/`) with 90-day retention.
- **Redis (BullMQ)**: AOF `everysec` on ElastiCache cluster. Snapshot daily to S3 for 14 days.
- **Object storage**: S3 versioning enabled on all buckets, cross-region replication to a DR region.
- **Config**: All infra is IaC (Terraform); the state bucket is versioned and cross-region replicated.

## Recovery procedures

### Total region loss

1. Fail over DNS to DR region (Route53 health-check routing policy).
2. Promote the read replica in the DR region to primary.
3. Restore Redis from latest snapshot in DR ElastiCache.
4. Deploy the last known-good image tag to the DR EKS cluster.
5. Reconcile in-flight PETPOOJA / Razorpay webhooks via the admin replay endpoint.

### Database corruption

1. Identify the point-in-time before corruption.
2. `aws rds restore-db-instance-to-point-in-time` into `burg-prod-restore`.
3. Validate the restore (row counts, latest orders).
4. Cut over via Route53 or pgbouncer connection string swap.
5. Post-mortem within 48 h.

### Migration rollback (destructive)

1. Stop deployments.
2. Restore Postgres to a snapshot immediately preceding the migration.
3. Pin app image to pre-migration tag.
4. Replay events from Redis outbox / BullMQ history covering the gap.

### BullMQ data loss

- Jobs enqueued but never persisted are recoverable from the domain outbox
  (`OutboxService`). Kick off the outbox drainer:
  `POST /api/v1/admin/outbox/drain`.

## Drill schedule

- Monthly: staging failover exercise (region A → region B).
- Quarterly: production PITR restore into an isolated account, validated, then torn down.
- Annually: full DR game-day covering payments, PETPOOJA, and notifications.

Log every drill in `docs/dr-drills/YYYY-MM-DD.md`.
