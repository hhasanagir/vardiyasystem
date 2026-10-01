# VardiyaOS Frontend Architecture

> **Angular 21 · Standalone Components · Signal Store · Feature Modules · Lazy Loading · PrimeNG**

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Domain Layer](#3-domain-layer)
4. [Signal Store Pattern](#4-signal-store-pattern)
5. [Feature Modules (Smart/Dumb)](#5-feature-modules)
6. [UI Primitives Library](#6-ui-primitives)
7. [Typed Forms](#7-typed-forms)
8. [Error Boundaries & Global Error Handling](#8-error-boundaries)
9. [Route-Level Code Splitting & Lazy Loading](#9-lazy-loading)
10. [State Management Strategy](#10-state-management)
11. [Services & API Layer](#11-services)
12. [Change Detection Strategy](#12-change-detection)
13. [Testing Strategy](#13-testing)
14. [Migration Plan](#14-migration-plan)

---

## 1. Architecture Overview

```
app/
├── core/           # Singleton services, interceptors, guards, stores, scheduling engine
├── domain/         # Pure TypeScript: models, enums, rules, validation
├── ui/             # Reusable presentational components (dumb components)
├── features/       # Feature modules with smart containers + dumb components
├── layouts/        # Page layout components (auth, main)
├── shared/          # Pipes, directives, typed forms, utilities
└── app.ts          # Root component (minimal)
```

**Key Principles:**

- **Domain models never import Angular.** Pure TypeScript with zero framework dependencies.
- **Smart components** (containers) handle data fetching, state, and business logic.
- **Dumb components** receive `@Input()` data and emit `@Output()` events — no DI.
- **All routes are lazy-loaded** via `loadComponent()` or `loadChildren()`.
- **Signals** are the primary reactivity primitive; RxJS is reserved for async streams (HTTP, WebSocket).
- **Typed reactive forms** use generic `FormGroup<Controls>` for full type safety.
- **Change Detection Strategy** is `OnPush` everywhere.

---

## 2. Directory Structure

```
src/app/
├── app.ts                          # Root component (selector: 'app-root')
├── app.config.ts                   # ApplicationConfig providers
├── app.routes.ts                   # Root route definitions
├── environments.ts                 # Dev environment
├── environments.prod.ts            # Prod environment
│
├── core/
│   ├── api/                        # HTTP API clients
│   │   ├── api.service.ts          # Base HTTP service
│   │   └── device-api.service.ts   # Device API client
│   ├── interceptors/               # HTTP interceptors
│   │   ├── auth.interceptor.ts     # Bearer token + 401 refresh
│   │   ├── csrf.interceptor.ts     # CSRF token
│   │   └── offline.interceptor.ts  # Offline queue
│   ├── scheduling/                 # Scheduling engine (pure TS)
│   │   ├── scheduling.models.ts
│   │   ├── constraint-solver.service.ts
│   │   ├── fairness-balancer.service.ts
│   │   └── ...
│   ├── services/                   # Core singleton services
│   │   └── logger.service.ts
│   ├── state/                      # Signal stores
│   │   ├── index.ts                # Public API barrel
│   │   ├── state.models.ts        # Re-export conduit
│   │   ├── schedule.store.ts
│   │   ├── metrics.store.ts
│   │   ├── unit.store.ts
│   │   └── persistence.store.ts
│   ├── error-handler.service.ts    # Global ErrorHandler implementation
│   └── logger.service.ts
│
├── domain/                         # Pure TS — zero Angular imports
│   ├── index.ts
│   ├── models/
│   │   ├── index.ts
│   │   ├── scheduling.ts           # Schedule, ShiftAssignment, Personnel, Device
│   │   ├── auth.ts                 # User, AuthResponse, Organization
│   │   ├── operations.ts           # Shift, Employee, Rule, SwapRequest
│   │   └── analytics.ts            # DashboardStats, FairnessScore, ScheduleAnalytics
│   ├── enums/
│   │   ├── index.ts
│   │   └── enums.ts                # All domain enums
│   └── rules/
│       ├── index.ts
│       └── scheduling-constraints.ts  # UNIT_CONFIG, CONSTRAINT_LIMITS, etc.
│
├── ui/                             # Presentational primitives (dumb components)
│   ├── index.ts                    # Barrel export
│   ├── empty-state/
│   │   └── empty-state.component.ts
│   ├── skeleton/
│   │   └── skeleton.component.ts
│   ├── toast-container/
│   │   └── toast-container.component.ts
│   ├── offline-badge/
│   │   └── offline-badge.component.ts
│   ├── pwa-install-prompt/
│   │   └── pwa-install-prompt.component.ts
│   ├── session-timeout-warning/
│   │   └── session-timeout-warning.component.ts
│   ├── confirm-modal/
│   │   └── confirm-modal.component.ts
│   ├── error-boundary/
│   │   └── error-boundary.component.ts
│   ├── error-fallback/
│   │   └── error-fallback.component.ts
│   └── loading-overlay/
│       └── loading-overlay.component.ts
│
├── shared/
│   ├── directives/
│   │   └── count-up.directive.ts
│   ├── pipes/                      # Pure pipes
│   ├── forms/                      # Typed form utilities
│   │   └── typed-form.ts
│   └── utils/
│       └── index.ts
│
├── features/                       # Feature modules
│   ├── dashboard/
│   │   ├── dashboard.component.ts       # Smart container
│   │   ├── kpi-card.component.ts        # Dumb component
│   │   └── unit-health-card.component.ts # Dumb component
│   ├── operations/
│   │   ├── components/
│   │   │   ├── operations-center.component.ts
│   │   │   ├── operations-center.component.html
│   │   │   ├── operations-center.component.scss
│   │   │   ├── quick-actions.component.ts
│   │   │   ├── conflicts-block.component.ts
│   │   │   └── ...
│   │   └── services/
│   │       └── recommendations.service.ts
│   ├── plans/
│   │   └── plan-page/
│   │       ├── plan-page.component.ts
│   │       ├── plan-page.component.html
│   │       ├── plan-page.component.scss
│   │       └── device-row/
│   ├── auth/                       # Auth feature (login, register)
│   │   ├── login.component.ts
│   │   ├── register.component.ts
│   │   └── onboarding.component.ts
│   ├── my-day/
│   │   └── my-day.component.ts
│   ├── my-shifts/
│   │   └── my-shifts.component.ts
│   ├── audit/
│   │   └── audit-timeline.component.ts
│   └── ... (15+ features)
│
├── layouts/
│   ├── main-layout/
│   │   └── main-layout.component.ts
│   └── auth-layout/
│       └── auth-layout.component.ts
│
├── guards/
│   ├── auth.guard.ts               # authGuard + roleGuard
│   └── guest.guard.ts              # Guest-only access
│
├── interceptors/                   # Legacy re-exports (delegate to core/interceptors/)
│
└── services/                       # Legacy re-exports (consolidating to core/api/)
```

---

## 3. Domain Layer

### 3.1 Rules

- **Zero Angular dependencies.** Classes, interfaces, enums, and pure functions only.
- Always exported via barrel `index.ts` files.
- Domain models are `interface` types (no classes), serializable by default.

### 3.2 Model Organization

```typescript
// domain/models/scheduling.ts
export interface Schedule { ... }
export interface ShiftAssignment { ... }
export interface Personnel { ... }
export interface Device { ... }

// domain/models/auth.ts
export interface User { ... }
export interface AuthResponse { ... }

// domain/models/operations.ts
export interface Employee { ... }
export interface Shift { ... }
export interface SwapRequest { ... }

// domain/models/analytics.ts
export interface DashboardStats { ... }
export interface FairnessScore { ... }
```

### 3.3 Barrel Exports

```typescript
// domain/models/index.ts
export type {
  Schedule,
  ShiftAssignment,
  Personnel,
  Device,
} from "./scheduling";
export type { User, AuthResponse, Organization } from "./auth";
export type { Employee, Shift, SwapRequest } from "./operations";
export type { DashboardStats, FairnessScore } from "./analytics";
```

---

## 4. Signal Store Pattern

### 4.1 Store Template

```typescript
import { Injectable, signal, computed } from "@angular/core";

interface MyFeatureState {
  items: MyItem[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
}

const INITIAL_STATE: MyFeatureState = {
  items: [],
  selectedId: null,
  loading: false,
  error: null,
};

@Injectable({ providedIn: "root" })
export class MyFeatureStore {
  // Private state — only mutated by store methods
  private readonly state = signal<MyFeatureState>(INITIAL_STATE);

  // Public readonly signals
  readonly items = computed(() => this.state().items);
  readonly selectedId = computed(() => this.state().selectedId);
  readonly loading = computed(() => this.state().loading);
  readonly error = computed(() => this.state().error);

  // Derived signals (computed from state)
  readonly selectedItem = computed(
    () => this.items().find((i) => i.id === this.selectedId()) ?? null,
  );

  // Mutators
  setItems(items: MyItem[]): void {
    this.state.update((s) => ({ ...s, items, loading: false, error: null }));
  }

  setLoading(): void {
    this.state.update((s) => ({ ...s, loading: true, error: null }));
  }

  setError(error: string): void {
    this.state.update((s) => ({ ...s, error, loading: false }));
  }

  reset(): void {
    this.state.set(INITIAL_STATE);
  }
}
```

### 4.2 RxJS Bridge (when needed)

```typescript
// For RxJS-driven side effects (HTTP, WebSocket), bridge via `toSignal`:
import { toSignal } from "@angular/core/rxjs-interop";
import { inject } from "@angular/core";

export class MyService {
  private http = inject(HttpClient);
  readonly items$ = this.http.get<Item[]>("/api/items").pipe(shareReplay(1));
  readonly items = toSignal(this.items$, { initialValue: [] });
}
```

### 4.3 Existing Stores

| Store              | Location                       | Scope                                       |
| ------------------ | ------------------------------ | ------------------------------------------- |
| `ScheduleStore`    | `core/state/schedule.store.ts` | Schedule data, current selection, conflicts |
| `MetricsStore`     | `core/state/index.ts`          | Dashboard/unit metrics                      |
| `UnitStore`        | `core/state/index.ts`          | Selected unit, available units              |
| `PersistenceStore` | `core/state/index.ts`          | Online status, sync state, localStorage     |

---

## 5. Feature Modules

### 5.1 Smart / Dumb Pattern

```
features/my-feature/
├── my-feature.component.ts          # Smart: injects stores/services, manages state
├── my-feature-detail.component.ts    # Dumb: @Input() data, @Output() events
├── my-feature-list.component.ts      # Dumb: @Input() items[], @Output() events
└── my-feature-form.component.ts      # Smart-ish: owns typed FormGroup
```

**Smart Component Rules:**

- Has injected dependencies (stores, services, router)
- Subscribes to data streams / reads signals
- Passes data down via `@Input()` to dumb components
- Handles `@Output()` events from dumb components
- Can own the `FormGroup` for forms

**Dumb Component Rules:**

- No injected dependencies (except `ChangeDetectionRef` if absolutely needed)
- Data arrives via `@Input()` properties
- User actions emitted via `@Output()` EventEmitters
- Pure presentational logic only
- Marked `changeDetection: ChangeDetectionStrategy.OnPush`

### 5.2 Current Feature Inventory

| Route                | Feature           | Smart Container              | Status |
| -------------------- | ----------------- | ---------------------------- | ------ |
| `/app/dashboard`     | Dashboard         | `DashboardComponent`         | Smart  |
| `/app/operations`    | Operations Center | `OperationsCenterComponent`  | Smart  |
| `/app/mr-plan`       | MR Plan           | `PlanPageComponent`          | Smart  |
| `/app/bt-plan`       | BT Plan           | `PlanPageComponent` (reused) | Smart  |
| `/app/employees`     | Employees         | `EmployeesComponent`         | Smart  |
| `/app/login`         | Auth              | `LoginComponent`             | Smart  |
| `/app/my-day`        | My Day            | `MyDayComponent`             | Smart  |
| `/app/my-shifts`     | My Shifts         | `MyShiftsComponent`          | Smart  |
| `/app/shifts`        | Shift Definitions | `ShiftsComponent`            | Smart  |
| `/app/swap-requests` | Swap Requests     | `SwapRequestsComponent`      | Smart  |

---

## 6. UI Primitives

### 6.1 Primitive Components

Located in `src/app/ui/`, these are reusable, framework-agnostic presentational components.

| Component               | Inputs                                                                                          | Outputs                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `EmptyState`            | `icon: string`, `title: string`, `message: string`, `actionLabel?: string`                      | `action: EventEmitter<void>`                                |
| `Skeleton`              | `width?: string`, `height?: string`, `count?: number`, `variant?: 'text' \| 'card' \| 'circle'` | —                                                           |
| `ToastContainer`        | —                                                                                               | — (uses service)                                            |
| `OfflineBadge`          | —                                                                                               | —                                                           |
| `PwaInstallPrompt`      | —                                                                                               | —                                                           |
| `SessionTimeoutWarning` | —                                                                                               | —                                                           |
| `ConfirmModal`          | `config: ModalConfig`                                                                           | `confirm: EventEmitter<void>`, `cancel: EventEmitter<void>` |
| `ErrorBoundary`         | `fallback?: TemplateRef`                                                                        | `error: EventEmitter<Error>`                                |
| `ErrorFallback`         | `errorId: string`, `message: string`                                                            | `retry: EventEmitter<void>`                                 |
| `LoadingOverlay`        | `loading: boolean`, `message?: string`                                                          | —                                                           |
| `CountUp`               | `end: number`, `duration?: number`                                                              | — (directive)                                               |
| `LiveBadge`             | `connected: boolean`                                                                            | —                                                           |

### 6.2 Styling Conventions

- All styles use CSS custom properties (variables) defined in `styles/`.
- No `ViewEncapsulation.None` — default emulated encapsulation.
- Component styles are co-located (`.scss` file or inline).
- Shared styles go in `src/styles/` and are imported via `angular.json`.

---

## 7. Typed Forms

### 7.1 Utility

```typescript
// shared/forms/typed-form.ts
import { FormControl, FormGroup, FormArray } from "@angular/forms";

type Controls<T> = {
  [K in keyof T]: T[K] extends Array<infer U>
    ? FormArray<FormControl<U>>
    : FormControl<T[K]>;
};

export function typedFormGroup<T extends Record<string, any>>(controls: {
  [K in keyof T]: FormControl<T[K]>;
}): FormGroup<Controls<T>> {
  return new FormGroup(controls);
}

export function typedFormControl<T>(value: T): FormControl<T> {
  return new FormControl(value) as FormControl<T>;
}
```

### 7.2 Usage Example

```typescript
import { typedFormGroup, typedFormControl } from "@shared/forms/typed-form";

interface ShiftForm {
  name: string;
  startTime: string;
  endTime: string;
  durationHours: number;
}

const form = typedFormGroup<ShiftForm>({
  name: typedFormControl(""),
  startTime: typedFormControl("08:00"),
  endTime: typedFormControl("16:00"),
  durationHours: typedFormControl(8),
});

// Fully typed — errors on property name typos
form.value.name; // string
form.value.startTime; // string
```

---

## 8. Error Boundaries

### 8.1 Global Error Handler

Already implemented in `core/error-handler.service.ts`. Extends Angular's `ErrorHandler`:

- Generates unique error IDs (`crypto.randomUUID().slice(0, 8)`)
- Logs to `LoggerService`
- Shows a fallback UI in `#error-fallback` element
- Provides a "Refresh page" action

### 8.2 Component-Level Error Boundary

```typescript
// ui/error-boundary/error-boundary.component.ts
@Component({
  selector: "app-error-boundary",
  template: `
    @if (hasError()) {
      <app-error-fallback
        [errorId]="errorId()"
        [message]="errorMessage()"
        (retry)="retry()"
      />
    } @else {
      <ng-content />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorBoundaryComponent {
  private readonly error = signal<Error | null>(null);
  readonly hasError = computed(() => this.error() !== null);
  readonly errorId = signal("");
  readonly errorMessage = signal("");

  @Output() errorCaught = new EventEmitter<Error>();

  @Input() fallback?: TemplateRef<any>;

  handleError(error: Error): void {
    this.error.set(error);
    this.errorId.set(crypto.randomUUID().slice(0, 8));
    this.errorMessage.set(error.message);
    this.errorCaught.emit(error);
  }

  retry(): void {
    this.error.set(null);
    // Re-initialization logic delegated to parent
  }
}
```

### 8.3 Error Propagation Flow

```
HTTP Error
  → Interceptor (auth.interceptor.ts)
    → 401 → Token refresh → retry
    → Non-retryable → throwError
  → Component subscription
    → catchError → store.setError()
    → UI renders error state
    → Optional: ErrorBoundary fallback

Uncaught JS Error
  → GlobalErrorHandler.handleError()
    → LoggerService.error()
    → DOM fallback UI (#error-fallback)
    → ErrorBoundary can catch with error handler
```

---

## 9. Lazy Loading

### 9.1 Current Implementation

All routes use `loadComponent()` for lazy loading — **already implemented.** Example:

```typescript
{
  path: 'dashboard',
  loadComponent: () =>
    import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  title: 'Kontrol Paneli - VardiyaOS',
}
```

### 9.2 Optimization Guidelines

- Keep component files lean by extracting heavy dependencies (services, stores) to separate files.
- Use `withPreloading(PreloadAllModules)` in `provideRouter` — **already enabled**.
- For very large features (e.g., Operations Center), consider `loadChildren` with child routes to split further.
- Monitor bundle size with `ng build --stats-json` and analyze with `esbuild-visualizer`.

### 9.3 Route Data for Code Splitting

```typescript
// app.routes.ts
{
  path: 'operations',
  canActivate: [roleGuard],
  data: {
    minRole: 'head_technician',
    preload: true,        // Hint for custom preloader
    animation: 'slideRight',
  },
  loadComponent: () => import('./features/operations/...'),
  title: 'Operasyon Merkezi - VardiyaOS',
}
```

---

## 10. State Management Strategy

### 10.1 Decision Matrix

| Concern                    | Solution                                           |
| -------------------------- | -------------------------------------------------- |
| Server state (API data)    | `toSignal(http.get())` or manual signal stores     |
| Client state (UI state)    | Component-local `signal()`                         |
| Shared cross-feature state | `Injectable({ providedIn: 'root' })` signal stores |
| Real-time (WebSocket)      | RxJS Subject → signal bridge                       |
| Form state                 | Typed `FormGroup` with signal integration          |
| Offline queue              | `PersistenceStore` + `OfflineInterceptor`          |

### 10.2 Data Flow

```
API Response
  → Service (HttpClient, toSignal)
    → Store (signal-based, providedIn: 'root')
      → Smart Component (reads signal, passes to dumb)
        → Dumb Component (@Input(), renders)

User Action
  → Dumb Component (@Output())
    → Smart Component (handles event)
      → Service (HTTP call)
        → API
      → Store (update signal)
        → UI reactivity
```

---

## 11. Services & API Layer

### 11.1 Service Organization

| Directory        | Purpose                                          | Examples                         |
| ---------------- | ------------------------------------------------ | -------------------------------- |
| `core/api/`      | Base HTTP + domain-specific API clients          | `ApiService`, `DeviceApiService` |
| `core/services/` | Infrastructure services                          | `LoggerService`                  |
| `services/`      | **Legacy** — being consolidated into `core/api/` | `AuthService`, `ScheduleService` |

### 11.2 API Service Pattern

```typescript
@Injectable({ providedIn: "root" })
export class ScheduleApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/schedules`;

  loadSchedules(params: ScheduleParams): Observable<ScheduleResponse> {
    return this.http.get<ScheduleResponse>(this.baseUrl, { params });
  }

  getById(id: string): Observable<Schedule> {
    return this.http.get<Schedule>(`${this.baseUrl}/${id}`);
  }
}
```

### 11.3 Migration Path

New API services go in `core/api/`. Legacy `services/` will be gradually migrated.

---

## 12. Change Detection

### 12.1 Rules

- **Every component** uses `changeDetection: ChangeDetectionStrategy.OnPush` — **already standard**.
- No manual `markForCheck()` calls needed with Signals (Angular 21 automatically marks ancestors dirty when signal reads are tracked).
- Avoid `async` pipe for signal data — prefer reading signals directly in templates.
- For RxJS observables that must be used in templates, convert with `toSignal()` and read the resulting signal.

---

## 13. Testing Strategy

- Unit tests with `vitest` (configured in `vitest.config.ts`).
- Component tests use `TestBed` with `provideExperimentalZonelessChangeDetection` when testing signal-based components.
- Mock services and stores — never instantiate real HTTP or stores in unit tests.
- Test dumb components by providing `@Input()` values and asserting rendered output.
- Test smart components by mocking dependencies and asserting store method calls.

---

## 14. Migration Plan

### Phase 1: Foundation (Current — Done)

- [x] Angular 21 standalone setup
- [x] All routes lazy-loaded
- [x] Signal-based stores (ScheduleStore, MetricsStore, UnitStore, PersistenceStore)
- [x] Domain layer (models, enums, rules)
- [x] Global error handler
- [x] ChangeDetection.OnPush everywhere
- [x] PrimeNG integration
- [x] Service Worker / PWA
- [x] Offline support

### Phase 2: Infrastructure (This Pass)

- [x] `/docs/frontend-architecture.md` — this document
- [x] Typed forms utility (`shared/forms/typed-form.ts`)
- [x] `ui/` directory with barrel export for presentational primitives
- [x] Error boundary component (`ui/error-boundary/`)
- [x] Error fallback component (`ui/error-fallback/`)
- [x] Loading overlay component (`ui/loading-overlay/`)
- [x] Consolidate domain model splinters into single import tree
- [x] `core/state/state-models.ts` — standardized barrel
- [x] `shared/utils/` — URI helpers, formatters

### Phase 3: Smart/Dumb Refactoring (Next)

- [ ] Extract `KpiCardComponent` from `DashboardComponent`
- [ ] Extract `UnitHealthCardComponent` from `DashboardComponent`
- [ ] Extract `UnitCardComponent` from `OperationsCenterComponent`
- [ ] Extract `ScheduleFilterComponent` from `PlanPageComponent`
- [ ] Extract `PersonnelListComponent` from `EmployeesComponent`
- [ ] Consolidate `services/` → `core/api/`
- [ ] Remove duplicate `models/` → delegate to `domain/models/`
- [ ] Remove duplicate `interceptors/` → delegate to `core/interceptors/`

### Phase 4: Advanced (Future)

- [ ] Implement `loadChildren` for large features (operations, plans)
- [ ] Add `ngrx-store-devtools` or custom signal devtools
- [ ] Resource API for HTTP caching with `@angular/core` `resource()`
- [ ] Route transition animations
- [ ] Server-side rendering with `@angular/ssr`
- [ ] End-to-end tests with Playwright
- [ ] Visual regression tests (Chromatic / Percy)
