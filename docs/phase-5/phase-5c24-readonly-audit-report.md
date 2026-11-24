# Phase 5C.24 — READ-ONLY Scheduling Engine & Product Architecture Audit Report

**System:** VardiyaOS (Enterprise Shift Scheduling)
**Audit type:** READ-ONLY — no source, schema, migration, test, config, or UI change was made or recommended as a code action in this phase.
**Date:** 2026-09-13
**Base / authoritative repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (single commit `eb7a6db Initial commit`)
**Prior-phase baselines read:** 5C.17, 5C.18, 5C.19, 5C.20, 5C.21, 5C.22 (impl + migration-design-review), 5C.23.

---

## 1. Executive Summary

Ana soru — *"VardiyaOS bugün gerçek bir kurumsal çizelgeleme (scheduling) motoru mu, yoksa özellikler production / domain / frontend / stub-ölü kod arasında mı dağılmış?"* — bütünsel, çağrı-zinciri kanıtlı olarak incelendi. Cevap:

**Kısmen. Production'da çalışan bir çizelgeleme motoru vardır (legacy `ScheduleAutoGeneratorService`), o gerçektir ve `generate/apply` ile PERSIST eder. Ancak üretkenlik açısından en zengin motor (domain optimizer) yalnızca DRY-RUN'dur; flagship "Vardiya Üret" düğmesi yalnızca **validate** çağırıp **sahte sonuç** bastırır; gerçek Redis/BullMQ kuyrukta çalışan async job processor'ları **sahte başarı** döndürür.** Yetenekler production / domain / frontend / stub arasına dağılmıştır ve iki canlı doğrulama motoru aynı kuralı zıt sertlikte uygular.

Sayım (bkz. §23): **P0=0 · P1=7 · P2=18 · P3=14**

- P0 yok: security katmanı (5C.17/18/20), dört-göz, optimistic-concurrency (legacy), tenant middleware, fail-closed `canAccessUnit` bundle'sız ve sağlam kaldı.
- P1 (7): izin/leave/absence-verisinin hiçbir doğrulama/publish yolunda tüketilmemesi (yalnız generator); flagship "Vardiya Üret"in sahte üretim göstermesi; canlı BullMQ üzerinde çalışan sahte job processor'ları; iki doğrulama motorunun zıt sertlikleri; `apply`'in published/archived plana yazabilmesi + version-suz/TVAC içi çakışma kör; DDD `save` TOCTOU (lost-update); generator preview'ın tenant-scope'suz unit-by-type lookup'ı.
- Verdict: **READY WITH CONDITIONS** — §26 koşul kontrolünde hiçbir BLOCKED tetiklenmedi (yalnızca BİR üretim motoru persist etmektedir; kanonik pipeline belirlenebilirdir; güvenlik/tenant/workflow/availability semantiği gerilememiştir).

**En kritik tek cümle:** Leave/absense/uygunluk modeli (`PersonnelDateAvailability`) artık mevcuttur (5C.23) ama yalnızca procedural generator bu veriyi okur; bir kişi bugün manuel ekleme ile izinli olduğu günde çizelgelenebilir ve **publish bu durumu geçirir**, çünkü her iki canlı validation motoru da sadece haftalık `offDays` görür.

---

## 2. Scope

- **Kapsam içi:** Production çizelgeleme akışının uçtan-uca izi (§5), legacy generator (§6), domain optimizer (§7), frontend scheduling katmanı (§8), BullMQ/işler (§9), availability (§10), device/unit-closed semantiği (§11), minimum-coverage (§12), kurallar kataloğu (§13), açıklanabilirlik (§14), determinizm (§15), concurrency (§16), workflow (§17), persistence/transaction (§18), performans/ölçek (§19), ürün olgunluğu (§20), ölü/stub/duplike katalog (§21), migration etkisi (§22), P0-P3 matrisi (§23), uygulama dizisi (§24), önerilen faz (§25), STOP koşulları (§26), kanıtlar (§27).
- **Kapsam dışı (verilen sabit kurallar):** Hiçbir kod/schema/migration/test değişikliği; eşik düşürme; güvenlik gevşetme; RBAC/workflow/dört-göz değişikliği; legacy retire; optimizer'i production'a bağlama; GA/ML/AI; frontend redesign; BullMQ gerçekleme; migration-uygulama; ölü/stub/duplike silme; yeni soyutlama; "daha iyi olur bence" önerileri. Yalnızca AUDIT + RAPOR.

---

## 3. Repository Verification

