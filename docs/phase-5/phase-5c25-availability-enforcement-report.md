# PHASE 5C.25 — Availability Enforcement + Generated-Write Integrity

**Repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (authoritative)
**Branch/DAG:** tek commit `eb7a6db Initial commit`; backend/src ve docs/phase-5 ağaçları git'te untracked olduğundan değişiklikler faz raporu olarak belgeleniyor.
**Önceki faz:** 5C.24 READ-ONLY → **READY WITH CONDITIONS** (P0=0 · P1=7 · P2=18 · P3=14).

## Kullanıcı kararları (5C.25 başlangıcı)
1. **Kapsam:** Tam kapsam — **P1-A1 + P1-A5 + P1-A6**. P1-A2/A3/A4 sonraki fazlara ertelendi. **Migration YOK.**
2. **Fail-open / Fail-closed:** **Engine'de kapalı (BLOCKING)** — izin/rapor/uygunsuz tarihlere atama her yüzeyde reddedilir.

## Kapsam eşlemesi (5C.24 P1 satırları)
| Bulgu | Karşılık | Durum |
|---|---|---|
| schedules.service.ts:1331-1342 | P1-A1 → legacy `validateAssignmentDetailed` | ✅ BLOCKING `PERSONNEL_AVAILABILITY_CONFLICT` |
| constraint-engine / optimize | P1-A1 → `PersonnelAvailabilityConstraint` | ✅ engine + greedy + local-search |
| workflow publish | P1-A1 → publish gate | ✅ |
| generator apply | P1-A5 → status gate + intrabatch + CAS bump | ✅ |
| prisma-schedule.repository.ts:98-109 | P1-A6 → atomic CAS | ✅ |

## Uygulanan değişiklikler (production)
1. `domain/constraints/constraint.interface.ts` — `ViolationRule`'a `PERSONNEL_AVAILABILITY_CONFLICT`; `details.blockingType?`; `ConstraintContext.personnelBlockedDates?: Map<string, Set<string>>`.
2. `domain/constraints/hard-constraints.ts` — `PersonnelAvailabilityConstraint` (BLOCKING, non-overridable; non-working shift kayıtları atlanır) + `ALL_HARD_CONSTRAINTS`'a kayıt.
3. `domain/constraints/index.ts` — `PersonnelAvailabilityConstraint` (+ `DeviceOffDateConstraint`) export.
4. `domain/constraints/constraint-engine.ts` — `validate` / `validateWithOverride` / `canOverride` son opsiyonel parametre `personnelBlockedDates`.
5. `schedule-validation.service.ts` — `PersonnelAvailabilityService?` constructor; üç validate yolunda `loadPersonnelBlockedDates(unitId,year,month)` (5C.23 `resolveMonthBlockedDates`; servis yoksa `blockedByWeeklyOffDays` fallback) → engine'e aktarım; `PERSONNEL_AVAILABILITY_CONFLICT → ConflictCode.AVAILABILITY_CONFLICT`.
6. `services/personnel-availability.service.ts` — `static resolveDateEligibility()` (tek doğruluk kaynağı: explicit AVAILABLE > weekly offDay); instance `resolveEligibility` delege eder.
7. `types/violation.types.ts` — legacy `ViolationRule` + `details.blockingType?`.
8. `schedules.service.ts` (`validateAssignmentDetailed`) — aktif LEAVE/ABSENCE/UNAVAILABLE satırı varsa BLOCKING ihlal (availability client mock'da yoksa pas geçer, try/catch). Weekly offDay **değişmedi** (OFF_DAY_CONFLICT WARNING).
9. `schedules-workflow.service.ts` — `PersonnelAvailabilityService` dep; `publish`'te yetkinlik doğrulamasından sonra atamalar izinli/raporlu/uygunsuz güne denk gelirse **BadRequestException** (violator sayısı + örnek).
10. `domain/optimization/scheduling-problem.ts` — `SchedulingProblemPersonnel.blockedDates?: string[]`.
11. `domain/optimization/greedy-strategy.ts` — `findAvailable`'da `blockedDates` **authoritative** (varken offDays'ı ezer; AVAILABLE overrides korunur); `buildBlockedDatesMap` → hard/soft ctx'e engine parametresi.
12. `domain/optimization/local-search-strategy.ts` — aynı blocked map hard/soft ctx.
13. `schedule-dry-run.service.ts` — `PersonnelAvailabilityService` inject; `loadPersonnel(unitId,year,month)` `resolveMonthBlockedDates` ile `blockedDates` doldurur.
14. `infrastructure/prisma-schedule.repository.ts` — `save(expectedVersion)` artık `$transaction` içinde **`updateMany({ where:{ id, version }, data:{...} })`** (atomik CAS); count=0 → findUnique → `StaleVersionError`. CAS yoksa eski upsert yolu korundu.
15. `schedule-auto-generator.service.ts` `apply` — `isPublished(status)` gate (published/archived → ConflictException); intrabatch gelişen conflict setleri (person/device çift kayıt önlenir); versiyon bump CAS `updateMany` (count=0 → ConflictException) createMany'den önce (aynı transaction).
16. `dto/generate-schedule.dto.ts` — `ApplyGeneratedScheduleDto.expectedVersion?: number`.

## Değişen/eklenen testler
- **Yeni:** `__tests__/5c25-availability-enforcement.spec.ts` (13 test): engine constraint (block/pass/non-working skip); greedy `blockedDates` + AVAILABLE-override; publish gate (engellendi/yayınlandı); generator apply (published gate, CAS conflict, intrabatch skip); repo CAS (stale/success); legacy `addAssignment` LEAVE engeli.
- `schedule-validation.service.spec.ts` — offDay→blocking; explicit AVAILABLE override (2 test).
- **Bağımlılık güncellemeleri:** `5c17-approve-four-eyes.spec.ts`, `5c17-rollback-swap-preservation.spec.ts`, `5c6-hardening.spec.ts`, `5c11-authz-consistency.spec.ts` → `PersonnelAvailabilityService` mock provider eklendi; `schedule-auto-generator.service.spec.ts` + `5c14-apply-scope.spec.ts` → `schedule.updateMany` tx mock (CAS).

## Doğrulama
- `tsc --noEmit` **clean** ✅
- `nest build` **PASS** (exit 0) ✅
- Unit suite: **93 dosya / 1030 test PASS** ✅ (istişna: env-only `device-off.spec.ts` — canlı Postgres `localhost:5432` gerektirir, bilinen blokaj, bu faza ait değil).

## Kapsam dışı (bilinçli alınmadı — DO-NOT-TOUCH listesi)
- P1-A2/A3/A4 (revizyon/immutability kalanı, üretim bağlama, coverage modeli) → sonraki fazlar.
- Eşik değerleri / `AVAILABLE_OVER_BLOCKING` / fail-open modu DEĞİŞMEDİ (karar: kapalı).
- Determinizm (§15 senaryosu) bu fazda **test olarak yazılmadı** (5C.24 kararı).
- Optimizer→üretim bağlama, BullMQ, RBAC haritaları dokunulmadı.
- **Migration YOK** — `PersonnelDateAvailability` 5C.23'te zaten vardı.

## Notlar & sonraki adımlar
- Yeni construct dep'lerin Nest spec'leri mock ile beslenir; üretim `schedules.module.ts` sağlar (zorunlu — fail-closed için gereklidir).
- `device-off.spec.ts` çalışması için `localhost:5432` Postgres gerekir (ortam).
- 5C.26 önerisi: P1-A2/A3/A4 + (opsiyonel) determinizm zincir testi; FE validasyon mesaj hamarlamaları.