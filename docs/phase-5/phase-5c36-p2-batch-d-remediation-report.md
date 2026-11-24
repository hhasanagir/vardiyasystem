# Phase 5C.36 — P2 Batch D Remediation Report

**Tarih:** 2026-11-21  
**Durum:** Batch D tamamlandı. Batch E/F ve P3 kapsam dışıdır, ayrı onay bekler.  
**Yetki:** Kullanıcı `Batch D'yi başlat` onayı. Değişiklik öncesi yedek: `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchd-backup-20261121\MANIFEST.txt` (1915 dosya).

## 1. Kapsam

`docs/phase-5/phase-5c34-p2-decision-record.md` kararları uyarınca bu partide yalnızca üç madde uygulandı:

| Madde | Karar | Uygulama |
| --- | --- | --- |
| P2-11 | İkisini düzelt, BLOCKING | DDD motorunda haftalık saat limiti; greedy optimizer'da haftalık ledger + `MAX_WORK_EXCEEDED`; generator'daki mevcut cap korundu |
| P2-14 | BLOCKING kural ekle | `HOLIDAY_CONFLICT` hard constraint; BLOCKING / non-overridable; politika kaydı |
| P2-18 | DDD 48h kanonik | Generator ve greedy yalnızca `night` vardiyasını gece sayıyor; 48h çapa son gerçek gece |

P2-15 (apply N+1 / batch) ve diğer P2 maddeleri bu partide değiştirilmedi.

## 2. Değişiklikler

### 2.1 Ortak takvim yardımcısı

`domain/value-objects/local-date.ts` içine `daysBetweenKeys(from, to)` eklendi. Yerel `YYYY-MM-DD` parçalarından `Date.UTC` ile takvim günü farkı hesaplanıyor; `toISOString()` kaynaklı ±1 gün kayması ve DST etkisi ortadan kaldırıldı. `P2-12` davranışı korundu.

### 2.2 P2-14 — tatil kuralı

