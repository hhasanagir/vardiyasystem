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

**Do not run any database migration.** D1-D13 are open, so the container and Helm gates are not
green, and migration execution is gated behind them. Migration analysis has since added nine more
defects, D14-D22, two of which would corrupt or block a real database.

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

Migration analysis added D14-D22. The two that block or damage a real database outright:

| ID  | Defect                                                      | Impact                                                                                                         |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D14 | Helm `migrate` Job omits `DATABASE_DIRECT_URL`              | Job dies with `P1012` before any migration; `OnFailure` + no `backoffLimit` hangs forever                      |
| D15 | Migration 6 renames columns via `DROP` + `ADD` with no copy | `SQLSTATE 23502` on any populated `auth_sessions`/`notifications`; silent lockout and read-state loss if empty |
| D16 | Migration 17 casts enums with no value mapping              | `invalid input value for enum` on 7 of 9 old `RbacRoleName` values and 6 of 8 old `UserRole` values            |

D17-D22 cover audit-column deletion, a `search_path` dependency that breaks the drift gate, the
absent rollback path, two stale enum-driven tests, and `pg_stat_statements` being installed with an
empty `shared_preload_libraries`.

Pipeline gate coverage added D23-D27. The intended chain has 11 stages; 3 do not exist, and the
ordering holds at 2 transitions:

<!-- prettier-ignore -->
| ID | Defect | Impact |
|---|---|---|
| D23 | `unit-tests`, `backend-e2e`, `build-check` have no `needs:` | Typecheck and E2E failures do not stop the build; only Docker is truly gated |
| D24 | `deploy.yml` has no link to `pr-validation.yml` | Both fire on the same push; "PR is green" is not a precondition for deploying |
| D25 | No staging deploy stage | Zero `kubectl`/`helm`/`kubeconfig` operations in any workflow |
| D26 | No smoke or staging E2E stage | Zero `smoke`/`rollout status`; D6-D10 are unobservable until this exists |
| D27 | Pipeline ends at a public GitHub Release | Every push to `main` publishes a non-draft, non-prerelease release while D1-D22 are open |

## Pipeline gate coverage

The intended release chain is a single ordered sequence:

```
Source Code -> Typecheck/Lint -> Unit/Integration -> E2E -> Build -> Docker
            -> Helm validation -> CI -> Staging -> Smoke/E2E -> Production
```

Measured against `.github/workflows/`, that chain does not exist. Three stages are absent
outright, and the ordering is enforced at two transitions only.

| #   | Stage           | Implemented                                                                   | Gate holds?                                               |
| --- | --------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | Source Code     | `pr-validation.yml` on PR to `main`/`develop`; `deploy.yml` on push to `main` | n/a                                                       |
| 2   | Typecheck/Lint  | `lint-typecheck`                                                              | **No** — no job declares `needs:` on it                   |
| 3   | Unit            | `unit-tests` in `pr-validation.yml`                                           | **No** — no `needs:`                                      |
| 3   | Integration     | `integration-test`, but in **`deploy.yml`**, after `docker-build-push`        | Yes, within `deploy.yml` only                             |
| 4   | E2E             | `backend-e2e`, `browser-acceptance`                                           | **No** — no `needs:`; both fail anyway (D1, D3)           |
| 5   | Build           | `build-check`                                                                 | **No** — no `needs:`, runs even when E2E fails            |
| 6   | Docker          | `docker-build-validation`                                                     | **Yes** — `needs: [build-check, lint-typecheck]`          |
| 7   | Helm validation | `manifest-render` → `bash scripts/release-dry-run.sh --ci`                    | Linked, but **dead** — D4 fails upstream so it never runs |
| 8   | CI              | Split across two files with no link                                           | **No** — see D24                                          |
| 9   | Staging         | —                                                                             | **Absent**                                                |
| 10  | Smoke/E2E       | —                                                                             | **Absent**                                                |
| 11  | Production      | — `create-release` only creates a GitHub Release                              | **Absent**                                                |

`pr-validation.yml` contains 11 jobs, and the only edges in its graph are
`docker-build-validation → docker-compose-validation → manifest-render` plus
`docker-build-validation → lint-typecheck`. Every other job is an independent root.

