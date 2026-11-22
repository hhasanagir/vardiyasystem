# Phase 5B.1 — Service Line Strategy

## Architecture

```
SchedulingStrategy (interface)
├── ImagingSchedulingStrategy
└── RadiationOncologySchedulingStrategy

createSchedulingStrategy(serviceLine: ServiceLine): SchedulingStrategy
```

## Purpose

Keep Imaging and Radiation Oncology scheduling rules **completely separate**.

No RT-specific rules leak into Imaging. No Imaging rules contaminate RT.

## Interface

```typescript
interface SchedulingStrategy {
  serviceLine: ServiceLine;
  getExtraHardConstraints(): string[];
  getExtraSoftConstraints(): string[];
  evaluateDomainSpecific(context: SchedulingContext): ConstraintScore[];
  validateCandidate(context: SchedulingContext): boolean;
}
```

## Service Lines

### ServiceLine.IMAGING

**Hard Constraints:**
- `IMAGING_MODALITY_MATCH` — Device modality matches assignment type
- `IMAGING_DEVICE_CAPABILITY` — Device capabilities match patient needs

**Soft Constraints:**
- `IMAGING_MODALITY_ROTATION` — Rotate across MR/CT/X-Ray/Nuclear
- `IMAGING_DEVICE_FAMILIARITY` — Prefer familiar devices

### ServiceLine.RADIATION_ONCOLOGY

**Hard Constraints:**
- `RT_DOSE_LIMIT` — Monthly/annual dose limits
- `RT_MACHINE_QUALIFICATION` — Personnel qualified for RT machines
- `RT_TREATMENT_PROTOCOL` — Treatment protocol compliance

**Soft Constraints:**
- `RT_PATIENT_CONTINUITY` — Same therapist for patient continuity
- `RT_MACHINE_UTILIZATION` — Optimize machine utilization

## Design Rules

1. Strategy instances are created via factory function
2. Strategy methods return arrays of constraint IDs (not implementations yet)
3. `evaluateDomainSpecific` returns empty arrays (placeholder for Phase 5B.2)
4. `validateCandidate` always returns true (placeholder for Phase 5B.2)
5. RT-specific logic NEVER appears in Imaging strategy
6. No Prisma ServiceLine migration — strategy is code-level only

## Imaging Modalities (Preserved)

| Modality | UnitType |
|---|---|
| MR | MRI |
| CT | CT |
| X-Ray | XRAY |
| Nuclear Medicine | NM |

## Files

- `domain/strategies/scheduling-strategy.ts` — Interface + implementations
- `domain/strategies/index.ts` — Re-exports
- `__tests__/5b1-domain-architecture.spec.ts` — Strategy tests (5 tests)

## Test Coverage

- Imaging strategy creation
- RT strategy creation
- Separate instances
- RT has RT-specific hard constraints
- Imaging does not have RT constraints
