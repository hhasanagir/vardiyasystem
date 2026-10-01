# Phase 5B.0: Service Line Architecture

**Status: COMPLETE — Radiation Oncology Separation VERIFIED**

---

## PART 10: Service Line Architecture

### Current State

No explicit `ServiceLine` model. Service lines are implicit from `UnitType` enum (16 values).

### Service Line Groupings

#### Imaging (Diagnostic)

| UnitType             | Equipment          | Domain                   |
| -------------------- | ------------------ | ------------------------ |
| `mr`                 | MRI scanners       | Diagnostic imaging       |
| `bt`                 | CT scanners        | Diagnostic imaging       |
| `rontgen`            | X-ray machines     | Diagnostic imaging       |
| `ultrason`           | Ultrasound         | Diagnostic imaging       |
| `anjiyo`             | Angiography suites | Diagnostic imaging       |
| `mamografi`          | Mammography        | Diagnostic imaging       |
| `kemik_dansitometri` | Bone densitometry  | Diagnostic imaging       |
| `floroskopi`         | Fluoroscopy        | Diagnostic imaging       |
| `pet_ct`             | PET/CT             | Diagnostic imaging       |
| `spect_ct`           | SPECT/CT           | Nuclear medicine imaging |

#### Radiation Oncology (Therapeutic)

| UnitType        | Equipment                  | Domain                 |
| --------------- | -------------------------- | ---------------------- |
| `nukleer`       | Nuclear medicine equipment | Radioactive materials  |
| `onkoloji`      | Treatment planning         | Cancer treatment       |
| `linak`         | Linear accelerator         | Radiation therapy      |
| `simutasyon_ct` | Simulation CT              | Pre-treatment planning |

#### Management

| UnitType     | Description            |
| ------------ | ---------------------- |
| `supervizor` | Supervisory/management |
| `mobil`      | Mobile units           |

### Recommended Architecture

```typescript
// domain/scheduling/service-line.scheduler.ts

interface ServiceLineScheduler {
  readonly serviceLine: string;
  readonly unitTypes: UnitType[];

  // Schedule generation
  generateSchedule(input: GenerationInput): ScheduleGenerationResult;

  // Constraints (hard + soft)
  getHardConstraints(): HardConstraint[];
  getSoftConstraints(): SoftConstraint[];

  // Scoring configuration
  getScoringWeights(): ScoringConfiguration;

  // Fairness configuration
  getFairnessWeights(): FairnessWeights;

  // Coverage requirements
  getCoverageRequirements(unit: Unit): CoverageRequirement[];
}

// Factory
class ServiceLineSchedulerFactory {
  static create(unitType: UnitType): ServiceLineScheduler;
}
```

### Key Differences: Imaging vs Radiation Oncology

| Aspect              | Imaging               | Radiation Oncology                      |
| ------------------- | --------------------- | --------------------------------------- |
| Scheduling driver   | Device availability   | Treatment plan                          |
| Session duration    | 5-60 minutes          | 15-30 minutes                           |
| Patient flow        | Walk-in / scheduled   | Treatment fractions (5-7 weeks)         |
| Weekend coverage    | Reduced               | Treatment-dependent                     |
| Staff requirements  | 1 technologist/device | Team (physicist + technologist + nurse) |
| Critical bottleneck | MRI availability      | Linac availability                      |
| Dose tracking       | N/A                   | Staff radiation dose                    |
| Holiday handling    | Typically closed      | Treatment calendar                      |

### Implementation Phases

1. **Phase 5B.0:** Define interface (this document)
2. **Phase 5B.1:** Implement `ImagingScheduler` (simpler, device-centric)
3. **Phase 5B.2:** Implement `RadiationOncologyScheduler` (treatment-plan-driven)
4. **Phase 5B.3:** Add unit-specific constraints (MR/BT/Nuclear Medicine)

---

## PART 11: Generic Resource Model Analysis

### Current Device Model

```prisma
model Device {
  id             String
  code           String
  name           String
  unitId         String
  roomId         String?
  organizationId String?
  mode           DeviceMode  // vardiya | polyclinic
  path           Unsupported("ltree")?
  requiredSkills String[]
  workDays       Int[]
  startHour      Int         // default 8
  endHour        Int         // default 20
  blockCode      String?
  isMaster       Boolean     // default false
  isActive       Boolean     // default true
  // Relations: unit, room, organization, assignments, assignmentSlots,
  //            handoverNotes, deviceIncidents, deviceStatusLogs,
  //            shiftDefinitions, dutyRoster, enterpriseAsset
}
```

### Can Device Model Support Radiation Oncology?

**YES — with no schema changes.**

The current `Device` model is generic enough:

- `code` — equipment identifier (e.g., "LINAC-01", "MR-03")
- `name` — display name
- `mode` — `vardiya` (shift-based) or `polyclinic` (OPD-based)
- `requiredSkills` — JSONB array for skill requirements
- `workDays` — JSONB array for available days
- `startHour`/`endHour` — operating hours
- `isMaster` — master device flag
- `blockCode` — grouping mechanism

### Resource Abstraction Decision

| Option                                   | Pros                       | Cons                     | Recommendation       |
| ---------------------------------------- | -------------------------- | ------------------------ | -------------------- |
| Keep `Device` as-is                      | No migration, no risk      | Semantically overloaded  | **RECOMMENDED**      |
| Add `resourceType` field                 | Distinguishes device types | Migration needed         | Future consideration |
| Create separate `TreatmentMachine` model | Clean domain separation    | Over-engineering for now | Don't do yet         |
| Rename to `Resource`                     | Generic terminology        | Massive rename migration | Don't do ever        |

### Justification

The `Device` model already functions as a generic resource. `DeviceMode` (`vardiya`/`polyclinic`) already distinguishes operational modes. Adding a `resourceType` enum could be done later if needed, but the current model handles both Imaging and Radiation Oncology equipment without changes.

**Service line differentiation happens in the strategy pattern (code), not in the database schema.**

---

_Audit completed: 2026-08-25_
