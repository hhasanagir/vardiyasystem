# Release Gate Matrix

Source of truth for the VardiyaOS release gates.

- **Snapshot commit:** `7e720af` (`fix(backend): document the encryption master key in env.example`)
- **Measured:** 2026-10-04
- **Host:** Windows, PowerShell 5.1, Node `v22.14.0`, npm `9.9.4`, Docker engine `29.4.0`, Compose `v5.1.2`
- **CI surface:** `.github/workflows/pr-validation.yml`, 13 jobs, triggered on every PR to `main`/`develop`
- **Companion document:** `release-candidate-remediation-report.md` (history of the remediation work)

Every result below was produced by running the command, not by reading it. Four CI defects were
found by doing that; all four are configuration faults that no amount of local green can reveal,
because they live in the workflow's own environment and job graph.

The matrix tables carry `<!-- prettier-ignore -->`. Prettier otherwise pads every column to the
longest cell, which turns each row into a 500-character line and makes the table impossible to
edit or diff. Every other part of this file is prettier-formatted.

## Legend

| Term              | Meaning                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Authoritative** | The environment whose result decides the release. `local = CI` means the gate is hermetic and both environments must agree. |
| **BLOCKED**       | Cannot be evaluated in the authoritative environment. Never a synonym for "skipped".                                        |
| **Advisory**      | Runs but cannot fail the release, by construction.                                                                          |
| **Proven**        | Failure reproduced locally from the same inputs CI uses.                                                                    |

## Matrix

