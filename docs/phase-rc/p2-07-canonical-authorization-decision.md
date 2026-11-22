# P2-07 — Legacy vs DDD Canonical Authorization Decision

- **REPO (AUTHORITATIVE):** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
- **Faz:** P2-07 Canonical Authorization Decision (READ-ONLY — kod değişikliği YAPILMADI)
- **Tarih:** 2026-09-21
- **Mod:** READ-ONLY AUDIT

---

## 1. Executive Summary

Approval / review / publish authorization için production-canonical contract **DDD** imkanlıdır.

- Her iki surface **ACTIVE** (çift taraflı production trafiği): `SchedulesController` (legacy `/schedules`) ve `SchedulesDDDController` (`/schedules-ddd`) aynı `SchedulesModule` içinde register edilmiş ve frontend'de **iki ayrı canlı UI** bunları çağırıyor (FireVibe + Approval-Center → legacy; Scheduling Workspace → DDD).
- Repository dokümantasyonu canonical yönü **net biçimde DDD** olarak işaretler: `phase-5c21` DDD katmanını **[PRODUCTION-AUTHORITATIVE]** ilan eder, `phase-5c16` FE "target client" olarak DDD client'ı (`schedule-api.service.ts`) gösterir, `phase-2` legacy controller'ı "backward compatible - preserved" tanımlar, `phase-5b0` canonical business logic'i `ScheduleApplicationService` üzerinden kurar.
- **Yetki eşiği drift'i legacy lehine (daha geniş = daha zayıf):** submit 400 (legacy) vs 500 (DDD); approve/reject 500 (legacy, runtime `canApprove`) vs 600 (DDD); rollback **300** (legacy, `HEAD_TECHNICIAN`=senior) vs **800** (DDD); delete/revision 300 vs yok/600. Publish/archive her iki tarafta da etkin 600 → aynı.
- KARAR SINIFI: **B** — `DDD = CANONICAL`, `LEGACY = ACTIVE / MIGRATION` (UNUSED değil). Runtime'da **DUAL ACTIVE AUTHORIZATION PATH** mevcuttur; bu durum canonical'ı belirsizleştirmez, aksine legacy'nin hizalamaya/emekliye ayrılmaya konu olduğunu gösterir. Çözüm ayrı implementasyon fazına bırakıldı.

**Sayılar:** P0=0 · Drift operasyonları: approve/reject/submit/rollback/revision/delete (6) · Eşit: publish/archive (2) · P2-07 = **RESOLVED (canonical=DDD, IMPLEMENTATION REQUIRED)** → yeni faz gerektirir, bu fazda uygulanmaz.

---

## 2. Repository Identity

`Get-Location` → `C:/Users/Hasan/OneDrive/Desktop/vardiyasystem` ✅
`git rev-parse --show-toplevel` → desktop root ✅
`git branch --show-current` → `main`
`git rev-parse HEAD` → `eb7a6dbabfdd254810a7e5f6c9f263395446b61e`
`git status --short` → 135 satır (dirty, korundu; hiçbir reset/clean/checkout/force yapılmadı)

Belgeler tree `C:\Users\Hasan\OneDrive\Belgeler\...` **kesinlikle kullanılmadı.**

---

## 3. Baseline

| Gate | Komut | Sonuç |
|---|---|---|
| FE TYPECHECK | `npm run typecheck` (frontend) | **PASS** (exit 0) |
| FE BUILD | `npm run build` (frontend) | **PASS** (exit 0) |
| BE TEST | `npm test` (backend) | **PASS** — 97 files / 1066 tests (170.06s) |
| BE TSC | `npx tsc --noEmit` (backend) | **PASS** (exit 0) |

Baseline **GREEN** → P2-07 BLOCKED değil.

---

## 4. Business Operations

Aynı state makinesi iki yüzeyde de kullanılıyor (`models/schedule-status.ts:4-10,12-19`):

```text
draft → under_review → approved → published → archived
                     ↘ rejected → draft
```