### Defect D23 - gate ordering is not enforced

`unit-tests`, `backend-e2e` and `build-check` have no `needs:`, so all three run concurrently
with `lint-typecheck`. A compile error in the typecheck does not prevent a build from being
produced, a failing E2E suite does not prevent `docker-build-validation` from pushing, and a
failing unit suite does not prevent anything downstream.

`coverage` sets `continue-on-error: true` and `browser-acceptance` sets `if: always()`, so those
two are advisory by construction.

The single real link, `docker-build-validation needs: [build-check, lint-typecheck]`, is exactly
the one that let D5 through: the image was built from a green typecheck and build and nothing ever
ran it.

**Root cause:** the workflow was assembled job-by-job rather than as a gate graph, and no job
declares its upstream dependency.

**Remediation:** add `needs:` so each stage waits for its predecessor — `unit-tests` and
`coverage` on `lint-typecheck`, `backend-e2e` on `unit-tests`, `build-check` on `backend-e2e`,
`browser-acceptance` on `build-check`. Drop `if: always()` on `browser-acceptance` so a failure
upstream stops it instead of burning 10+ minutes to fail on its own.

### Defect D24 - the deploy pipeline is not gated by PR validation

`pr-validation.yml` runs on `pull_request`. `deploy.yml` runs on `push` to `main`. There is no
`workflow_run` trigger, and no job in `deploy.yml` references `pr-validation.yml`. Both fire on the
same push and neither waits for the other.

`deploy.yml` does gate its own internals correctly: `validate` → `release-dry-run`, `unit-tests`,
`security-scan` → `docker-build-push` → `integration-test` → `create-release`. What is missing is
the link from the PR gate to the deploy gate.

**Root cause:** the two workflows were authored for different purposes and never connected, so
"PR is green" is not a precondition for "main deploys".

**Remediation:** trigger `deploy.yml` from `workflow_run` on `pr-validation.yml`
`conclusion: success`, or add a `needs:`-equivalent check. Whichever route, the deploy must not
start while any PR gate is red — currently D1-D22 would all still reach production.

### Defect D25 - there is no staging stage

No workflow contains `kubectl apply`, `helm install`, `helm upgrade`, `kubeconfig` or
`actions/create-kubernetes`. No job declares `environment:`, so there is no environment approval
either.

The Helm chart is validated only as a render (`release-dry-run.sh --ci`), which is the correct and
only available form of validation while D4 is open — but nothing has ever deployed it.

**Root cause:** the Helm chart was built and dry-run validated, and the deployment half was never
written.

**Remediation:** add a staging deploy job that runs `helm upgrade --install --dry-run` first, then a
real install into a `staging` GitHub environment with required reviewers. Do not wire it to
production namespaces.

### Defect D26 - there is no smoke or staging E2E stage

Zero occurrences of `smoke`, `rollout status` or `kubectl wait` across all four workflow files.

The closest thing is `integration-test`, and it is genuinely strong — it brings up the full
`docker-compose.prod.yml` stack (`postgres`, `redis`, `pgbouncer`, `backend`, `frontend`), runs
`scripts/release-preflight.test.mjs` and `scripts/lint-staged-typecheck.test.mjs`, restores a
database into a scratch container, and tears down with `down -v --remove-orphans`. But it tests
containers, not a cluster, so it cannot catch a missing `NetworkPolicy`, a probe that never becomes
ready, or a Service selector that matches nothing — precisely the D6-D10 class.

**Root cause:** container-level integration testing was treated as sufficient coverage for
deployment verification.

**Remediation:** after D25, add a post-deploy gate: `kubectl rollout status` on every Deployment
and StatefulSet, then `/health/ready` and `/health/live` against the ingress host, then the E2E
suite against the deployed URL. That is the only place D6-D10 become observable.

### Defect D27 - the pipeline ends at a GitHub Release and publishes it publicly

`create-release` is the terminal job. It runs `mikepenz/release-changelog-builder-action@v5`, then
`softprops/action-gh-release@v2` with `draft: false` and `prerelease: false`. It contains no
cluster operation of any kind.

