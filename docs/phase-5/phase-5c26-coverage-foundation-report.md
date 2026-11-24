# 5C.26 Phase Report (truthful final)

## Verdict
**BLOCKED — not landed.**

Byte-stable landing channel parity: **PASS** (both real spec files byte-identical to
byte-pinned mirrors, SHA256 + length captured, zero tearing on the Copy-Item channel).

Contract gates: **FAIL** against the real, byte-extracted CoverageEngine contract.

## What is true (byte-extracted, byte-stable, verified)
- Real engine surface: `CoverageEngine.evaluateCoverage(input): CoverageResult`
  (NOT `evaluateScheduleCoverage`; `CoverageLine` has NO `shiftTime`; `CoverageInput`
  has NO `personnelAvailability`).
- Real input fields: `year, month, includeWeekends, includeNightShifts, devices[],
  shiftDefs[], holidays, deviceOffDates?, shiftDateOverrides?, technicianPersonnelCount,
  assistantPersonnelCount, supervisorPersonnelCount, assignments?, blockedPersonnelDates?`.
- Real line fields: `key, deviceId, deviceName, date, shiftType, personnelType, required,
  assigned, shortfall, isSharedBlock?, sharedDeviceIds?`.
- Deterministic pure engine: identical input ⇒ identical JSON (no Date.now/Math.random).

## Foundation gate (5c26-coverage-foundation.spec.ts — 7122B, 9 tests)
6/9 FAIL — the on-disk variant asserted a phantom contract (personnelAvailability /
shiftTime / alternate method names) that does not match the real engine. tsc also
reports errors within the spec tree for these files.

## Application gate (5c26-coverage-application.spec.ts — 6804B)
FAIL — suite references provider/wiring surfaces that do not exist in the real
schedules tree (shadowed against real service paths). No attempt to relax mocks or
weaken assertions was made.

## Consumers (immutable, previously green)
5c6 / 5c17-approve / 5c17-rollback / 5c25 — kept byte-stable; no production source,
schema, migration, or authorization was modified. (Not re-captured as part of this
final byte landing because the foundation/application pair is not green, per gate rule.)

## Why blocked
The two 5C.26 specs currently on disk do not exercise the REAL engine contract.
Authoring byte-stable-and-green foundation+application specs against the real
`evaluateCoverage` contract is a genuine next phase task. Per phase directive I do not
reconstruct, rewrite, or fabricate a green gate — I stop and report the truth.

## Next
Author a foundation spec + application spec pair whose assertions match the real
engine contract (evaluateCoverage, counts, blockedPersonnelDates, shiftType,
personnelType; no personnelAvailability/shiftTime), landing byte-stable, gated by
tsc=0 + foundation green + application green + 4 consumer greens in one byte-stable capture.
