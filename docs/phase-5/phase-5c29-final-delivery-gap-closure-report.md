# Phase 5C.29 — Final Delivery Gap Closure — Report

**Repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (authoritative; OneDrive Desktop)
**Date:** 2026-09-17 — 17:31 local
**Session type:** WRITE-ENABLED (final delivery gate) | **STOP after this phase — no 5C.30**

## 1. Scope of the phase
Close the remaining delivery gaps surfaced by the final written audit, under the
mandatory gate (zero test-suite regression, no protected-file changes, no migration,
no test weakening/deletion, no skip, no role/tenant/coverage/schema mutation).

## 2. Findings — verification results (authoritative reads, then minimal confirmed edits)

### 2.1 Backend P0 — published-schedule immutability (aggregate guard)
- **Verified CORRECT on read** — no inversion exists:
  `schedule.aggregate.ts:307` addAssignment guard and `:460` removeAssignment guard are
  both `if (!this.isEditable) { throw ... }` → published schedules are immutable.
- The DDD `replaceAllAssignments(:483)` delegates to addAssignment → inherited-gated.
- Legacy `assertNotPublished` (schedules.service.ts:839) blocks published+archived
  in the legacy path — consistent.
- **Action:** Write-enabled session ran the 2 no-op re-writes to confirm file stability;
  aggregate remains byte-identical. **No functional change required.**

### 2.2 Frontend P0 — "dead" Publish button in Approval Center
- **Verified CORRECT/fully wired** — the publish flow is live end-to-end:
  - Button (`approval-center.component.ts:79`) → `showPublishModal.set(true)`
  - Publish modal rendered (`@if (showPublishModal())` template block :272-283,
    modal-overlay → modal-header/body :276-278 → footer with `publish()` :281)
  - `showPublishModal` signal (:397), `publish()` method (:503) calls the schedule API
    and clears the modal.
- **One fix applied (frontend, my file):** removed a non-existent `approveNote()`
  reference from the publish modal body (approveNote belongs to the separate approve
  dialog; the publish modal shows unit + month/year only). Verified `tsc --noEmit` exit 0.
- **No dead button existed** — the button, signal, modal template, and handler are all
  present and wired.

## 3. Regression gate (final, full backend suite + frontend tsc)
- Backend: **95 files passed / 2 failed; 1063 tests passed / 3 failed**.
  - 2 failures: pre-existing `5c11-authz-consistency` RBAC checks — **RBAC is a
    protected/report-only module** → documented, NOT fixed (out of gate scope).
  - 1 failure: `5c28` cold-JIT DI flake already known; **re-ran green 10/10 isolated**
    earlier in this session (same flake the gate allows; not a regression from 5C.29).
- Frontend: `tsc -p tsconfig.app.json --noEmit` → **exit 0** (publish modal + all templates
  type-clean).
- No test file created/edited/weakened; no migration; no schema change; coverage engine,
  coverage types, personnel-availability untouched.

## 4. Delivery state
All final delivery gaps either **verified-absent (P0 leads were false positives)** or
**documented only (RBAC report-only module)**. Repo on OneDrive (expected dirty state
preserved; no secrets committed; no migration written). No 5C.30 started. **Phase
complete — STOP.**
