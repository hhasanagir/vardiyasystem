# Phase 5C.34 — Kalan P2 Karar Kaydı (Decision Record)

**Tarih:** 2026-11-21  
**Kapsam:** `docs/phase-5/phase-5c24-readonly-audit-report.md` içindeki açık P2 maddeleri (P2-01, P2-02 kalanı, P2-03, P2-04, P2-09, P2-11, P2-13, P2-14, P2-15, P2-18).  
**Durum:** Kararlar kullanıcı tarafından onaylandı. **Bu fazda kaynak kodu değiştirilmedi**; uygulama ayrı onay gerektirir.  
**Önceki fazlar:** P0 ✅ · P1 (A1–A7) ✅ · P2 Batch A ✅ · P2 Batch B ✅ (bkz. 5C.31/32/33).

---

## 1. Karar tablosu

| ID | Kullanıcı kararı | Uygulama anlamı |
|---|---|---|
| **P2-01 / P2-02 / P2-03** | **DDD kanonik, kademeli geçiş** | DDD aggregate/application/validation tek otorite; optimizer kusurları giderilir ve feature-flag arkasında kontrollü açılır; legacy yüzey migration moduna alınır, birden kapatılmaz |
| **P2-04** | **En kısıtlayıcı yönde** | `approve = imaging_director+`, `submit = supervisor+`; `field_supervisor` submit yetkisi kaldırılır; dört-göz ve tenant kısıtları korunur |
| **P2-09** | **Redis-backed status** | `ScheduleJobStatusService` in-memory Map yerine Redis (mevcut `REDIS_CLIENT`, `redisKey(QUEUE,…)`, atomik `SET NX` + TTL); fail-closed 503 korunur, gerçek worker olmadan sahte success yok |
| **P2-13** | **Etiketleri kaldır** | Coverage-requirement modeli **eklenmez**; yanıltıcı "Kademe / coverage%" UI etiketleri ve phantom `COVERAGE_MISSING` gösterimi kaldırılır; migration yok |
| **P2-11** | **İkisini düzelt, BLOCKING** | Gerçek `year/month` ile aylık cap + `maxWeeklyHours` zorlanır; `MAX_WORK_EXCEEDED` BLOCKING / non-overridable olur (greedy hard-cap kalanı dahil) |
| **P2-14** | **BLOCKING kural ekle** | Mevcut `Holiday` modeliyle yeni hard constraint; tatil çakışması BLOCKING / non-overridable; yeni violation kodu `VIOLATION_POLICY`'ye kaydedilir |
| **P2-15** | **Apply N+1 + batch** | Apply'de sıralı per-candidate doğrulama yerine in-memory conflict index + batch validation + yazım öncesi tekil geçerlilik; CAS ve coverage gate korunur |
| **P2-18** | **DDD 48h kanonik** | Generator ve greedy, engine'in 48h rest kuralına uyarlanır; "gündüz dışı = gece" sayımı kaldırılır; `REST_RULE_VIOLATION` BLOCKING kalır |

---

## 2. Mevcut kod durumu (kararların önündeki gerçeklik)

Denetim raporundaki bazı bulgular sonraki fazlarda kısmen kapatıldı; karar uygulaması bunları yeniden yapmamalı:

|Konu|Durum|
|---|---|
| P2-02 coverage ağırlığı | `score-aggregator.ts` ve `canonical-scoring.config.ts` içinde `coverage = 0.15` uygulanıyor (test: `p2-02-scoring-strategy.spec.ts`) |
| P2-02 `local-search` DTO | `dry-run-optimization.dto.ts` içinde `OptimizationStrategyId.LOCAL_SEARCH` mevcut |
| P2-11 generator aylık cap | `findAvailablePersonnel` artık `year/month` alıyor, `exceedsWeeklyHours` ve `MAX_WORK_EXCEEDED` uyarısı var (test: `p2-11-workload-cap.spec.ts`) |
| Coverage engine | `coverage-engine.ts` + `schedule-coverage.service.ts` gerçek evaluate yapıyor; DDD validate boş sonuç üretiyor |
| Dry-run tenant | `schedule-dry-run.service.ts` org pin + deterministik `orderBy` uyguluyor |
| Feature flag | `ENABLE_SCHEDULE_GENERATION_ASYNC` varsayılan `false` ve **hiçbir yerde tüketilmiyor** → kademeli geçiş için doğal kanca |
| Async job'lar | P1-A3 ile tüm tipler fail-closed (503), canned success yok |
| Validation policy | P1-A4 ile tek kaynak, strictest-wins, bilinmeyen kural fail-closed |