Operasyonlar: **submit**, **approve**, **reject**, **publish**, **archive**, **rollback**, **revision/revert-to-draft**, **delete**.

---

## 5. Legacy Authorization Surface (`SchedulesController`, `/schedules`)

Class-guardlar: `schedules.controller.ts:62` → `@UseGuards(JwtAuthGuard, RolesGuard, ScheduleAccessGuard, UnitScopeGuard)`. `RolesGuard` = `hasMinRole(role, MinRole)` threshold semantiği (`>=`) — `backend/guards/role-guards.ts`, `auth/guards/roles.guard.ts`.

| Endpoint | Metod | @Roles (MinRole) | Runtime kontrol | Service | Mutasyon |
|---|---|---|---|---|---|
| `POST /schedules` → create | :76-77 | FIELD_SUPERVISOR (400) | — | SchedulesService | schedule row |
| `GET /schedules` list | :85-86 | VIEWER | unit-scope list filtre | SchedulesService | — |
| `GET /schedules/pending-approvals` | :123-124 | SUPERVISOR (500) | org filter (5c11) | SchedulesWorkflowService.getPendingApprovals :693-710 | — |
| `POST /schedules/:id/submit` | :503-504 | FIELD_SUPERVISOR (400) + `@UnitScope` | state makinesi valid | SchedulesWorkflowService.submitForReview :74-130 | status, approval, audit, notify |
| `POST /schedules/:id/approve` | :516-517 | **HEAD_TECHNICIAN (=SENIOR 300, deprecate)** | **`canApprove`** :525-527 | SchedulesWorkflowService.approve :132-197 | status→approved + four-eyes |
| `POST /schedules/:id/reject` | :531-532 | HEAD_TECHNICIAN (300) | **`canApprove`** :540-542 | SchedulesWorkflowService.reject :199-263 | status→rejected |
| `POST /schedules/:id/publish` | :546-547 | **PLANNER (=ID 600, deprecate)** | — (service `canPublish` :275-277) | SchedulesWorkflowService.publish :265-378 | snapshot + published + skill/availability/coverage gates |
| `POST /schedules/:id/archive` | :557-558 | PLANNER (600) | — (service `canPublish` :383-385) | SchedulesWorkflowService.archive :380-427 | status→archived |
| `POST /schedules/:id/rollback/:version` | :567-568 | **HEAD_TECHNICIAN (300)** | — | SchedulesWorkflowService.rollback :429-530 | swap cancel + assignment restore + version |
| `POST /schedules/:id/revision` | :579-580 | **HEAD_TECHNICIAN (300)** | — | SchedulesWorkflowService.createRevision :532-591 | snapshot + draft |
| `POST /schedules/:id/duplicate` | :589-590 | SUPERVISOR (500) | — | SchedulesService.duplicate | kopya |
| `DELETE /schedules/:id` | :601-602 | **HEAD_TECHNICIAN (300)** | imaging_director ek guard (draft-only) :606-611 | SchedulesService.delete | schedule row |
| `POST /schedules/unit/:unit/publish` | :229-230 | HEAD_TECHNICIAN (300)?? eccetto `publishByUnit` | — | (unit-bazlı legacy publish) | firevibe akışı |
| `POST /schedules/generate*` | :636-659 | HEAD_TECHNICIAN (300) | — | AutoGenerator/DryRun | generation |

> Not: legacy `publishByUnit` :229-230 `@Roles(MinRole.HEAD_TECHNICIAN)`→300; FireVibe bu endpoint'i kullanıyor (`schedule.service.ts:924`). Ama `POST /schedules/:id/publish` :546 PLANNER(600)+`canPublish`(600).

---

## 6. DDD Authorization Surface (`SchedulesDDDController`, `/schedules-ddd`)

Class-guardlar: `schedules-ddd.controller.ts:50` → `@UseGuards(JwtAuthGuard, RolesGuard, ScheduleAccessGuard)` (ScheduleAccessGuard org-ownership sağlar). Service zinciri: controller → `ScheduleApplicationService` → `ScheduleAggregate` (domain, version-gated) → `PrismaScheduleRepository` → prisma.

