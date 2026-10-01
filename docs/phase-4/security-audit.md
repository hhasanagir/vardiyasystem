# Security Audit — Authentication & Transport Layer

**Date:** 2026-08-23
**Scope:** Backend authentication architecture, session/token lifecycle, CSRF, CORS, security headers, input validation, rate limiting, environment validation
**Method:** Static source review. Every finding below cites the exact file and line it was derived from. Nothing in this document is inferred from documentation or assumed behavior.
**Reviewed files:**

| Area            | File                                                                                |
| --------------- | ----------------------------------------------------------------------------------- |
| Auth flow       | `backend/src/modules/auth/auth.service.ts`                                          |
| JWT validation  | `backend/src/modules/auth/jwt.strategy.ts`                                          |
| Sessions        | `backend/src/modules/auth/session.service.ts`                                       |
| Refresh tokens  | `backend/src/modules/auth/refresh-token.service.ts`                                 |
| Token blacklist | `backend/src/modules/auth/token-blacklist.service.ts`                               |
| Endpoints       | `backend/src/modules/auth/auth.controller.ts`                                       |
| Guards          | `backend/src/modules/auth/guards/jwt-auth.guard.ts`, `guards/roles.guard.ts`        |
| Bootstrap       | `backend/src/main.ts`                                                               |
| CSRF            | `backend/src/modules/auth/csrf/*`                                                   |
| DTOs            | `backend/src/modules/auth/dto/login.dto.ts`, `create-user.dto.ts`, `refresh.dto.ts` |
| Env config      | `backend/src/config/env.config.ts`                                                  |
| Module wiring   | `backend/src/app.module.ts`, `backend/src/modules/rbac/rbac.module.ts`              |

---

## 1. Executive Summary

The authentication layer is substantially hardened for its maturity level: dual-secret JWT separation (access vs. refresh, `env.config.ts:12–23`), algorithm-pinned verification (`HS256` only), per-token `jti` with DB-backed blacklisting, SHA-256-hashed refresh tokens at rest, rotation with cross-IP replay detection, progressive lockout, timing-safe CSRF comparison, a strict Helmet CSP, and Joi-based startup config enforcement that refuses weak secrets in production.

However, the audit identified **one High finding**: the `@nestjs/throttler` machinery is fully configured (module + per-endpoint `@Throttle` decorators) but **no `ThrottlerGuard` is ever registered**, so HTTP-level rate limiting is currently inert (SEC-001). Brute-force resistance presently rests entirely on the application-level lockout service and WebSocket-specific limiter.

**Finding counts: 0 Critical · 1 High · 3 Medium · 5 Low · 4 Info**

---

## 2. Authentication Architecture

### 2.1 JWT strategy

- Bearer-token extraction with expiration enforced (`ignoreExpiration: false`) and algorithms pinned to `HS256`; secret resolved from `JWT_ACCESS_TOKEN_SECRET` falling back to `JWT_SECRET` — `jwt.strategy.ts:22–28`.
- On each request, `validate()` rejects any token whose `jti` is blacklisted before touching the user store — `jwt.strategy.ts:36–38`.
- User lookup is re-fetched from DB (`validateUser`, `auth.service.ts:433–445`) and enriched with RBAC permissions (`jwt.strategy.ts:45–50`), guarded by an in-process cache: 60 s TTL, max 1 000 entries with oldest-entry eviction — `jwt.strategy.ts:10–12, 40–43, 52–56`. A cache-invalidator hook is registered so RBAC changes can drop entries (`jwt.strategy.ts:30–32`).
- Access tokens carry `sub`, `email`, `role`, `organizationId`, `jti`, and `rbacLevel` — `auth.service.ts:457–464`. Default TTL 15 min — `env.config.ts:24`.

### 2.2 Token lifecycle

- Every login/registration/refresh mints a fresh `randomUUID()` `jti` shared by both the access and refresh token of that issuance — `auth.service.ts:448, 457–472`.
- Two distinct signing secrets are used: access tokens use the default JwtModule secret; refresh tokens are signed and verified with `JWT_REFRESH_TOKEN_SECRET` (hard failure if unset) — `auth.service.ts:466–472, 215–222, 515–522`.
- Blacklisting is DB-backed (`TokenBlacklist` table, unique on `jti`) — `token-blacklist.service.ts:10–27`; entries expire after a fixed 7 days and are purged by a 5-minute interval timer started in the AuthService constructor — `token-blacklist.service.ts:11, 29–37`, `auth.service.ts:46`.

