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

## Legend

| Term              | Meaning                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Authoritative** | The environment whose result decides the release. `local = CI` means the gate is hermetic and both environments must agree. |
| **BLOCKED**       | Cannot be evaluated in the authoritative environment. Never a synonym for "skipped".                                        |
| **Advisory**      | Runs but cannot fail the release, by construction.                                                                          |
| **Proven**        | Failure reproduced locally from the same inputs CI uses.                                                                    |

## Matrix

| #   | Gate                               | Command                                                                                            | Result                                                              | CI job                              | Authoritative                                   | Failure reason                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Remediation                                                                                                                 |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | Backend typecheck                  | `npm run typecheck --prefix backend` (`tsc --noEmit`)                                              | **PASS**                                                            | `lint-typecheck`                    | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE** (`daaf848`)                                                                                                        |
| 2   | Frontend typecheck                 | `npm run typecheck --prefix frontend` (app + spec projects)                                        | **PASS**                                                            | `lint-typecheck`                    | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE** (`7fae115`; it used to pass while checking zero files)                                                             |
| 3   | Backend lint                       | `npm run lint --prefix backend` (`node scripts/lint-gate.mjs`)                                     | **PASS** — 0 errors, 0 warnings                                     | `lint-typecheck`                    | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE**                                                                                                                    |
| 4   | Frontend lint                      | `npm run lint --prefix frontend` (`eslint .`)                                                      | **PASS** — 0 errors, **379 warnings**                               | `lint-typecheck`                    | local = CI (exits 0: warnings are `warn` level) | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **OPEN (backlog, deliberate)** — 208 `no-explicit-any`, 170 `no-unused-vars`, 1 `no-console`                                |
| 5   | Backend unit tests                 | `npm run test --prefix backend` (`vitest run`)                                                     | **PASS** — 553/553, 43 files, 42.7s                                 | `unit-tests`                        | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE** (`8d1b724`)                                                                                                        |
| 6   | Frontend unit tests                | `npm run test --prefix frontend` (`ng test`)                                                       | **PASS** — 72/72, 8 files, 28.0s                                    | `unit-tests`                        | local = CI                                      | Includes the only integration-style specs in the repo: `device-api.integration.spec.ts`, `schedule-api.integration.spec.ts`                                                                                                                                                                                                                                                                                                                                     | **DONE** (`2445ad9`)                                                                                                        |
| 7   | Prisma client generation           | `npx prisma generate`                                                                              | **PASS** — exit 0 even with only `DATABASE_URL`                     | 6 jobs                              | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **NONE REQUIRED**                                                                                                           |
| 8   | Prisma schema validation           | `npx prisma validate`                                                                              | **PASS local / FAIL in CI**                                         | `unit-tests`                        | **CI**                                          | **Proven defect D2.** `schema.prisma` reads `env("DATABASE_DIRECT_URL")`, which is defined **nowhere** in the workflow `env:` block or any step. The step supplies only `DATABASE_URL` (L95–100), so `prisma validate` exits 1 with `P1012 Environment variable not found: DATABASE_DIRECT_URL`. The comment at L22–23 generalises a true fact about `generate` to `validate`.                                                                                  | **OPEN** — add `DATABASE_DIRECT_URL` to the workflow `env:`                                                                 |
| 9   | Backend build                      | `npm run build --prefix backend`                                                                   | **PASS**                                                            | `build-check`                       | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **NONE REQUIRED**                                                                                                           |
| 10  | Frontend build                     | `npm run build --prefix frontend` (`ng build`)                                                     | **PASS** — 0 errors, 0 warnings, initial 619.23 kB / 150.78 kB lazy | `build-check`                       | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE** (`81c5bae`: NG8107 cleared, budgets recalibrated)                                                                  |
| 11  | Backend E2E                        | `npm run test:e2e --prefix backend`                                                                | **FAIL** — 12 failed, 1 passed, 23 skipped (36); 8/8 files; 381.5s  | `backend-e2e`                       | **CI**                                          | Three causes, see [§ Backend E2E](#backend-e2e). Includes **proven defect D1**.                                                                                                                                                                                                                                                                                                                                                                                 | **PARTIAL** — key documented (`7e720af`); CI env, seed/guard contract, boot time **OPEN**. No test was modified or bypassed |
| 12  | Browser acceptance                 | `npm test --prefix e2e` (`playwright test`)                                                        | **FAIL** — 0/57, all files                                          | `browser-acceptance`                | **CI**                                          | **Proven defects D1 + D3.** `e2e/playwright.config.ts` **does not exist anywhere in the repo**, so Playwright runs with defaults: no `baseURL`, no `webServer`. Every spec uses relative URLs (`page.goto("/login")`), so all 57 fail on `Cannot navigate to invalid URL`. Nothing ever starts port 3000 or 4200, though the job comment claims `playwright.config.ts` starts both. The `E2E_BASE_URL`/`E2E_API_URL` env passed at L368–369 is read by nothing. | **OPEN** — write the config, or delete the job                                                                              |
| 13  | Security invariant tests           | `npx vitest run src/modules/schedules/__tests__/security-invariants.spec.ts`                       | **PASS**                                                            | `security-tests`                    | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **NONE REQUIRED**                                                                                                           |
| 14  | Dependency audit (PR gate)         | `npx --yes audit-ci@6 --critical --report-type summary`, per workspace                             | **PASS** — 0 critical                                               | `security-scan`                     | **CI**                                          | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **NONE REQUIRED** at this threshold. See [§ Dependency audit](#dependency-audit) for what it does not cover                 |
| 15  | Secret scanning (PR gate)          | `gitleaks/gitleaks-action@v2` + tracked-material shell checks                                      | **PARTIAL**                                                         | `security-scan`                     | **CI**                                          | No local failure. The tracked-material half is proven by preflight ("No tracked secret material"). `gitleaks` is **not installable locally**, so its half is unverified here — the action also needs a GitHub token and full history.                                                                                                                                                                                                                           | **OPEN** — unverified locally                                                                                               |
| 16  | Docker image build                 | `docker build` via buildx, `push: false`                                                           | **PASS** — backend 175.4s, frontend 119.4s, both exit 0             | `docker-build-validation`           | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **NONE REQUIRED**                                                                                                           |
| 17  | Docker Compose validation          | `docker compose config -q` on both files, `:latest` assert, preflight, preflight suite, hook suite | **FAIL**                                                            | `docker-compose-validation`         | **CI**                                          | **Proven defect D4.** The job's own placeholder `.env` (L522–529) omits three variables that `docker-compose.prod.yml` requires: `FRONTEND_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (`FRONTEND_URL` is `${...:?}`, the other two resolve to errors in turn). It also never creates `backend/.env`, which `docker-compose.yml` requires via `env_file` (L46–47). Both `config -q` steps exit 1. The `:latest` assert and preflight steps pass.              | **OPEN** — add the 3 variables and create `backend/.env` from `.env.example`                                                |
| 18  | Manifest render (Kustomize + Helm) | `bash scripts/release-dry-run.sh --ci`                                                             | **BLOCKED locally / never reached in CI**                           | `manifest-render`                   | **CI**                                          | Upstream: `needs: [docker-compose-validation]`, which fails (defect D4), so this job never executes. It is also not runnable on this host — `bash` resolves to the WSL launcher stub with no distro installed, and `helm`, `kustomize`, `actionlint`, `kubeconform` are all absent.                                                                                                                                                                             | **OPEN** — unverified end to end                                                                                            |
| 19  | Coverage                           | `npm run test:coverage` + Codecov                                                                  | **ADVISORY — thresholds not met**                                   | `coverage`                          | **neither**                                     | `continue-on-error: true` (L130). The workflow comment states the backend vitest config carries 80% thresholds this tree does not meet, and the frontend has no coverage provider installed.                                                                                                                                                                                                                                                                    | **OPEN** — documented as intentional non-gating                                                                             |
| 20  | Release preflight                  | `node scripts/release-preflight.mjs`                                                               | **PASS** — 18/18, with and without `SKIP_ENVIRONMENT_CHECKS=1`      | `docker-compose-validation`         | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE**                                                                                                                    |
| 21  | Preflight self-test                | `node --test scripts/release-preflight.test.mjs`                                                   | **PASS** — 32/32                                                    | `docker-compose-validation`         | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE**                                                                                                                    |
| 22  | Pre-commit gate suite              | `node --test scripts/lint-staged-typecheck.test.mjs`                                               | **PASS** — 14/14                                                    | `docker-compose-validation`         | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE** (`dfcf0c2` root-cause fix)                                                                                         |
| 23  | lint-staged / pre-commit           | `.husky/pre-commit` → `npx lint-staged`                                                            | **PASS** — real commits verified                                    | local + CI                          | local = CI                                      | —                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **DONE**                                                                                                                    |
| 24  | Commitlint                         | `npx commitlint --from 7c9eb76 --to HEAD`                                                          | **PASS** for every new commit                                       | local (`.husky/commit-msg`)         | local = CI                                      | Full range `--from eb7a6db` exits 1                                                                                                                                                                                                                                                                                                                                                                                                                             | **PARTIAL by design** — see [§ Commitlint scope](#commitlint-scope)                                                         |
| 25  | Backend integration tier           | —                                                                                                  | **NOT IMPLEMENTED**                                                 | —                                   | n/a                                             | The tier does not exist. `backend/vitest.config.ts` includes only `src/**/*.spec.ts`; every backend spec is mock-based unit scope.                                                                                                                                                                                                                                                                                                                              | **OPEN** — declare the absence intentional, or add the tier                                                                 |
| 26  | Migration drift validation         | —                                                                                                  | **NOT IMPLEMENTED**                                                 | —                                   | n/a                                             | Nothing proves `schema.prisma` and `prisma/migrations/` agree. No `prisma migrate diff` exists in the repo; `migrate status` appears only in `backend/scripts/migrate-baseline.{sh,ps1}`, which are operator utilities. Migrations are _executed_ in CI (`migrate deploy`) and by the Helm `pre-install,pre-upgrade` job, never _validated_.                                                                                                                    | **OPEN**                                                                                                                    |
| 27  | Weekly security scan               | `npx audit-ci --high … \|\| true`, `npm-check-updates \|\| true`, trufflehog, SBOM                 | **ADVISORY**                                                        | `security-scan.yml` (cron + manual) | **neither**                                     | Both audit steps end in `\|\| true`, and the outdated-package step is additionally `continue-on-error`. Scheduled weekly, so it never blocks a PR.                                                                                                                                                                                                                                                                                                              | **OPEN** — separate from the blocking `--critical` PR gate                                                                  |

### Summary

| Result           | Gates                                                           |
| ---------------- | --------------------------------------------------------------- |
| PASS             | 1, 2, 3, 5, 6, 7, 9, 10, 13, 14, 16, 20, 21, 22, 23             |
| PASS with caveat | 4 (379 warnings), 15 (half unverified), 24 (full history fails) |
| FAIL             | 8, 11, 12, 17                                                   |
| ADVISORY         | 19, 27                                                          |
| BLOCKED          | 18                                                              |
| NOT IMPLEMENTED  | 25, 26                                                          |

**Release recommendation: BLOCKED.**

Four gates are red, and all four are CI configuration defects (D1–D4) rather than application
defects. Gates 1–7, 9–10 and 13–14 are genuinely green in both environments, which is why a
green-looking pipeline was possible: the failures live entirely in the environment the workflow
supplies to its own jobs.

| ID  | Defect                                                       | Impact                                                          |
| --- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| D1  | `ENCRYPTION_MASTER_KEY` is absent from all 13 jobs           | `backend-e2e` and `browser-acceptance` cannot boot the Nest API |
| D2  | `DATABASE_DIRECT_URL` is absent from the workflow `env:`     | `Validate Prisma schema` exits 1 (`P1012`)                      |
| D3  | `e2e/playwright.config.ts` does not exist                    | `browser-acceptance` fails all 57 tests                         |
| D4  | `docker-compose-validation` placeholder `.env` is incomplete | Both `config -q` steps fail; `manifest-render` never runs       |

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

### Cause 2 — 10 × HTTP 403 where 201 is expected

`POST /schedules` and its `/submit`, `/approve`, `/publish`, `/revision`, `/rollback`
transitions return `403 Forbidden`, plus the creation step in the `beforeAll` of `authorization`,
`my-shifts`, `schedule-alerts` and `schedule-notifications`. The seeded admin carries the role
`system_admin` and the guards reject it.

CI runs the same seed against the same code, so this reproduces there. Fixing it requires a
decision about the intended role and permission mapping; it is not an environment problem.

### Cause 3 — 5 × `Hook timed out in 30000ms`

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
editing the spec until causes 1–3 are resolved.

## Dependency audit

Two different gates with two different thresholds, and the distinction matters:

| Gate                         | Command                           | Threshold     | Enforcing?              |
| ---------------------------- | --------------------------------- | ------------- | ----------------------- |
| PR (`security-scan`)         | `npx --yes audit-ci@6 --critical` | critical only | **Yes** — fails the job |
| Weekly (`security-scan.yml`) | `npx audit-ci --high … \|\| true` | high          | **No** — `\|\| true`    |

`npm audit --audit-level=high` exits 1 in both workspaces. The count is not theoretical:

| Workspace  | Total | Low | Moderate | **High** | Critical |
| ---------- | ----- | --- | -------- | -------- | -------- |
| `backend`  | 66    | 4   | 33       | **29**   | 0        |
| `frontend` | 43    | 5   | 15       | **23**   | 0        |

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

## Local environment

| Service       | Endpoint                                  | State                                             |
| ------------- | ----------------------------------------- | ------------------------------------------------- |
| PostgreSQL 15 | `localhost:55432` (`vardiya-rc-postgres`) | up, `vardiyasystem_e2e`, 23/23 migrations, seeded |
| Redis 7       | `localhost:56379` (`vardiya-rc-redis`)    | up, `PING` → `PONG`                               |

Absent locally, therefore not evaluable here: `helm`, `kustomize`, `actionlint`, `kubeconform`,
`gitleaks`, `trufflehog`. `kubectl` is present. `bash` resolves to the WSL launcher stub with no
distribution installed, so `scripts/release-dry-run.sh` cannot run on this host at all.