| Endpoint | Metod | @Roles | @Permissions | Throttle | Stub/Real |
|---|---|---|---|---|---|
| `POST /schedules-ddd` create | :138-142 | SUPERVISOR (500) | schedule.create | — | real (5c24) |
| `GET /schedules-ddd` list | :156-157 | VIEWER | schedule.read | — | real, unit-scope `resolveReadScope` :166-176 |
| `GET /schedules-ddd/:id` | :187-189 | VIEWER | schedule.read | — | unit/org check :199-204 |
| `POST :id/assignments` | :209-210 | SUPERVISOR (500) | schedule.update | — | real (version-gated) |
| `POST :id/assignments/override` | :224-226 | SUPERVISOR (500) | schedule.override | — | real |
| `PUT/DELETE :id/assignments` | :243-270 | SUPERVISOR (500) | schedule.update | — | real |
| `POST :id/submit-for-review` | :274-275 | SUPERVISOR (500) | schedule.submit | — | real |
| `POST :id/approve` | :289-291 | **IMAGING_DIRECTOR (600)** | schedule.approve | 10/min | real + four-eyes |
| `POST :id/reject` | :305-307 | **IMAGING_DIRECTOR (600)** | schedule.reject | 10/min | real |
| `POST :id/publish` | :321-323 | **IMAGING_DIRECTOR (600)** | schedule.publish | 5/min | real + aggregate validasyon |
| `POST :id/archive` | :336-338 | **IMAGING_DIRECTOR (600)** | schedule.archive | — | real |
| `POST :id/revert-to-draft` | :350-352 | IMAGING_DIRECTOR (600) | schedule.update | — | real |
| `POST :id/rollback` | :364-366 | **HOSPITAL_ADMIN (800)** | schedule.rollback | 5/min | real (lock + idempotency) |
| `GET :id/versions/:version` | :383-390 | SUPERVISOR (500) | — | — | real |
| `POST :id/validate` | :394-395 | SUPERVISOR (500) | schedule.validate | — | real |
| `POST :id/jobs/*` + `GET jobs` | :401-492 | SUPERVISOR(v) / TECHNICIAN(export) / VIEWER(jobs) ; cancel SUPERVISOR | schedule.generate/export/read | 5-10/min | **bulk üretim/export = STUB** (5c21:98)—onay akışıyla ilgili değil |

---

## 7. Endpoint Matrix (production wiring)

| Operation | Legacy endpoint | DDD endpoint | FE caller |
|---|---|---|---|
| submit | `POST /schedules/:id/submit` | `POST /schedules-ddd/:id/submit-for-review` | FireVibe (svc :1015) + Workspace (`schedule-api.service.ts:96`) |
| approve | `POST /schedules/:id/approve` | `POST /schedules-ddd/:id/approve` | Approval-Center (`approval-center.component.ts:519`) + Workspace (`schedule-workspace.component.ts:497`) |
| reject | `POST /schedules/:id/reject` | `POST /schedules-ddd/:id/reject` | Approval-Center (:539) + Workspace (:506) |
| publish | `POST /schedules/:id/publish` · `POST /schedules/unit/:unit/publish` | `POST /schedules-ddd/:id/publish` | Approval-Center (:557) + FireVibe (svc :924, :1097) + Workspace (:520) |
| archive | `POST /schedules/:id/archive` | `POST /schedules-ddd/:id/archive` | FireVibe/Workspace |
| rollback | `POST /schedules/:id/rollback/:version` | `POST /schedules-ddd/:id/rollback` | Workspace + version-panel |
| revert/draft | `POST /schedules/:id/revision` | `POST /schedules-ddd/:id/revert-to-draft` | Workspace (:538) |

`/schedules-ddd` FE client: `frontend/src/app/features/scheduling/services/schedule-api.service.ts:20` (`BASE='/schedules-ddd'`); legacy client: `frontend/src/app/services/schedule.service.ts:1019-1131,1336,924`.

