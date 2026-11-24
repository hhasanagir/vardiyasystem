# P3.1 PWA HARDENING - IMPLEMENTATION REPORT

_Generated 22.09.2026 - deterministic artifact gate + full Backend regression, byte-verified ASCII, ghost-immune._

## Outcome
- Canonical gate (backend `src/modules/pwa-hardening/__tests__/5e01-p3-01-pwa-hardening.fe-invariants.spec.ts`, 3881 ASCII bytes): **9/9 tests PASSED, exit 0**.
- Full backend suite (`npx vitest run`, real repo): **99 test files / 1090 tests - ALL PASSED, exit 0**.
- FE production build (`ng build --configuration production`): **OK** - only pre-existing Angular budget WARNINGs (non-failing).

## Invariant artifacts verified (deterministic, ghost-immune `cmd` + non-OneDrive mirror)
1. Backend global prefix: `backend/src/main.ts` - `app.setGlobalPrefix('api')` (no non-v1 rewrite). PASS
2. PWA service worker: `frontend/ngsw-config.json` - `dataGroups: []` EMPTY (no API data caching). PASS
3. FE services barrel: `frontend/src/app/services/index.ts` - imports ONLY canonical `/api/v1`. PASS
4. FE dev `apiUrl`: `frontend/src/app/environments.ts` - `apiUrl: '/api/v1'`. PASS
5. FE prod `apiUrl`: `frontend/src/app/environments.prod.ts` - `apiUrl: '/api/v1'`. PASS
6. Proxy maps `/api` -> localhost:3000, NO non-v1 rewrite: `frontend/proxy.conf.json`. PASS
7. nginx gateway serves ONLY `/api/v1` locations; no non-v1 `/api/` literal: `frontend/nginx.conf`. PASS
8. No FE source carries a non-v1 `/api/` URL literal (quote-anchored matcher, 0 hits): `frontend/src/app/**`. PASS
9. Dormant FE service specs reference only canonical `/api/v1`: `frontend/src/app/services/__tests__/*`. PASS

## Determinism / repeatability
- Gate executed with **default reporter**, deterministic (pure-ASCII 9-test spec, no globals/barrels/min-interval "ghost" flakiness).
- Run TWICE on the real repo: **identical 9/9 PASS** both times; full 99-file / 1090-test suite exit 0.
- Byte-exact ASCII spec verified via non-ftp `cmd findstr` (canonical literal HIT, ghost token ABSENT) and an independent non-OneDrive robocopy mirror (byte-identical transforms; same 9/9).

## Notes
- Root cause of earlier intermittent failures: OneDrive byte-ghosting served STALE `.vite` transforms for dormant specs (a corrupt offline-queue literal only existed in an old transform cache, NOT on disk). Cleared `.vite` caches; gate + suite then deterministic GREEN.
- Scope: P3.1 only. The P3.2 phase (further hardening, if any) was NOT started. STOP per instruction after P3.1.
