# VardiyaOS Enterprise Design System

> **Version:** 1.0.0  
> **Framework:** Angular 21 + PrimeNG Aura  
> **Status:** Reference document for implementation

---

## 1. Design Principles

1. **Clarity above all** — Healthcare workers make life-critical decisions; every UI element must be unambiguous
2. **Progressive disclosure** — Show what's needed, hide what's not; complex features revealed on demand
3. **Role-aware** — Every UI element adapts to the user's role, permissions, and context
4. **Performance is a feature** — Fast interactions, instant feedback, no blank screens
5. **Consistency** — One way to do each thing; no competing patterns

---

## 2. Color System

### 2.1 Brand Palette

```css
/* Primary — Trust, professionalism */
--color-primary-50: #eff6ff;
--color-primary-100: #dbeafe;
--color-primary-200: #bfdbfe;
--color-primary-300: #93c5fd;
--color-primary-400: #60a5fa;
--color-primary-500: #3b82f6; /* Primary action */
--color-primary-600: #2563eb; /* Hover state */
--color-primary-700: #1d4ed8;
--color-primary-800: #1e40af;
--color-primary-900: #1e3a8a;

/* Neutral — Scales for backgrounds, text, borders */
--color-neutral-50: #f8fafc;
--color-neutral-100: #f1f5f9;
--color-neutral-200: #e2e8f0;
--color-neutral-300: #cbd5e1;
--color-neutral-400: #94a3b8;
--color-neutral-500: #64748b;
--color-neutral-600: #475569;
--color-neutral-700: #334155;
--color-neutral-800: #1e293b; /* Default background */
--color-neutral-900: #0f172a; /* Darkest background */
--color-neutral-950: #020617;
```

### 2.2 Semantic Colors

```css
/* Status */
--color-success: #22c55e;
--color-success-bg: rgba(34, 197, 94, 0.12);
--color-warning: #f59e0b;
--color-warning-bg: rgba(245, 158, 11, 0.12);
--color-error: #ef4444;
--color-error-bg: rgba(239, 68, 68, 0.12);
--color-info: #3b82f6;
--color-info-bg: rgba(59, 130, 246, 0.12);

/* Shift types */
--color-shift-day: #3b82f6;
--color-shift-evening: #f59e0b;
--color-shift-night: #6366f1;
--color-shift-off: #64748b;

/* Unit accents (for radiology sections) */
--accent-mr: #3b82f6; /* Blue */
--accent-bt: #10b981; /* Green */
--accent-rontgen: #f59e0b; /* Amber */
--accent-nukleer: #8b5cf6; /* Purple */
--accent-onkoloji: #06b6d4; /* Cyan */
```

### 2.3 Background System

```css
--bg-primary: var(--color-neutral-900); /* Page background */
--bg-secondary: var(--color-neutral-800); /* Card/surface background */
--bg-tertiary: var(--color-neutral-700); /* Elevated surface */
--bg-hover: rgba(255, 255, 255, 0.05); /* Hover overlay */
--bg-active: rgba(59, 130, 246, 0.1); /* Active/selected */
--bg-glass: rgba(30, 41, 59, 0.6); /* Glass morphism */
--bg-surface: var(--color-neutral-800); /* Card background */
--bg-float: rgba(30, 41, 59, 0.95); /* Modal/drawer background */
```

### 2.4 Text System

```css
--text-primary: #f1f5f9; /* Headings, primary content */
--text-secondary: #94a3b8; /* Body text, descriptions */
--text-muted: #64748b; /* Placeholder, disabled, metadata */
--text-inverse: #0f172a; /* Text on bright backgrounds */
--text-disabled: #475569; /* Disabled text */
--text-link: #60a5fa; /* Link text */
--text-on-accent: #ffffff; /* Text on accent backgrounds */
```

---

## 3. Typography System

### 3.1 Font Stack

```css
--font-family:
  "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", "Consolas", monospace;
```

### 3.2 Type Scale