---

## 8. Role Threshold Matrix

| Operation | Legacy (decorator) | Legacy (ETKİN — runtime) | DDD |
|---|---|---|---|
| submit | 400 (FS) | 400 | **500 (SV)** |
| approve | 300 (senior, deprecate) | **500 (canApprove: SV+ID+admin)** | **600 (ID)** |
| reject | 300 | **500 (canApprove)** | **600 (ID)** |
| publish | 600 (PLANNER→ID, deprecate) | **600 (canPublish: ID+admin)** | 600 (ID) |
| archive | 600 | 600 (canPublish) | 600 (ID) |
| rollback | **300** | **300 (runtime kontrol YOK)** | **800 (HOSPITAL_ADMIN)** |
| revision / revert-to-draft | 300 (revision) | 300 | 600 (revert-to-draft) |
| delete | 300 | 300 (draft guard kısmen) | (yok) |

Kaynaklar: `min-role.ts:32,38` (HEAD_TECHNICIAN=SENIOR_TECHNICIAN 300, PLANNER=IMAGING_DIRECTOR 600); `schedule-status.ts:171-179` (canApprove=[ID,SV]+admin; canPublish=[ID]+admin); `schedules-workflow.service.ts:275-277,383-385` (publish/archive runtime canPublish).

---

## 9. Permission Matrix

| Permission | Legacy | DDD |
|---|---|---|
| schedule.approve / reject / publish / archive / submit / rollback | decorator tabanlı @Roles µ, **permission string YOK** | `@Permissions('schedule.approve')` vb. **var** (:291,307,323,338,276,366) + RBAC |

DDD yalnızca role threshold değil, RBAC permission string'i de taşır — authorization contract DDD tarafında daha eksiksizdir.

---

## 10. Organization Scope

| | Legacy | DDD |
|---|---|---|
| org-ownership guard | `ScheduleAccessGuard` class-level (:62; guard :40-78, cross-org deny) | `ScheduleAccessGuard` class-level (:50; aynı guard) |
| tenant fail-closed | evet (org/unit bağlamı yoksa 403, guard :49-78) | evet (aynı guard) |

Org scope her iki tarafta **aynı guard** → hizalı.

---

## 11. Unit Scope

| | Legacy | DDD |
|---|---|---|
| Mekanizma | class-level `UnitScopeGuard` (:62) + submit/device-off `@UnitScope` (:505,617) + list read filtre | `list`/`getOne` → `unitScopeService.resolveReadScope` (:166-176,199-204); create `@UnitScope(unitBodyField:'unitId')` (:140); submit/approve/publish → rol eşiği (500/600) FS'yi zaten kapatır |
| FS confinement | kendi birimine sıkı (UNIT_SCOPED_ROLES, min-role:53-57) | FS hiçbir mutasyon/onay eşiğine ulaşamaz (submit 500+); read unit-scoped |

Etkin kapsam aynı: **FS tek birim + mutation-red; SV org genelinde (tasarım gereği)**. Fark: DDD threshold doğrudan unit-rol çakışmasını yok eder (600 eşiği), legacy rol+scope iki katmanına dayanır.

---

## 12. Production Usage Evidence