- `ViolationRule` tipine `HOLIDAY_CONFLICT` eklendi.
- `VIOLATION_POLICY` içinde `HOLIDAY_CONFLICT: BLOCKING, isOverrideAllowed=false` kaydedildi; legacy taraftan `INFO/WARNING` gelse bile strictest-wins ile yükseltiliyor.
- Yeni `HolidayShiftConstraint`, `ALL_HARD_CONSTRAINTS` içine eklendi:
  - Tatil gününde `day`/`morning` çalışma vardiyalarına izin verilir (generator'ın mevcut day-only üretimiyle tutarlı).
  - `evening`/`night` çalışma vardiyaları BLOCKING ve override edilemez.
  - Çalışma dışı (`off`, `leave`, `sick`, `backup`) vardiyalar ve tatil olmayan günler kuralı tetiklemez.
- `schedule-validation.service.ts` rule→conflict eşlemesine `HOLIDAY_CONFLICT → RULE_VIOLATION` eklendi.
- Bu kural **iç planlama politikasıdır**; doğrulanmış yasal/mevzuat yorumu olarak sunulmaz.

### 2.3 P2-11 — haftalık çalışma limiti

- `ViolationRule` tipine ve `VIOLATION_POLICY` kaydına `MAX_WORK_EXCEEDED` eklendi; BLOCKING / non-overridable.
- Yeni `WeeklyHoursLimitConstraint`, personelin `maxWeeklyHours` değerini Monday bazlı hafta için `AssignmentCollection.getWeeklyHours()` ledger'ından hesaplıyor; aşımda BLOCKING violasyon ve `maxHours/actualHours/weekStart` detayları üretiliyor. Limit yok veya ≤0 ise yanlış bloklama yapılmıyor.
- `schedule-validation.service.ts` eşlemesi `MAX_WORK_EXCEEDED → ConflictCode.MAX_WORK_EXCEEDED`.
- `greedy-strategy.ts`:
  - Haftalık saat ledger'ı (`weeklyHours`) eklendi; mevcut atamalar da ledger'a işleniyor.
  - `findAvailable()` artık `maxWeeklyHours` kontrolünü saat cinsinden yapıyor.
  - Slot doldurulamadığında ve kap nedeni varsa `ConflictCode.MAX_WORK_EXCEEDED`, `ERROR`, `isHardConstraint=true`, `isOverridable=false` emit ediliyor; `candidate.isValid=false`, `result.success=false`. Fake success yok.
  - Yerel `shiftDurationHours()` yardımcısı generator ile aynı saat-string semantiğini kullanıyor.
- Generator'daki mevcut `year/month` cap, `weeklyHours` ledger'ı ve uyarı üretimi korundu; zayıflatılmadı.

### 2.4 P2-18 — gece vardiyası semantiği

- `greedy-strategy.ts` ve `schedule-auto-generator.service.ts` içinde `lastNightDate` takibi eklendi.
- `evening` artık `nightCount` içine girmiyor ve gece streak limitine tabi değil (`ShiftTypeVO.isNightShift` yalnızca `night`).
- Yeni gece ataması için son gerçek geceden itibaren `daysBetweenKeys >= 2` zorunlu; aradaki gündüz/akşam vardiyaları 48h çapasını sıfırlamıyor. Bu, `RequiredRestConstraintNew` davranışıyla aynı.
- Greedy'de aday atamalar için collection filtresi kaldırıldı; engine artık üretilen gece geçmişini görüyor (`REST_RULE_VIOLATION` BLOCKING kalıyor).

### 2.5 Yeni regresyon spec'i

`backend/src/modules/schedules/__tests__/p2-batch-d-rule-semantics.spec.ts` eklendi (13 test):

- politika pinleri (strictest-wins),
- holiday day/morning serbest, evening/night BLOCKING, non-working/non-holiday sessiz,
- haftalık cap'te BLOCKING, tam kapta izin, limit yoksa false-block yok,
- generator ve greedy için evening/48h çapraz-yol pinleri,
- engine `REST_RULE_VIOLATION` pin'i,
- greedy `MAX_WORK_EXCEEDED` fail-closed pin'i.

Mevcut test dosyaları (`p2-11-workload-cap.spec.ts`, `5c26-*`, `5c28-apply-coverage-gate`, `p1-a4-violation-policy`, strictest-wins/coverage spec'leri) değiştirilmedi.

## 3. Kapsam farkı (Batch D öncesi yedek ile karşılaştırma)

**8 dosya:** 7 değiştirilmiş + 1 yeni. Silinen dosya yok.

Değiştirilen:
- `backend/src/modules/schedules/domain/constraints/constraint.interface.ts`
- `backend/src/modules/schedules/domain/constraints/hard-constraints.ts`
- `backend/src/modules/schedules/domain/optimization/greedy-strategy.ts`
- `backend/src/modules/schedules/domain/value-objects/local-date.ts`
- `backend/src/modules/schedules/schedule-auto-generator.service.ts`
- `backend/src/modules/schedules/schedule-validation.service.ts`
- `backend/src/modules/schedules/types/violation-policy.ts`

Yeni:
- `backend/src/modules/schedules/__tests__/p2-batch-d-rule-semantics.spec.ts`

Migration, seed, DB şeması, secret, git veya lint baseline değişikliği yapılmadı.

## 4. Doğrulama kapıları

| Kapı | Sonuç |
| --- | --- |
| Backend `npm run typecheck` | PASS |
| Backend lint gate (`maxErrors: 4075`) | PASS — 4075 error / 8824 warning, baseline korundu |
| Hedef testler (11 mevcut dosya) | 142/142 PASS |
| Yeni Batch D spec | 13/13 PASS |
| Backend tam `npx vitest run` | **1258 PASS / 10 FAIL / 1268** — 10 hata yalnızca `device-off.spec.ts`, `localhost:5432` erişilemediği için DB'siz ortamdan kaynaklı, Batch D öncesi mevcut |
| Frontend `npm run typecheck` | PASS |
| Frontend `npx vitest run` | 157/157 PASS |
| Frontend `npm run lint` | 0 error / 397 warning, baseline korundu |

Çalıştırılmadı: build, migration, seed, e2e/Playwright, Docker/K8s ve DB-backed integration — PostgreSQL mevcut değil.

## 5. Kapanış değerlendirmesi

Batch D kapsamındaki P2-11, P2-14 ve P2-18 tamamlandı. Yeni BLOCKING kurallar canonical politika kaydına işlendi; greedy ve generator DDD kural motorıyla aynı yönde hizalandı; hiçbir test, eşik veya severity zayıflatılmadı.

**30 Kasım 2026 go-live değerlendirmesi hâlâ NOT READY:** Batch E/F ve DB-backed doğrulama tamamlanmadan üretim onayı verilmemelidir. Batch E/F ve P3 için ayrı açık kullanıcı onayı gereklidir; bu rapor o onayları içermez.