```css
/* Desktop */
--text-xs: 0.625rem; /* 10px — Labels, badges */
--text-sm: 0.75rem; /* 12px — Metadata, table cells */
--text-base: 0.8125rem; /* 13px — Body text */
--text-md: 0.875rem; /* 14px — Large body, input text */
--text-lg: 1rem; /* 16px — Subheadings */
--text-xl: 1.125rem; /* 18px — Section headings */
--text-2xl: 1.25rem; /* 20px — Page titles */
--text-3xl: 1.5rem; /* 24px — Hero titles */

/* Mobile (scale down slightly) */
@media (max-width: 768px) {
  --text-lg: 0.9375rem;
  --text-xl: 1rem;
  --text-2xl: 1.125rem;
  --text-3xl: 1.25rem;
}
```

### 3.3 Font Weights

```css
--font-normal: 400; /* Body text */
--font-medium: 500; /* Strong body, labels */
--font-semibold: 600; /* Subheadings, button text */
--font-bold: 700; /* Headings, display text */
```

### 3.4 Line Heights

```css
--leading-tight: 1.25; /* Headings */
--leading-normal: 1.5; /* Body text */
--leading-relaxed: 1.75; /* Long-form content */
--leading-dense: 1.15; /* Dense data tables */
```

---

## 4. Spacing System

### 4.1 Spacing Scale

```css
--spacing-2xs: 0.125rem; /*  2px */
--spacing-xs: 0.25rem; /*  4px */
--spacing-sm: 0.5rem; /*  8px */
--spacing-md: 0.75rem; /* 12px */
--spacing-base: 1rem; /* 16px */
--spacing-lg: 1.25rem; /* 20px */
--spacing-xl: 1.5rem; /* 24px */
--spacing-2xl: 2rem; /* 32px */
--spacing-3xl: 2.5rem; /* 40px */
--spacing-4xl: 3rem; /* 48px */
```

### 4.2 Gap System (Grid/Flex)

```css
--gap-sm: var(--spacing-md); /* 12px — Tight grids */
--gap-md: var(--spacing-xl); /* 24px — Standard grids */
--gap-lg: var(--spacing-3xl); /* 40px — Section spacing */
```

---

## 5. Elevation System

```css
--shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.3);
--shadow-md:
  0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3);
--shadow-lg:
  0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3);
--shadow-xl:
  0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
--shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
--shadow-elevated:
  0 0 0 1px rgba(255, 255, 255, 0.05), 0 25px 50px -12px rgba(0, 0, 0, 0.6);
```

---

## 6. Border Radius

```css
--radius-none: 0;
--radius-sm: 0.25rem; /*  4px */
--radius-md: 0.375rem; /*  6px */
--radius-lg: 0.5rem; /*  8px */
--radius-xl: 0.75rem; /* 12px */
--radius-2xl: 1rem; /* 16px */
--radius-3xl: 1.5rem; /* 24px */
--radius-full: 9999px; /* Pills, badges */
```

**Usage guidelines:**

- Buttons: `--radius-md`
- Cards: `--radius-xl`
- Modals/Dialogs: `--radius-2xl`
- Input fields: `--radius-md`
- Badges/Tags: `--radius-full`
- Sidebar: `--radius-none` (full height)

---

## 7. Component Standards

### 7.1 Button System

```typescript
// Usage: <button app-button variant="primary" size="md" [loading]="false">
// Or:    <p-button severity="primary" [loading]="false">

interface ButtonConfig {
  variant: "primary" | "secondary" | "ghost" | "danger" | "success" | "warning";
  size: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: string; // PrimeIcon name
  iconPos?: "left" | "right";
  fullWidth?: boolean;
  disabled?: boolean;
}
```

**Sizes:**

- `sm`: 32px height, `--text-sm`
- `md`: 40px height, `--text-base` (default)
- `lg`: 48px height, `--text-md`

**States:** Default → Hover (brighten 10%) → Active (scale 0.97) → Loading (spinner) → Disabled (opacity 0.5)

### 7.2 Form Standards