1. **Route usage (FE):** `/app/schedules` → `features/scheduling/scheduling.routes.ts` → ScheduleList+ScheduleWorkspace (DDD). `/app/firevibe-schedule` → FireVibe (legacy). `/app/approval-center` → legacy pending-approvals/approve/reject/publish (`approval-center.component.ts:519-562`). Her ikisi de canlı.
2. **Service usage:** DDD — `ScheduleApplicationService` (yalnız DDD controller + testler). Legacy — `SchedulesWorkflowService` (yalnız legacy controller + `schedules.service.ts`, testler). Cron/job onay çağırmıyor (`@Cron` yalnız data-retention & notification-scheduler).
3. **Controller usage:** ikisi de `SchedulesModule.controllers` listesinde (:27) → ikisi de Nest route'a bağlı.
4. **Dependency graph:** DDD: `ScheduleAccessGuard` + `ScheduleApplicationService` + `PrismaScheduleRepository` (version-gated, domain events, Redis lock concurrency). Legacy: `ScheduleAccessGuard` + `UnitScopeGuard` + `SchedulesWorkflowService` (raw prisma, lock yok, version yok) — `concurrency-reliability.md:207` F-01: legacy uçları bu garantileri baypas eder.
5. **Database mutation path:** ikisi de `schedule.status` + `scheduleApproval` ve `scheduleSnapshot` alanlarında çalışır (aynı state modeli, `prisma-schedule.repository.ts:87-233`, `schedules-workflow.service.ts:150-341`).
6. **Authorization tests:** aşağıda (Bölüm 16).
7. **Architecture docs:** aşağıda (Bölüm 13).

---

## 13. Module Registration & Architecture Documentation

- `schedules.module.ts:27` → `controllers: [SchedulesController, SchedulesDDDController, PersonnelAvailabilityController]` — **her ikisi register edili**.
- `docs/phase-5/phase-5c21-readonly-audit-report.md:91` → `ScheduleApplicationService + ScheduleAggregate + repository | DDD layer | **[PRODUCTION-AUTHORITATIVE]**`.
- `docs/phase-5/phase-5c16-release-readiness.md:229` → FE "Authoritative candidate: Family A (`core/api`)… architecture docs point to `schedule-api.service.ts` as target client" (DDD client).
- `docs/phase-5/phase-5b0-canonical-business-logic.md:31` → canonical business logic `ScheduleApplicationService.overrideAssignment()` (DDD).
- `docs/phase-2/scheduling-core-report.md:83` → "Backward compatible — old controller at `/schedules` preserved, new DDD controller at `/schedules-ddd`".
- `docs/phase-4/concurrency-reliability.md:207` → F-01 HIGH: duplicated stacks; legacy bypasses lock/version guarantees.
- `docs/phase-5/phase-5b0-duplicate-audit.md:58` + `phase-2:34` → TD-3 iki paralel controller = açık teknik borç.
- `docs/phase-5/phase-5c24-readonly-audit-report.md:100` → DDD workflow uçları REAL (approve/reject/publish/archive/revert/rollback).

**Yorum:** dokümantasyon canonical yönü açıkça DDD der; legacy "preserved/backward compatible" yüzey (FireVibe + Approval-Center için). MIGRATION yüzeyidir, "unused" değildir.

---

## 14. Frontend Caller Analysis

- DDD client yalnız `features/scheduling` özelliği tarafından kullanılıyor: `schedule-api.service.ts` (11 workflow metodu), `schedule-command.service.ts` (:100-170), tüketiciler `schedule-workspace.component.ts:383`, `schedule-list.component.ts:207`, `version-panel.component.ts:105`, `version-compare.component.ts:120`.
- Legacy client FireVibe + Approval-Center: `schedule.service.ts` (`submitForReview` :1015, `approveSchedule`/`rejectSchedule`/`publishSchedule` :1044-1121, `loadPendingApprovals` :1332, `publishByUnit` :924).
- **Her iki client de production route'larında canlı.**

---

## 15. Dependency Graph

```text
[FE scheduling-workspace]  → schedule-api.service (/schedules-ddd)
                             → SchedulesDDDController (:50 guards)
                                → ScheduleApplicationService (domain aggregate, version-gated, four-eyes)
                                   → PrismaScheduleRepository → prisma (status+approval+snapshot)

[FE firevibe]  +  [FE approval-center]
                             → schedule.service (/schedules legacy)
                                → SchedulesController (:62 guards)
                                   → SchedulesWorkflowService (raw prisma, canApprove/canPublish runtime)
                                   → SchedulesService (rollback/duplicate/delete)
```

---

## 16. Test Evidence