### 2.3 Authorization guards

- `JwtAuthGuard` is a thin Passport wrapper — `jwt-auth.guard.ts:4–5`.
- `RolesGuard` denies when no authenticated user/role is present (`roles.guard.ts:21–25`) and resolves the _minimum_ required role from the decorator list against a hierarchy (`roles.guard.ts:29–37`), i.e., declaring multiple roles grants access to the lowest threshold, which is fail-safe toward the stricter check.

---

## 3. Refresh Token Security

Endpoint: `POST /auth/refresh` — `auth.controller.ts:81–96`.

1. **Verification:** signature checked against the dedicated refresh secret with `algorithms: ['HS256']`; payload must contain both `sub` and `jti` — `auth.service.ts:219–227`.
2. **Blacklist check:** previously rotated/revoked jtis rejected — `auth.service.ts:229–232`.
3. **Session binding:** the raw refresh token is looked up by its SHA-256 hash (`session.service.ts:30–32, 67–73`); tokens issued through `generateToken` are always linked to their session row post-creation — `auth.service.ts:484`, `session.service.ts:59–65`. Plaintext tokens are never persisted.
4. **Active-session gate:** inactive sessions are rejected and the presented jti blacklisted — `auth.service.ts:241–245`.
5. **Replay detection:** two layers — an in-memory map (1 h TTL, cleaned every 5 min) and a DB query over prior `REFRESH_USED` attempt rows — `refresh-token.service.ts:57–85, 10–11, 151–158`. Detected replays raise `REFRESH_REPLAY` attempts plus an audit entry explicitly framed as possible token theft — `refresh-token.service.ts:87–125` (reason string at line 120).
   - **Same-IP replays** (e.g., multi-tab races) log a warning but do not revoke — `auth.service.ts:255–258`.
   - **Cross-IP replays** blacklist the jti _and_ revoke the session — `auth.service.ts:259–260`.
6. **Rotation:** the used jti is recorded (`markUsed`, `refresh-token.service.ts:26–55`), the old jti blacklisted ("rotated on refresh"), and a brand-new pair issued — `auth.service.ts:283–294`.
7. **Auditability:** every rejection path records an attempt typed `REFRESH_<REASON>`; critical reasons (`REPLAY`, `BLACKLISTED`, `SESSION_INACTIVE`) additionally produce audit-log entries — `auth.service.ts:304–338`.

All failures return the identical message `Invalid refresh token` — no oracle distinguishes failure causes to callers (`auth.service.ts:226–300`).

---

## 4. Session Management

- **Creation:** sessions record user, `jti`, IP, user-agent, device info and expiry — `session.service.ts:34–57`. The row starts with an empty hash and is linked to the SHA-256 of the refresh token immediately after signing — `auth.service.ts:476–484`.
- **Revocation (single):** ownership is enforced — a mismatched user receives the same `NotFound` as a missing session (no existence oracle) — `session.service.ts:99–101`; revocation is idempotent (`session.service.ts:103–105`) and audited (`session.service.ts:112–121`).
- **Logout:** blacklists the current access-token jti and revokes the current (or body-supplied) session; the body-supplied `sessionId` is safe because ownership is re-checked inside `revoke` — `auth.controller.ts:113–126`, `auth.service.ts:340–375`.
- **Logout-all:** revokes every active session except the caller's own — `auth.service.ts:377–406`, `session.service.ts:129–154`; audited with revoked count (`session.service.ts:140–147`). Admin-initiated account unlock is a separate, admin-gated action — `auth.controller.ts:168–180`, `auth.service.ts:416–431`.
- **Listing / self-revocation:** `GET /auth/sessions` and `DELETE /sessions/:id` (UUID-validated param) — `auth.controller.ts:146–166`.
- **Hygiene:** expired+revoked rows are deleted by the periodic cleaner — `session.service.ts:163–174`; `lastUsedAt` updates on every refresh — `refresh-token.service.ts:38`, `session.service.ts:83–88`.
- A server-side validity predicate exists (`isSessionValid`, `session.service.ts:176–188`) — note it is _not_ consulted on the ordinary JWT request path (see SEC-002).

---

## 5. Password Security

