# Security Policy

## Reporting a vulnerability

Email `security@burgonomics.com`. Please include reproduction steps and a
proof of concept. We acknowledge within 24 h and target a fix within 7 days
for high-severity issues.

Please do **not** open a public GitHub issue for security reports.

## Scope

- The Burgonomics backend (`backend/`).
- Deployed API endpoints (`*.burgonomics.com`).

Out of scope: third-party providers (PETPOOJA, Razorpay, Firebase). Report
issues in those systems directly to the vendor.

## Baseline controls

| Control                | Implementation                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| Transport              | TLS 1.2+ terminated at ALB; HSTS enforced                              |
| Auth                   | OTP → short-lived JWT (15 m) + rotating refresh token (30 d)           |
| Refresh rotation       | One-time use, hashed at rest, family invalidated on reuse              |
| Authorization          | RBAC via `@RequirePermissions()` + `PermissionsGuard`                  |
| Secrets                | AWS Secrets Manager + External Secrets Operator                        |
| Input validation       | Global `ValidationPipe` (whitelist + forbidNonWhitelisted)             |
| Output escaping        | JSON responses only; no server-rendered HTML                           |
| SQL injection          | Prisma parameterised queries; no raw string interpolation              |
| CSRF                   | Not applicable — pure JSON API, no cookies for auth                    |
| CORS                   | Allow-list via `APP_CORS_ORIGINS`                                      |
| Security headers       | Helmet (default set) + explicit HSTS/Referrer-Policy                   |
| Webhook signatures     | HMAC-SHA256 constant-time compare + replay-window guard                |
| Rate limiting          | Per-IP + per-principal via Redis; sensitive routes lower               |
| Password / OTP storage | Argon2id (passwords), hashed OTPs, single-use                          |
| Audit trail            | Every admin write persisted immutably in `AuditLog`                    |
| PII                    | Phone numbers hashed for lookups; addresses pgcrypto-encrypted at rest |
| Dependencies           | `npm audit` + Trivy + CodeQL in CI                                     |
| Container              | Non-root, dumb-init PID 1, distroless-adjacent base                    |

## OWASP Top 10 mapping

| OWASP 2021           | Mitigation                                                     |
| -------------------- | -------------------------------------------------------------- |
| A01 Broken AC        | RBAC + object-level checks in specifications                   |
| A02 Crypto Failures  | TLS everywhere; argon2id; short JWT TTL; secrets in KMS        |
| A03 Injection        | Prisma; Zod DTOs; no shell exec of user input                  |
| A04 Insecure Design  | Threat modelling per module; specifications enforce invariants |
| A05 Misconfiguration | Helmet defaults; Zod env validation; boot fails hard           |
| A06 Vulnerable Deps  | CI scans + Renovate                                            |
| A07 AuthN Failures   | OTP rate-limited; refresh rotation; family invalidation        |
| A08 Integrity        | Signed webhooks; SBOM per release; provenance attestation      |
| A09 Logging Failures | Structured logs, correlation IDs, immutable audit table        |
| A10 SSRF             | No user-controlled outbound URLs                               |

## Known residual risks

- Rate limiting is best-effort per instance; a proper edge WAF (Cloudflare / AWS WAF) is recommended in front.
- OTP provider integration is stubbed until a provider (MSG91 / Twilio) is wired — issue tracked in the backlog.
- Refresh-token binding is per-device via `deviceId` claim; long-lived stolen devices remain a risk until a step-up re-auth policy ships.