| İmplementasyon | Onay/publish yetki testleri | Rol sabitlemeleri |
|---|---|---|
| DDD (aggregate + app service) | `schedule-aggregate.spec.ts:32-62` (submit supervisor / approve imaging_director / revert imaging_director / four-eyes deny); `security-invariants.spec.ts:89-105,190-193` (approve as imaging_director); `5c9`, `5c14-ddd-create-scope` (unit/org scope); `5c11` (audit metadata + pending org) | declarative: commit → 500 submit, 600 approve/publish/archive, 800 rollback |
| Legacy (workflow) | `5c17-approve-four-eyes.spec.ts:65-110` (**role='supervisor'** approve ALLOWED); `5c25-availability-enforcement` / `5c26-coverage` (publish gates); `5c17-update-status-gate` | approve pratiği **SUPERVISOR(500)**, publish ID(600) |
| PIN'lenmemiş | hiçbir spec `MinRole.HEAD_TECHNICIAN`/`MinRole.PLANNER` sabitlemiyor (grep: 0 eşleşme) | legacy decorator 300/600 değerleri test edilmiyor |

**Coverage farkı:** DDD'nin role eşiği aggregate + app-service spec'lerinde sabit; legacy'nin decorator 300'ü testlerde örtülüyor (testler supervisor kullanıyor → effective 500 gerçeğiyle uyumlu).

---

## 17. Security Impact

**Etkin (runtime) eşikler üzerinden rol matrisi:**

| Operation | FIELD_SUPERVISOR Legacy | FIELD_SUPERVISOR DDD | SUPERVISOR Legacy | SUPERVISOR DDD |
|---|---|---|---|---|
| submit | **ALLOWED** (400≤450) | DENIED (500) | ALLOWED | ALLOWED |
| approve | DENIED (500) | DENIED (600) | **ALLOWED** | DENIED |
| reject | DENIED (500) | DENIED (600) | **ALLOWED** | DENIED |
| publish | DENIED (600) | DENIED (600) | DENIED | DENIED |
| archive | DENIED (600) | DENIED (600) | DENIED | DENIED |
| rollback | **ALLOWED** (300) | DENIED (800) | **ALLOWED** | DENIED |
| revision/revert | **ALLOWED** (300) | DENIED (600) | **ALLOWED** | DENIED |
| delete | **ALLOWED** (300)** | (yok) | **ALLOWED** | (yok) |

**Analiz:**
- **4 işlemde legacy DDD'den geniş:** submit (400 vs 500), approve/reject (500 vs 600), rollback (300 vs 800), delete/revision (300 vs 600).
- En kritik: **SUPERVISOR legacy'de plan onaylayabilir** (`canApprove`=SV, spec:5c17) ama DDD'de IMAGING_DIRECTOR(600) gerekir; **senior_technician (300) legacy'de rollback/delete/revision yapabilir** — DDD'de sırasıyla 800/600 gerekir.
- Aynı veri (schedule tablosu) iki farklı eşikle mutasyona açık → **SUPERVISOR, legacy Approval-Center/FireVibe üzerinden DDD eşiğini baypas edebilir** (aynı schedule kaydı).
- publish/archive etkin eşikleri eşit (600); copy drift yalnızca decorator'da (PLANNER alias).

UNKNOWN yok — tüm değerler manuel/guard kanıtına dayanıyor.

---

## 18. Canonical Decision

**KARAR SINIFI: B** → `DDD = CANONICAL`; `LEGACY = ACTIVE / MIGRATION` (unused değil).

Gerekçe (Section 9 kriterleri):
1. Route usage — ikisi de canlı (DUAL ACTIVE PATH, kayıt altında).
2. Module registration — ikisi de canlı.
3. Frontend caller — DDD client "target client" (5c16:229); legacy client FireVibe/Approval-Center'a özgü (eski yüzey).
4. Dependency graph — DDD: version/lock/event/discrete; legacy: raw prisma, garantisiz (F-01).
5. DB mutation — aynı tablo → canonical seçimi data-model değil, contract kararı.
6. Auth tests — DDD eşikleri declarative ve spec-sabit; legacy 300/600 decorator'ları test dışı.
7. Architecture docs — DDD **PRODUCTION-AUTHORITATIVE** (5c21:91), canonical business logic DDD (5b0), "old preserved backward-compatible" (phase-2:83).

