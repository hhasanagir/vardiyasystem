# VardiyaOS Production Data Integration Audit Report

**Generated:** 2026-05-06  
**Status:** CRITICAL - Production Ready Integration Required

---

## Executive Summary

The VardiyaOS codebase contains extensive mock data, demo generators, and silent fallback patterns that must be removed before production deployment. This audit identifies all instances and provides remediation guidance.

### Critical Findings

| Category                     | Count      | Severity |
| ---------------------------- | ---------- | -------- |
| Files with mock data         | 13         | CRITICAL |
| Files with fallback patterns | 18         | HIGH     |
| Contract mismatches (F/B)    | 8          | HIGH     |
| Missing error handling       | 6 services | CRITICAL |
| Components needing updates   | 12         | MEDIUM   |

---

## PART 1: MOCK DATA INVENTORY

### Files to DELETE Mock Functions

| File                             | Function                   | Lines     | Action                     |
| -------------------------------- | -------------------------- | --------- | -------------------------- |
| `reports.component.ts`           | `generateMockData()`       | 83-167    | **DELETE ENTIRE FUNCTION** |
| `onkoloji-plan.component.ts`     | `getMockTechnicians()`     | 1081-1088 | DELETE                     |
| `onkoloji-plan.component.ts`     | `getDefaultDevices()`      | 1091-1141 | DELETE                     |
| `onkoloji-plan.component.ts`     | `loadSampleData()`         | 2394-2438 | DELETE                     |
| `leave-management.component.ts`  | `getMockData()`            | 688-695   | DELETE                     |
| `live-tracking.component.ts`     | Mock liveShifts            | 476-483   | DELETE                     |
| `fairness-analysis.component.ts` | Mock personnel             | 469-478   | DELETE                     |
| `notifications.component.ts`     | Mock notifications         | 377-383   | DELETE                     |
| `employees.component.ts`         | `calculateStats()`         | 1033-1036 | REFACTOR - use API         |
| `employees.component.ts`         | `getDepartment()`          | 1062      | REFACTOR                   |
| `operations-center.component.ts` | `updateMetrics()`          | 2720-2733 | REFACTOR - use API         |
| `operations-center.component.ts` | `showExplanation()`        | 2736-2767 | REFACTOR - use API         |
| `operations-center.component.ts` | `calculateImpactPreview()` | 2970-2978 | REFACTOR - use API         |
| `onboarding.service.ts`          | `runDemo()`                | 35-39     | KEEP for demo mode flag    |

### Files to UPDATE - Remove Fallback Defaults

| File                      | Lines                          | Current Behavior              | Required Behavior        |
| ------------------------- | ------------------------------ | ----------------------------- | ------------------------ |
| `device-api.service.ts`   | 87, 102-220                    | Fallback to hardcoded devices | **THROW ERROR**          |
| `dashboard.service.ts`    | 112-115, 133-135, 154, 174-214 | Return fake metrics           | **THROW ERROR**          |
| `schedule.service.ts`     | 243-254, 270-278               | Return zeroed stats           | **THROW ERROR**          |
| `schedule-api.service.ts` | 420, 459, 474, 509             | Return empty array            | **THROW ERROR + notify** |

---

## PART 2: SILENT ERROR PATTERNS

### Pattern 1: `catchError(() => of([]))`

```typescript
// BEFORE (SILENT FAILURE)
loadAuditLog(): Observable<AuditLogResponse[]> {
  return this.api.get(...).pipe(
    catchError(() => of([]))  // ❌ User never knows data failed
  );
}

// AFTER (EXPLICIT ERROR)
loadAuditLog(): Observable<AuditLogResponse[]> {
  return this.api.get(...).pipe(
    tap(response => { if (response.success) this._auditLog.set(response.data); }),
    catchError(err => {
      this._error.set(err.message || 'Denetim günlüğü yüklenemedi');
      this.notification.error('Hata', 'Denetim günlüğü yüklenemedi');
      return of([]);
    })
  );
}
```

### Pattern 2: Fallback Arrays `|| []`

```typescript
// BEFORE (MASKS ERRORS)
const assignments = this.currentSchedule()?.assignments || [];

// AFTER (DEFENSIVE ONLY)
const assignments = this.currentSchedule()?.assignments ?? [];
```

### Pattern 3: Missing Error Handling

```typescript
// BEFORE (NO ERROR HANDLING)
getAll(): Observable<Employee[]> {
  return this.http.get<Employee[]>('/api/employees');  // ❌ Unhandled errors
}

// AFTER (PROPER ERROR HANDLING)
getAll(): Observable<Employee[]> {
  return this.http.get<Employee[]>('/api/employees').pipe(
    catchError(err => {
      console.error('Employee fetch failed:', err);
      return throwError(() => err);
    })
  );
}
```

---

## PART 3: CONTRACT MISMATCH REPORT

### Frontend-Backend DTO Alignment

