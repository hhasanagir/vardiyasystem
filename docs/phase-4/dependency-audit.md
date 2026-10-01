# Dependency Audit Report

**Scope:** Backend (`npm audit` results)
**Total vulnerabilities:** 57 — 3 low, 30 moderate, 23 high, 1 critical

## Vulnerability Breakdown

| Package                                                                 | Severity | Current             | Affected Range               | Fixed Version                                     | Breaking Risk | Action                                                                         |
| ----------------------------------------------------------------------- | -------- | ------------------- | ---------------------------- | ------------------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `@mapbox/node-pre-gyp` (via `tar`, affects `bcrypt`)                    | Critical | < 1.0.11            | < 2.0.2                      | `bcrypt@6.0.0`                                    | Semver major  | Upgrade `bcrypt` to 6.x; verify hash compatibility and rebuild native binaries |
| `@nestjs/cli` (via `angular-devkit`, `glob`, `inquirer`, `webpack`)     | High     | < 11.0.24           | Multiple transitive ranges   | `@nestjs/cli@11.0.24`                             | Semver major  | Upgrade dev dependency; low runtime risk since CLI is not shipped              |
| `@nestjs/cache-manager` (via `@nestjs/core`)                            | High     | < 3.1.3             | < 3.1.3                      | `3.1.3`                                           | Semver major  | Upgrade and adapt to cache-manager v6 API if needed                            |
| `@angular-devkit/core` (via `ajv`, `picomatch`)                         | Moderate | < current fix range | Transitive of CLI            | Via `@nestjs/cli` upgrade                         | None direct   | Resolved automatically by the CLI upgrade                                      |
| `@google-cloud/storage` (via `retry-request`, affects `firebase-admin`) | Moderate | < fixed range       | Transitive of Firebase Admin | Latest `firebase-admin` / `@google-cloud/storage` | Low–medium    | Bump `firebase-admin` to latest minor/major that pulls patched storage         |
| `@nestjs/common` (via `file-type`)                                      | Moderate | < fixed range       | Transitive                   | Patched NestJS release                            | Low           | Update `@nestjs/*` packages together within same major                         |

## Summary by Severity

- **Critical (1):** `bcrypt`'s transitive dependency on `@mapbox/node-pre-gyp` → vulnerable `tar`. Highest priority.
- **High (23):** Dominated by build tooling (`@nestjs/cli` chain) and one runtime path through `@nestjs/cache-manager`.
- **Moderate (30):** Mostly transitive dependencies resolved indirectly by the major upgrades above.
- **Low (3):** No action required beyond routine updates.

## Recommendations

1. **Do NOT run `npm audit fix --force`.** It will attempt arbitrary semver-major jumps across unrelated packages, can break builds, and may silently change lockfile behavior in ways that are hard to review.
2. **Upgrade deliberately, package by package:**
   - `bcrypt` → `6.0.0`: test login flows, existing password hash verification, and CI native builds after upgrade.
   - `@nestjs/cli` → `>= 11.0.24`: dev-only; validate `nest build`/`start:dev` still work.
   - `@nestjs/cache-manager` → `>= 3.1.3`: review breaking API changes against current cache usage.
   - Update `firebase-admin` to a release with patched `@google-cloud/storage`/`retry-request`.
3. **Update all `@nestjs/*` core packages in lockstep** (`common`, `core`, `cache-manager`) to avoid peer-dependency conflicts.
4. **Re-run `npm audit` after each upgrade** and confirm vulnerability counts decrease without introducing new ones.
5. **Pin upgrades in a single reviewed PR per concern** (runtime deps vs dev deps) so regressions are easy to bisect.

### Residual risk

Most high-severity findings live in **build-time tooling**, which reduces production exposure significantly. The only critical finding affects a **runtime** dependency (`bcrypt`) used for authentication — treat its upgrade as a priority item before next release.
