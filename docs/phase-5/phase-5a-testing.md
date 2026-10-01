# Phase 5A: Testing Strategy Reference

**VardiyaOS — Schedule Testing Architecture**

---

## Current Test Status

### Test Runner

- **Vitest 4.1.9**
- **Command:** `npx vitest run <specific-file>` (singular files only)
- **Known Issue:** `npx vitest run` without args hangs indefinitely
- **Build Check:** `npx tsc --noEmit` (alternative to `npx nest build` which times out)

### Test Files (Schedule Module)

| File                              | Tests | Status      | Purpose                       |
| --------------------------------- | ----- | ----------- | ----------------------------- |
| `security-closure-4.1.spec.ts`    | 38    | ✅ PASS     | Security behavioral tests     |
| `security-invariants.spec.ts`     | 12    | ✅ PASS     | Security invariant regression |
| `device-shift-visibility.spec.ts` | 14    | ✅ PASS     | DTO mapping tests             |
| `constraint-engine.spec.ts`       | —     | ✅ PASS     | Constraint validation         |
| `fairness-engine.spec.ts`         | —     | ⚠️ FAIL (2) | Fairness calculation          |
| `schedule-validation.spec.ts`     | —     | ✅ PASS     | Validation orchestration      |

### Known Failures

| Test                                  | Failure                | Root Cause                         |
| ------------------------------------- | ---------------------- | ---------------------------------- |
| `analytics.service.spec.ts` (2 tests) | Missing `holiday` mock | Pre-existing, not schedule-related |

---

## Test Categories

### 1. Unit Tests (Domain Logic)

#### ConstraintEngine Tests

- Test each of the 12 hard constraints individually
- Test constraint engine with multiple constraints
- Test override behavior
- Test canOverride logic

#### FairnessEngine Tests

- Test CV-based scoring
- Test dimension weights
- Test edge cases (empty personnel, single person)
- Test workload calculation

#### ScoringModel Tests

- Test weighted average calculation
- Test penalty application
- Test preference score
- Test boundary conditions (0, 100)

#### Assignment Entity Tests

- Test value object creation
- Test time overlap detection
- Test date operations (dayOfWeek, isWeekend, daysUntil)
- Test shift type properties (isNightShift, isWorking)

### 2. Integration Tests (Service Layer)

#### ScheduleValidationService Tests

- Test full schedule validation flow
- Test lookup building from Prisma
- Test holiday loading
- Test conflict code mapping

#### ScheduleApplicationService Tests

- Test schedule CRUD operations
- Test assignment add/update/remove
- Test workflow transitions
- Test optimistic concurrency
- Test four-eyes principle
- Test idempotency
- Test distributed lock behavior

#### ScheduleAutoGeneratorService Tests

- Test greedy generation
- Test preview vs generate
- Test constraint validation during generation
- Test edge cases (no personnel, no devices)

### 3. API Tests (Controller Layer)

#### SchedulesController Tests

- Test all REST endpoints
- Test authentication/authorization
- Test tenant isolation
- Test rate limiting
- Test error responses

#### SchedulesDDDController Tests

- Test DTO mapping
- Test enrichment (personnel name, device code)
- Test DDD-specific endpoints

### 4. Security Tests

#### Behavioral Tests (38 tests)

- Rate limiting enforcement
- ThrottlerGuard activation
- Schedule access guard (tenant isolation)
- WebSocket authentication
- Override authorization
- Role-based access control
- Permission-based access control
- Publish validation (hard violation blocking)

#### Invariant Regression Tests (12 tests)

- Tenant isolation invariant
- Role hierarchy invariant
- Override restriction invariant
- Version verification invariant
- Four-eyes principle invariant
- Publish validation invariant

### 5. Frontend Tests (Phase 5B)

#### Store Tests

- Signal updates
- Computed value recalculation
- Action dispatching

#### Component Tests

- Schedule grid rendering
- Filter/search functionality
- View switching
- Conflict panel display

#### Service Tests

- API client calls
- WebSocket message handling
- Offline detection

---

## Test Data Strategy

### Current State