| Interface   | Frontend Location                                  | Backend Location      | Status                 |
| ----------- | -------------------------------------------------- | --------------------- | ---------------------- |
| Schedule    | `domain/models/index.ts`                           | `Prisma: Schedule`    | ⚠️ Status mismatch     |
| Assignment  | `domain/models/index.ts`                           | `Prisma: Assignment`  | ✅ OK                  |
| Device      | `domain/models/index.ts` + `device-api.service.ts` | `Prisma: Device`      | ❌ DUPLICATE           |
| Personnel   | `domain/models/index.ts`                           | `Prisma: Personnel`   | ⚠️ Missing fields      |
| User        | `domain/models/index.ts`                           | `Prisma: User`        | ✅ OK                  |
| SwapRequest | `domain/models/index.ts`                           | `Prisma: SwapRequest` | ⚠️ Field name mismatch |

### ScheduleStatus Enum Mismatch

```typescript
// Frontend (INCORRECT)
type ScheduleStatus =
  | "draft"
  | "review"
  | "approved"
  | "published"
  | "archived";

// Backend Prisma (CORRECT)
enum ScheduleStatus {
  draft,
  published,
  archived,
}

// FIX: Remove 'review' and 'approved' - backend uses separate approval table
```

### SwapRequest Status Mismatch

```typescript
// Frontend (INCORRECT)
type SwapRequestStatus = "pending" | "approved" | "rejected";

// Backend Prisma (CORRECT)
enum SwapRequestStatus {
  PENDING,
  APPROVED,
  REJECTED,
}

// FIX: Use uppercase or add normalization layer
```

### Device Interface Duplication

```typescript
// frontend/src/app/domain/models/index.ts
interface Device {
  id: string;
  code: string;
  name: string;
  unit: UnitType;
  mode: DeviceMode;
  isActive: boolean;
  requiredSkills: string[];
  workDays: number[];
  startHour?: number;
  endHour?: number;
  tripleShift?: boolean;
  shiftTypes?: ShiftType[];
}

// frontend/src/app/core/api/device-api.service.ts
interface Device {
  id: string;
  code: string;
  name: string;
  block: string; // ❌ Extra field
  manufacturer: string; // ❌ Extra field
  model: string; // ❌ Extra field
  mode: "vardiya" | "polyclinic";
  tripleShift: boolean;
  isActive: boolean;
  unit: UnitType;
}

// FIX: Remove device-api.service.ts Device interface, use domain model
```

---

## PART 4: FILES TO UPDATE

### Critical Priority

1. **DELETE** `reports.component.ts` mock data (lines 83-167)
2. **UPDATE** `dashboard.service.ts` - remove all fake data fallbacks
3. **UPDATE** `device-api.service.ts` - remove `getDefaultDevicesForUnit()`
4. **UPDATE** `schedule-api.service.ts` - add proper error notifications
5. **UPDATE** `employee.service.ts` - add error handling
6. **UPDATE** `shift.service.ts` - add error handling

### High Priority

7. **UPDATE** `operations-center.component.ts` - remove all mock/reandom generators
8. **UPDATE** `onkoloji-plan.component.ts` - remove mock technicians/devices
9. **UPDATE** `leave-management.component.ts` - remove mock data
10. **UPDATE** `live-tracking.component.ts` - remove mock live shifts
11. **UPDATE** `fairness-analysis.component.ts` - remove mock personnel
12. **UPDATE** `notifications.component.ts` - remove mock notifications
13. **UPDATE** `employees.component.ts` - remove random stat generators

### Medium Priority

14. **UPDATE** `schedule.store.ts` - validate user context before API calls
15. **UPDATE** `persistence.store.ts` - add "offline mode" indicator
16. **UPDATE** Domain models - fix ScheduleStatus enum
17. **UPDATE** Domain models - fix SwapRequest status casing

---

## PART 5: RECOMMENDED SERVICE PATTERN

### Standard Error Handling Pattern

```typescript
@Injectable({ providedIn: "root" })
export class ExampleService {
  private readonly api = inject(ApiService);
  private readonly notification = inject(NotificationService);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _data = signal<Data[]>([]);

  readonly isLoading = computed(() => this._isLoading());
  readonly error = computed(() => this._error());
  readonly data = computed(() => this._data());

  loadData(): Observable<Data[]> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api.get<ApiResponse<Data[]>>("/endpoint").pipe(
      tap((response) => {
        if (response.success) {
          this._data.set(response.data);
        }
      }),
      map((response) => response.data),
      catchError((err) => {
        const message = err.error?.message || "Veriler yüklenemedi";
        this._error.set(message);
        this.notification.error("Yükleme Hatası", message);
        return of([]);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }

  createItem(item: CreateDto): Observable<Data | null> {
    this._isLoading.set(true);
    this._error.set(null);

    return this.api.post<ApiResponse<Data>>("/endpoint", item).pipe(
      tap((response) => {
        if (response.success) {
          this._data.update((list) => [...list, response.data]);
          this.notification.success("Başarılı", "Kayıt oluşturuldu");
        }
      }),
      map((response) => response.data),
      catchError((err) => {
        const message = err.error?.message || "Kayıt oluşturulamadı";
        this._error.set(message);
        this.notification.error("Kayıt Hatası", message);
        return of(null);
      }),
      finalize(() => this._isLoading.set(false)),
    );
  }
}
```