**Sonuç:** Kalan iş, "yeni özellik yazmak"tan çok **mevcut paralel yolları tek bir doğru davranışa hizalamak** ve bunu testlerle sabitlemektir.

---

## 3. Uygulama yüzeyleri (kısa harita)

### 3.1 P2-01/02/03 — kanonik geçiş
- Kanonik: `schedules-ddd.controller.ts`, `schedule-application.service.ts`, `domain/aggregates/schedule.aggregate.ts`, `domain/repositories/schedule-repository.port.ts`, `infrastructure/prisma-schedule.repository.ts`
- Legacy (migration): `schedules.controller.ts`, `schedules.service.ts`, `schedules-workflow.service.ts`, `schedule-auto-generator.service.ts`
- Optimizer: `domain/optimization/schedule-optimizer.service.ts`, `greedy-strategy.ts`, `local-search-strategy.ts`, `score-aggregator.ts`, `canonical-scoring.config.ts`
- Kalan P2-02: `domain/constraints/soft-fairness.ts` placeholder personel (`name=id`, `maxWeeklyHours:40`, `monthDays:30`) ve 6 implemente edilmemiş kural kodu
- Kanca: `config/feature-flags.ts` (`isFeatureEnabled` tanımlı, kullanılmıyor), `config/env.config.ts`
- Frontend: `features/scheduling/services/schedule-api.service.ts` (DDD CRUD+validate), `services/schedule.service.ts` (legacy generate/apply), `generate-dialog.component.ts`

### 3.2 P2-04 — RBAC
- `models/schedule-status.ts` (`VALID_TRANSITIONS`, `canRoleTransition`, `canApprove`, `canPublish`)
- `guards/min-role.ts`, `guards/role-guards.ts` (`ROLE_PERMISSIONS`)
- `domain/aggregates/schedule.aggregate.ts` (`TRANSITION_ALLOWED_ROLES`)
- Her iki controller'daki `@Roles` dekoratörleri (submit/approve/reject/rollback)
- Test: `5c29-legacy-ddd-authz-alignment.spec.ts`, `5c17-approve-four-eyes.spec.ts`

### 3.3 P2-09 — Redis job durumu
- `job-queue/schedule-job-status.service.ts` (`jobs = new Map`), `schedule-job-queue.service.ts`, `schedule-job.processor.ts`, `schedule-job.types.ts`
- Redis altyapısı: `events/event-bus.module.ts` (`REDIS_CLIENT`), `config/redis-key-namespace.ts` (`redisKey(QUEUE,…)`), `infrastructure/distributed-lock.service.ts` (atomik `SET NX` + Lua release), `app.module.ts` (Throttler Redis)
- Test: `p1-a3-job-fail-closed.spec.ts` (fail-closed korunmalı)

### 3.4 P2-13 — coverage etiketleri
- Frontend: `coverage-view.component.ts`, `coverage-panel.component.ts`, `schedule-workspace.component.ts`, `view-switcher.component.ts`, `publish-dialog.component.ts`, `validation-panel.component.ts`
- Backend: `domain/models/conflict.ts` (`COVERAGE_MISSING`), `domain/optimization/greedy-strategy.ts` (emit), `domain/models/validation-result.ts` (sıfır coverage)
- Test: `5c26-coverage-foundation.spec.ts`, `5c26-coverage-application.spec.ts`, `5c28-apply-coverage-gate.spec.ts`

### 3.5 P2-11 — iş yükü
- Generator: `schedule-auto-generator.service.ts` (`findAvailablePersonnel`, `exceedsWeeklyHours`) — düzeltilmiş
- **Kalan:** `domain/optimization/greedy-strategy.ts` (`findAvailable`, `selectBest`) — haftalık saat ledger'ı yok
- `domain/optimization/scheduling-problem.ts` (`maxWeeklyHours`), `dto/generate-schedule.dto.ts`, `domain/models/conflict.ts`
- Test: `p2-11-workload-cap.spec.ts`

