# Burgonomics Backend

Production-grade NestJS Backend-for-Frontend (BFF) for the Burgonomics mobile
application. Sole gateway between the frontend and all external providers
(PETPOOJA, Razorpay, Firebase).

## Requirements

- Node.js **20 LTS**
- Docker & Docker Compose
- PostgreSQL **15**
- Redis **7**

## Getting started

```bash
cp .env.example .env
npm install
docker compose -f docker/docker-compose.dev.yml up -d
npm run prisma:migrate:dev
npm run start:dev
```

- API: http://localhost:3000/api/v1
- OpenAPI: http://localhost:3000/docs
- Prometheus: http://localhost:3000/metrics
- Health: http://localhost:3000/health

## Documentation

| Doc                                                      | Purpose                             |
| -------------------------------------------------------- | ----------------------------------- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)           | System design & module rules        |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)               | Deploying to staging & prod         |
| [`docs/RUNBOOK.md`](docs/RUNBOOK.md)                     | On-call operational reference       |
| [`docs/DISASTER_RECOVERY.md`](docs/DISASTER_RECOVERY.md) | RTO/RPO & recovery procedures       |
| [`docs/PRODUCTION_AUDIT.md`](docs/PRODUCTION_AUDIT.md)   | Phase-9 hardening audit             |
| [`SECURITY.md`](SECURITY.md)                             | Vulnerability disclosure & controls |
| [`load/README.md`](load/README.md)                       | Load & chaos testing                |

## Scripts

```bash
npm run start:dev       # nodemon w/ ts-node
npm run build           # nest build → dist/
npm run start:prod      # node dist/main.js
npm run test            # jest unit + integration
npm run lint            # eslint
npm run prisma:migrate:dev
npm run prisma:studio
```

## CI/CD

GitHub Actions pipelines under `.github/workflows/`:

- `ci.yml` — lint, typecheck, test (Postgres + Redis services), build,
  npm-audit, Trivy fs, CodeQL, Docker build + Trivy image + SBOM.
- `release.yml` — on `v*.*.*` tag: build, push to GHCR with provenance/SBOM,
  create GitHub Release.

## Load & chaos

See [`load/`](load/) for k6 + Artillery profiles (smoke, stress, spike,
soak) and documented chaos scenarios.