| Kontrol | Sonuç |
|---|---|
| Authoritative | `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` — 5C.13+ tüm faz çalışmasını içerir. |
| `Belgeler\GitHub\vardiyasystem` | STALE duplicate. Refactor-öncesi nested klonu `backend/src/modules/schedules/schedules/**` (57 dosya) yalnızca Belgeler'de var; Desktop'ta **yok** (`Test-Path` false). Belgeler, 5C.13+ dosyaları (personnel-availability, local-search-strategy, 5c* spec'leri) içermiyor. → §21 P3-14 repo-hijyeni bulgusu; üretim kodu değildir. |
| Git | Tek commit `eb7a6db`; çalışma ağacında **135 adet önceden var olan** kayıt (7 tracked-modified, 8 staged, ~120 untracked — tüm faz kaynaklarımız dahil). Bunlar 5C.13-5C.23'ün hiç commit edilmemiş çıktılarıdır; bu audit bunlara dokunmamıştır (bkz. §27). |
| Bu fazın ürettiği tek yeni varlık | `docs/phase-5/phase-5c24-readonly-audit-report.md` (bu dosya). |

---

## 4. Previous Phase Baseline (okunan 8 rapor)

| Faz | Durum / Verdict | Bu auditteki durum |
|---|---|---|
| 5C.17 | 2 P0 + 5 P1 KAPALI | Doğrulandı: published-mutation gate'leri (`schedules.service.ts:838-842,1393,1485,1620,1720,1802`), four-eyes (`schedules-workflow.service.ts:141-144`), rollback/swap koruması, export sanitizasyonu sağlam. |
| 5C.18 | 32/32; PASS WITH WARNINGS | DIRECT-01 doğrulandı (direct-assign asla force-publish etmiyor; `:1597-1621`); EXP-01/RT-01/FE-01 sağlam. |
| 5C.19 | READY FOR IMPLEMENTATION; 0 P0/2 P1/6 P2/13 P3 | Koşul korundu; P2/P3'ler bu raporda yeniden sınıflandırıldı. |
| 5C.20 | SEC-01/SEC-02 KAPALI | Doğrulandı: `/hospitals` tenant-scope (`hospitals.service.ts` `findAllScoped`); `canAccessUnit` NULL-org fail-closed (`unit-scope.service.ts`). |
| 5C.21 | READY WITH CONDITIONS; 0 P0/0 P1/8 P2/**12 P3**; optimizer readiness B | F-01..F-20 durumları bu rapora aktarıldı; F-09 (role boyutunda) hâlâ açık; F-10 dormant; F-17 açık; F-02/F-05 doğrulandı; F-12 → 5C.23 kısmen (yalnızca generator) kapandı; F-06/F-08/F-16/F-18 açık. |
| 5C.22 | BLOCKED (migration design) → design review APPROVED WITH CHANGES | PersonnelDateAvailability modeli+birici migration kararı onaylanmıştır; 5C.23'te uygulandı. |
| 5C.23 | PASS WITH WARNINGS; 34/34 yeni test; 1015/1025 full | Model `schema.prisma` `@@unique([personnelId,date])`, isActive soft-flag, 4 enum değeri, `AVAILABLE_OVER_BLOCKING` 409 kuralı — korunmuş. Generator tarafı `resolveMonthBlockedDates`+`blockedDates` filtresine bağlandı; **collision/DDD aynalama bilinçli ertelendi — bu raporun P1-A1 bulgusu o ertelenen işi kapatır.** |
| Tüm | Backend full suite | 1015 passed / 10 failed — sadece `device-off.spec.ts` (canlı Postgres `localhost:5432` gerektirir; environment-only). `tsc` clean, `nest build` PASS. |

---

## 5. Production Scheduling Flow (§5) — uçtan-uca iz

### 5.1 Kanonik (persist eden) pipeline — LEGACY "generate/apply"

```
plan-page.component.html:380-391  <app-auto-generate-dialog>  on(applied)→refresh
  → auto-generate-dialog.component.ts:256 generate()
      → frontend/src/app/services/schedule.service.ts:955-976 generateSchedule()
          → POST /api/v1/schedules/generate           (schedules.controller.ts:636-641, @Roles(HEAD_TECHNICIAN))
              → ScheduleAutoGeneratorService.preview (generator:74-82) → generate(db, year, month, ...) (84-435)
                  IN-MEMORY sondaj; hiçbir yazma yok. 411-endpoint döner {assignments, summary, warnings}
  → kullanıcı "Vardiyaları Uygula" → auto-generate-dialog.component.ts:287 apply()
      → POST /api/v1/schedules/generate/apply          (schedules.controller.ts:650-656)
          → autoGeneratorService.apply (generator:438-523)
              UNIT-SCOPE kontrol :447-454; mevcut assignment oku :458; her aday için re-validate :469-508;
              $transaction: createMany + version ince :512-518   → PERSIST ✅
```
**REAL** — compute-in-preview, validate-then-persist-on-apply.

### 5.2 Ürünün "flagship" yüzü — DDD "Vardiya Üret" (workspace)

```
schedule-workspace.component.ts:568-570 onGenerate → generate-dialog.openDialog()
generate-dialog.component.ts:192-224 onGenerate()
  :206  cmd.validate(scheduleId)            ← hiçbir generate çağrısı YOK
  :208  resultAssignments = store.assignmentCount()   (mevcut DB sayısı, üretilen değil)
  :209-211 violations/score = validate sonucu
  :212  resultTime = Math.random() * 3 + 0.5          ← SAHTE süre
  :213  resultAlgorithm = 'constraint-propagation'    ← sadece etiket
  sonuç paneli "Üretim Tamamlandı" (+ toast "Vardiya planı üretildi")
```
**STUB/PARTIAL** — hiçbir assignment üretilmez/persist edilmez; `setGeneratingProgress` hiç beslenmez. (F-02 açık → bulgu P1-A2.)

### 5.3 Endpoint envanteri (özet; REAL algısı dışındakiler)

| Yüzey | Route grubu | Durum |
|---|---|---|
| Legacy `/schedules` | create/read/findAll, by-unit, overrides, person-shifts, publishByUnit, direct-assign, export, dashboard/stats, alerts, CRUD+versioned mutations, workflow (submit/approve/reject/publish/archive/rollback/revision), device-off, generate/apply | REAL (43 route) |
| Legacy DEAD (importer yok) | `by-unit/:unitId`, `my-shifts`, `:id/snapshots`, `:id/versions/:version` (legecy), `duplicate`, `generate/preview` (helper `schedule.service.ts:990` çağıranı yok), `optimize/dry-run` (gerçek engine ama UI'sız) | DEAD (uygulaması gerçek, tüketici yok) |
| Legacy kırık referans | `GET /schedules/activities`, `GET /schedules/live-metrics` → `@Get(':id')` fallback → 404 (dashboard.service.ts:302,358) | KIRIK → P2-16 |
| DDD `/schedules-ddd` | create/list/get/assignments(CRUD+override)/submit/approve/reject/publish/archive/revert/rollback/versions/validate | REAL |
| DDD jobs | `POST :id/jobs/generate`, `POST :id/jobs/export`, `GET jobs/:jobId`, `GET :id/jobs`, `POST jobs/:jobId/cancel` (controller 401-492) | STUB-result + DEAD-UI (frontend'te `/jobs` çağıran yok) → P1-A3 / P2-09 |
| Özet | Production'da **yalnızca** legacy generator persist eder; DDD yan yüzey CRUD + validate; optimizer dry-run-only; async iş katmanı sahte. | — |

### 5.4 Route-metadata vs service-enforcement uyuşmazlıkları

- Legacy approve/reject: `@Roles(HEAD_TECHNICIAN)` + in-body `canApprove` (controller 525,540) → supervisor/imaging_director/admin'in onayı legacy'de geçerli; DDD approve `@Roles(IMAGING_DIRECTOR)` yalnız → **aynı workflow iki yüzeyde farklı yetki** → P2-04.
- DDD rollback `HOSPITAL_ADMIN` vs legacy `HEAD_TECHNICIAN` (P3 nitelikte; P2-04'e dahil).
- Legacy `POST /schedules/generate*` + `/optimize/dry-run`: class-level `ScheduleAccessGuard`/`UnitScopeGuard` parametresiz (id/unit yok) no-op → generator unit-by-type global lookup'a korumasız (bulgu P1-A7).

---

## 6. Legacy Generator (§6) — `ScheduleAutoGeneratorService` (schedule-auto-generator.service.ts)

| Konu | Bulgu (FILE:LINE) | Sev |
|---|---|---|
| Üretim döngüsü | `generate` (84-435): unit findFirst(tip-by-type, :85-88), `Promise.all` loadPersonnel/loadDevices/loadHolidays (:101-105), deviceOffSet (:109-116), **5C.23 blockedDates** (:122-135, `resolveMonthBlockedDates` / `blockedByWeeklyOffDays` fallback), gün döngüsü (:214-421), rol bazlı 3 çağrı noktası, `scoreCandidates` (:690-715), summary (:423-433). | — |
| İş yükü cap kusuru (F-06) | `findAvailablePersonnel` workload cap: `options`'ta `year`/`month` YOK (:90-99) → `new Date(options.year||2026, options.month||1, 0)` her zaman Ocak-2026 → **maxShifts her ay sabit 36** (:681-684). `maxWeeklyHours` hiç okunmaz; `MAX_WORK_EXCEEDED` hiç üretilmez. | P2-11 |
| Night-streak semantiği | `nightCount` yalnız gündüz vardiyasında sıfırlanır (:274-279), rest günü değil; evening de nite sayılır (:674-677) → generator'un "consecutive night" kavramı DDD engine'in 48h kuralından farklı (P2-18). | P2-18 |
| Yetenek eşleşmesi | `.some()` (herhangi biri) (:647-649) vs engine `.every()` (tamamı) → generator atadığı kişiyi validation sonradan reddedebilir. | P2 (F-16 ailesi) |
| Rest kontrolleri | night→day 24h (:667-669), general <minRestHours (:671). | — |
| apply (438-523) | `assertNotPublished` YOK, `expectedVersion` YOK, aday başına **stale DB durumuna karşı** sequential await validation (:469-508 — ~7 sorgu/aday, N+1), sonra `createMany` + kontrolsüz `version.increment` (:512-518). | P1-A5 / P2-15 |
| Determinizm | `loadPersonnel/Devices/Holidays/Shifts/Overrides` findMany **orderBy yok** (:525-570,604-615); `scoreCandidates` tie → input sırası; `seniority` modu `candidates.indexOf(p)%5*5` (:704-705, `Personnel.seniority` okunmaz). | P2-10 |
| TZ tehlike | Gün döngüsü `new Date(dateStr).getDay()` (:217) ile personel dönüşümleri `toISOString` (schedules.service.ts:1008,1347) +03 altında ±1 gün kayar. | P2-12 |
| Uyarı kapsamı | Sadece `day` eksikliği uyarılır (:252-254); evening/night sessiz; summary `warnings.length` yalnız sayı (:432). | P3 |

---

## 7. Domain Optimizer (§7) — dry-run altyapısı

| Konu | Bulgu (FILE:LINE) | Sev |
|---|---|---|
| Motor envanteri | `GreedyOptimizationStrategy` (greedy-strategy.ts) API'den seçilebilir; **`local-search` DTO enum'unda yok** → yalnız programatik/test. `schedule-optimizer.service.ts:31` default greedy. | P2-02 |
| Persist | `optimize()` hiçbir yazma yapmaz; tek çağrıcı `ScheduleDryRunService.execute` (schedule-dry-run.service.ts:17-65, gerçek Prisma load, `deviceOffDates` Set'i :200-212) → tek route `POST /schedules/optimize/dry-run` (controller 658-663) → **UI tüketici yok**. | P2-01 |
| Availability boşluğu | `SchedulingProblemPersonnel` yalnız `offDays:number[]`; `unavailableDates` alanı yok (grep 0); greedy yalnız `offDays`'i reddeder (:412-413). Personeline leave/absence verisi girilmez → optimizer personeli izinli günde atayabilir. | P1-A1 (kapsam) |
| Score aggregator kusuru | `score-aggregator.ts:63`: görmezden gelinir `coverage` ağırlığı (0.15) → toplam mak = **0.85**; `canonical-scoring.config.ts` 0.35/0.25/0.25/0.15. | P2-02 |
| Kural kapsamı | `constraint.interface.ts` 6 code bildirimi (DEVICE_BOOKED, GROUP_NOT_FOUND, GROUP_NOT_IN_UNIT, TEMPLATE_NOT_IN_GROUP, TEMPLATE_NOT_IN_UNIT, SAME_SLOT) hiçbir constraint'te implemente değil (`hard-constraints.ts:336-351`). | P2-02 |
| Soft-constraint | `evaluateSoftConstraints` dummy-anchor (dummyAssignment, placeholder date -15) (:324-370); personel `name=id, nightShiftEligible:true, maxWeeklyHours:40` sabitleriyle üretilir (soft-fairness.ts:38-43) → gerçek attribute'lar kullanılmaz. | P2-02 |
| ShiftDateOverride | Dry-run tarafı yüklenmez → hafta sonu/tatil override'ları optimizer'ı etkilemez. | P2-02 |
| Açıklama | `buildExplanations` (:373-393) üretir; `score-aggregator.explanation` hesaplanıp `buildExplanations`'la ezilir. | P2 (F-14) |
| Determinizm | `greedy` :306 `Math.random()` conflict-id üretir; local-search explicit sort ile deterministik olma çabasında (local-search-strategy.ts:102-111). | P3 |

---

## 8. Frontend Scheduling (§8)

### 8.1 `core/scheduling/**` — TAMAMI DEAD

`frontend/src/app/core/scheduling/*` (scheduling-engine, schedule-generator, **constraint-solver GA**, comprehensive-constraint-validator, conflict-detector, constraint-validator, fairness-balancer, fatigue-engine, rebalance-engine, recommendation-engine, solver-validation, models): `core/scheduling` import grep → **0 harici import**. İçerideki tek gerçek `Math.random` GA kodu (`constraint-solver.service.ts:198-285`, pop 50/mut 0.15/cross 0.7/elite 0.1; `solver-validation.service.ts:392`) yürütülemez. `scheduling.models.ts` `preferences.unavailableDates` — backend'de dalı olmayan ölü ayna. (F-03 → P3-03.)

### 8.2 `features/scheduling/**` — ACTIVE (workspace'te canlı)

- store/api/command/realtime/offline/grid, workspace/list, toolbar/grid/filter/search/view-switcher, publish-dialog, day/personnel/device-view, version-compare, paneller (conflict/validation/fairness/coverage/version/audit/approval) → HEPSİ aktiftir ve backend verisini okur.
- `generate-dialog.component.ts:192-224` → **DUPLICATE/STUB** (bkz. §5.2; P1-A2).
- `models/coverage.models.ts:54` `const dateStr = 'TBD'` — DEAD + kırık yardımcı; `computeDeviceCoverage` importer yok (P3-04).

### 8.3 Yerelleştirme (backend-authoritative)

Frontend'te hiçbir generate/optimize/jobs endpoint çağrısı yoktur (`schedule-api.service.ts` yalnız DDD CRUD + validate). "Çözücü" yalnızca features içeriğinde validate-yansıtır. Backend otoriter kalır — ancak generation yetenekleri UI'dan kopuktur (P2-01/03 bulgularının UX yüzü).

---

## 9. BullMQ / Jobs (§9)

**Önemli düzeltme (5C.21 "in-memory simülasyon" izlenimi yanlıştı):** Queue gerçektir.
- `backend/package.json`: `@nestjs/bullmq ^11.0.4`, `bullmq ^5.78.0`, `ioredis ^5.11.0`.
- `BullModule.forRootAsync` (app/events modülü), `ScheduleJobQueueModule` → `BullModule.registerQueue({name:'schedule-jobs'})` (schedule-job-queue.module.ts:9) + health modülü.
- `ScheduleJobQueueService` (queue.service.ts:27-69) gerçek `Queue.add` (jobId/attempts/backoff/dedupe) yapar.
- **Processor'lar sahte:** `ScheduleJobProcessor` (`@Processor('schedule-jobs')`, WorkerHost) `processGenerate/Validate/Export/Report` (:64-107) yalnızca `simulateWork(setTimeout)` + canned `{generated:true}` döndürür. `VALIDATE` hiç enqueue edilmez; `enqueueReport` çağıranı yok.
- **Sonuç:** Redis+BullMQ çalışan her dağıtımda async generate/export job'ları **iş yapmadan "başarılı"** işaretler. Frontend çağırmıyor (DEAD-UI), ama endpoint SUPERVISOR'a açıktır → **P1-A3**.
- Durum/dedupe `ScheduleJobStatusService` in-memory Map'te (schedule-job-status.service.ts:21) — restart'ta silinir, multi-pod'da bozulur → **P2-09**.
- `VALIDATE`/`REPORT` processor dalları enqueue'suz ölü; `GET jobs/:jobId` vs. kontrol içinde org-scope var (:447-455) — iyi.

---

## 10. Availability Model (§10) — uçtan-uca

| Katman | Durum (FILE:LINE) |
|---|---|
| Model & yazıcılar | ✅ `PersonnelDateAvailability` (schema.prisma ~:1463-1477, enum `AVAILABLE/UNAVAILABLE/LEAVE/ABSENCE`), `personnel-availability.service.ts` CRUD + `AVAILABLE_OVER_BLOCKING` 409 + audit (`personnel_date_availability`). |
| Generator tüketimi | ✅ 5C.23: `resolveMonthBlockedDates` → `blockedDates.get(p.id)?.has(dateStr)` filtresi (generator:124-134,643); pickled precedence (aktif satır > weekly offDays). |
| **Manual/DDD validation** | ❌ `schedules.service.ts` **hiçbir** `personnelDateAvailability` referansı içermez (grep 0). `LEAVE_CONFLICT`/`AVAILABILITY_CONFLICT` hiçbir canlı yolda üretilmez — değerler yalnız enum'dadır (conflict.ts:1-12); `master-data.ts:93-109` ölü `validatePersonnelForAssignment` bunları hâlâ kullanır. |
| Publish gate (DDD validate) | ❌ `ConstraintEngine` `ALL_HARD_CONSTRAINTS` (hard-constraints.ts:336-351) personel-temelli uygunluk satırı içermez. |
| Optimizer | ❌ greedy yalnız `offDays` okur (:412-413). |
| Weekend-offDays | ✅ Weekly `offDays` engine'de WARNING-overridable (`OFF_DAY_CONFLICT` hard-constraints.ts:151), legacy'de WARNING-overridable (schedules.service.ts:1334). |
| **Sonuç** | İzinli/raporlu personel manuel eklenebilir, Publish geçer, generator bu kişiyi 9 ayrı günde çizelgeleyebilir (sadece weekly-offDays çakışırsa WARNING). → **P1-A1** (5C.23'ün bilinçli ertelediği iş; migrasyon GEREKMEZ — model vardır, yalnız tüketim eksiktir). |

> 🔑 **Semantik koruma notu:** 5C.23 kararları (fail-closed, aktif-satır önceliği, `AVAILABLE` override, isActive soft-flag, parent-owned tenancy, `org/unit` kolonu yok, TENANT_MODELS dışı) korunmuştur; hiçbiri bu audit'te geriletilmedi. Bu husustaki önerinin MIGRATION'sız olduğunun dayanağı modelin zaten var olmasıdır.

---

## 11. Device / Unit Availability (§11)

| Kavram | Bulgu |
|---|---|
| DeviceOffDate | Sağlam: schema `@@unique([deviceId,date])`; yazıcı `toggleDeviceOff` (2410-2490) aktif atama varken kapatmayı reddeder (:2436-2451); tüketiciler: generator (:228), legacy validation `DEVICE_OFF_DATE` BLOCKING (:1130-1140), engine `DeviceOffDateConstraint` BLOCKING non-overridable (:322-334), dry-run (200-212). |
| ShiftDateOverride | Yalnız legacy generator tüketir (:294-297, overrideMap :604-615); DDD optimizer yok sayar. |
| Unit "closed" | **Model yok.** `Unit` yalnız `isActive` (schema.prisma:~483). `UNIT_CLOSED` aslında device `workDays` bazlı hafta günü kapaması (engine :296-320, legacy :1117-1129). "Tarihte birim kapalı" kavramı yok → bu semantik boşluğu P2 seviyesi (tarih değil, tasarım) not ediyoruz. |
| Sonuç | Cihaz kapatma/personel uygunluğu **ayrık boru hatları**; device personel-atama çakışmasında "device closed" ile "person unavailable" aynı karar noktasında birleşemez (P2-18/FAT-01 ile aynı aile; tek motor hedefi P2-01/03 altında çözülür). |

---

## 12. Coverage (§12) — KESİNLEŞTİRİLMİŞ: NOT IMPLEMENTED

- **Persist edilmiş minimum-kadro / staffing-requirement modeli YOK.** Schema'da `CoverageRequirement`/`StaffingRequirement`/per-slot-kadro tablosu yok; yalnız `ConflictCode.COVERAGE` (schema.prisma:1037) ve `Recommendation.impactCoverage` (:1066).
- **`COVERAGE_MISSING` phantom'dır:** enum'da vardır (conflict.ts:8, "Eksik Kadro"), **hiçbir yerde emit edilmez** (grep). MIGRATIONNOT w no.
- **DDD validate coverage hep 0:** `createEmptyValidationResult()` `coverage:{totalSlots:0,filledSlots:0,coveragePercent:0}` (validation-result.ts:81-84); `finalizeValidation` yalnız `valid`+`validatedAt` koyar (:145-148).
- Frontend `coverage-view` (coverage-view.component.ts:59-80) **fills-per-device** heuristic'i hesaplar (dayAssignments/deviceCount); `coverage-panel` missingDates hiç eşleşmez (:147-156). Label "Kademe/coverage%" ürün dilinde otoriter görünür ama arkasında gereksinim yoktur.
- `schedule-alert.service.ts:46-65` her device'ın her gün day+evening+night istediğini varsayar (workDays/mode/device-off'u yok sayar) → yanlış pozitif alarm riski.

**Panel kararı:** "Coverage requirement" ürün gereksinimi ise → additive `ShiftRequirement`/`PersonnelRequirement` modeli + `COVERAGE_MISSING` emit (P2-13; bu fazda IMPLEMENT edilmez); değilse "Kademe"/% label'ları göstermeyi bırak. `'TBD'` hatası (§8.3) ölü koddadır.

---

## 13. Constraint Matrix (§13)

Kısaltma: **B**=BLOCKING · **W**=WARNING(overridable) · **(gen)**=sadece generator heuristiği · `·`=yok/uç.

| # | Kural | Legacy (`schedules.service.ts`) | Engine (`hard-constraints.ts`) | Generator | TESTED? |
|---|---|---|---|---|---|
| 1 | Aynı gün çakışma (TIME_OVERLAP) | **W** (:1300-1310) | **B** (:79-83) ⚠️ | dahil edilir | constraint-engine.spec:75; schedules.service.spec |
| 2 | Rest (11h) | genel kont.YOK (yalnız night→day W, :1359-1374) | **W** REQUIRED_REST_NOT_MET (:109) | heuristik (:671) | doğrudan spec yok |
| 3 | Ardışık gün limiti | yok | yok | heuristik (:679) | 5b2/5b3 dolaylı |
| 4 | Ardışık gece / 48h | yalnız night→day W (:1344-1377) | **B** REST_RULE_VIOLATION (:270-294) ⚠️ | night→day 24h (:667-669) + nightCount ayrı (P2-18) | doğrudan spec yok |
| 5 | Gece vardiyası uygunluğu | **W** overridable (:1322-1329) | **B** (:123-138) ⚠️ | (:645) | doğrudan assert yok |
| 6 | Beceri/cihaz yeterliliği | person+kinds BLOCKING (:1144-1149); device beceri KONTROL YOK | **W** overridable (:196-221) ⚠️ | `.some()` (yanlış yön, :647-649) | 5b3 F scen. |
| 7 | Haftalık saat (maxWeeklyHours) | hiçbir yerde zorlanmıyor | soft-workload 40 sabit (:25) | yüklenir, kullanılmaz (:537) | yok |
| 8 | Aylık iş yükü | cap sabit 36 (P2-11, :681-684) | yok | heuristik | 5b3 kısmi |
| 9 | **İzin/rapor/uygunsuz (PersonnelDateAvailability)** | **YOK** (P1-A1) | **YOK** (P1-A1) | ✅ (:122-134,643) — 5C.23 | 5c23-* |
| 10 | Haftalık offDays | **W** (:1331-1342) | **W** OFF_DAY_CONFLICT (:140-162) | blockedDates içinde | 5c23-avail |
| 11 | Device-off tarihi | **B** (:1130-1140) | **B** non-overridable (:322-334) | ✅ (:228) | enforcement/sched/device-off |
| 12 | Birim kapalı / workDays | **B** (:1117-1129) | **B** (:296-320) | ✅ (:227) | geniş |
| 13 | Tatil | hiçbir kural — sadece generator "day-only" (:620-621) | yok (holiday yüklenir ama okunmaz, validation.service:366-371) | heuristik | yok |
| 14 | Seniority | `indexOf%5` (:704-705) | greedy:450-451 aynı | aynı | golden 5b3 |
| 15 | Gece/hafta sonu/tatil dengesi (fairness) | yok | **soft** (soft-fairness.ts:12-17, sadece dry-run) | yok | fairness-engine |
| 16 | Fizyon (fatigue) | yok | **soft** (soft-fatigue.ts; sadece dry-run) | maxConsecutiveNights heuristik | fatigue-engine |
| 17 | Coverage | `COVERAGE_MISSING` phantom | ağırlık 0.15 (score-aggregator kullanmaz!) | yok | yok |
| 18 | Kişi/ünite/grup/şablon | B (:1160-1226) | B (:164-244) | role bölümü | partial |

**Kritik:** Aynı kurallık için B↔W zıtlıkları legacy↔engine arasında (satır 1,4,5,6) — **MANUEL yol ile AUTO-APPLY/PUBLISH aynı atamayı farklı kabul eder** → P1-A4.

---

## 14. Explainability (§14)

- DDD validate: yalnız `hardViolations.total`/`softViolations.total`/`score.overall` — **per-assignment "neden" yok**.
- Legacy generator: warnings yalnız (sayı); apply'de **provenance/skor kaydı yok** (yalnız createMany+version).
- Optimizer dry-run: `buildExplanations` string'ler üretir (greedy:373-393; soft constraints açıklayıcı metin — soft-fatigue.ts:33, soft-fairness.ts:59) ama production'a hiç dokunmaz; `score-aggregator.explanations` hesaplanıp eziliyor.
- Frontend version-panel'i `score:'—'` (fetch yok) — üretim "history" UI'ı yanıltıcı (P3-12).
- **Sonuç:** Üretilen plan için "neden bu kişi bu vardiya" sorusu bugün cevapsız. (F-14 açık; P2; tek-motor fazında P2-02 ile birlikte ele alınmalı.)

---

## 15. Determinism (§15)

**Tespit:** Backend üretim kararlarında `Math.random` YOK (`SeededRandom` tanımlı ama hiç instantiate edilmez). Asal belirsizlik: **DB satır sırası → indeks-temelli tie-break.**

| Kaynak | Kanıt | Etki |
|---|---|---|
| `findMany` orderBy yok (scheduling) | generator:526,545,563,573,607; validation:291,314; dry-run:68,100,126,150,157,203; workflow:317,413,551,638,657,703; availability:147 | Aday dizisi sırası DB'ye bağlı |
| `scoreCandidates` tie → input sırası; `seniority = indexOf%5` | generator:704-705; greedy:450-451 | Aynı veri, farklı ekleme sırası → farklı seçim |
| `Math.random()` conflict-id | greedy-strategy.ts:306 | "deterministic" bayrağına rağmen sonuç id'leri rastgele |
| local-search | local-search-strategy.ts:102-111 explicit sort | deterministik olma çabası (iyi) |

**✔ Tek senaryo (koşul):** "SAME INPUT × 10 RUNS → SAME OUTPUT" — sabit seed-verisi, BİLİNEN personel ekleme SIRASI A vs B (ters sıra): generator + greedy + dry-run çıktılarının birebir aynı olması ve saat-20'e kadar süre eşitliği beklenir; bu iki ekleme sırasında farklı çıktı = kanıtlı determinizm ihlali. **(Bu fazda yazılmaz; P2-10'un test gereksinimidir.)**

---

## 16. Concurrency (§16)

| Yol | Durum |
|---|---|
| Legacy versioned mutations (update/addAssignment/override/directAssign/updateAssignment/removeAssignment) | ✅ atomik CAS: `bumpScheduleVersion` `updateMany where {id,version}` (schedules.service.ts:69-90,1436,1527,1665,1766,1807). `update` :751 non-transactional read-then-compare → TOCTOU (P2-09-a). |
| **DDD `save`** | ⚠️ `prisma-schedule.repository.ts:98-130`: expectedVersion READ-then **unconditional upsert** `version: scheduleVersion` → iki eşzamanlı save iki aggregate de geçer → **lost update** — **P1-A6**. (Legacy atomikdir; DDD değil.) |
| Generator `apply` | ❌ expectedVersion yok + `assertNotPublished` yok + unconditional increment → **P1-A5**. |
| Legacy workflow transitions | ❌ version precondition yok (submit/approve/reject/publish/archive/rollback/revision unconditional) → P2-05. |
| Idempotency | `schedule-application.service.ts:11-29` in-memory Map +300s TTL, per-instance → P3-10. |
| Locks | Redis `DistributedLockService` yalnız DDD publish (:178) ve DDD rollback (:219). Legacy publish/rollback lock'suz → P2-05/06. |

---

## 17. Workflow (§17)

- İki canlı geçiş haritası: `schedule-status.ts` (legacy — `VALID_TRANSITIONS` incl. `field_supervisor` :52-58,:104-110; `canRoleTransition` system/hospital_admin ekler :123-137) ve `schedule.aggregate.ts` `TRANSITION_ALLOWED_ROLES` (:31-38 — **field_supervisor YOK**, medical_engineer/senior_technician var). **F-09 hâlâ açıktır (role boyutu):** field_supervisor legacy'de submit edebilir, DDD'de 403. → **P2-04**.
- DDD route guard'ları haritayla çelişir: DDD submit `MinRole.SUPERVISOR` (medical/senior/field_supervisor'ı harness'e alır), DDD approve `MinRole.IMAGING_DIRECTOR` (canApprove'un verdiği supervisor'ı reddeder). → P2-04.
- Four-eyes: legacy `:141-144` ✅ ve DDD `schedule-application.service.ts:160-164` — her ikisi sağlam (submit≠approve).
- DIRECT-01 (5C.18) ✅ korunmuş (direct-assign asla force-publish, `:1597-1621`).
- `publishByUnit`: system-schedule-autopublish aktörüyle four-eyes korunur, gerçek kullanıcı `submittedBy` (:551-562) — doğrultu iyidir fakat **snapshot+update+approval üçü ayrı yazma** (P2-06).

---

## 18. Persistence / Transactions (§18)

| Yol | Transaction | Snapshot | Not |
|---|---|---|---|
| Legacy `apply` | ✅ `$transaction` (generator:512-518) | ❌ (yalnız createMany+version) | provenance yok (P3-09) |
| Legacy `publish` | ❌ snapshot+update+approval ayrı (+audit fire-and-forget) (workflow.service:281-300) | ✅ pre-publish snapshot (:281,:695-722) | parçalı durum riski → P2-06 |
| Legacy submit/approve/reject/archive | ❌ ayrı yazmalar (:79-96,:146-163,:212-229,:350-366) | snapshot yalnız publish'te | → P2-06 |
| Legacy `update` | ✅ (:775-809) | — | — |
| Legacy `directAssign` | ✅ (:1643-1668) | — | — |
| Legacy rollback (workflowService) | ✅ + swap-cancel (:411-432,:477) | ✅ | 5C.17 sağlam |
| Legacy `SchedulesService.rollback` | ✅ (:2027-2068) ANA swap YOK + **+2 version** (:2051,:2053-2057) | — | DORMANT route, F-10 → P3-07 |
| DDD mutations | ✅ `$transaction` save (prisma-schedule.repository.ts:111-228) | ❌ **DDD publish snapshot YOK** → DDD-rollback 404 (P2-07) | version read-then-write TOCTOU (P1-A6) |
| DDD rollback | Redis lock ✅ | snapshot yok | swap dangle (P2-08) |
| Domain event bus | — | — | **ZERO caller**; `commit()`/`loadFromHistory` kullanılmaz; `applyEvent` smart stub (P3-02) |

---

## 19. Performance / Scale (§19)

**Skala senaryoları** (26 device · 200 personel · 31 gün / MR·BT·Röntgen tipik küç·orta ölçek vs):

| Yol | Kompleksite | Tahmini maliyet (26·200·31) |
|---|---|---|
| Generator generate (in-memory) | slot ≈ 31×26×3 ≈ 2.400; her slot 200 personel × 2 `.some` × ~400 ort. → **~1.6–3.2×10⁸ işlem** | CPU **~2–10 s** |
| Generator apply | ~800 aday × ~7 sıralı DB sorgusu (validation service 6+ lookup) → **~5.600 round-trip** + her satırda tüm schedule re-hydrate | **10–60 s+** |
| DDD greedy dry-run | ~700 yeni atama × 14 constraint × O(A) collection taraması | ~5–30 s |
| local-search | i<j swap (O(n²)) + rescor, timeout 30s | up to 30 s |
| Legacy per-assignment validation | up to ~9 sıralı sorgu/atama (:1048-1383) | N+1 |

- N+1 kaynakları: apply sequential await (generator:469-508), legacy validateAssignmentDetailed (schedules.service.ts:1048-1383), `AssignmentCollection` full-array linear filtreler (assignment-collection.ts:44-80,131-141).
- **Sonuç:** Tipik MR/BT ölçeğinde uçtan-uca "preview+apply" **1-3 dk**; kurumsal 26/200/31 senaryosunda **apply bottleneck**. Tek büyük kazanım: in-memory conflict index + batch validation + uygulama öncesi tekil geçerlilik (P2-15; ayrıca F-15).
- `k6/` harness repo'da mevcut fakat CI'da değil; `5b3-performance-failure.spec.ts` sentetik (P3-13).

---

## 20. Product Maturity (§20) — A-M, 0-100

| Boyut | Puan | Tek cümle kanıt |
|---|---|---|
| A. Domain modeling | 60 | Zengin aggregate/value-object/repository + versioning; ama iki yüzey, availability yalnız generator'da, coverage yok. |
| B. Constraint correctness | 55 | 18 kuralın çoğu iki engine'de var ama **5 kuralda zıt sertlik** (B↔W) + leave/absence yok (P1-A1/A4). |
| C. Algorithm quality | 45 | Production = inline greedy; zengin motor dry-run-only; generation soyut port yok. |
| D. Determinism | 55 | Backend üretim kararında RNG yok; ama DB-sırası bağımlı tie-break (P2-10), lokal time-limit. |
| E. Fairness | 35 | Production'da sıfır etki; soft engine'ler yalnız dry-run + kurgusal personel verisi. |
| F. Explainability | 30 | Sadece validate toplamları + dry-run string'leri; production'da per-assignment neden yok. |
| G. Performance | 60 | MR/BT ölçeğinde çalışır; apply N+1 26/200'de dakikalara çıkar; benchmark yok. |
| H. Testability | 75 | 93 backend spec dosyası, golden & scenario'lar; DB-gated device-off hariç yeşil; FE spec'leri zayıf. |
| I. Workflow integration | 75 | Four-eyes+version+guards+snapshots sağlam; ama DDD publish snapshot'sız, legacy transition'lar version'sız. |
| J. Production readiness | 45 | Emin güvenlik; ama flagsip "Üret" sahte, async üretim sahte, iki engine çelişkili, availability yalnız generator'da. |
| K. Security | 80 | RBAC/unit-scope/fail-closed/tenancy/audit sağlam; tek açık: generator preview unit-by-type (P1-A7). |
| L. UX | 55 | Rich workspace; ama generate ve version/audit panelleri sahte/kısmi (P1-A2, P3-12). |
| M. Maintainability | 45 | Domain katmanlama ödüllü; ama legacy↔DDD paralel yüzey + ölü front-end solver + 25+ ölü/ stub sembol. |
| **Genel** | **51/100** | (5C.21: 59) — 5C.22/23 net + (availability modeli), fakat doğrulama-publish-optimizer uçları ertelendiği için etkin üretim doğruluğu gerildi. |

---

## 21. Dead / Stub / Duplicate Catalog (§21)

| Öğe | Durum | Kanıt | Sev |
|---|---|---|---|
| `domain/models/seeded-random.ts` | DEAD | barrel dışı importer yok | P3-01 |
| `domain/models/generation.ts` | DEAD | yalnız barrel re-export | P3-01 |
| `domain/models/scoring-model.ts` | DEAD (spec-only) | conflict-validation.spec:5, 5b4-preseeding.spec:8 | P3-01 |
| `domain/services/scheduling-logger.ts` | DEAD | importer yok | P3-01 |
| `domain/events/schedule-event-bus.ts` | DEAD | zero caller; `commit()`/`loadFromHistory`/`applyEvent` boş | P3-02 |
| Frontend `core/scheduling/**` (GA dahil) | DEAD | `core/scheduling` dışı 0 import | P3-03 |
| `coverage.models.ts:54` `'TBD'` | DEAD+BUG | `computeDeviceCoverage` uncalled | P3-04 |
| `constants.ts` blok + `OVERRIDE_ROLES` | DEAD | zero import yandı; :1397 lokalde yeniden inline | P3-05 |
| Ölü endpoint'ler | by-unit/unitId, my-shifts, snapshots, duplicate, generate/preview, legacy versions/:version | importer yok | P3-06 |
| `SchedulesService.rollback` +2 bump | DORMANT | route workflowService.rollback/appService.rollback'te | P3-07 |
| Audit taxonomy | `SCHEDULE_ARCHIVED/SCHEDULE_REVERTED/ASSIGNMENTS_APPLIED` enum dışı; `SCHEDULE_GENERATED` hiç publish edilmiyor; `schedule_generate` entity yok | audit.constants.ts:32-40 | P3-08 |
| `apply` provenance | apply'de snapshot/anogen bilgisi yok | generator:512-518 | P3-09 |
| Idempotency in-memory | per-instance 300s TTL | schedule-application.service.ts:11-29 | P3-10 |
| Heuristic alarm/insights | alert "her device day+evening+night"; supervisor-center required 1/2; insights deviceCount-personnelCount | schedule-alert:46-65 vb. | P3-11 |
| version-panel/audit-panel fabricated | `score:'—'`, tek sentetik audit satırı | version-panel:113-124; audit-panel:67-92 | P3-12 |
| `k6/` CI dışı + perf spec sentetik | yürütme/karşılaştırma yok | repo k6/, 5b3-perf | P3-13 |
| Belgeler stale nested klon + tek-commit sürüklenmesi | Desktop temiz; Belgeler'de `schedules/schedules/**` 57 dosya (refactor-öncesi) | Test-Path false (Desktop) | P3-14 |
| **LEGACY vs DDD ikiz yüzey** | İkisi de canlı, ayrı engine/ayrı yetki | controller 76-661 vs 138-469 | **P2-03** |
| **İki üretim motoru** | Yalnız legacy persist; optimizer dry-run | (§6/§7) | **P2-01** |
| **İki doğrulama motoru** | zıt sertlikler | (§13/§16·17) | **P1-A4** |

---

## 22. Migration Impact (§22)

| Öneri Ailesi | Migration |
|---|---|
| **P1-A1 availability-in-validation + optimizer** | **NO** — `PersonnelDateAvailability` + `maxWeeklyHours` alanları zaten vardır; yalnız tüketim kodu. |
| P1-A5 apply gates (assertNotPublished/expectedVersion/intra-batch) | **NO** | 
| P1-A6 DDD save CAS (updateMany-count) | **NO** |
| P1-A4 tek validation engine | **NO** (kod birleştirme; DTO şekli legacy kalabilir) |
| P1-A7 generator tenant-scope | **NO** |
| P1-A2 gerçek üretim arayüzü / P1-A3 job gerçekleme | **NO** |
| P2-02 optimizer kusurları (coverage weight, local-search enum, personel verisi) | **NO** |
| P2-11 haftalık saat zorlama + aylık cap düzeltme | **NO** (şift süreleri `startTime/endTime`'dan türetilir; istenirse ek kolon additive opsiyonel) |
| P2-13 coverage-requirement (ÜRÜN KARARI) | **EVET (additive, opsiyonel)** — `ShiftRequirement`-tipi tablo + FK'ler; tahribatlı migrasyon ÖNERİLMEZ |
| Aşağıda herhangi bir tahribatlı/backfill migrasyonu | **YOK — öneri listesinde hiçbir tahribatlı migrasyon mevcut değildir** |

**N ödülü:** Bu rapor hiçbir migration önerisini kod olarak üretmez; etki tablosu 5C.22-review kararlarının (additive, parent-owned tenancy) sınırlarına sadıktır.

---

## 23. Findings Register — P0/P1/P2/P3 Matrix (§23)

**P0: 0** — güvenlik/veri-bütünlüğü/tenant koruması katmanında ihlal bulunamadı (5C.17/18/20 sağlam; fail-closed; four-eyes; CAS legacy).

**P1: 7**

| ID | Başlık | Kanıt | Öneri (yönsel) |
|---|---|---|---|
| P1-A1 | Availability (izin/rapor/uygunsuz) hiçbir doğrulama/publish/optimizer yolunda tüketilmiyor; manuel atama izinli personele geçer ve **publish geçer** | schedules.service.ts:998-1001,1331-1342; hard-constraints.ts:336-351; greedy-strategy.ts:412-413; conflicts değil; 5C.23 sadece generator | Availability'yi legacy + engine + publish-gate + greedy/local-search'e inject et (BLOCKING-politika; entity type `personnel_date_availability` korunur). MIGRATION NO. |
| P1-A2 | Flagship "Vardiya Üret" yalnız validate + **sahte sonuç** (`Math.random` süre, mevcut count) | generate-dialog.component.ts:192-224 | Gerçek generate/apply akışına (legacy `generate/apply` veya gerçek job) bağla; sahte süreyi kaldır. |
| P1-A3 | Canlı Redis/BullMQ üzerinde job processor'ları **sahte başarı** döndürüyor (generate/export gerçek iş yapmıyor) | schedule-job.processor.ts:64-107; package.json 23,48; schedule-job-queue.module.ts:9 | Processor'larda gerçek iş (AutoGenerator/Export/Validation) ya da kuyruk endpoint'lerini devre dışı bırak. |
| P1-A4 | İki canlı validation motoru aynı kuralı **zıt sertlikte** uyguluyor (TIME_OVERLAP B↔W, NOT_NIGHT_ELIGIBLE B↔W, GROUP_SLOT_OCCUPIED B↔W, PERSON_DEVICE_NOT_ALLOWED, REST semantiği) | hard-constraints.ts:79-83,123-138,262-265,214-216 vs schedules.service.ts:1248-1257,1300-1310,1322-1328; generator:647-649 | Tek engine aka tek policy; legacy manual path'i engine'e bağla (şekil korunur). |
| P1-A5 | Generator `apply`: no `assertNotPublished`, no `expectedVersion`, stale-temel doğrulama, kontrolsüz version increment → published/archived'a yazılabilir + batch-içi çakışma kör | schedule-auto-generator.service.ts:438-523; controller:650-656 | Status gate + atomic bump + in-memory evrilen koleksiyona karşı doğrula. |
| P1-A6 | DDD `save` TOCTOU: expectedVersion read-then **unconditional upsert** → eşzamanlı iki save **lost-update** | prisma-schedule.repository.ts:98-130 | `updateMany where {id,version}` / koşullu update ile atomik CAS (legacy pattern'i). |
| P1-A7 | Generator preview unit-by-type **tenant-scope'suz** global lookup; `/generate*` route'lar uni-scope'suz → cross-org plan sızıntısı/driver | schedule-auto-generator.service.ts:85-88; controller:636-648 vs schedules.service.ts:103-121 | `resolveTenantScopedUnit` veya unit-scope check'ten geçir. |

**P2: 18**

| ID | Başlık (kısa) | İlişkili 5C.21 |
|---|---|---|
| P2-01 | Dual engine — production inline greedy persist eder; zengin motor dry-run-only | F-01 |
| P2-02 | Optimizer kusurları kümesi: coverage weight hiç uygulanmaz (mak 0.85); local-search DTO'da yok; 6 kural kodu implemente değil; dummy-anchor soft-eval; personel verisi kurgusal; ShiftDateOverride yok sayılır | F-19 |
| P2-03 | Legacy↔DDD ikiz yüzey canlı; ayrı policy | ARC-01 |
| P2-04 | F-09 role-map uyuşmazlığı (field_supervisor) + DDD submit/approve guard çelişkisi | F-09 |
| P2-05 | Legacy workflow transition'ları version precondition'suz; concurrent interleave | — |
| P2-06 | Legacy workflow yazmaları transaction'sız + audit fire-and-forget → parçalı durum | — |
| P2-07 | DDD publish/revert **snapshot üretmiyor** → DDD-rollback 404; history boşluğu | — |
| P2-08 | DDD/legacy-dormant rollback swapRequest'leri iptal etmiyor → dangling refs | 5C.17/rollback swap DP |
| P2-09 | Job status/dedupe in-memory Map + in-memory cancel | F-05 parçası |
| P2-10 | Determinizm: orderBy yok +-order tie-break; "seniority" positional | F-08/F-07 |
| P2-11 | Workload cap sabit 36 (options year/month yok) + `maxWeeklyHours` hiç zorlanmıyor | F-06 |
| P2-12 | `toISOString` tarih aritmetiği +03 altında ±1 gün → rest/today kontrolleri yanlış gün | — |
| P2-13 | Coverage requirement yok; `COVERAGE_MISSING` phantom; DDD validate %0 | F-13 |
| P2-14 | Tatil hiçbir validation kuralında yok (yalnız generator "day-only") | — |
| P2-15 | Apply N+1 (~5.600 sorgu) + generator O(P·A) + local-search O(n²) — 26/200/31'de 1-3 dk | F-15 |
| P2-16 | `/schedules/activities`+`/live-metrics` route'suz → `@Get(':id')` fallback 404 | — |
| P2-17 | ONK seed/master drift: seed.ts:363-384 inline vs onkoloji-master Linak/Mon-Fri; applyOnkolojiMasterConfig orphan | F-17 |
| P2-18 | Night-streak muhasebesi generator vs engine farklı semantik (gündüz olmayan ayrı streak) | F-16 parçası |

**P3: 14** — P3-01..P3-14 (bkz. §21 katalog; ayrıca F-04, F-10, F-14 kod-parçası, F-18 parçası P3-09). Ek: `apply` provenance (P3-09), heuristic alarmlar (P3-11), panel fabrications (P3-12), k6 CI (P3-13), Belgeler hijyen (P3-14).

**Açıklık kurallarına uygunluk:** `CLOSED` ilan edilen 5C.17/18/20 bulguları regresyon kanıtı olmadan yeniden açılmamıştır. F-09 yalnız **role** boyutunda (edge'ler özdeş) ve yeni kanıtla yeniden teyit edilmiştir.

---

## 24. Implementation Sequence (§24)

| Faz | GOAL | DEPENDENCIES | FILES | MIGRATION? | TESTS | RISKS | WHY NOW? | WHY NOT EARLIER? |
|---|---|---|---|---|---|---|---|---|
| **PHASE 1 (önerilen 5C.25)** | **Availability enforcement + generated-write integrity** — izin/rapor/uygunsuz verisi legacy+engine+publish+optimizer'da otoriter girdi; `apply` published'a dokunamaz ve concurrency-safe | yok (5C.23 modeli var) | services/availability, schedule-validation.service.ts, hard-constraints.ts (yeni AvailabilityConstraint), schedules.service.ts validate yolları, greedy+local-search (blockedDates girişi), apply (gate+version+intra-batch), controller/DTO | **NO** | 5c23-* → validation/publish/optimizer uzantıları; apply-gate spec'leri | severity politika seçimi (B vs W-overridable) mevcut override beklentisiyle hizalı olmalı | tek en büyük doğruluk boşluğunu + published-yazma deliğini kapatır | availability verisi (5C.23) önce var olmalıydı; 5C.23 bilinçli generator-only idi |
| PHASE 2 | Tek validation engine (policy tek kaynak) | P1 | validation service, schedules.service legacy path bağlama, sevriyeleri birleştir | NO | cross-engine parity spec | legacy DTO şekli korunmalı | zıt sertlikler üretimi yalanlıyor | önce tüm yolarda veri (P1-A1) tutarlı olmalı |
| PHASE 3 | Optimizer→production (feature-flag) + kusur onarımları | PHASE 1,2 | optimizer, dry-run, controller, feature-gate | NO | determinizm+benchmark gate | davranış delta; feature-flag şart | optimizasyon yeteneği bugün UI'dan kopuk | doğrulama semantiği önce tekillenmeli |
| PHASE 4 | Entegrasyon: workflow version preconditions + transaction + DDD snapshot + swap | PHASE 1 | workflow, repository, application | NO | concurrency spec | legacy davranış dokusu | workflow bütünlüğü | öncelik üretim doğruluğunda |
| PHASE 5 | Açıklanabilirlik (per-assignment why) + benchmark harness | PHASE 3 | apply/provenance, optimizer, UI panel | NO (provenance alanları additive opsiyonel) | e2e | — | güven/denetim | önce deterministik taban |
| PHASE 6 | Ürün katmanı: gerçek "Üret" UX / coverage-requirement kararı / ölü-kod temizliği | en geç burada | frontend generate, coverage (additive), dead catalog | coverage ise ADDITIVE | — | — | ürün dürüstlüğü | işlevsel taban oturmadan |

**Fazların her biri hero iş yükünde bağımsızdır; hiçbiri RBAC/dört-göz/threshold'ları değiştirmez.**

---

## 25. Recommended Next Phase (§25)

**En önemli çıktı — ilk kurulacak temel:** **PersonnelDateAvailability'ın tüm otoriter karar noktalarında tüketimi + generated-write integrity (PHASE 1 / 5C.25).** Bu, haihat yoluyla yalnızca generator'ı kapsayan 5C.22/23 tasarımının vaadini doğrulama/publish/optimizer'a tamamlar.

**İlk uygulama fazında DOKUNULMAMASI GEREKENLER:**
1. **Optimizer'ı production'a bağlama** (P2-01) — PHASE 3 öncesi kesinlikle yok.
2. **RBAC / workflow / four-eyes / MinRole haritaları** (availity girişi B/W kararı dışında geçiş/görev değişmez; `schedule-status.ts` ile aggregate role-map'ları **bu fazda birleştirilmez**).
3. **BulMQ kuyruk akışını legacy generate'in yerine koyma** (yalnızca gerçek processor işi — P1-A3 — ayrı karar).
4. **Ölü kod silme** (core/scheduling, SeededRandom vb.) ve **frontend redesign** — P3 kataloğu ayrı faz.
5. **Coverage-requirement modeli ekleme** (P2-13) — ürün kararı + additive migration olduğu için; önce fiili kullanım (P1-A1) dürüstleşmeli.
6. **Eşikler / override semantiği / `AVAILABLE_OVER_BLOCKING` / fail-closed kuralları** geriletilemez.

---

## 26. STOP Conditions Validation (§26)

| Koşul | Değerlendirme | Result |
|---|---|---|
| P0/P1 güvenlik | Yok (5C.17/18/20 sağlam) | Geçmedi |
| Veri bozulması / veri koruması riski kanıtı | Yok (P0 yok; P1-A6 lost-update concurrency kusuru — BLOCKED değil, onarım gerektirir) | Geçmedi |
| Migration semantiği belirsizliği | Tüm öneriler ya **NO** ya da **additive opsiyonel** (coverage); 5C.22-review kararları korunur | Geçmedi |
| Optimizer kontrat belirsizliği | Dry-run readonly'dir; kontrat bellidir (problem→assignments, persist yok) | Geçmedi |
| **Birden çok çakışan üretim generator'ı** | **YALNIZCA legacy persist eder** (generate/apply). DDD "Üret" sahte; optimizer/kuyruk persist etmez → çakışan yazma YOK | Geçmedi |
| Workflow integrity regresyonu | Four-eyes + DIRECT-01 + 5C.17 gate'leri sağlam; yalnız zincirleme version-condition eksikleri (P2) | Geçmedi |
| Tenant isolation regresyonu | SEC-01/02, ScheduleAccessGuard, fail-closed sağlam; P1-A7 (generator preview) **yeni** aykırılık — regresyon değil | Geçmedi |
| Availability semantiği regresyonu | 5C.23 fail-closed + precedence korunmuş; tüketim eksikliği (P1-A1) ertelenmiş iş, gerileme değil | Geçmedi |
| Kanonik pipeline indeterminable | Belirlidir: legacy auto-generator + apply (üretimde; DDD yan yüzey CRUD/validate) | Geçmedi |
| Mevcut implementasyonun anlamı belirsiz | Değil (dosya/çağrı kanıtlarına dayalıdır) | Geçmedi |

**Sonuç: BLOCKED tetiklenmedi → VERDICT: READY WITH CONDITIONS.** Koşul: PHASE 1 önceliklendirilerek, optimizer'ı etkinleştirmeden önce P1 kümesi ve P2-01/03/04 giderilmelidir; hiçbir öneri bu auditte kod olarak uygulanmamıştır.

---

## 27. Validation Evidence (§27)

**Yöntem (read-only):** Bu fazda **hiçbir kaynak/schema/migration/test/config/UI dosyası değiştirilmedi ve hiçbir komut çalıştırma yoluyla dosya yazılmadı.** Doğrulama kanıtları:

- **Repo kimliği:** Desktop → `git log` tek commit `eb7a6db`; Belgeler aynı commit'e ama refactor öncesi içerikle (nested `schedules/schedules/` klonu yalnız Belgeler'de).
- **Önceden var olan değişiklikler (dokunulmadı):** `git status --porcelain` = **135 kayıt** (örneği: `AM .gitignore`, ` M README.md`, `AD backend/prisma/migrations/20260427190705_init/migration.sql`, `?? .github/`, `?? AUDIT_REPORT.md`, vb.). Bu kayıtlar 5C.13-5C.23'ün hiç commit edilmemiş çıktısıdır. **Bu fazın tek yeni varlığı** `docs/phase-5/phase-5c24-readonly-audit-report.md`'dir (yukarıdaki 135'e 1 untracked dosya eklenir). Tracked dosyalara yönelik hiçbir ek `diff` yoktur (`git diff` yalnızca önceden var olan 7 tracked-modified durağını gösterir — audit kaynaklı değil).
- **Durum değişmeme garantisi:** §§5·6·7·8·9·10·11·12·13·15·16·17·18'deki tüm satır numaraları okuma-anındaki canlı dosyalardan alınmıştır; her ikisi farklı bağımsız taramalar (5 alt-agent + doğrulayıcı okumalar) tarafından teyit edilmiştir.
- **Doğrulanan kritikler:** BullMQ (`@nestjs/bullmq` :package.json 23, `bullmq` 5.78 :48, queue.moEx `registerQueue`, processor stub'ları :64-107); `generate-dialog` sahte üretim (:192-224, `Math.random` :212); DDD `save` TOCTOU (repo:98-130); `score-aggregator` coverage-weight kusuru (:63); generator options/cap kusuru (:90-99,:681-684); availability generator entegrasyonu (:124-134,:643) ve validation engelleri (schedules.service grep 0).
- **İz bırakmayan komutlar:** `git status`, `Get-Content`/`Select-String`/`Test-Path`, globs, vitest/tsc çalıştırılmadı (read-only faz; §26 durumsuz).
- **Test durumu (bu fazca çalıştırılmadı, taşınan baseline):** Backend 1015/1025 (10 fail = env-only `device-off` DB); `tsc` clean; `nest build` PASS; FE-01 15/15.

---

> **STOP — Phase 5C.24 read-only audit complete. Hiçbir kod/schema/migration/test değişikliği yapılmadı. Yalnızca bu rapor üretildi. Verdict: READY WITH CONDITIONS (P0=0 · P1=7 · P2=18 · P3=14).**