### 3.6 P2-14 — tatil
- `holidays/holidays.service.ts`, `holidays.controller.ts`, `prisma/schema.prisma` (`Holiday` modeli — migration yok)
- `domain/constraints/hard-constraints.ts` (`ALL_HARD_CONSTRAINTS`), `constraint.interface.ts` (`ConstraintContext.holidays` hazır)
- `types/violation-policy.ts` (yeni kod kaydı zorunlu)
- Test: doğrudan holiday hard-constraint spec'i **yok** — eklenecek

### 3.7 P2-15 — performans
- `schedule-auto-generator.service.ts` `apply()` (~:618 per-candidate validation)
- `schedule-validation.service.ts` `validateAssignment()` (~:91–136)
- `domain/entities/assignment-collection.ts` (linear filtreler)
- `services/schedule-coverage.service.ts` (tek seferlik merged evaluate — örnek desen)
- `infrastructure/database/unit-of-work.ts` (opsiyonel)
- Test: `5b3-performance-failure.spec.ts`, `5c28-apply-coverage-gate.spec.ts`

### 3.8 P2-18 — gece streak
- `schedule-auto-generator.service.ts` (`nightCount` evening'i sayıyor)
- `domain/optimization/greedy-strategy.ts` (sadece night)
- `domain/constraints/hard-constraints.ts` `RequiredRestConstraintNew` (48h, BLOCKING)
- `schedule-alert.service.ts` (`consecutive_night` >3)
- Test: çapraz-yol semantik spec'i **yok** — eklenecek

---

## 4. Önerilen uygulama sırası ve onay kapıları

Bağımlılık gerekçesi: yeni BLOCKING kurallar (P2-11/14/18) ve RBAC daraltması (P2-04), optimizer production'a alınmadan **önce** tamamlanmalı; aksi halde kanonik motor yanlış semantiği kalıcı hale getirir.

| Paket | İçerik | Migration | Onay |
|---|---|---|---|
| **Batch C — Politika daraltma (küçük)** | P2-04 (en kısıtlayıcı rol haritası), P2-13 (yanıltıcı coverage etiketlerinin kaldırılması) | Yok | Ayrı onay |
| **Batch D — Kural semantiği** | P2-14 (tatil BLOCKING), P2-11 (greedy hard weekly cap), P2-18 (48h kanonik) + çapraz-yol regresyon spec'leri | Yok | Ayrı onay |
| **Batch E — Altyapı/performans** | P2-09 (Redis status/dedupe), P2-15 (apply N+1 + batch validation) | Yok (Redis config mevcut) | Ayrı onay |
| **Batch F — Kanonik geçiş (en büyük)** | P2-01/02/03: DDD kanonik, optimizer kusurları (soft-fairness gerçek veri, 6 kural kodu), feature-flag kontrollü rollout, legacy migration modu | Yok | Ayrı onay + DB/worker doğrulaması |

Her paket için aynı kapılar uygulanır: typecheck, lint baseline (re-baseline yok), hedefli regression, backend full suite, frontend gate'ler, yedek + MANIFEST. DB-backed testler yalnızca PostgreSQL erişimi sağlandığında iddia edilir.

---

## 5. Korunan değişmezler (tüm paketler için)

- Tenant kısıtları ve org-scope genişletilmez; yeni Redis anahtarları ve kurallar org bağlamını taşır.
- Dört-göz (submit ≠ approve), `publishByUnit` akışı, published/archived immutable.
- `violation-policy.ts` strictest-wins; bilinmeyen kural fail-closed; hiçbir severity/eşik zayıflatılmaz.
- `AVAILABLE_OVER_BLOCKING`, fail-closed availability, A4 non-overridable kısıtlar.
- CAS/transaction (Batch B) ve DDD save CAS geriletilemez.
- Async job'lar gerçek worker olmadan fail-closed kalır; sahte success asla geri gelmez.
- Migration/DB/secret/git değişikliği yok (P2-13 ve tüm diğer maddelerde).
- Emek hukuku / NDK yorumları doğrulanmış mevzuat olarak sunulmaz.

---

## 6. Go-live notu

30 Nov 2026 değerlendirmesi, bu kararların uygulanması ve DB-backed doğrulama tamamlanana kadar **hazır değildir**. Bu belge yalnızca kararları kaydeder; uygulama kanıtı değildir.
