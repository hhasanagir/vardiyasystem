# Phase 5A: Service Line Architecture

**VardiyaOS — Service Line Scheduling Strategy**

---

## Current State

There is **no explicit `ServiceLine` model** in the database. Service lines are implicitly defined by `UnitType`:

```prisma
enum UnitType {
  mr                    // Imaging — MRI
  bt                    // Imaging — CT
  rontgen               // Imaging — X-Ray
  nukleer               // Radiation Oncology — Nuclear Medicine
  onkoloji              // Radiation Oncology — Oncology
  ultrason              // Imaging — Ultrasound
  anjiyo                // Imaging — Angiography
  mamografi             // Imaging — Mammography
  kemik_dansitometri    // Imaging — Bone Densitometry
  floroskopi            // Imaging — Fluoroscopy
  pet_ct                // Imaging — PET/CT
  spect_ct              // Imaging — SPECT/CT
  linak                 // Radiation Oncology — Linear Accelerator
  simutasyon_ct         // Radiation Oncology — Simulation CT
  mobil                 // Mobile units
  supervizor            // Management
}
```

## Service Line Groupings

### Imaging (Diagnostic)

| Unit Type            | Equipment          | Typical Shifts    | Constraints                                                 |
| -------------------- | ------------------ | ----------------- | ----------------------------------------------------------- |
| `mr`                 | MRI scanners       | Day/Evening/Night | Long scan times (30-60 min), patient prep, safety screening |
| `bt`                 | CT scanners        | Day/Evening/Night | Faster scans (5-15 min), contrast protocols                 |
| `rontgen`            | X-ray machines     | Day/Evening       | Walk-in patients, quick turnaround                          |
| `ultrason`           | Ultrasound         | Day/Evening       | Operator-dependent, patient flow                            |
| `anjiyo`             | Angiography suites | Day/Evening       | Interventional, team-based                                  |
| `mamografi`          | Mammography        | Day/Evening       | Screening schedules, patient comfort                        |
| `kemik_dansitometri` | Bone densitometry  | Day               | Low throughput                                              |
| `floroskopi`         | Fluoroscopy        | Day/Evening       | Real-time imaging, radiation safety                         |
| `pet_ct`             | PET/CT             | Day               | Radiopharmaceutical timing, long procedures                 |
| `spect_ct`           | SPECT/CT           | Day               | Nuclear medicine protocols                                  |

**Key Characteristics:**

- Device-centric scheduling (each machine has shift patterns)
- `DeviceMode.vardiya` (shift-based) or `DeviceMode.polyclinic` (OPD-based)
- Patient-slot-driven (device availability determines capacity)
- Standard 8-hour shifts (day/evening/night)
- Weekend/holiday coverage typically reduced

### Radiation Oncology (Therapeutic)

| Unit Type       | Equipment          | Typical Shifts | Constraints                                     |
| --------------- | ------------------ | -------------- | ----------------------------------------------- |
| `nukleer`       | Nuclear medicine   | Day/Evening    | Radioactive materials, decay timing             |
| `onkoloji`      | Treatment planning | Day            | Treatment plan-driven                           |
| `linac`         | Linear accelerator | Day/Evening    | Treatment fractions (5-7 weeks), precise timing |
| `simutasyon_ct` | Simulation CT      | Day            | Pre-treatment planning                          |

**Key Characteristics:**

- Treatment-plan-driven scheduling (patient needs determine device time)
- Longer sessions (15-30 minutes per fraction)
- Consecutive-day treatments (5 days/week for weeks)
- Device availability is critical (Linac is bottleneck)
- Radiation safety constraints (staff dose limits)
- Holiday scheduling follows treatment calendars, not business calendars

### Management

| Unit Type    | Description                 |
| ------------ | --------------------------- |
| `supervizor` | Supervisory/management unit |

---

## Recommended Strategy Pattern for Phase 5B

### ServiceLineScheduler Interface

