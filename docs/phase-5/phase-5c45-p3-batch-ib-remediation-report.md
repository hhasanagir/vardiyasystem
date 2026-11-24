# Phase 5c45 — P3 Batch I-B (API / Ürün / Coverage) Kapanış Raporu

**Tarih:** 2026-11-22
**Onay:** Kullanıcı `I-B'yi uygula` seçeneğini açıkça onayladı. I-C ve I-D için ayrı onay alınmadı.
**Kapsam:** P3-06 (endpoint temizliği), P3-09 (apply provenance), P3-11 (CoverageEngine tabanlı alarm/eşik refactor).
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchib-backup-20261122\MANIFEST.txt` (1760 dosya).
**Karar referansı:** `docs/phase-5/phase-5c43-p3-batch-i-decision-record.md`.

## 1. Uygulanan değişiklikler

### P3-06 — Ölü endpoint temizliği / deprecation window

`schedules.controller.ts` içinden kullanıcısı kalmayan 5 route kaldırıldı:

- `GET /schedules/by-unit/:unitId`
- `GET /schedules/:id/versions/:version` (legacy)
- `GET /schedules/:id/snapshots`
- `POST /schedules/:id/duplicate`
- `POST /schedules/generate/preview`

`GET /schedules/my-shifts` gerçek bir k6 tüketicisine sahip olduğu için **silinmedi**; `@ApiOperation({ deprecated: true })` ile 1 sürümlük deprecation window'a alındı. k6'da 4 senaryo (`load`, `stress`, `soak`, `spike`) canonical `/me/shifts` ailesine taşındı. FE tarafında kullanılmayan `previewSchedule()` kaldırıldı; `docs/api/api-inventory.md` güncellendi.

Kanıt: yeni `5c45-p3-batch-ib-regression.spec.ts`, silinen handler'ların prototype üzerinde bulunmadığını ve `findMyShifts` decorator metadata'sında `deprecated: true` olduğunu doğruluyor.

### P3-09 — Apply provenance (code-only, migration yok)

- `domain/models/version-snapshot.ts` — `SnapshotMetadata` alanları: `generatedBy`, `generatedAt`, `coverage`.
- `schedule-auto-generator.service.ts::apply()` — CAS version bump, `assignment.createMany`, **authoritative post-insert assignment read** ve `scheduleSnapshot.create` artık **aynı `$transaction`** içinde.
- Provenance tamamen sunucu türetilmiş: `generatedBy: userId`, `generatedAt`, `algorithm: 'auto-generator.apply'`, `score`/coverage authoritative CoverageEngine sonucundan. İsim ve cihaz kodları client önerisinden değil kalıcı satırlardan okunuyor.
- Snapshot version kuralı korundu/pekiştirildi: `Math.max(expectedVersion + 1, (lastSnapshot?.version ?? 0) + 1)`. `@@unique([scheduleId, version])` değişmedi.
- Client DTO'ya provenance alanı **eklenmedi**; `ScheduleSnapshot.data` JSONB yapısı korundu. **Migration / schema / seed değişikliği yok.**

Kanıt: `schedule-auto-generator.service.spec.ts` ve `5c28-apply-coverage-gate.spec.ts` içindeki yeni assertion'lar snapshot'ın aynı transaction'da, doğru versiyon ve sunucu türetilmiş metadata ile yazıldığını doğruluyor.

### P3-11 — CoverageEngine tek doğruluk kaynağı

- `ScheduleCoverageService` export edilip `SchedulesModule` provider'ına eklendi; `SupervisorCenterModule` ve `InsightsModule` bu modülü import ediyor.
- Yeni saf adapter: `domain/coverage/coverage-input-mapper.ts` — DutyRoster `role` alanını personel tipine normalize eder, device'sız satırları ve overlay tekrarlarını ayıklar.
- `ScheduleAlertService` — `missing_staff` artık `evaluateScheduleCoverage().underCoverage` satırlarından üretiliyor. Cihaz/mod bazlı “günde 1 kişi” sezgiselliği kaldırıldı; hafta sonu, tatil, cihaz off ve devre dışı vardiya override'ları için **alarm üretilmiyor**.
- `SupervisorCenterService` — mode-based `1/2` required hesabı ve `deviceCount - personnelCount` mantığı kaldırıldı; dashboard `shiftCoverage`/`missingStaffing` ve `getShiftCoverage()`权威 slot satırlarından türetiliyor. Slot'u olmayan cihaz 0/0 → %100 ve **eksik personel alarmı yok**.
- `InsightsService` — `staffingGap`, `coveragePercent`, `requiredSlots`, `assignedSlots` CoverageEngine sonuçlarından geliyor; önceki `deviceCount - personnelCount` KPI'sı kaldırıldı.
- E2E fixture'ı: `schedule-alerts.e2e-spec.ts` artık cihaz için gerçek `day/evening/night` vardiya tanımları oluşturuyor. **Test beklentileri (2 ve 89) değişmedi**; yalnızca fixture权威 modele hizalandı.

Eşik, severity, required-per-slot (`coverage-engine.ts:75` → `1`), migration veya per-device override **değiştirilmedi**.

Kanıt: `5c45-p3-batch-ib-regression.spec.ts` (6 test) — alert'lerin authoritative under-coverage satırlarından gelmesi, kapalı tarihlerde slot/alarm oluşmaması, DutyRoster normalizasyonu, supervisor ve insights KPI'larının coverage kaynaklı olması.

## 2. Kapılar

| Kapı | Sonuç |
|---|---|
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Hedef regresyon (7 spec dosyası) | **49/49 PASS** |
| Backend tam suite | **1298/1298 PASS** (121 dosya) |
| Frontend birim testleri | **162/162 PASS** (21 dosya) |
| Backend lint | **4074 error / baseline 4075** → PASS (re-baseline yok) |
| Frontend lint | **0 error / 332 warning** |
| Backend build (`nest build`) | PASS |
| Frontend build (`ng build`) | PASS |
| Backend DB e2e (`npm run test:e2e`) | **10 dosya, 85/85 PASS** |
| Tarayıcı e2e (`npm run test:browser`) | **44/44 PASS** (3.4 dk) |

Notlar:

- İlk tam suite çalışmasında zaman hassasiyetli `5b3-performance-failure.spec.ts` testi 111ms ölçtü (eşik 100ms). Aynı spec izole edildiğinde **12/12 PASS**, tam suite tekrarında **1298/1298 PASS**. Eşik değiştirilmedi, skip eklenmedi.
- İlk DB e2e çalışmasında alert fixture'ı vardiya tanımı içermediği için 2 test başarısız oldu; fixture'a 3 gerçek vardiya eklendikten sonra **85/85 PASS**. Beklenti sayıları ve severity'ler değişmedi.
- Unit test log'larındaki `ScheduleJobStatusService ... redis connection refused` fail-closed testlerinden beklenen davranış; DB/Redis kapılar boyunca healthy kaldı (`vardiya-postgres` 5432, `vardiya-redis` 6379).
- Üretilen `e2e/playwright-report/index.html` I-B yedeğindeki hash ile birebir aynı olacak şekilde geri yüklendi.

Test skip'leri, eşikler, severity'ler ve `eslint-baseline.json` değiştirilmedi.

## 3. Kapsam / manifest

I-B yedeğine göre (`batchib-manifest-diff.py`):

- **Değişen:** 23 dosya (12 uygulama + 6 test/fixture + modül/DTO/docs/k6)
- **Yeni:** 4 dosya (`coverage-engine.ts`, `coverage-types.ts`, `coverage-input-mapper.ts`, `5c45-p3-batch-ib-regression.spec.ts`)
- **Silinen:** 0 dosya (P3-06 route silmeleri dosya silmesi değil)
- **Yasaklı yol eşleşmesi:** 0
- Migration, `schema.prisma`, seed verisi, `.env`, secret, `eslint-baseline.json`, `.git`, Docker ve package dosyalarına dokunulmadı.

## 4. P3 durumu (I-B sonrası)

| Madde | Önce | Sonra |
|---|---|---|
| P3-06 | OPEN | **RESOLVED** |
| P3-09 | OPEN | **RESOLVED** |
| P3-11 | OPEN | **RESOLVED** |
| P3-13 | OPEN | Değişmedi — **I-C (k6/CI gate) kararını bekliyor** |
| P3-14 | PARTIAL | Değişmedi — **I-D, kanonik ağaç git'e girdikten sonra** |
| P3-01 | PARTIAL | PARTIAL (Batch G'den kalan `ScoringModel` GATE 5 pin'i) |

## 5. Go-live

Tüm P0/P1/P2 ve P3 I-A/I-B değişiklikleri hâlâ commit/push edilmedi (kanonik workspace `.git` içermiyor) ve staging/production DB, Redis ve worker dağıtımı doğrulanmadı. **30 Kasım 2026 go-live değerlendirmesi NOT READY** kalıyor.

> **STOP — Batch I-B tamamlandı. I-C (CI gate) ve I-D (git/OneDrive) için ayrı onay gerekir.**
