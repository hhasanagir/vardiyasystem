# N+1 Query Audit

**Scope:** Prisma schema relationships and repository query patterns
**Result:** ✅ No active N+1 issues found; key risk areas documented below

## Relationship-by-Relationship Analysis

### Schedule → Assignments

- Repository uses `include: { assignments: true }` — a **single query with join**.
- **GOOD** — Prisma fetches schedules and their assignments in one round trip.

### Schedule → Approval

- Uses `include: { approval: true }`.
- **GOOD** — no separate query loop per schedule.

### Assignment → Personnel

- Personnel is **not included** in schedule queries.
- Personnel is loaded separately, **only when actually needed**.
- **GOOD** — avoids over-fetching heavy personnel rows on schedule listings.

### Assignment → Device

- Device is **not included** in schedule queries.
- **GOOD** — device data fetched on demand only.

### Audit log queries

- Single-table queries.
- **No N+1 risk.**

## Key Risk Areas

| Area                                    | Risk                                                                 | Current State                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Schedule list endpoint                  | Could trigger N+1 **if** it loads assignments per schedule in a loop | Mitigated — repository-level `include` prevents this                                                   |
| `findAll` in `PrismaScheduleRepository` | Large datasets inflate join size                                     | Efficient today (`include: { assignments: true }`), but unbounded result sets remain a scaling concern |

## Findings Detail

- The `findAll` implementation in `PrismaScheduleRepository` uses
  `include: { assignments: true }` — **efficient**: one joined query regardless of row count.
- Because relations are consistently loaded via `include` at the repository layer,
  there is no evidence of query-in-a-loop patterns anywhere in the audited paths.

## Recommendations

1. **Monitor `findAll` under large datasets.**
   A single joined query does not mean bounded cost — thousands of schedules × many
   assignments each can produce large payloads and slow serialization.
2. **Consider cursor-based pagination** for schedule listing endpoints:
   - Use Prisma `cursor` + `take` keyed on a stable, indexed column (e.g., `id` or `createdAt`).
   - Expose pagination metadata to clients instead of returning unbounded lists.
3. **Keep the convention:** always load related entities through `include`/`select` at
   the repository layer — never issue per-row follow-up queries inside loops.
4. Add a load/perf test that exercises the schedule list endpoint with a large fixture
   dataset so N+1 or payload-size regressions surface early.

## Verdict

Current query patterns are **healthy**. No remediation required now; pagination hardening is the main forward-looking improvement.