```typescript
interface ServiceLineScheduler {
  readonly serviceLine: string;
  readonly unitTypes: UnitType[];

  // Schedule generation
  generateSchedule(input: GenerationInput): ScheduleGenerationResult;

  // Constraint evaluation
  getHardConstraints(): HardConstraint[];
  getSoftConstraints(): SoftConstraint[];

  // Scoring
  getScoringWeights(): ScoringConfiguration;

  // Fairness
  getFairnessWeights(): FairnessWeights;

  // Coverage requirements
  getCoverageRequirements(unit: Unit): CoverageRequirement[];

  // Device-specific rules
  getDeviceSchedulingRules(device: Device): DeviceSchedulingRules;
}
```

### ImagingScheduler Implementation

```typescript
class ImagingScheduler implements ServiceLineScheduler {
  readonly serviceLine = "imaging";
  readonly unitTypes = [
    "mr",
    "bt",
    "rontgen",
    "ultrason",
    "anjiyo",
    "mamografi",
    "kemik_dansitometri",
    "floroskopi",
    "pet_ct",
    "spect_ct",
  ];

  generateSchedule(input: GenerationInput): ScheduleGenerationResult {
    // Device-centric: for each device, find optimal personnel assignment
    // Consider: patient slots, operator skills, mode (vardiya/polyclinic)
  }

  getHardConstraints(): HardConstraint[] {
    return [
      ...ALL_HARD_CONSTRAINTS,
      new PolyclinicModeConstraint(), // polyclinic mode has different slot rules
      new ContrastAgentConstraint(), // contrast agent timing
    ];
  }
}
```

### RadiationOncologyScheduler Implementation

```typescript
class RadiationOncologyScheduler implements ServiceLineScheduler {
  readonly serviceLine = "radiation_oncology";
  readonly unitTypes = ["nukleer", "onkoloji", "linak", "simutasyon_ct"];

  generateSchedule(input: GenerationInput): ScheduleGenerationResult {
    // Treatment-plan-driven: load patient plans, allocate device time
    // Consider: fraction schedules, dose constraints, equipment calibration
  }

  getHardConstraints(): HardConstraint[] {
    return [
      ...ALL_HARD_CONSTRAINTS,
      new LinacAvailabilityConstraint(), // Linac must be available for treatment
      new RadiationDoseConstraint(), // Staff dose limits
      new TreatmentContinuityConstraint(), // Treatment must not be interrupted
    ];
  }
}
```

### Factory

```typescript
class ServiceLineSchedulerFactory {
  private static readonly schedulers: Map<string, ServiceLineScheduler> =
    new Map([
      ["imaging", new ImagingScheduler()],
      ["radiation_oncology", new RadiationOncologyScheduler()],
    ]);

  static create(unitType: UnitType): ServiceLineScheduler {
    for (const [key, scheduler] of this.schedulers) {
      if (scheduler.unitTypes.includes(unitType)) {
        return scheduler;
      }
    }
    throw new Error(`No scheduler for unit type: ${unitType}`);
  }
}
```

---

## Key Differences: Imaging vs Radiation Oncology

| Aspect                    | Imaging                   | Radiation Oncology                         |
| ------------------------- | ------------------------- | ------------------------------------------ |
| **Scheduling Driver**     | Device availability       | Treatment plan                             |
| **Session Duration**      | 5-60 minutes              | 15-30 minutes                              |
| **Patient Flow**          | Walk-in / scheduled       | Treatment fractions (5-7 weeks)            |
| **Weekend Coverage**      | Reduced                   | Treatment-dependent                        |
| **Holiday Handling**      | Typically closed          | Treatment calendar                         |
| **Staff Requirements**    | 1 technologist per device | Team (physicist + technologist + nurse)    |
| **Equipment Constraints** | Standard                  | Calibration schedules, maintenance windows |
| **Dose Limits**           | N/A                       | Staff radiation dose tracking              |
| **Critical Bottleneck**   | MRI availability          | Linac availability                         |

---

## Recommendation

1. **Do NOT create a `ServiceLine` database model** — use `UnitType` enum as the discriminator
2. **Implement strategy pattern in code** — `ServiceLineScheduler` interface with per-service-line implementations
3. **Start with Imaging** — simpler, device-centric, more straightforward
4. **Add Radiation Oncology second** — treatment-plan-driven, more complex constraints
5. **Shared base** — common constraint engine, fairness engine, scoring model
6. **Domain-specific extensions** — additional constraints, scoring weights, coverage rules per service line