- Tests use live Prisma client (no mocking for most)
- `fairness-engine.spec.ts` fails due to missing `holiday` mock
- No dedicated schedule test fixtures

### Recommended Approach

#### For Unit Tests

```typescript
// Mock Prisma for unit tests
const mockPrisma = {
  personnel: {
    findMany: vi.fn().mockResolvedValue([...testPersonnel]),
  },
  device: {
    findMany: vi.fn().mockResolvedValue([...testDevices]),
  },
  // ...
};
```

#### For Integration Tests

```typescript
// Use test database
const testDb = await PrismaService.createTestDatabase();

// Seed with minimal data
await seedScheduleTestData(testDb);

// Run tests
// Cleanup after
```

#### For Security Tests

```typescript
// Use mock JWT tokens
const adminToken = generateTestToken({ role: "system_admin" });
const supervisorToken = generateTestToken({ role: "supervisor" });
const technicianToken = generateTestToken({ role: "technician" });
```

---

## Performance Tests (Phase 5B)

### Load Testing with k6

```javascript
// schedule-generation-load.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    schedule_generation: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 5 }, // Ramp up
        { duration: "1m", target: 10 }, // Sustained load
        { duration: "30s", target: 0 }, // Ramp down
      ],
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<30000"], // 95% under 30s
    http_req_failed: ["rate<0.01"], // <1% failure rate
  },
};

export default function () {
  const res = http.post(
    "http://localhost:3000/api/v1/schedules/dry-run",
    JSON.stringify({
      unitId: "test-unit",
      month: 8,
      year: 2026,
      algorithm: "genetic",
      configuration: {
        populationSize: 50,
        maxIterations: 500,
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${__ENV.TEST_TOKEN}`,
      },
    },
  );

  check(res, {
    "status is 200": (r) => r.status === 200,
    "has assignments": (r) => JSON.parse(r.body).assignments.length > 0,
    "has score": (r) => JSON.parse(r.body).score.overall > 0,
  });

  sleep(1);
}
```

### Benchmark Scenarios

| Scenario                                     | Target       | Notes                  |
| -------------------------------------------- | ------------ | ---------------------- |
| Greedy generation (30 personnel, 30 days)    | <5s          | Current backend        |
| Genetic optimization (30 personnel, 30 days) | <120s        | Phase 5B backend       |
| Dry-run (30 personnel, 30 days)              | <120s        | Phase 5B dry-run       |
| Full validation (2700 assignments)           | <5s          | Current backend        |
| Concurrent schedule access (10 users)        | No conflicts | Optimistic concurrency |

---

## Test Coverage Targets

| Area                         | Current   | Target | Gap            |
| ---------------------------- | --------- | ------ | -------------- |
| ConstraintEngine             | ✅ High   | 100%   | Low            |
| FairnessEngine               | ⚠️ Medium | 95%    | Medium         |
| ScoringModel                 | ⚠️ Medium | 95%    | Medium         |
| ScheduleApplicationService   | ❌ Low    | 90%    | High           |
| ScheduleAutoGeneratorService | ❌ None   | 85%    | High           |
| ScheduleOptimizerService     | ❌ N/A    | 90%    | N/A (Phase 5B) |
| API endpoints                | ❌ Low    | 85%    | High           |
| Frontend scheduling          | ❌ None   | 70%    | High           |
| Security                     | ✅ High   | 100%   | Low            |

---

## CI/CD Integration

### Current

- Tests run manually via `npx vitest run <file>`
- No CI/CD pipeline configured

### Recommended (Phase 5B)

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npx prisma generate
      - run: npx vitest run --reporter=verbose
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/vardiyasystem_test
      - run: npx tsc --noEmit
```

### Test Commands

| Command                             | Purpose                           |
| ----------------------------------- | --------------------------------- |
| `npx vitest run <file>`             | Run specific test file            |
| `npx vitest run --reporter=verbose` | Run all tests with verbose output |
| `npx tsc --noEmit`                  | Type check                        |
| `npx tsc -p tsconfig.build.json`    | Build check                       |
| `npx prisma validate`               | Schema validation                 |
| `npx prisma format`                 | Schema formatting                 |