So the chain terminates at "Create GitHub Release", and it does so by default on every push to
`main`. `docker-build-push` has already written to `ghcr.io` by that point.

With D1-D22 open, every push to `main` currently publishes a non-draft, non-prerelease public
GitHub Release tagged `v{version}-{sha}`.

**Root cause:** `create-release` was written as a release-publishing step and treated as the end
of the pipeline, with the deployment steps never added after it.

**Remediation:** make publishing conditional on the deploy stages once they exist. Until then, at
minimum set `draft: true` so nothing is published from a pipeline whose own gates are red, and keep
the existing `workflow_dispatch` `dry_run` input as the safe path.

### Corrected during this pass

Two earlier statements in this document were wrong and are corrected here:

- The integration tier was recorded as absent. It exists as `integration-test` in `deploy.yml`,
  and it is substantial. It was missed because only `pr-validation.yml` had been examined.
- Staging and production stages were assumed missing before `deploy.yml` was read. The stages are
  still missing, but `deploy.yml` is where that conclusion has to be drawn, not
  `pr-validation.yml`.

`pr-validation.yml` has 11 jobs, not the 13 previously stated.

### Not claimed

- No staging or production cluster was contacted, so cluster-side behaviour is unmeasured rather
  than passing.
- `release-dry-run.sh --ci` was never executed on a Linux runner. It cannot run on this host
  (`bash` is the WSL launcher stub), so its behaviour in CI is inferred from the local Helm and
  kustomize invocations that were run directly, not observed.
- No claim that the missing stages are _wanted_ removed rather than never written. The absence is
  established; the intent is not.

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

## Migration analysis

**No migration was executed against any production database, and none should be.** The release
gate is still blocked on D1-D13, so migration execution stays behind that door. What follows is
static analysis plus empirical proof on four disposable databases created for the purpose, inside
the existing local `vardiya-rc-postgres` container. The E2E database `vardiyasystem_e2e` was not
touched.

| Lab database                    | Purpose                                                          |
| ------------------------------- | ---------------------------------------------------------------- |
| `mig_lab_base`                  | migration 1 only — pre-migration schema                          |
| `mig_lab_pre`                   | migrations 1-5, populated, then v6 attempted                     |
| `mig_lab_17`                    | migrations 1-16, populated with legacy roles, then v17 attempted |
| `mig_lab_drift`, `mig_lab_post` | all 23 migrations — post-migration schema                        |

### Staging-safe verdict: NO

**The migration chain is only proven to work on an empty database.** Two separate migrations fail
on data, and both were confirmed by execution, not by reading:

- `20260619000001_v6_enterprise_notification_system` fails with `SQLSTATE 23502` on any populated
  `auth_sessions` or `notifications`.
- `20260714000001_enterprise_asset_management` fails with `invalid input value for enum` on any
  `roles` row outside `SYSTEM_ADMIN`/`TECHNICIAN`, and on any `users.role` outside the new 10-value
  set.

Both pass on a fresh empty database, which is exactly the path CI and every local run exercise.
That is why this has never been caught: `prisma migrate deploy` on a fresh database is the only
scenario ever tested.

### Pre-migration schema

Migration 1 (`20260519000000_v1_initial_baseline`), 338 lines:

<!-- prettier-ignore -->
| Object | Count |
|---|---|
| Tables | 16 |
| Columns | 194 |
| Foreign keys | 17 |
| Unique constraints | 0 |
| Check constraints | 0 |
| Indexes | 36 |
| Enums | 9 |

Uniqueness is expressed as unique **indexes**, not table constraints — the Prisma convention, so
the `0` above is expected, not a gap.

The three tables that later migrations gut are in their original shape. `auth_attempts` uses
`snake_case` (`attempt_type`, `ip_address`, `lockout_until`, `user_id`, `created_at`);
`auth_sessions` likewise (`hashed_token`, `expires_at`, `revoked_at`, `user_id`);
`notifications` is already `camelCase` (`userId`, `isRead`, `readAt`, `createdAt`) with
`type TEXT NOT NULL`.

### The migrations

23 migrations, 2,838 lines of SQL. Verified count:

<!-- prettier-ignore -->
| Severity | Pattern | Migrations affected |
|---|---|---|
| CRITICAL | `DROP COLUMN` | v5, v6 |
| CRITICAL | `DROP CONSTRAINT` (FK) | v6, v12, v16 |
| CRITICAL | `DROP TYPE` (enum) | `remove_gmre_enum`, asset management |
| CRITICAL | `DROP INDEX` | v5, v6, v10, asset mgmt, v15, v17 |
| HIGH | `ALTER COLUMN ... TYPE` (enum cast) | `remove_gmre_enum`, asset management |
| HIGH | `DROP DEFAULT` | asset management (`users.role`) |
| HIGH | `RENAME` | v5, `remove_gmre_enum`, asset management |
| DATA | `UPDATE` backfill | `v11_add_ltree_path_columns` (2), `assignment_source_and_tenant_isolation` (1) |

**No `DROP TABLE`, no `TRUNCATE`, no `DELETE FROM` anywhere.** Destructive change is confined to
columns, constraints, indexes and enum types. Only 3 statements are genuine data migrations, all
`UPDATE` backfills.

`add_schedule_audit_indexes`, `add_check_constraints`, `v13_rbac_hierarchy_scopes` and
`add_supervizor_unit_type` are additive and safe.

### Post-migration schema

All 23 applied cleanly to a fresh database, exit 0:

<!-- prettier-ignore -->
| Object | Pre | Post | Delta |
|---|---|---|---|
| Tables | 16 | 96 | +80 |
| Columns | 194 | 1272 | +1078 |
| Foreign keys | 17 | 144 | +127 |
| Unique constraints | 0 | 0 | — |
| Check constraints | 0 | 9 | +9 |
| Indexes | 36 | 435 | +399 |
| Enums | 9 | 48 | +39 |

`UserRole` ends at 10 values and `RbacRoleName` at 10, both listed in `schema.prisma`. Five
extensions are installed into `public`: `btree_gin`, `citext`, `ltree`, `pg_stat_statements`,
`pgcrypto`.

### Defect D14 - the Helm migrate Job cannot start at all

The rendered `vardiya-migrate` Job is correct in the ways that matter: `command: ["npx", "prisma",
"migrate", "deploy"]`, `DATABASE_URL` sourced from `key: database_direct_url` so it bypasses
PgBouncer, `runAsNonRoot: true`, `runAsUser: 100`. It has one fatal omission.

`schema.prisma` declares `directUrl = env("DATABASE_DIRECT_URL")`, so Prisma resolves that variable
**even during `migrate deploy`**. The Job supplies only `DATABASE_URL`. Reproduced with the Job's
exact environment:

```
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
error: Environment variable not found: DATABASE_DIRECT_URL.
```

This is the same root cause as D2, now proven to break the Kubernetes migration path as well. It
compounds: `restartPolicy: OnFailure` with **no `backoffLimit`**, `ttlSecondsAfterFinished` or
`activeDeadlineSeconds`, so the Job will restart indefinitely and never terminate. The deployment
pipeline hangs instead of failing.

**Root cause:** the Job template was written against `DATABASE_URL` only, while the schema has
required `DATABASE_DIRECT_URL` for every Prisma invocation since `DATABASE_DIRECT_URL` was
introduced.

**Remediation:** add `DATABASE_DIRECT_URL` from `key: database_direct_url` to the Job, and set
`backoffLimit: 3` so a genuinely failing migration surfaces as a failed Job.

### Defect D15 - migration 6 cannot run against a populated database

`20260619000001_v6_enterprise_notification_system` converts three tables from `snake_case` to
`camelCase` by dropping and re-adding every column **with no data copy**. Proven on `mig_lab_pre`
with 2 sessions, 5 auth attempts and 2 notifications:

```
Applying migration `20260619000001_v6_enterprise_notification_system`
Error: P3018
Database error code: 23502
ERROR: column "expiresAt" of relation "auth_sessions" contains null values
```

`ADD COLUMN "hashedToken" TEXT NOT NULL` and `ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL` on
`auth_sessions`, and `ADD COLUMN "type" "NotificationType" NOT NULL` on `notifications`, have no
`DEFAULT`, so on a non-empty table Postgres fills `NULL` and the `NOT NULL` check fails. Only an
empty table satisfies them.