- **Hashing:** bcrypt with cost factor 13 — `auth.service.ts:64`; comparison wrapped defensively so hashing errors fail closed — `auth.service.ts:149–156`.
- **Complexity (registration):** minimum length 10, mandatory upper/lower/digit/special classes via regex — `create-user.dto.ts:34–38`; a 30-entry common-password blocklist validator — `create-user.dto.ts:4–10, 12–24`; maximum length 128 caps bcrypt input abuse — `create-user.dto.ts:35`.
- **Enumeration resistance:** duplicate-email registration returns the same generic `Registration failed` as other outcomes — `auth.service.ts:55–57`; login always returns `Invalid credentials` — `auth.service.ts:127, 182`. Residual timing side channel noted in SEC-005.
- **Privilege escalation guard:** self-registration may only assign roles from an explicit allow-list (`guest`, `secretary`, assistant/regular `technician`); anything else degrades to `guest` — `auth.service.ts:59–62`. Registration additionally requires a valid invite code consumed atomically in the same transaction as user creation — `auth.service.ts:50, 66–87`.

---

## 6. CSRF Protection

Pattern: **double-submit cookie**, applied globally.

- `CsrfGuard` is registered as a global `APP_GUARD` — `app.module.ts:167–170`.
- Cookie `csrf-token` / header `x-csrf-token` constants — `csrf.guard.ts:6–7`. Safe methods (`GET/HEAD/OPTIONS`) are issued a token if absent — `csrf.guard.ts:8, 32–38`; an explicit bootstrap endpoint also sets the cookie — `auth.controller.ts:39–50`.
- Validation requires header ≡ cookie with fixed-length (64 hex chars, two concatenated UUIDs) and a **timing-safe** comparison — `csrf.service.ts:8–20`.
- Cookie flags: `SameSite=Strict`, `Secure` in production, readable by JS (`httpOnly:false`, required by the double-submit pattern) — `csrf.guard.ts:44–51`.
- Opt-outs via `@SkipCsrf()` are limited to pre-auth endpoints (`register`, `login`, `refresh`) and the admin unlock route — `auth.controller.ts:53, 63, 82, 171`; mechanism at `skip-csrf.decorator.ts:4` and `csrf.guard.ts:23–28`.
- Contextual note: because authentication uses the `Authorization` header rather than cookies (see §7 `credentials:true` notwithstanding — the API does not set auth cookies), classic login-CSRF exposure is low; the guard functions as defense-in-depth. Guard behavior is covered by unit tests (`__tests__/csrf.guard.spec.ts`).

---

## 7. CORS Configuration

Single-origin, credentialed, explicit allow-lists — `main.ts:96–102`:

- `origin`: single value from `FRONTEND_URL` (no array/wildcard/reflect) — `main.ts:97`; default `http://localhost:4200` — `env.config.ts:26`; a production deployment pointing at localhost is refused at boot — `env.config.ts:92–95`.
- `credentials: true` — `main.ts:98` (supports cookie-based flows such as the CSRF cookie).
- Methods limited to `GET/POST/PUT/PATCH/DELETE/OPTIONS` — `main.ts:99`.
- `allowedHeaders` restricted to `Content-Type`, `Authorization`, `x-csrf-token`, `X-Correlation-Id`; only `X-Correlation-Id` exposed — `main.ts:100–101`.
- A separate `WS_CORS_ORIGIN` exists for sockets — `env.config.ts:27`.

---

## 8. Security Headers

Helmet with customized directives — `main.ts:49–76`:

| Control                           | Setting                                                                                                                                                                                                                                                                 | Reference       |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Content-Security-Policy           | `default-src 'self'`; `script-src 'self'` (no inline scripts); `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `img-src 'self' data:`; `connect-src 'self' <frontendUrl>`; `upgrade-insecure-requests` added in production only | `main.ts:50–65` |
| style-src exception               | `'unsafe-inline'` permitted (common SPA requirement; see SEC-009)                                                                                                                                                                                                       | `main.ts:55`    |
| HSTS                              | 1 year, `includeSubDomains`, `preload` — **production only** (disabled in dev)                                                                                                                                                                                          | `main.ts:68–72` |
| X-Frame-Options                   | `DENY`                                                                                                                                                                                                                                                                  | `main.ts:75`    |
| Referrer-Policy                   | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                       | `main.ts:73`    |
| Cross-Origin-Resource-Policy      | `same-origin`                                                                                                                                                                                                                                                           | `main.ts:67`    |
| Cross-Origin-Embedder-Policy      | disabled (deliberate, likely for embeds)                                                                                                                                                                                                                                | `main.ts:66`    |
| X-Permitted-Cross-Domain-Policies | `none`                                                                                                                                                                                                                                                                  | `main.ts:74`    |

Additional transport posture: compression enabled (`main.ts:44`), signed cookie parser using `COOKIE_SECRET` (`main.ts:46–47`), Swagger exposed **only outside production** (`main.ts:104–114`), graceful SIGTERM/SIGINT shutdown (`main.ts:139–156`), proxy trust configurable via `TRUST_PROXY_LEVEL` default 1 (`main.ts:34–35`, `env.config.ts:43`).

---

## 9. Input Validation

Global `ValidationPipe` — `main.ts:86–94`:

- `whitelist: true` + `forbidNonWhitelisted: true`: unknown properties stripped _and_ rejected — `main.ts:87–88`.
- `forbidUnknownValues: true` — `main.ts:89`.
- Transformation enabled (with implicit conversion) so typed rules apply — `main.ts:90–91`.
- Error responses omit `target` and `value` (no reflection of submitted payloads back to clients) and stop at first error — `main.ts:92–93`.

Representative DTO hardening:

- Login: `@IsEmail` + `MaxLength(255)` email; string password capped at 128 — `login.dto.ts:6–13`.
- Registration: full password policy (§5), bounded name field, optional string role/org/unit, required invite code — `create-user.dto.ts:26–66`.
- Session revocation param validated as UUID via `ParseUUIDPipe` — `auth.controller.ts:161`.
- Gap: `RefreshTokenDto.refreshToken` has no length cap (`refresh.dto.ts:4–8`) — see SEC-013.

---

## 10. Rate Limiting

**Intended design:**

- `ThrottlerModule.forRootAsync` with global window 60 s / limit 200 (`GLOBAL_THROTTLE_LIMIT`), backed by Redis when `REDIS_URL` is set, otherwise in-memory — `app.module.ts:79–92`, defaults at `env.config.ts:28–29`.
- Per-endpoint decorators: register **3/min** (`auth.controller.ts:54`), login **10/min** (`:65`), refresh **10/min** (`:84`), logout **20/min** (`:116`), logout-all **5/min** (`:131`), sessions list **30/min** (`:148`), unlock **5/min** (`:172`). Matching env knobs `AUTH_LOGIN_LIMIT`, `AUTH_REGISTER_LIMIT`, `AUTH_REFRESH_LIMIT` exist — `env.config.ts:30–35`.
- Application-level brute-force defense independent of throttler: lockout after 5 failures with base 15-min duration × 1.5 progressive factor capped at 24 h (`auth-attempt.service.ts:124–135`, defaults `env.config.ts:36–39`); pre-check short-circuits locked accounts — `auth.service.ts:112–128`; progressive response delay 500 ms→5 s after 3 consecutive failures — `auth.service.ts:130–138`.
- WebSocket connections have their own in-memory connection limiter — `schedule.gateway.ts:158–176, 216–217`.

**Actual state (High):** no `ThrottlerGuard` binding exists anywhere in `backend/src` — the only global guards are `CsrfGuard` (`app.module.ts:167–170`) and RBAC's `PermissionGuard` (`rbac.module.ts:16–18`), and no controller applies `@UseGuards(ThrottlerGuard)`. Consequently the `@Throttle` decorators are currently **metadata without an enforcer**, and the effective HTTP-layer limits are those listed under "application-level defense" above. See SEC-001.

Client IP attribution for lockout comes from the first `x-forwarded-for` entry, falling back to socket address — `auth.controller.ts:74–76, 91–93`; correctness depends on proxy topology matching `TRUST_PROXY_LEVEL` (`main.ts:34–35`).

---

## 11. Environment Validation

- **Joi schema at ConfigModule load** (`validationSchema` wired in `app.module.ts:93–102` with `abortEarly: false` so all violations surface): `DATABASE_URL` required (`env.config.ts:10`); in production, `JWT_ACCESS_TOKEN_SECRET`, `JWT_REFRESH_TOKEN_SECRET`, and `COOKIE_SECRET` are **required with ≥32 chars** — `env.config.ts:12–23, 45–50`; dev-only fallbacks (`dev-jwt-*`) exist otherwise.
- **Startup guard** runs before listening (`main.ts:30`): in production it throws on dev-default secrets, secrets shorter than 32 chars, or a localhost `FRONTEND_URL` — `env.config.ts:79–105`; in development the same problems merely warn (`env.config.ts:103–104`).
- Token TTLs are schema-validated strings with sane defaults (15 m / 7 d) — `env.config.ts:24–25`.
- Feature flags default safely (collaboration/offline/biometric off; four-eyes approval on) — `env.config.ts:66–72`.
- Gaps: `allowUnknown: true` means mistyped env names pass silently (`app.module.ts:100`); dev-default VAPID keys are embedded in source (`env.config.ts:51–62`) — see SEC-008.

---

## 12. Findings & Risk Classification

Severity rubric: **Critical** = exploitable auth bypass/data breach; **High** = control believed present but not enforcing, or realistic compromise path; **Medium** = meaningful weakening requiring specific conditions; **Low** = defense-in-depth gap or hardening opportunity; **Info** = observation/hygiene.

| ID      | Severity | Title                                                            | Location(s)                                                                                           | Detail & Recommendation                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------- | -------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEC-001 | **High** | Throttler configured but never enforced                          | `app.module.ts:79–92, 167–170`; `rbac.module.ts:16–18`; `auth.controller.ts:54,65,84,116,131,148,172` | `ThrottlerModule` and seven `@Throttle` decorators exist, but no `ThrottlerGuard` is registered globally or per-route, so HTTP rate limits do not execute. Brute-force protection currently depends solely on lockout/progressive delay (`auth.service.ts:112–138`; `auth-attempt.service.ts:124–135`). **Fix:** add `{ provide: APP_GUARD, useClass: ThrottlerGuard }` and verify 429s in integration tests.                                                                      |
| SEC-002 | Medium   | `logout-all` leaves other devices' unexpired access tokens valid | `jwt.strategy.ts:36–38`; `auth.service.ts:377–380`; `session.service.ts:176–188`                      | The request-path strategy checks only the jti blacklist; session state is consulted solely during refresh (`auth.service.ts:241–245`). After logout-all, other devices' access tokens (≤15 min, `env.config.ts:24`) keep working until expiry because `isSessionValid` is never called per-request. **Fix:** consult session validity (or a per-user "sessions epoch") in `JwtStrategy.validate`, or accept and document the bounded window.                                       |
| SEC-003 | Medium   | Same-IP replay exemption + client-influenced IP attribution      | `auth.service.ts:255–258`; `auth.controller.ts:74–76`; `main.ts:34–35`                                | Replay from the same IP as first use neither blacklists nor revokes (multi-tab accommodation). Attackers behind shared NAT/corp egress — or where `TRUST_PROXY_LEVEL` mis-describes the proxy chain, letting clients spoof `x-forwarded-for` — get repeated free replays. **Fix:** narrow the exemption (e.g., time-boxed, same session fingerprint), and derive IP via Express `req.ip` honoring `trust proxy` instead of raw header parsing.                                     |
| SEC-004 | Medium   | Refresh-token TOCTOU race allows double redemption               | `auth.service.ts:247–253` vs `283–289`; `refresh-token.service.ts:33–36, 71–82`                       | `detectReplay` and `markUsed` are separate steps; two concurrent requests carrying the same valid token can both pass detection before either records usage, yielding two live token pairs (old jti is blacklisted afterward, but both new pairs stand). Cross-instance concurrency widens the window since the in-memory map is per-process. **Fix:** make redemption atomic (unique constraint on `REFRESH_USED` jti + transactional insert-before-issue, or Redis `SET NX`).    |
| SEC-005 | Low      | Timing-based username enumeration on login                       | `auth.service.ts:150–156, 182`                                                                        | `bcrypt.compare` runs only when the user exists; unknown emails return measurably faster despite identical error text. **Fix:** perform a dummy comparison against a static hash when the user is absent.                                                                                                                                                                                                                                                                          |
| SEC-006 | Low      | Blacklist writes swallow all DB errors                           | `token-blacklist.service.ts:16–18`                                                                    | The catch treats _every_ insert failure as "already blacklisted," including transient DB outages — a failed logout/rotation blacklist would go unnoticed. **Fix:** distinguish unique-constraint violations from other errors; alert/metric on unexpected failures.                                                                                                                                                                                                                |
| SEC-007 | Low      | Blacklist TTL hardcoded, decoupled from refresh TTL              | `token-blacklist.service.ts:11` vs `env.config.ts:25`                                                 | Entries expire at a fixed 7 d while `JWT_REFRESH_TOKEN_EXPIRES_IN` is operator-configurable; raising refresh TTL beyond 7 d could purge jtis while still cryptographically valid. Impact is bounded — the refresh path independently re-checks session state (`auth.service.ts:234–245`) and permanent `REFRESH_USED` rows (`refresh-token.service.ts:71–82`) — but access-token jtis rely solely on this table. **Fix:** derive blacklist TTL from the configured refresh expiry. |
| SEC-008 | Low      | VAPID private key committed as dev default                       | `env.config.ts:57–62`                                                                                 | A private web-push key ships in source as the non-production default (production requires override, but the material persists in VCS history and matches the public key at `env.config.ts:55`). **Fix:** rotate the keypair and remove the private default from source (generate ephemeral dev keys).                                                                                                                                                                              |
| SEC-009 | Low      | CSP allows inline styles                                         | `main.ts:55`                                                                                          | `styleSrc 'self' 'unsafe-inline'` weakens style-injection defenses; scripts remain locked to `'self'`. **Fix:** move to nonce/hash-based styles if framework permits.                                                                                                                                                                                                                                                                                                              |
| SEC-010 | Info     | Per-route throttle values not driven by env knobs                | `auth.controller.ts:54,65,84,116,131,148,172` vs `env.config.ts:30–35`                                | Decorators hardcode limits duplicating `AUTH_*_LIMIT/WINDOW` settings, so runtime tuning won't affect these endpoints (relevant again once SEC-001 is fixed).                                                                                                                                                                                                                                                                                                                      |
| SEC-011 | Info     | Per-process caches in multi-replica deployments                  | `jwt.strategy.ts:10–12`; `refresh-token.service.ts:10–11`                                             | The 60 s user cache and replay map are per-instance; correctness across replicas relies on the DB-backed blacklist/session checks (which do cover the core paths). Cache invalidation events (`jwt.strategy.ts:30–32`) are likewise local.                                                                                                                                                                                                                                         |
| SEC-012 | Info     | No concurrent-session cap; uneven throttle coverage              | `session.service.ts:34–57`; `auth.controller.ts:156–166`                                              | Users may open unlimited sessions, and `DELETE /sessions/:id` carries no endpoint throttle (global limit would apply post-SEC-001). Consider capping active sessions per user.                                                                                                                                                                                                                                                                                                     |
| SEC-013 | Info     | Missing length bound on refresh token input                      | `refresh.dto.ts:4–8`                                                                                  | Arbitrary-size strings reach JWT verification (`auth.service.ts:219`) before failing; bounded in practice by body-parser limits and the (future) refresh throttle. Add `@MaxLength`.                                                                                                                                                                                                                                                                                               |
| SEC-014 | Info     | Duplicate stale source tree                                      | `backend/src/src/**` (e.g., `src/src/modules/auth/csrf/csrf.guard.ts`)                                | A nested copy of parts of `src/` exists alongside the canonical tree; stale security-code copies create review/drift hazards. Recommend deletion.                                                                                                                                                                                                                                                                                                                                  |

### Positive controls confirmed (not exhaustive)

- Dual-secret JWT separation with pinned HS256 — `auth.service.ts:515–522`, `jwt.strategy.ts:27`
- Rotation + cross-IP replay revocation with theft-framed auditing — `auth.service.ts:291`, `refresh-token.service.ts:120`
- Refresh tokens stored only as SHA-256 hashes — `session.service.ts:30–32`
- Self-registration role allow-list + atomic invite consumption — `auth.service.ts:59–62, 66–87`
- Timing-safe, fixed-length CSRF comparison — `csrf.service.ts:12–20`
- Production startup refusal of weak secrets and localhost frontend — `env.config.ts:79–105`
- Strict CSP (no inline scripts), DENY framing, prod-only HSTS/preload — `main.ts:49–76`
- Progressive lockout with admin-controlled unlock and full audit trail — `auth-attempt.service.ts:124–135`, `auth.service.ts:416–431`

### Prioritized remediation order

1. **SEC-001** — bind `ThrottlerGuard` (one-line fix, restores intended posture).
2. **SEC-003 / SEC-004** — harden refresh replay handling (atomic redemption; tighten same-IP rule).
3. **SEC-002** — decide on access-token↔session coupling strategy.
4. Low/Info items as routine hardening work.