`DUAL ACTIVE AUTHORIZATION PATH` notu (Section 11): her iki yüzey de production trafiği alıyor. Bu, canonical'ı geçersiz kılmaz — repository'nin kendi authoritative beyanı DDD'dir; dual-aktiflik, legacy hizalamasının/emekliliğinin neden yapılması gerektiğini gösterir.

---

## 19. Implementation Recommendation (UYGULANMADI — sonraki faz)

```
CANONICAL = DDD

Recommended next implementation (ayrı fazda, en az ayrıcalık korunarak):
- Legacy workflow authorization'ı DDD'ye hizala (daralt = güvenli yön):
    • submit: 400 → 500
    • approve/reject: effective 500 → 600 (canApprove güncelle: [ID]+admin veya decorator'ı 600
      yapıp runtime kontrolü kaldır — decorator == runtime tek kaynak)
    • rollback: 300 → 800
    • delete/revision: 300 → yok/600 (delete DDD tarafında zaten yok → legacy delete'i kaldır
      veya 600+ yap, draft guard'ı koru)
    • publish/archive: dokunma (etkin 600 zaten == DDD) — GEÇİCİ uyum; decorator alias PLANNER'ı
      kaldırıp IMAGING_DIRECTOR yap
- Deprecated alias'ları kapat: HEAD_TECHNICIAN(300)→SENIOR_TECHNICIAN, PLANNER→IMAGING_DIRECTOR
  (min-role.ts:32,38) → tek eşik kaynağı.
- Regression testleri ekle: FIELD_SUPERVISOR denied submit/approve/rollback legacy; SUPERVISOR
  denied approve legacy (şu an ALLOWED — bu davranış değişimi olur, feature-flag'le fail-mue);
  IMAGING_DIRECTOR allowed approve/publish; wrong org denied; unit denied.
- FE cut-over planı: Approval-Center → DDD pending-approvals + approve; FireVibe publish → DDD
  publish; legacy workflow uçları geri çekilince legacy controller'ın onay/publish uçları kapatılır.
- Orjinal kapsam doğrulaması: 5c11/5c17/5c25/5c26 spec'leri tarafından korunduğundan emin ol;
  güvenlik envanterine yansıt.
```

Not: legacy'i hizalar yana, legacy yüzeyler (FireVibe+Approval-Center) DDD'ye geçene dek active kalır → kademeli geçiş (feature gate) şart; tek seferde emeklilik riski FireVibe üretim akışını durdurur.

---

## 20. Open Questions

1. FireVibe (legacy) birim-bazlı `publishByUnit` akışının DDD eşdeğeri (`/schedules-ddd/:id/publish`) bugün FireVibe akışına uyuyor mu (unit-publish per schedule)? Migration'da FireVibe DDD workspace'e mi yoksa DDD publish'e mi hizalanmalı? **(product kararı)**
2. Legacy `DELETE /schedules/:id` ve `revision` için DDD simetriği yok — bu işlevler korunacak mı (yeni implementation) yoksa iptal mi? **(product kararı)**
3. SUPERVISOR'ın legacy approve hakkı bugün gerçek üretimde kullanılıyor mu (audit log `APPROVE` action aktör dağılımı)? Hizalamanın davranış-etkisini ölçmek için log sorgusu önerildi.
4. RBAC permission tabanlı eşiklerin (9) legacy tarafına entegrasyonu isteniyor mu yoksa yalnızca role eşiği mi yeterli?

---

`P2-07 = RESOLVED (CANONICAL = DDD) / IMPLEMENTATION REQUIRED` — bu faz READ-ONLY idi; hiçbir kod değişikliği yapılmadı.

`STOP`