Had the tables been empty, the migration would have succeeded and silently destroyed data:
`auth_attempts` loses `ip_address`, `user_id`, `lockout_until` and `user_agent` — every rate-limit
and lockout signal — while `auth_attempts` happens to survive only because the replacement columns
carry `DEFAULT 'LOGIN'` and `DEFAULT CURRENT_TIMESTAMP`.

Worse, `notifications` drops `isRead`, `readAt` and `userId` **without ever re-adding them**, so
per-user read state and notification ownership are gone for good. `type` is dropped and re-added,
so any stored value that is not a valid `NotificationType` is lost.

**Root cause:** a case-only rename was written as destructive DDL instead of
`ALTER TABLE ... RENAME COLUMN`, which is metadata-only and would have worked on a populated table.

**Remediation:** replace the drop/add pairs with `RENAME COLUMN`, which preserves data and is
near-instant. Because these migrations are already applied on some environments, decide explicitly
per environment whether a data backfill is needed before rewriting history — do not edit applied
migrations. Add a CI gate that runs `migrate deploy` onto a database seeded with representative
rows, because a fresh-database run cannot catch this class of bug.

### Defect D16 - migration 17 fails on any pre-existing role

`20260714000001_enterprise_asset_management` rebuilds the `RbacRoleName` enum with a blind cast:

```sql
ALTER TABLE "roles" ALTER COLUMN "name" TYPE "RbacRoleName_new"
  USING ("name"::text::"RbacRoleName_new");
```

The two value sets barely overlap.

<!-- prettier-ignore -->
| Old `RbacRoleName` | New `RbacRoleName` |
|---|---|
| `SYSTEM_ADMIN` | `SYSTEM_ADMIN` |
| `ORGANIZATION_ADMIN` | — |
| `HOSPITAL_DIRECTOR` | `HOSPITAL_ADMIN` |
| `IMAGING_MANAGER` | `IMAGING_DIRECTOR` |
| `UNIT_SUPERVISOR` | `SUPERVISOR` |
| `SHIFT_COORDINATOR` | — |
| `HR_MANAGER` | — |
| `TECHNICIAN` | `TECHNICIAN` |
| `READ_ONLY_AUDITOR` | — |
| — | `MEDICAL_ENGINEER`, `SENIOR_TECHNICIAN`, `ASSISTANT_TECHNICIAN`, `SECRETARY`, `GUEST` |

Seven of the nine old values have no counterpart. Reproduced on `mig_lab_17` with those 7 roles
inserted:

```
Applying migration `20260714000001_enterprise_asset_management`
ERROR: current transaction is aborted, commands ignored until end of transaction block
```

That message is misleading. Prisma wraps each migration file in a transaction, and this file
contains its own `BEGIN;`/`COMMIT;` pairs at lines 77-83 and 101-109, so the first real error is
swallowed and replaced by a cascade. Executing the cast directly exposes it:

```
ERROR:  invalid input value for enum "RbacRoleName_new": "ORGANIZATION_ADMIN"
```

The same applies to `users.role`. Old `UserRole` was `super_admin, admin, project_manager,
head_technician, supervisor, field_supervisor, technician, staff`; the new set shares only
`supervisor` and `technician`:

```
ERROR:  invalid input value for enum "UserRole_new": "super_admin"
```

The cast survives only because `prisma/seed.ts` happens to use just `system_admin` and `technician`
— the two values that map cleanly. Any real deployment has `users` rows with the other old roles.

**Root cause:** enum values were renamed and reorganised without a value mapping. `USING` with a
bare `::text::enum` cast cannot rename, only reject.

**Remediation:** add an explicit mapping in the `USING` clause, for example
`USING (CASE "name" WHEN 'HOSPITAL_DIRECTOR' THEN 'HOSPITAL_ADMIN' WHEN 'UNIT_SUPERVISOR' THEN
'SUPERVISOR' ... ELSE "name"::text END)::"RbacRoleName_new"`, plus a pre-flight `SELECT` that
lists any value with no target so nothing fails mid-migration. Remove the inner `BEGIN;`/`COMMIT;`
so real errors surface.