### Standard Component Error State

```typescript
@Component({...})
export class ExampleComponent {
  private readonly service = inject(ExampleService);

  // Use signals directly in template
  readonly isLoading = this.service.isLoading;
  readonly error = this.service.error;
  readonly data = this.service.data;

  ngOnInit(): void {
    this.service.loadData().subscribe();
  }

  retry(): void {
    this.service.loadData().subscribe();
  }
}
```

```html
<!-- Template -->
@if (isLoading()) {
<div class="loading-state">
  <mat-spinner></mat-spinner>
  <span>Yükleniyor...</span>
</div>
} @else if (error()) {
<div class="error-state">
  <mat-icon>error_outline</mat-icon>
  <span>{{ error() }}</span>
  <button (click)="retry()">Tekrar Dene</button>
</div>
} @else if (data().length === 0) {
<div class="empty-state">
  <mat-icon>inbox</mat-icon>
  <span>Henüz veri yok</span>
</div>
} @else {
<!-- Content -->
}
```

---

## PART 6: INTEGRATION TESTS TO CREATE

### Test File: `schedule-api.integration.spec.ts`

```typescript
describe('ScheduleApiService Integration', () => {
  let service: ScheduleApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ScheduleApiService]
    });
    service = TestBed.inject(ScheduleApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  it('should load schedule from API', (done) => {
    const mockResponse = {
      success: true,
      data: { id: '1', unit: 'mr', month: 5, year: 2026, ... }
    };

    service.loadSchedule('1').subscribe(schedule => {
      expect(schedule).toBeDefined();
      expect(schedule?.id).toBe('1');
      done();
    });

    const req = httpMock.expectOne('/api/schedules/1');
    req.flush(mockResponse);
  });

  it('should handle API errors', (done) => {
    service.loadSchedule('999').subscribe({
      next: () => fail('Should error'),
      error: (err) => {
        expect(err.status).toBe(404);
        done();
      }
    });

    const req = httpMock.expectOne('/api/schedules/999');
    req.flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
  });

  it('should set error signal on failure', () => {
    service.loadSchedule('1').subscribe();

    const req = httpMock.expectOne('/api/schedules/1');
    req.flush({ message: 'Server error' }, { status: 500, statusText: 'Error' });

    expect(service.error()).toBeTruthy();
  });
});
```

### Test File: `device-api.integration.spec.ts`

```typescript
describe("DeviceApiService Integration", () => {
  // Tests that device API throws error instead of returning defaults
  // Tests that API errors propagate correctly
});
```

---

## PART 7: MIGRATION CHECKLIST

- [ ] Remove `generateMockData()` from reports.component.ts
- [ ] Remove `getMockTechnicians()` and `getDefaultDevices()` from onkoloji-plan.component.ts
- [ ] Remove `getMockData()` from leave-management.component.ts
- [ ] Remove mock liveShifts from live-tracking.component.ts
- [ ] Remove mock personnel from fairness-analysis.component.ts
- [ ] Remove mock notifications from notifications.component.ts
- [ ] Remove `Math.random()` from employees.component.ts
- [ ] Remove `Math.random()` from operations-center.component.ts
- [ ] Update dashboard.service.ts - throw on API errors
- [ ] Update schedule.service.ts - throw on API errors
- [ ] Update device-api.service.ts - throw on API errors (no defaults)
- [ ] Update employee.service.ts - add error handling
- [ ] Update shift.service.ts - add error handling
- [ ] Update schedule-api.service.ts - add notification on errors
- [ ] Fix ScheduleStatus enum in domain/enums/index.ts
- [ ] Fix SwapRequest status casing
- [ ] Remove duplicate Device interface
- [ ] Add loading/error/empty states to all components
- [ ] Create integration tests
- [ ] Test with backend API
- [ ] Verify error messages display correctly

---

## APPENDIX: FILE PATHS

### Mock Data Files

```
frontend/src/app/components/reports/reports.component.ts
frontend/src/app/features/onkoloji/onkoloji-plan.component.ts
frontend/src/app/components/leave-management/leave-management.component.ts
frontend/src/app/components/live-tracking/live-tracking.component.ts
frontend/src/app/components/fairness-analysis/fairness-analysis.component.ts
frontend/src/app/components/notifications/notifications.component.ts
frontend/src/app/components/employees/employees.component.ts
frontend/src/app/features/operations/components/operations-center.component.ts
```

### Files Needing Error Handling Updates

```
frontend/src/app/services/dashboard.service.ts
frontend/src/app/services/schedule.service.ts
frontend/src/app/services/schedule-api.service.ts
frontend/src/app/services/employee.service.ts
frontend/src/app/services/shift.service.ts
frontend/src/app/core/api/device-api.service.ts
```

### Files Needing Contract Updates

```
frontend/src/app/domain/enums/index.ts (ScheduleStatus)
frontend/src/app/domain/models/index.ts (Device, SwapRequest)
```