```css
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm); /* 8px gap between label + input */
}

.form-label {
  font-size: var(--text-sm); /* 12px */
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

.form-input {
  height: 40px; /* 40px standard */
  padding: 0 var(--spacing-base); /* 16px horizontal */
  font-size: var(--text-md); /* 14px */
  border-radius: var(--radius-md);
  border: 1.5px solid var(--border-default);
  background: var(--bg-secondary);
  color: var(--text-primary);
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.form-input:focus {
  border-color: var(--color-primary-500);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
  outline: none;
}

.form-error {
  font-size: var(--text-xs);
  color: var(--color-error);
  margin-top: var(--spacing-xs);
}
```

**Validation states:**

- Error: Red border + error message below
- Success: Green border (optional, for confirmations)
- Warning: Amber border (for soft validation)

### 7.3 Table Standards

```css
.table-container {
  background: var(--bg-secondary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}

.table-header {
  padding: var(--spacing-base) var(--spacing-lg);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.table-toolbar {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
}

/* Responsive table wrapper */
.table-responsive {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```

### 7.4 Card Standards

```css
.card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  overflow: hidden;
  transition:
    border-color 0.15s,
    box-shadow 0.15s;
}

.card-hoverable:hover {
  border-color: var(--border-hover);
  box-shadow: var(--shadow-md);
}

.card-header {
  padding: var(--spacing-lg) var(--spacing-xl);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-body {
  padding: var(--spacing-xl);
}

.card-footer {
  padding: var(--spacing-base) var(--spacing-xl);
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border-subtle);
}

/* Card variants */
.card-kpi {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.card-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--gap-md);
}
```

### 7.5 Empty State Standards

```html
<div class="empty-state">
  <div class="empty-state-icon">
    <svg><!-- contextual icon --></svg>
  </div>
  <h3 class="empty-state-title">Henüz veri yok</h3>
  <p class="empty-state-description">Bu bölümde henüz kayıt bulunmuyor.</p>
  <button class="btn btn-primary">Yeni Kayıt Ekle</button>
</div>
```

### 7.6 Skeleton Standards

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-tertiary) 25%,
    var(--bg-hover) 50%,
    var(--bg-tertiary) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}
```

### 7.7 Notification Standards

```css
.notification-item {
  padding: var(--spacing-base) var(--spacing-lg);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  gap: var(--spacing-base);
  align-items: flex-start;
  transition: background 0.15s;
  cursor: pointer;
}

.notification-item:hover {
  background: var(--bg-hover);
}

.notification-item.unread {
  background: var(--bg-active);
  border-left: 3px solid var(--color-primary-500);
}

.notification-priority-high {
  border-left-color: var(--color-error);
}
```

---

## 8. Grid & Layout System

### 8.1 Page Layout

```css
.page-container {
  max-width: 1600px;
  margin: 0 auto;
  padding: var(--spacing-xl);
  width: 100%;
}