### Defect D17 - migration 5 destroys audit data silently

`20260618000001_v5_enterprise_audit_system` drops three columns from `audit_logs` with no
replacement and no warning:

```sql
ALTER TABLE "audit_logs" DROP COLUMN "sessionId";
ALTER TABLE "audit_logs" DROP COLUMN "reason";
ALTER TABLE "audit_logs" DROP COLUMN "comment";
```

`reason` and `comment` are audit context. On an audit table this is a compliance concern, not just
data loss, and it happens without any error to alert on.

Code impact is nil — `sessionId`, `reason` and `comment` have 0 references across `backend/src` —
so nothing breaks at runtime. The data is simply gone.

**Root cause:** the columns were treated as unused because no code referenced them, ignoring that
an audit log's value is the record itself.

**Remediation:** recover the values from a backup into new columns if the audit trail must stay
complete, or document the deletion as an accepted compliance decision. Do not re-add the columns
empty — that would imply the data is retrievable when it is not.

### Defect D18 - migrations only work when `public` is in `search_path`

Five extensions are created without a schema, so they install into whatever `search_path` resolves
to, and `v11_add_ltree_path_columns` then uses the `ltree` type by unqualified name. This was
observed directly when `prisma migrate diff --shadow-database-url` was pointed at a non-`public`
schema:

```
Migration `20260703000002_v11_add_ltree_path_columns` failed to apply cleanly to the shadow database.
ERROR: type "ltree" does not exist
```

The mechanism is `CREATE EXTENSION IF NOT EXISTS ltree` combined with a `search_path` that excludes
`public`: the extension already exists in `public`, so `IF NOT EXISTS` skips it, and the new
schema never gets its own copy.

This blocks the offline drift gate that D-gate 32 already notes as unimplemented, and it will fail
any deployment that does not use `?schema=public`.

**Root cause:** unqualified extension and type references, with no `WITH SCHEMA`.

**Remediation:** write `CREATE EXTENSION IF NOT EXISTS ltree WITH SCHEMA public;` and keep the
datasource pinned to `?schema=public`. This is also what unblocks `prisma migrate diff` as a CI
drift gate.

### Defect D19 - there is no rollback path

No `down.sql`, no `down` directory, no rollback script anywhere in `prisma/migrations`. The only
files besides `migration.sql` are four inert `migration.json` files and `migration_lock.toml`.

Prisma has no built-in `migrate down`; recovery is `migrate resolve --rolled-back` plus a
hand-written compensating script. For D15 and D16 that script would have to reconstruct dropped
columns and re-add deleted enum values from a backup. Rehearsing this is the only way to know the
recovery time, and it has never been done.

The saving grace, confirmed empirically: Prisma wraps each migration file in a transaction, so a
failed `migrate deploy` leaves **no partial state**. After the D15 failure, `auth_attempts` still
had its original columns, both FK constraints were intact, all 15 indexes survived and all 9 rows
were present. Failure is atomic — which also means the `BEGIN;`/`COMMIT;` blocks inside
`enterprise_asset_management` serve no purpose and only corrupt error reporting (D16).

**Root cause:** migrations were authored as one-way scripts with no inverse recorded.

**Remediation:** before any production run, take and verify a snapshot, and write a tested
compensating script per destructive migration. For D15 and D16 specifically, the correct action is
to fix the migration before it ever reaches a populated database, not to plan a rollback.

### Application compatibility

One confirmed break, one silent test-validity defect, and one thing that looks like a break but is
not.

**`backend/e2e/auth.e2e-spec.ts:39` asserts `super_admin`, which no longer exists** — see D20 below.

**`hierarchy.service.spec.ts` tests a schema that cannot exist** — see D21 below.

**Not a defect: `Personnel.role` is `String`** (`schema.prisma:596`), not an enum. So
`head_technician` and `field_supervisor` in `seed-personnel.ts:87-88` and in the two frontend
components remain valid values, and `userRoleFromTitle` only ever returns `supervisor`,
`senior_technician` or `technician`, all of which are in the new enum. Seeded personnel and users
will insert cleanly.

