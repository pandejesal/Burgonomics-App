# Security Policy

## Reporting a Vulnerability

Email `security@burgonomics.com`. Please include reproduction steps and a proof of concept. We acknowledge within 24 hours and target a fix within 7 business days for high-severity issues.

Please do **not** open a public GitHub issue for security reports.

## Scope

- The Burgonomics backend (`backend/`).
- Mobile & web customer applications (`src/`).
- Cloud Functions & Firestore triggers (`functions/`).
- Deployed API endpoints (`*.burgonomics.com`).

Out of scope: third-party providers (PETPOOJA, Razorpay, Firebase). Report issues in those systems directly to the respective vendor.

## Baseline Controls

| Control                | Implementation                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| Transport              | TLS 1.2+ HTTPS enforced; HSTS enabled                                 |
| Authentication         | Firebase Auth ID Tokens (RSA-256) & short-lived backend JWTs (15 min)  |
| Refresh Rotation       | Rotating refresh tokens with reuse invalidation                        |
| Authorization          | RBAC via `@RequirePermissions()` + `PermissionsGuard` & Firestore Rules |
| Input Validation       | NestJS `ValidationPipe` (whitelist + forbidNonWhitelisted) & Zod DTOs   |
| Output Escaping        | JSON responses only; no server-rendered HTML                           |
| SQL / Data Injection   | Prisma parameterized queries; Firestore structured document access     |
| CORS                   | Strict origin allowlist (`burgonomics.com`, `www.burgonomics.com`)     |
| Security Headers       | Helmet protection headers + HSTS                                       |
| Webhook Signatures     | HMAC-SHA256 constant-time signature verification with replay protection|
| Rate Limiting          | Per-IP and per-principal rate limiting via Redis                      |
| Password Storage       | Argon2id cryptographic hashing for administrative credentials          |
| Audit Trail            | Administrative operations logged in database audit trail               |

## OWASP Top 10 Mapping

| OWASP 2021           | Mitigation                                                     |
| -------------------- | -------------------------------------------------------------- |
| A01 Broken AC        | RBAC guards + object-level user ownership checks               |
| A02 Crypto Failures  | TLS everywhere; argon2id; server-authoritative secret checks   |
| A03 Injection        | Prisma ORM parameterized queries; Firestore Admin SDK          |
| A04 Insecure Design  | Server-Authoritative Price Engine; strict state transitions     |
| A05 Misconfiguration | Helmet security defaults; fail-closed webhook validation       |
| A06 Vulnerable Deps  | Dependency auditing via `npm audit` in CI pipelines            |
| A07 AuthN Failures   | Token expiration, Bearer auth, strict signature validation     |
| A08 Integrity        | Signed webhooks; server-locked payment order amounts           |
| A09 Logging Failures | Structured logs with correlation IDs and masked PII            |
| A10 SSRF             | No client-controlled outbound URLs                             |