@media (max-width: 768px) {
  .page-container {
    padding: var(--spacing-base);
  }
}
```

### 8.2 Grid Templates

```css
/* 2-column responsive grid */
.grid-2 {
  grid-template-columns: repeat(2, 1fr);
}
/* 3-column responsive grid */
.grid-3 {
  grid-template-columns: repeat(3, 1fr);
}
/* 4-column responsive grid */
.grid-4 {
  grid-template-columns: repeat(4, 1fr);
}
/* Auto-fill with minimum size */
.grid-auto {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

@media (max-width: 1024px) {
  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 768px) {
  .grid-3,
  .grid-4 {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 480px) {
  .grid-2,
  .grid-3,
  .grid-4 {
    grid-template-columns: 1fr;
  }
}
```

### 8.3 Responsive Breakpoints

```scss
$bp-mobile: 480px;
$bp-tablet: 768px;
$bp-desktop: 1024px;
$bp-wide: 1280px;
```

---

## 9. Transition & Animation Standards

```css
--transition-fast: 0.15s ease;
--transition-normal: 0.25s ease;
--transition-slow: 0.35s ease;

/* Page transition */
@keyframes pageEnter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-page {
  animation: pageEnter 0.3s ease-out;
}
```

---

## 10. Z-Index System

```css
--z-dropdown: 100;
--z-sticky: 200;
--z-overlay: 300;
--z-modal: 400;
--z-toast: 500;
--z-tooltip: 600;
```

---

## 11. Icon Standards

- Use **PrimeIcons** (`pi pi-*`) for all interface icons
- Use **inline SVGs** only for custom illustrations (empty states, logos)
- Icon sizes: 16px (inline/tables), 18px (buttons), 20px (nav items), 24px (page headers)
- All icons must have `aria-hidden="true"` when decorative, `aria-label` when interactive

---

## 12. Enterprise Patterns

### 12.1 Command Palette (Ctrl+K)

- Modal overlay with search input
- Fuzzy match on: page titles, actions, recent pages
- Categories: Pages, Actions, Recent
- Keyboard: `Ctrl+K` to open, `Esc` to close, `↑↓` to navigate, `Enter` to select

### 12.2 Global Search

- Topbar search input with debounce (300ms)
- Results grouped by entity type (Personnel, Schedules, Devices, Units)
- Each result shows: name, type badge, context info
- Click navigates to detail page

### 12.3 Breadcrumbs

```html
<nav aria-label="Breadcrumb" class="breadcrumbs">
  <a routerLink="/app/dashboard">Dashboard</a>
  <span class="sep">/</span>
  <a routerLink="/app/personnel">Personel</a>
  <span class="sep">/</span>
  <span aria-current="page">Detay</span>
</nav>
```

### 12.4 Profile Menu

- User avatar + name trigger
- Dropdown: Profile, Settings, Help, Logout
- Shows role badge

### 12.5 Notification Drawer

- Slide-out panel from right
- Tabs: All, Unread, Mentions
- Real-time counter
- Mark-as-read on click
- "View all" link to notification center

---

## 13. Component Checklist

Every new or refactored component must have:

- [ ] `ChangeDetectionStrategy.OnPush`
- [ ] Standalone with explicit `imports`
- [ ] All text using `--text-*` tokens
- [ ] All spacing using `--spacing-*` tokens
- [ ] All colors using `--color-*` or `--bg-*` tokens
- [ ] Loading skeleton state
- [ ] Empty state
- [ ] Error state
- [ ] RBAC permission check (if role-restricted)
- [ ] Responsive behavior (mobile + tablet + desktop)
- [ ] Keyboard navigation support
- [ ] ARIA labels on interactive elements
- [ ] `trackBy` on all `@for` loops
- [ ] `takeUntil(destroy$)` or signal-based cleanup

---

## 14. Implementation Order

| Step | Component                | Effort | Impact     |
| ---- | ------------------------ | ------ | ---------- |
| 1    | Breadcrumbs component    | 2h     | 🔥🔥🔥🔥   |
| 2    | Profile dropdown menu    | 2h     | 🔥🔥🔥🔥   |
| 3    | Empty state audit        | 4h     | 🔥🔥🔥🔥   |
| 4    | Skeleton loader audit    | 6h     | 🔥🔥🔥🔥   |
| 5    | Unsaved changes guard    | 4h     | 🔥🔥🔥     |
| 6    | Notification drawer      | 8h     | 🔥🔥🔥🔥   |
| 7    | Command palette (Ctrl+K) | 16h    | 🔥🔥🔥🔥🔥 |
| 8    | Global search            | 24h    | 🔥🔥🔥🔥🔥 |
| 9    | Table enhancements       | 16h    | 🔥🔥🔥🔥   |
| 10   | Token cleanup            | 16h    | 🔥🔥🔥     |
| 11   | Page transitions         | 4h     | 🔥🔥       |
| 12   | Keyboard shortcuts       | 8h     | 🔥🔥       |

---

**File:** `docs/frontend/design-system.md`  
**Version:** 1.0.0  
**Next review:** 2026-Q3
