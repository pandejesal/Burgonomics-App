# Burgonomics Mobile — Frontend Architecture

Enterprise-grade, feature-first React 19 / TanStack Start frontend for the
Burgonomics customer app. This document describes only the frontend
architecture; product requirements live in the attached PRD / UX / AI
Development Guide documents.

The architecture below is FINAL for MVP. Any change requires an explicit
architecture review — feature prompts must not restructure these layers.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Screens / Routes  (src/routes, src/features/*/screens)     │  ← UI
├─────────────────────────────────────────────────────────────┤
│  Feature Repositories  (src/features/<name>/repositories)   │  ← Public API of each feature
├─────────────────────────────────────────────────────────────┤
│  Feature Services      (src/features/<name>/services)       │  ← Wire-shape helpers
├─────────────────────────────────────────────────────────────┤
│  Core Network         (src/core/network)                    │  ← HTTP client, interceptors
├─────────────────────────────────────────────────────────────┤
│  Integrations         (src/core/integrations)               │  ← Petpooja / Razorpay / Firebase
└─────────────────────────────────────────────────────────────┘
```

Cross-cutting infrastructure (config, logging, analytics, feature flags,
storage, errors, domain models, DTOs, mappers) lives in `src/core/`.
Reusable UI (components, layouts, navigation, theme, hooks, assets) lives
in `src/shared/`. Product surface area lives in `src/features/`.

## 2. Folder Structure

```
src/
├─ core/                          # Application infrastructure
│  ├─ config/                     # env.ts + appConfig (envs, timeouts, flags)
│  ├─ network/                    # HttpClient, interceptors, ApiResult envelope
│  ├─ integrations/               # Petpooja, Razorpay, Firebase, Analytics adapters
│  ├─ repositories/               # Base repository contract + variants
│  ├─ services/                   # Cross-feature service primitives (currently empty)
│  ├─ storage/                    # secureStorage, offlineCache
│  ├─ state/                      # App-level Zustand (appConfigStore)
│  ├─ analytics/                  # Typed event catalogue + dispatcher
│  ├─ logging/                    # Structured logger + sinks
│  ├─ featureFlags/               # Local + remote flag evaluation
│  ├─ errors/                     # AppError kinds + typed error classes
│  ├─ models/                     # Cross-cutting domain models
│  ├─ dto/                        # Wire-format DTOs
│  ├─ mappers/                    # DTO → domain-model mappers
│  ├─ constants/                  # app.ts, screens.ts
│  ├─ types/                      # Cross-cutting primitives
│  ├─ utils/                      # cn, format
│  └─ index.ts                    # Namespaced barrel
├─ shared/                        # Reusable UI
│  ├─ components/{common,feedback}
│  ├─ layouts/                    # AppShell, OfflineBanner
│  ├─ navigation/                 # TopBar, BottomTabBar, routes.ts (typed)
│  ├─ theme/                      # Design tokens
│  ├─ hooks/                      # useHydrated, useOnlineStatus, use-mobile
│  └─ assets/
├─ features/                      # One folder per product area
│  ├─ auth/  ├─ cart/  ├─ checkout/ ├─ home/  ├─ menu/  ├─ notifications/
│  ├─ offers/  ├─ orders/  ├─ profile/  ├─ settings/  ├─ stores/  └─ tracking/
├─ routes/                        # TanStack Router file-based routes (thin)
├─ components/ui/                 # shadcn primitives (untouched)
└─ lib/                           # framework glue (error reporting, cn)
```

Every feature folder follows the same shape:

```
features/<name>/
├─ index.ts               # Public entry point — the ONLY file other features may import
├─ repositories/          # Feature repository (mock today, api later)
├─ services/              # Wire-shape helpers
├─ state/                 # Zustand stores (persisted where required)
├─ models/                # Feature domain models
├─ mappers/               # DTO ↔ model mapping (optional)
├─ hooks/                 # Feature-local hooks
├─ screens/               # Feature-local screen components (optional)
└─ utils/                 # Feature-local helpers (optional)
```

## 3. Layer Responsibilities

| Layer                | Owns                                                               | May depend on                                |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| Screens / Routes     | Rendering, routing, user interaction                               | Feature barrels, `shared/*`, `core/*`        |
| Feature repositories | Domain behaviour, caching, DTO→model, store coordination           | Feature services, `core/*`                   |
| Feature services     | Wire-shape requests, DTO parsing (never business logic)            | `core/network`, `core/errors`                |
| `core/network`       | HTTP client, interceptors, retry, timeout, error mapping           | `core/config`, `core/errors`, `core/logging` |
| `core/integrations`  | Third-party SDK adapters (Petpooja, Razorpay, Firebase, Analytics) | `core/*` only                                |
| `core/analytics`     | Typed event catalogue + dispatcher                                 | `core/config`, `core/logging`                |
| `core/featureFlags`  | Local + remote flag rules, rollout, kill switches                  | `core/config`                                |
| `core/logging`       | Structured logger, sinks                                           | `core/config`                                |
| `core/storage`       | secureStorage, offlineCache abstractions                           | —                                            |
| `core/errors`        | AppError kinds + typed error classes                               | —                                            |
| `core/config`        | `appConfig` from `import.meta.env.VITE_*`                          | —                                            |
| `shared/*`           | Reusable UI (components, layouts, navigation, theme)               | `core/*` only                                |

## 4. Dependency Rules

These rules are enforced by convention today and by lint in a follow-up:

1. `features/<a>` MUST NOT import from `features/<b>/…` internals. Cross-
   feature collaboration goes through another feature's `index.ts` barrel.
2. `shared/*` MUST NOT import from `features/*`.
3. `core/*` MUST NOT import from `features/*` or `shared/*`.
4. UI code (`routes/`, `screens/`, `components/`) MUST NOT import
   `services/*`, `core/network`, or raw `fetch`. Use the feature repository.
5. `services/*` MUST NOT contain business logic — only wire-shape calls
   and DTO parsing.
6. Repositories are the ONLY layer allowed to call services.
7. UI code MUST NOT consume raw DTOs — repositories return domain models.
8. Route paths MUST come from `@/shared/navigation/routes` (`ROUTES`,
   `routePath()`), never inline strings — except inside `createFileRoute`
   which is generated file-based routing.
9. Configuration MUST come from `@/core/config` — never
   `import.meta.env.*` in feature or UI code.
10. Logging MUST use `@/core/logging`; analytics MUST use
    `@/core/analytics`. Direct `console.*` calls are forbidden outside
    the logger implementation itself.
11. No circular imports. Barrel imports (`@/features/<name>`) are
    preferred; deep imports are reserved for a feature's own internals.

## 5. Repository Pattern

- Every feature owns exactly one repository class + singleton
  (`authRepository`, `menuRepository`, …).
- Repositories are the single UI entry point — they compose services,
  cache via `@/core/storage`, coordinate with Zustand stores, and
  translate DTOs into domain models.
- Every repository ships in two variants behind the same interface
  (`RepositoryVariant = "mock" | "api"`). Only the mock is wired today;
  the API variant is added with the backend prompt. Selection happens in
  the feature `index.ts` — UI code never branches on environment.

## 6. Network Architecture

`@/core/network` provides:

- `HttpClient` — request/response/error interceptors, per-request
  timeout via `AbortController`, exponential backoff retry, and
  request cancellation.
- Interceptor slots: authentication token injection, refresh handling,
  request/response logging, offline detection, request queueing.
- `mapTransportError` — maps low-level failures to typed `AppError`
  subclasses so UI code never inspects HTTP status codes directly.
- `ApiResult<T>` envelope — the uniform shape services return.

The real fetch dispatcher is intentionally not wired in this refactor
— the backend integration prompt swaps the placeholder for a real
fetch pipeline without touching any feature code.

## 7. Domain Models, DTOs, Mappers

- `core/dto` — wire-format shapes (snake_case, nullable, string
  timestamps). Feature-specific DTOs live inside the feature.
- `core/models` — cross-cutting domain models (`Paginated<T>`, `Id`,
  `Money`, `Iso8601`). Feature-specific models live inside the feature.
- `core/mappers` — cross-cutting mappers (pagination, ISO dates).
  Feature mappers (`ProductMapper`, `OrderMapper`) live inside the
  feature. UI **never** sees a DTO.

## 8. Environment Configuration

Configure per-environment values via Vite env vars. Environments
supported: `development`, `staging`, `production`, `feature-preview`.

| Variable                                                             | Purpose                            |
| -------------------------------------------------------------------- | ---------------------------------- |
| `VITE_APP_ENV`                                                       | development / staging / production |
| `VITE_APP_NAME`, `VITE_APP_VERSION`                                  | Display + telemetry                |
| `VITE_API_BASE_URL`                                                  | API root                           |
| `VITE_API_TIMEOUT_MS`                                                | Per-request timeout                |
| `VITE_API_RETRY_ATTEMPTS`                                            | Retry count                        |
| `VITE_API_RETRY_BACKOFF_MS`                                          | Retry backoff base                 |
| `VITE_FF_*`                                                          | Feature flags                      |
| `VITE_ANALYTICS_ENABLED`, `VITE_ANALYTICS_WRITE_KEY`                 | Analytics                          |
| `VITE_PUSH_ENABLED`, `VITE_PUSH_VAPID_PUBLIC_KEY`                    | Push                               |
| `VITE_RAZORPAY_KEY_ID`, `VITE_PETPOOJA_ENABLED`, `VITE_MAPS_API_KEY` | Integrations                       |

Only publishable / non-secret values belong in env vars. Secrets stay
in backend infrastructure.

## 9. Logging

`@/core/logging` exports a `logger` singleton with `debug / info /
warn / error / critical`. Sinks are pluggable: the console sink ships
enabled in development; Sentry / Crashlytics / backend ingest sinks
register in a later prompt via `logger.addSink(...)`. Feature and
infrastructure code MUST use the logger — never `console.*` directly.

## 10. Analytics

`@/core/analytics` exposes:

- `AnalyticsEvent` — discriminated union covering every product event
  (App Opened, Login Started/Success, Store Selected, Menu Viewed,
  Product Viewed, Product Customized, Add/Remove From Cart, Checkout
  Started, Payment Success/Failed, Order Placed/Cancelled/Delivered,
  Profile Updated).
- `AnalyticsProvider` — the interface a real provider implements
  (Segment / GA4 / Amplitude / custom). Registered at bootstrap via
  `analytics.setProvider(...)`.
- `analytics.track(event)` / `identify(userId, traits)` /
  `reset()` — the only surface features call. Events fired before a
  provider is registered buffer in-memory and flush on registration.

## 11. Feature Flags

`@/core/featureFlags` supports local defaults (seeded from
`appConfig.featureFlags`), local overrides, remote sync (placeholder),
percentage rollout, kill switches (`kill_switch_orders`,
`kill_switch_payments`), store-scoped flags, and A/B variant
assignment. Flag keys are typed (`FlagKey`) so misspellings fail at
compile time.

## 12. Typed Navigation

`@/shared/navigation/routes` exports `ROUTES` (route path constants,
seeded from `core/constants/screens`), `RoutePath` / `RouteId`,
`routePath(path, params)` for `$param` substitution, and
`PRIMARY_TABS` for the bottom-tab surface. Feature code must import
from this module rather than hardcoding path strings.

## 13. Error System

`@/core/errors` provides:

- `AppErrorKind` union — `NETWORK`, `OFFLINE`, `UNAUTHORIZED`,
  `MAINTENANCE`, `SESSION_EXPIRED`, `NOT_FOUND`, `UNKNOWN`.
- Typed classes: `AuthenticationError`, `SessionExpiredError`,
  `NetworkError`, `OfflineError`, `TimeoutError`, `ValidationError`,
  `ServerError`, `MaintenanceError`, `NotFoundError`, `UnknownError`.
- `toAppError(err)` + copy map for consistent UI feedback (used by
  `shared/components/feedback/ErrorState`).

Transport failures pass through `mapTransportError` in the network
layer — features and UI never inspect HTTP internals.

## 14. Public Feature APIs

Every feature exposes exactly one public entry point:
`src/features/<name>/index.ts`. Other features and screens may import
ONLY from this barrel. Deep imports into another feature's
`services/`, `state/`, `hooks/`, or `screens/` are forbidden.

## 15. Adding a New Feature

1. `src/features/<name>/{screens,repositories,services,state,models,mappers,hooks}`.
2. Define DTOs (`services/*.dto.ts` or `dto/`), domain models
   (`models/`), and mappers (`mappers/`).
3. Add `services/<name>Service.ts` returning `ApiResult<T>` envelopes
   from `@/core/network/http`.
4. Add `repositories/<Name>Repository.ts` wrapping the service.
   Provide a mock implementation now; leave a slot for the API impl.
5. Add feature-owned state in `state/<name>Store.ts` (Zustand + persist
   where required, with `skipHydration: true` for SSR safety).
6. Re-export the repository (and any public state) from
   `src/features/<name>/index.ts`.
7. Add screen files under `src/routes/` and reference the route in
   `@/shared/navigation/routes`.
8. Wire analytics events through `@/core/analytics`, logs through
   `@/core/logging`, flags through `@/core/featureFlags`.

## 16. Coding Standards

- TypeScript strict mode. No `any` unless justified in a comment.
- Barrel imports (`@/features/menu`, `@/core/network`) preferred over
  deep imports.
- No inline `import.meta.env.*`, no inline `console.*`, no inline
  route strings — use `@/core/config`, `@/core/logging`,
  `@/shared/navigation/routes`.
- Repositories return domain models. Services return `ApiResult<DTO>`.
- Every user-observable moment fires a typed analytics event.
- Every catchable failure surfaces as a typed `AppError` subclass.

## 17. What This Refactor Did NOT Change

- No UI, screens, layouts, navigation, or design tokens changed.
- No feature behaviour changed.
- No backend, authentication logic, PETPOOJA, Razorpay, Firebase,
  analytics provider, logging sink, feature-flag backend, or business
  logic was implemented.

All existing screens, routes, and interactions are preserved bit-for-bit.
The architecture is now frozen for MVP feature development.