**Drift gate is unbuildable as written.** `prisma migrate diff --from-migrations
--to-schema-datamodel` fails with D18, so migrations and `schema.prisma` cannot currently be
compared automatically. Everything above was therefore established by applying migrations to real
databases and querying `information_schema`, which is the stronger method but is manual.

### Defect D20 - `auth.e2e-spec.ts` asserts a role the schema cannot store

`backend/e2e/auth.e2e-spec.ts:39` asserts `User.role === 'super_admin'`. `User.role` is the
`UserRole` enum (`schema.prisma:290`); `super_admin` was valid before migration 17 and migration 17
removed it. Confirmed by direct cast, not inferred:

```
ERROR:  invalid input value for enum "UserRole_new": "super_admin"
```

`prisma/seed.ts:27,39` writes `system_admin`, so the spec and the seed disagree about the same
field.

This is what the Backend E2E section previously recorded as an unverified hypothesis. The role
mismatch is now documented fact. It is still **not** counted as the cause of the 10 authorization
403s, because the suite fails at hook level first and the assertion never executes.

**Root cause:** migration 17 renamed the enum values without updating the tests that name them, and
the E2E suite never reached this line because of D1.

**Remediation:** update the assertion to `system_admin` to match the seed, but only after D1 and D3
are fixed so the suite can actually run and prove it. Changing it before then would be unverified.

### Defect D21 - `hierarchy.service.spec.ts` validates a schema that cannot exist

23 references to removed `RbacRoleName` values across lines 35-192: `ORGANIZATION_ADMIN` ×15,
`HOSPITAL_DIRECTOR` ×6, `IMAGING_MANAGER` ×1, `READ_ONLY_AUDITOR` ×1. They appear only as plain
string literals inside `mockQueryRaw` fixtures and are never typed as the enum, so typecheck and the
553/553 unit suite both stay green.

The assertions exercise ltree paths such as
`SYSTEM_ADMIN.ORGANIZATION_ADMIN.HOSPITAL_DIRECTOR`, values migration 17 made impossible.

**Root cause:** the fixtures are untyped string literals, so removing enum values does not fail
compilation or tests — it silently converts a real assertion into a fiction.

**Remediation:** type the fixtures as `RbacRoleName` (or import the enum) so any future enum change
breaks the build instead of passing. Then rewrite the paths to the current role hierarchy and add
one integration test that runs the hierarchy query against a real database.

### Defect D22 - `pg_stat_statements` is installed but collecting nothing

Migration 17 creates five extensions. `shared_preload_libraries` on the local server is **empty**,
yet `CREATE EXTENSION pg_stat_statements` succeeded. The extension object exists in `public` and
reports version 1.10, but without the preload it never records a query.

This passes every migration gate and is invisible until someone tries to read slow-query data.

**Root cause:** `CREATE EXTENSION` does not enforce the preload requirement, and nothing validates
server configuration before migrating.

**Remediation:** either set `shared_preload_libraries = 'pg_stat_statements'` on every Postgres
instance before migration 17 runs, or drop the extension from the migration and manage it as
infrastructure. Add a pre-migration assertion so the setting is verified, not assumed.

### Not claimed

- No lock-duration or production table-size measurement. Every migration runs `ALTER TABLE` and
  non-concurrent `CREATE INDEX` under a single transaction, which takes `ACCESS EXCLUSIVE` locks.
  On real row counts these will block writes for an unmeasured duration. `CREATE INDEX CONCURRENTLY`
  appears in zero migrations, and it cannot run inside the transaction Prisma uses anyway.
- No restore rehearsal. The backup CronJob is correct in the render (D9 context) but no restore has
  been performed, so RPO and RTO are unknown.
- No `pg_stat_statements` effectiveness claim. `shared_preload_libraries` is **empty** on the local
  server yet `CREATE EXTENSION` succeeded, so the extension is installed and collecting nothing.
  This is a silent observability gap, not a migration failure.
- `pgcrypto`, `btree_gin`, `citext`, `ltree` and `pg_stat_statements` are all present locally
  because `postgres:15-alpine` bundles contrib. A Postgres build without contrib would fail
  migration 17 outright. Not tested against such a build.

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