<!-- prettier-ignore -->
| # | Gate | Command | Result | CI job | Authoritative | Failure reason | Remediation |
|---|---|---|---|---|---|---|---|
| 1 | Backend typecheck | `npm run typecheck --prefix backend` (`tsc --noEmit`) | **PASS** | `lint-typecheck` | local = CI | — | **DONE** (`daaf848`) |
| 2 | Frontend typecheck | `npm run typecheck --prefix frontend` (app + spec projects) | **PASS** | `lint-typecheck` | local = CI | — | **DONE** (`7fae115`; it used to pass while checking zero files) |
| 3 | Backend lint | `npm run lint --prefix backend` (`node scripts/lint-gate.mjs`) | **PASS** — 0 errors, 0 warnings | `lint-typecheck` | local = CI | — | **DONE** |
| 4 | Frontend lint | `npm run lint --prefix frontend` (`eslint .`) | **PASS** — 0 errors, **379 warnings** | `lint-typecheck` | local = CI (exits 0: warnings are `warn` level) | — | **OPEN (backlog, deliberate)** — 208 `no-explicit-any`, 170 `no-unused-vars`, 1 `no-console` |
| 5 | Backend unit tests | `npm run test --prefix backend` (`vitest run`) | **PASS** — 553/553, 43 files, 42.7s | `unit-tests` | local = CI | — | **DONE** (`8d1b724`) |
| 6 | Frontend unit tests | `npm run test --prefix frontend` (`ng test`) | **PASS** — 72/72, 8 files, 28.0s | `unit-tests` | local = CI | Includes the only integration-style specs in the repo: `device-api.integration.spec.ts`, `schedule-api.integration.spec.ts` | **DONE** (`2445ad9`) |
| 7 | Prisma client generation | `npx prisma generate` | **PASS** — exit 0 even with only `DATABASE_URL` | 6 jobs | local = CI | — | **NONE REQUIRED** |
| 8 | Prisma schema validation | `npx prisma validate` | **PASS local / FAIL in CI** | `unit-tests` | **CI** | **Proven defect D2.** `schema.prisma` reads `env("DATABASE_DIRECT_URL")`, defined **nowhere** in the workflow `env:` block or any step. The step supplies only `DATABASE_URL` (L95-100), so `prisma validate` exits 1 with `P1012 Environment variable not found: DATABASE_DIRECT_URL`. The comment at L22-23 generalises a true fact about `generate` to `validate`. | **OPEN** — add `DATABASE_DIRECT_URL` to the workflow `env:` |
| 9 | Backend build | `npm run build --prefix backend` | **PASS** | `build-check` | local = CI | — | **NONE REQUIRED** |
| 10 | Frontend build | `npm run build --prefix frontend` (`ng build`) | **PASS** — 0 errors, 0 warnings, initial 619.23 kB / 150.78 kB lazy | `build-check` | local = CI | — | **DONE** (`81c5bae`: NG8107 cleared, budgets recalibrated) |
| 11 | Backend E2E | `npm run test:e2e --prefix backend` | **FAIL** — 12 failed, 1 passed, 23 skipped (36); 8/8 files; 381.5s | `backend-e2e` | **CI** | Three causes, see [Backend E2E](#backend-e2e). Includes **proven defect D1**. | **PARTIAL** — key documented (`7e720af`); CI env, seed/guard contract, boot time **OPEN**. No test was modified or bypassed |
| 12 | Browser acceptance | `npm test --prefix e2e` (`playwright test`) | **FAIL** — 0/57, all files | `browser-acceptance` | **CI** | **Proven defects D1 + D3.** `e2e/playwright.config.ts` **does not exist anywhere in the repo**, so Playwright runs with defaults: no `baseURL`, no `webServer`. Every spec uses relative URLs (`page.goto("/login")`), so all 57 fail on `Cannot navigate to invalid URL`. Nothing starts port 3000 or 4200, though the job comment claims `playwright.config.ts` starts both. The `E2E_BASE_URL`/`E2E_API_URL` env passed at L368-369 is read by nothing. | **OPEN** — write the config, or delete the job |
| 13 | Security invariant tests | `npx vitest run src/modules/schedules/__tests__/security-invariants.spec.ts` | **PASS** | `security-tests` | local = CI | — | **NONE REQUIRED** |
| 14 | Dependency audit (PR gate) | `npx --yes audit-ci@6 --critical --report-type summary`, per workspace | **PASS** — 0 critical | `security-scan` | **CI** | — | **NONE REQUIRED** at this threshold. See [Dependency audit](#dependency-audit) for what it does not cover |
| 15 | Secret scanning (PR gate) | `gitleaks/gitleaks-action@v2` + tracked-material shell checks | **PARTIAL** | `security-scan` | **CI** | No local failure. The tracked-material half is proven by preflight ("No tracked secret material"). `gitleaks` is **not installable locally**, so its half is unverified here; the action also needs a GitHub token and full history. | **OPEN** — unverified locally |
| 16 | Docker image build | `docker build` via buildx, `push: false` | **PASS** — backend 175.4s, frontend 119.4s, both exit 0 | `docker-build-validation` | local = CI | — | **NONE REQUIRED** |
| 17 | Docker Compose validation | `docker compose config -q` on both files, `:latest` assert, preflight, preflight suite, hook suite | **FAIL** | `docker-compose-validation` | **CI** | **Proven defect D4.** The job's own placeholder `.env` (L522-529) omits three variables `docker-compose.prod.yml` requires: `FRONTEND_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. It also never creates `backend/.env`, which `docker-compose.yml` requires via `env_file` (L46-47). Both `config -q` steps exit 1. The `:latest` assert and preflight steps pass. | **OPEN** — add the 3 variables, create `backend/.env` from `.env.example` |
| 18 | Manifest render (Kustomize + Helm) | `bash scripts/release-dry-run.sh --ci` | **BLOCKED locally / never reached in CI** | `manifest-render` | **CI** | Upstream: `needs: [docker-compose-validation]`, which fails (D4), so this job never executes. Also not runnable on this host: `bash` resolves to the WSL launcher stub with no distro, and `helm`, `kustomize`, `actionlint`, `kubeconform` are absent. | **OPEN** — unverified end to end |
| 19 | Coverage | `npm run test:coverage` + Codecov | **ADVISORY — thresholds not met** | `coverage` | **neither** | `continue-on-error: true` (L130). The workflow comment states the backend vitest config carries 80% thresholds this tree does not meet, and the frontend has no coverage provider installed. | **OPEN** — documented as intentional non-gating |
| 20 | Release preflight | `node scripts/release-preflight.mjs` | **PASS** — 18/18, with and without `SKIP_ENVIRONMENT_CHECKS=1` | `docker-compose-validation` | local = CI | — | **DONE** |
| 21 | Preflight self-test | `node --test scripts/release-preflight.test.mjs` | **PASS** — 32/32 | `docker-compose-validation` | local = CI | — | **DONE** |
| 22 | Pre-commit gate suite | `node --test scripts/lint-staged-typecheck.test.mjs` | **PASS** — 14/14 | `docker-compose-validation` | local = CI | — | **DONE** (`dfcf0c2` root-cause fix) |
| 23 | lint-staged / pre-commit | `.husky/pre-commit` → `npx lint-staged` | **PASS** — real commits verified | local + CI | local = CI | — | **DONE** |
| 24 | Commitlint | `npx commitlint --from 7c9eb76 --to HEAD` | **PASS** for every new commit | local (`.husky/commit-msg`) | local = CI | Full range `--from eb7a6db` exits 1 | **PARTIAL by design** — see [Commitlint scope](#commitlint-scope) |
| 25 | Backend integration tier | — | **NOT IMPLEMENTED** | — | n/a | The tier does not exist. `backend/vitest.config.ts` includes only `src/**/*.spec.ts`; every backend spec is mock-based unit scope. | **OPEN** — declare the absence intentional, or add the tier |
| 26 | Migration drift validation | — | **NOT IMPLEMENTED** | — | n/a | Nothing proves `schema.prisma` and `prisma/migrations/` agree. No `prisma migrate diff` exists in the repo; `migrate status` appears only in `backend/scripts/migrate-baseline.{sh,ps1}`, which are operator utilities. Migrations are *executed* in CI (`migrate deploy`) and by the Helm `pre-install,pre-upgrade` job, never *validated*. | **OPEN** |
| 27 | Weekly security scan | `npx audit-ci --high ... \|\| true`, `npm-check-updates \|\| true`, trufflehog, SBOM | **ADVISORY** | `security-scan.yml` (cron + manual) | **neither** | Both audit steps end in `\|\| true`, and the outdated-package step is additionally `continue-on-error`. Scheduled weekly, so it never blocks a PR. | **OPEN** — separate from the blocking `--critical` PR gate |
| 28 | Backend container runtime | `docker run` + Docker healthcheck + `GET /api/v1/health/live` | **PASS** — healthy, HTTP 200 `{"status":"ok"}`, `uid=100(vardiya)` | none | **neither** | — | **NONE REQUIRED**. No CI gate runs the image; see gate 32 |
| 29 | Frontend container runtime | `docker run` + HTTP content assertion | **FAIL** — serves `Welcome to nginx!` (615 B) | none | **neither** | **Proven defect D5.** The Angular build emits `dist/frontend/browser/`, so `COPY /app/dist/frontend` lands the app in `html/browser/` and the base image's own `index.html` survives. nginx `root` points at `html/`, so the app is never served. | **OPEN** — copy `dist/frontend/browser`, and assert on content, not just status |
| 30 | Non-root execution | `docker exec <c> id` | **PASS** — `uid=100(vardiya)` in both | none | local | — | **NONE REQUIRED** |
| 31 | Secret hygiene in images | filesystem scan, `Config.Env`, `docker history` | **PASS** — no `.env`, no secret files, no secret-like env, nothing baked into history | none | local | — | **NONE REQUIRED** |
| 32 | Image content verification | — | **NOT IMPLEMENTED** | — | n/a | `docker-build-validation` builds with `push: false` and never runs the image, so D5 is structurally invisible to CI. A build-only gate cannot detect a wrong-content image. | **OPEN** — add a run-and-assert step |

### Summary

<!-- prettier-ignore -->
| Result | Gates |
|---|---|
| PASS | 1, 2, 3, 5, 6, 7, 9, 10, 13, 14, 16, 20, 21, 22, 23, 28, 30, 31 |
| PASS with caveat | 4 (379 warnings), 15 (half unverified), 24 (full history fails) |
| FAIL | 8, 11, 12, 17, 29 |
| ADVISORY | 19, 27 |
| BLOCKED | 18 |
| NOT IMPLEMENTED | 25, 26, 32 |

**Release recommendation: BLOCKED.**

Five gates are red. Four of them (D1-D4) are CI configuration defects rather than application
defects. Gates 1-7, 9-10 and 13-14 are genuinely green in both environments, which is why a
green-looking pipeline was possible: the failures live entirely in the environment the workflow
supplies to its own jobs. D5 is different in kind — a real product defect that survived because
no gate ever runs the image it just built.

| ID  | Defect                                                    | Impact                                                          |
| --- | --------------------------------------------------------- | --------------------------------------------------------------- |
| D1  | `ENCRYPTION_MASTER_KEY` absent from all 13 jobs           | `backend-e2e` and `browser-acceptance` cannot boot the Nest API |
| D2  | `DATABASE_DIRECT_URL` absent from the workflow `env:`     | `Validate Prisma schema` exits 1 (`P1012`)                      |
| D3  | `e2e/playwright.config.ts` does not exist                 | `browser-acceptance` fails all 57 tests                         |
| D4  | `docker-compose-validation` placeholder `.env` incomplete | Both `config -q` steps fail; `manifest-render` never runs       |
| D5  | Frontend image serves the nginx base-image page           | The shipped SPA is never served; image still reports healthy    |

Helm and Kubernetes validation added eight further defects, D6-D13, all recorded with root cause
and remediation in the Helm section below. The two that would corrupt production data if shipped:

| ID  | Defect                                                       | Impact                                                                      |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| D6  | Helm path renders no NetworkPolicy, RBAC, quota or SA        | Helm installs lose the isolation `k8s/` enforces                            |
| D7  | `postgres.replicaCount: 2` with no replication in production | Two writable primaries behind one headless Service; dataset splits silently |

D8-D13 are missing probes, missing resource bounds, absent container hardening, the missing
`values/dev.yaml`, a deprecated Ingress class annotation, and subcharts that cannot be linted
standalone. None of these are style complaints: D7 alone makes the production database unsafe to
point at real traffic.

## Container validation

Measured by building and then **running** both images locally. No dependency or application code
was changed, nothing was pushed to GHCR, and nothing was deployed to Kubernetes. The backend image
was pointed at the already-running local PostgreSQL (`host.docker.internal:55432`) and Redis
(`:56379`); no migration or seed was executed.

### Image inventory

<!-- prettier-ignore -->
| | Backend | Frontend |
|---|---|---|
| Compressed size | **157 MB** | **22.9 MB** |
| Reported by `docker images` | 785 MB | 83.2 MB |
| RootFS layers | 10 | 12 |
| Largest layer | **`node_modules` 460 MB** uncompressed (73%) | nginx base 38.7 MB |
| Exposed port | `3000/tcp` | `80/tcp` |
| Entrypoint / Cmd | `/sbin/tini --` / `node dist/src/main` | `/docker-entrypoint.sh` / `nginx -g daemon off;` |
| Healthcheck | `curl -sf .../api/v1/health/live`, 30s/10s, 3 retries, 30s start | `wget --spider http://localhost:80/`, 30s/3s, 3 retries, 5s start |
| Runtime user | `vardiya` (`uid=100`) confirmed by `exec id` | `vardiya` (`uid=100`) confirmed by `exec id` |

The backend's 460 MB uncompressed `node_modules` dominates the image and is the single biggest
lever on pull time and registry storage.

`NODE_ENV=production` is baked into the backend image, so the Joi `when('NODE_ENV', { is:
'production' })` branches activate on container start. The container refuses to boot unless
`COOKIE_SECRET` (>=32 chars, not `dev-`-prefixed), `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are
all supplied, in addition to the 32-character JWT secrets. That is correct behaviour, but it
means the required variable set is larger than the workflow provides.

### Secret handling — clean

| Check                                   | Backend | Frontend |
| --------------------------------------- | ------- | -------- |
| `.env` or `*secret*` files in the image | none    | none     |
| Secret-like values in `Config.Env`      | none    | none     |
| Credentials baked into `docker history` | none    | none     |

All secrets were supplied at `docker run` time via `-e`; nothing sensitive is baked into either
layer set.

### Defect D5 — the frontend image serves the wrong content

The build succeeds, the container starts, and the healthcheck reports **healthy**. The image still
serves the nginx welcome page instead of the application.

Angular's application builder emits its output to `dist/frontend/browser/`. The Dockerfile copies
the parent:

```
COPY --from=builder /app/dist/frontend /usr/share/nginx/html
```

`COPY` merges directories rather than replacing them, so the result is:

```
/usr/share/nginx/html/index.html          615 B   Apr 16 2025   <- base image, "Welcome to nginx!"
/usr/share/nginx/html/50x.html             497 B   Apr 16 2025   <- base image
/usr/share/nginx/html/browser/index.html  34250 B  Oct  4 2026   <- the real app
```

nginx `root /usr/share/nginx/html` therefore resolves `/` to the stale base-image `index.html`.
The real document — `<title>VardiyaOS — Radyoloji Vardiya Yönetim Sistemi</title>`, `lang="tr"` —
sits one directory too deep and is never served.

The healthcheck is `wget --spider http://localhost:80/`, which returns 200 for the welcome page,
so it passes. **No gate in the repository can catch this**: `docker-build-validation` builds with
`push: false` and never starts the image. A build-only gate cannot detect an image that builds
cleanly and serves the wrong bytes.

The fix is one line — copy `dist/frontend/browser` — but a content assertion belongs with it, or
the same class of bug returns the next time the output layout changes.

### Smoke test commands

```powershell
# backend: healthy, non-root, health endpoint 200
docker run -d --name vardiya-smoke-backend --network vardiya-smoke-net --network-alias backend `
  -p 13000:3000 `
  -e ENCRYPTION_MASTER_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" `
  -e DATABASE_URL="postgresql://postgres:postgres@host.docker.internal:55432/vardiyasystem_e2e?schema=public" `
  -e DATABASE_DIRECT_URL="postgresql://postgres:postgres@host.docker.internal:55432/vardiyasystem_e2e?schema=public" `
  -e REDIS_URL="redis://host.docker.internal:56379" `
  -e JWT_ACCESS_TOKEN_SECRET="smoke-access-secret-32-characters-min" `
  -e JWT_REFRESH_TOKEN_SECRET="smoke-refresh-secret-32-characters-min" `
  -e COOKIE_SECRET="smoke-cookie-secret-strong-32chars-value" `
  -e VAPID_PUBLIC_KEY="<dev default from env.config.ts>" `
  -e VAPID_PRIVATE_KEY="<dev default from env.config.ts>" `
  -e FRONTEND_URL="https://vardiya.example.invalid" `
  vardiya-gate/backend:local

# frontend needs a resolvable "backend" upstream, so join it to the same network
docker run -d --name vardiya-smoke-frontend --network vardiya-smoke-net -p 13080:80 `
  vardiya-gate/frontend:local

Invoke-WebRequest http://localhost:13080/ -UseBasicParsing   # returns the nginx page, not the app
```

The VAPID values used are the development defaults already present in
`backend/src/config/env.config.ts`. They are not credentials, but they are not what production
should use either.

## Backend E2E

Measured against real infrastructure, not a stub. Nothing was bypassed and no test file was edited.

The local environment turned out **not** to be the limitation:

| Dependency    | Local state                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| PostgreSQL    | `vardiya-rc-postgres` (`postgres:15-alpine`) up on host port **55432**           |
| Redis         | `vardiya-rc-redis` (`redis:7-alpine`) up on host port **56379**, `PING` → `PONG` |
| Test database | `vardiyasystem_e2e`, 98 tables                                                   |
| Migrations    | **23/23 applied, 0 failed or rolled back** — nothing to run                      |
| Seed          | 4 users, 6 units, 30 personnel, 10 roles, `admin@hospital.com` present           |
| Docker        | Available; not required                                                          |

Reproduce with:

```powershell
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:55432/vardiyasystem_e2e?schema=public"
$env:DATABASE_DIRECT_URL = $env:DATABASE_URL
$env:REDIS_URL = "redis://localhost:56379"
$env:JWT_ACCESS_TOKEN_SECRET = "local-e2e-access-secret"
$env:JWT_REFRESH_TOKEN_SECRET = "local-e2e-refresh-secret"
$env:ENCRYPTION_MASTER_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
$env:NODE_ENV = "test"
npm run test:e2e --prefix backend
```

### Cause 1 — `ENCRYPTION_MASTER_KEY` is provided nowhere (defect D1)

`EncryptionService` reads it in its constructor and throws
`ENCRYPTION_MASTER_KEY must be at least 64 hex characters (256 bits)` when absent
(`backend/src/modules/encryption/encryption.service.ts:28`). There is no fallback and no
test-mode exemption, so any entrypoint that builds `AppModule` fails.

The variable exists only on production paths: the Helm `deployment.yaml` (L83, sourced from
`/run/secrets/encryption_master_key`) and `docker-compose.prod.yml` (L146). It was absent from
`backend/.env.example`, from dev `docker-compose.yml`, and from **all 13 CI jobs**.

Without it every spec file fails at boot. Adding the key locally moved the run from 100.4s of
immediate failures to 381.5s with real HTTP traffic — which is how the remaining causes became
visible at all.

**Status:** documented in `backend/.env.example` (`7e720af`). Supplying it in CI is **OPEN**.

### Cause 2 — 10 x HTTP 403 where 201 is expected

`POST /schedules` and its `/submit`, `/approve`, `/publish`, `/revision`, `/rollback`
transitions return `403 Forbidden`, plus the creation step in the `beforeAll` of `authorization`,
`my-shifts`, `schedule-alerts` and `schedule-notifications`. The seeded admin carries the role
`system_admin` and the guards reject it.

CI runs the same seed against the same code, so this reproduces there. Fixing it requires a
decision about the intended role and permission mapping; it is not an environment problem.

### Cause 3 — 5 x `Hook timed out in 30000ms`

`beforeAll` / `afterAll` in `auth`, `personnel-smoke` and `schedule-export` exceed the
`hookTimeout: 30000` in `backend/e2e/vitest.config.ts`. The captured run shows the timeout but
retains too little server log to identify which startup step stalls, so the stall point is
**unidentified rather than diagnosed**.

This may be local-specific (Windows plus Docker Desktop overhead), but that is **not proven** —
it has never been measured on CI. Treat it as unmeasured, not as a local defect.

### Not claimed

`auth.e2e-spec.ts:39` asserts the role is `super_admin` while the seed assigns `system_admin`.
That assertion never executed, because the auth suite fails at hook level first. It is an
unverified hypothesis, is deliberately not counted as a finding, and must not be "fixed" by
editing the spec until causes 1-3 are resolved.

## Dependency audit

Two different gates with two different thresholds, and the distinction matters:

<!-- prettier-ignore -->
| Gate | Command | Threshold | Enforcing? |
|---|---|---|---|
| PR (`security-scan`) | `npx --yes audit-ci@6 --critical` | critical only | **Yes** — fails the job |
| Weekly (`security-scan.yml`) | `npx audit-ci --high ... \|\| true` | high | **No** — `\|\| true` |

`npm audit --audit-level=high` exits 1 in both workspaces. The count is not theoretical:

<!-- prettier-ignore -->
| Workspace | Total | Low | Moderate | **High** | Critical |
|---|---|---|---|---|---|
| `backend` | 66 | 4 | 33 | **29** | 0 |
| `frontend` | 43 | 5 | 15 | **23** | 0 |

The PR gate passes legitimately, because there are 0 critical advisories. Earlier reporting
described this as "audit critical 0", which is true but misleading — it reads as a clean result
while 52 high-severity advisories sit open and nothing enforces them. Raising the PR threshold to
`--high`, or fixing the advisories, is **OPEN**.

## Commitlint scope

| Range                                     | Result                              |
| ----------------------------------------- | ----------------------------------- |
| `npx commitlint --from 7c9eb76 --to HEAD` | exit 0                              |
| `npx commitlint --from eb7a6db --to HEAD` | exit 1 — 3 errors on `7c9eb76` only |

`7c9eb76` carries a UTF-8 BOM at the start of its commit message, verified at byte level from the
raw commit object. That single commit is the whole difference. It stays: correcting it would
rewrite its SHA and all 21 commits above it, no automated path lints a range containing it, and
`.husky/commit-msg` already rejects a BOM so it cannot recur.

## Helm and Kubernetes validation

Container validation is **not** green — defect D5 still stands — so this pass is read-only. Nothing
was deployed, no migration was executed, nothing was pushed to GHCR. Every command below is
`lint`/`template`/`kustomize`/schema validation against a local render.

Tools: `helm` v4.3.0 (WinGet), `kubeconform` v0.8.0 (downloaded to a temp dir, not added to the
repo), `kubectl` with built-in kustomize. No cluster was reachable, so `kubectl --dry-run=client
--validate=true` fails on `localhost:8080` OpenAPI discovery. That is a missing cluster, not a
manifest defect; `kubeconform` covers the same ground offline.

### Render and schema validation

<!-- prettier-ignore -->
| Environment | Command | Result |
| --- | --- | --- |
| default | `helm lint infra/helm/vardiya-platform` | exit 0 |
| staging | `helm lint ... -f values/staging.yaml` | exit 0 |
| production | `helm lint ... -f values/production.yaml` | exit 0 |
| default | `helm template` | 44 manifests |
| staging | `helm template -f values/staging.yaml` | 44 manifests |
| production | `helm template -f values/production.yaml` | 44 manifests |
| all three | `kubeconform -strict -kubernetes-version 1.31.0` | 44 valid, 0 invalid, 0 errors |
| `k8s/` | `kubectl kustomize k8s` → `kubeconform` | 35 valid, 0 invalid |
| sealed | `kubectl kustomize infra/sealed-secrets` → `kubeconform` | 4 valid, 0 invalid |

Without a CRD catalog `kubeconform` reports 3 schema-not-found errors (`Certificate`, 2×
`ServiceMonitor`). Those are first-party CRDs the offline binary cannot know; with
`https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json`
all 44 validate. Not a chart defect.

### Reference integrity - clean

Every cross-reference in the production render resolves:

<!-- prettier-ignore -->
| Reference | Count | Result |
| --- | --- | --- |
| `configMapKeyRef` / volume `configMap` | 6 | all resolve to the 6 rendered ConfigMaps, 0 orphans |
| `secretKeyRef` / volume `secret` | 4 | resolve to the 4 `infra/sealed-secrets` SealedSecrets |
| `claimName` → PVC | 5 | all resolve |
| HPA `scaleTargetRef` | 2 | backend, frontend |
| PDB `selector` | 2 | backend, frontend |
| ServiceMonitor `selector` | 2 | backend, `redis` |
| Ingress backend → Service:port | 4 | all exist and ports match |

No plaintext secret is rendered. An automated scan flagged 17 lines, and all 17 are false
positives: they are the `key:` field **inside** `secretKeyRef`, not values.

`helm template` also emits the pgbouncer image as `"bitnamilegacy/pgbouncer:..."` with literal
quotes from the template. Valid YAML, no effect.

### Defect D6 - the Helm path has no network policy, RBAC, quota or ServiceAccount

The repo ships two deployment paths and they are not equivalent:

<!-- prettier-ignore -->
| Resource | `helm/` render | `k8s/` kustomize |
| --- | --- | --- |
| NetworkPolicy | **0** | 8 |
| ClusterRole / ClusterRoleBinding | **0** | 1 / 1 |
| Role / RoleBinding | **0** | 1 / 1 |
| ServiceAccount | **0** | 2 |
| ResourceQuota | **0** | 1 |
| LimitRange | **0** | 1 |
| Namespace | **0** | 1 |

Every workload in the Helm render runs as `serviceAccountName: (default)` and no ServiceAccount
object is created. The Helm path therefore deploys with none of the isolation the kustomize path
enforces.

**Root cause:** the chart covers application workloads only; the namespace, RBAC and
NetworkPolicy layers exist solely under `k8s/` and were never ported into
`infra/helm/vardiya-platform`.

**Remediation:** add ServiceAccount objects and `serviceAccountName` to every chart workload;
either port the 8 NetworkPolicies and the quota/LimitRange into the chart or make the chart
consume a pre-created namespace and record which path is authoritative. Until then exactly one
path must be declared the source of truth, because a production install through Helm silently
loses all network isolation.

### Defect D7 - production Postgres scales to 2 replicas with no replication

`values/production.yaml` sets `postgres.replicaCount: 2`. The rendered StatefulSet has **one**
`volumeClaimTemplate` (`postgres`, 50Gi, `gp3`), no replication configuration of any kind, and its
service is headless (`clusterIP: None`) selecting `app.kubernetes.io/component: postgres`. Staging
and default are `replicas: 1`.

`charts/postgres/templates/statefulset.yaml` contains no `replication`, `primary`, `standby`,
`wal_level`, `master`, `repmgr`, `patroni` or `pg_basebackup` directive. So the second replica is
not a hot standby — it is a second independent, writable PostgreSQL instance that receives its own
50Gi volume, and the headless service resolves both pod IPs. A client connecting to
`vardiya-postgres` lands on whichever pod DNS returns first and can write to either, splitting the
dataset with no replication and no conflict detection.

**Root cause:** `replicaCount` was raised for capacity, but the subchart is a single-instance
Postgres; the replica count is being used as a capacity knob where the chart only supports
scale-out via real replication.

**Remediation:** set `postgres.replicaCount: 1` in `values/production.yaml` and scale vertically
(bigger `resources`, `storage.size`, `pgbouncer`) until a streaming or Patroni-based subchart is in
place. If replication is genuinely wanted, replace the subchart with one that implements it and
verify failover before re-enabling a replica count above 1.

### Defect D8 - probes missing on the whole monitoring stack

Identical in all three environments, so this is chart-level, not environment drift:

<!-- prettier-ignore -->
| Workload | Missing |
| --- | --- |
| `vardiya-alertmanager` | liveness, readiness |
| `vardiya-grafana` | liveness, readiness |
| `vardiya-loki` | liveness, readiness |
| `vardiya-prometheus` | liveness, readiness |
| `vardiya-tempo` | liveness, readiness |
| `vardiya-redis-sentinel` | liveness |

`vardiya-backend`, `vardiya-frontend`, `vardiya-pgbouncer`, `vardiya-pgbouncer-exporter`,
`vardiya-postgres` and `vardiya-redis` all have complete probes.

**Root cause:** the monitoring subcharts were contributed without probe definitions, and nothing in
lint or `kubeconform` requires them.

**Remediation:** add liveness and readiness probes per component (`/-/ready` and `/-/healthy` for
Prometheus, `/api/v1/status/config` for Alertmanager, `/ready` for Loki, `/api/health` for Tempo,
`/ready` for Grafana) and a liveness probe for sentinel. Note these subcharts are not hardened at
all — see D10.

### Defect D9 - resource requests and limits missing

<!-- prettier-ignore -->
| Workload | Missing |
| --- | --- |
| `Deployment/vardiya-redis-sentinel` | requests, limits |
| `CronJob/vardiya-postgres-backup` | requests, limits |

The other 11 workloads all declare both. This matters more than usual here because the backup
CronJob is the data-durability path: an unbounded backup competes with production workloads and
can be evicted or OOM-killed mid-`pg_dump`.

**Root cause:** values were not defined for these two workloads; no chart-level required-field
check exists.

**Remediation:** give sentinel and the backup CronJob explicit `resources.requests`/`limits`, and
add a Helm-unittest or `kubeconform`-adjacent policy check so a future subchart cannot ship
without them.

### Defect D10 - container hardening is absent outside backend and frontend

Across all 12 workloads and all three environments:

<!-- prettier-ignore -->
| Control | Result |
| --- | --- |
| `allowPrivilegeEscalation: false` | **0 of 12** |
| `readOnlyRootFilesystem` | **0 of 12** |
| `capabilities.drop: [ALL]` | **0 of 12** |
| `runAsNonRoot` | 3 of 12 — only backend, frontend, migrate |

Only `vardiya-backend`, `vardiya-frontend` and the migrate Job set
`runAsNonRoot` + `runAsUser: 100`. The monitoring stack, Postgres, PgBouncer, Redis and the backup
CronJob set no pod-level security context at all — Prometheus alone sets `runAsUser: 65534`.
The containers verified earlier in the image stage do run as non-root, but the manifests do not
require it, so a tag change can silently reintroduce root.

**Root cause:** the app charts were hardened from the container side; the platform subcharts
vendored from upstream were adopted with their defaults.

**Remediation:** set a pod-level `securityContext` (`runAsNonRoot: true`, `runAsUser`, `fsGroup`,
`seccompProfile: RuntimeDefault`) and a container-level context
(`allowPrivilegeEscalation: false`, `capabilities.drop: [ALL]`, `readOnlyRootFilesystem: true` where
the component tolerates it) across every subchart. Mirror the pattern already used in
`charts/backend` and `charts/frontend`.

### Defect D11 - no dev values, and dev is neither represented nor tested

The chart ships `values.yaml` plus `values/staging.yaml` and `values/production.yaml`. There is no
`values/dev.yaml`, and `k8s/` has no dev overlay either. So "dev" is only the un-overridden
default, which carries `vardiya.example.com` and `replicas: 2` — production-shaped defaults that
are still placeholders.

Staging and production do diverge meaningfully, so the override mechanism works: `0 */2 * * *`
backup schedule, `replicas` 2→3 backend / 3→2 PgBouncer / 1→2 Postgres / 3→5 Redis, HPA max
10→4, storage 50Gi, retention 60.

**Root cause:** dev was treated as "the default" and never given its own reviewed overlay.

**Remediation:** add `values/dev.yaml` with `replicas: 1`, single-instance Postgres, a local
ingress host and disabled TLS, and include dev in the lint/template/kubeconform matrix so all four
environments are validated on every change.

### Defect D12 - Ingress uses the deprecated class annotation

`charts/ingress/templates/ingress.yaml` sets
`kubernetes.io/ingress.class: {{ .Values.className }}` at line 9. Every environment renders
`ingressClassName: undefined`. On a cluster hosting more than one ingress controller the legacy
annotation can route to the wrong controller, and `nginx` ignores `ingressClassName` when the
annotation is present.

**Root cause:** the template predates `spec.ingressClassName`.

**Remediation:** emit `spec.ingressClassName: {{ .Values.ingressClassName }}` and keep the
annotation only if a specific controller still needs it. Rename the values key to match so the
field is discoverable.

### Defect D13 - every subchart fails `helm lint` on its own

`helm lint` on the umbrella passes 3/3, but each of `charts/backend`, `charts/frontend`,
`charts/postgres`, `charts/pgbouncer`, `charts/redis-cluster`, `charts/monitoring` and
`charts/ingress` exits 1. Example: `charts/backend/values.yaml` does not exist, so
`.Values.serviceMonitor.enabled` dereferences nil.

**Root cause:** subcharts have no `values.yaml`, so all values arrive from the umbrella. That is a
legitimate layout, but it means subcharts cannot be linted, documented or consumed independently.

**Remediation:** give each subchart a minimal `values.yaml` with safe defaults (the same values
the umbrella passes down), which makes standalone `helm lint` meaningful and lets a single
subchart be reused. Until then lint the umbrella only and say so in CI, so the failures are not
silently ignored.

### Minor findings, not release blockers

- ServiceMonitor `vardiya-redis` selects **both** `vardiya-redis` and `vardiya-redis-cluster`,
  so Redis metrics are scraped twice. Tighten the selector.
- `helm template` and `k8s/` share 3 images and drift on 9: `frontend`, `postgres`,
  `pgbouncer-exporter`, `grafana`, `loki`, `tempo`, `alertmanager`, `prometheus` exist only in
  Helm. Expected given D6, but it means the two paths cannot be compared image-for-image until one
  is retired.
- All images are tag-pinned and none use `:latest`. Good.

### Retracted during this pass

Recorded so they are not re-raised. Each was a defect hypothesis that verification killed:

- **Plaintext secrets in the render** — false. All 17 hits are `secretKeyRef` `key:` names.
- **ConfigMaps rendered but unreferenced** — false. They are mounted as volumes; the first scan
  only inspected env references.
- **Two Services select the same Redis pods** — false. `vardiya-redis-cluster` is headless
  (`clusterIP: None`) and `vardiya-redis` is a normal ClusterIP. No collision.
- **Backup CronJob writes to an ephemeral path, and `retention` is dead config** — false. It
  mounts PVC `vardiya-postgres-backups` at `/backups`, and `retention` is consumed by
  `find /backups -name "vardiya_backup_*.dump" -mtime +{{ .Values.backup.retention }} -delete`.

### Not evaluated

No cluster existed and none was requested, so these stay unmeasured rather than passing:

- Actual admission, webhook and CRD-version compatibility in a live cluster.
- Storage class `gp3` availability, PVC binding and backup restore.
- SealedSecret decryption, which needs the cluster's cert.
- Whether `helm install` upgrades cleanly, and migration Job ordering against a live database.

## Local environment

| Service       | Endpoint                                  | State                                             |
| ------------- | ----------------------------------------- | ------------------------------------------------- |
| PostgreSQL 15 | `localhost:55432` (`vardiya-rc-postgres`) | up, `vardiyasystem_e2e`, 23/23 migrations, seeded |
| Redis 7       | `localhost:56379` (`vardiya-rc-redis`)    | up, `PING` → `PONG`                               |

`helm` v4.3.0 and `kubeconform` v0.8.0 were installed for the pass above; `kubectl` provides
kustomize. Still absent locally, therefore not evaluable here: `actionlint`, `gitleaks`,
`trufflehog`. `bash` resolves to the WSL launcher stub with no distribution installed, so
`scripts/release-dry-run.sh` still cannot run on this host — the Helm and kustomize steps it wraps
were executed directly instead.
