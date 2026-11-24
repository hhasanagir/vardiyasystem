# Phase 5c41 — P3 Batch G (Ölü Kod Temizliği) Kapanış Raporu

**Tarih:** 2026-11-22
**Onay:** Kullanıcı `Batch G — ölü kod` seçeneğini açıkça onayladı (dosya silme dahil).
**Kapsam:** P3-01 (kısmi), P3-03, P3-04, P3-05.
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchg-backup-20261122\MANIFEST.txt` (1768 dosya).

## 1. Uygulanan değişiklikler

### Silinen dosyalar (17)

| Madde | Dosyalar | Gerekçe |
|---|---|---|
| P3-01 (kısmi) | `backend/src/modules/schedules/domain/models/seeded-random.ts`, `generation.ts`, `domain/services/scheduling-logger.ts` | Üretim importer'ı yok; yalnız barrel re-export (silindi). |
| P3-03 | `frontend/src/app/core/scheduling/**` (13 dosya; GA `constraint-solver.service.ts` dahil) | Klasör dışından **0 import**; P1-A2 gerçek generate UI bu katmanı kullanmıyor. |
| P3-04 | `frontend/src/app/features/scheduling/models/coverage.models.ts` | `computeDeviceCoverage` ve `DeviceCoverage` yalnız barrel'da; helper `dateStr = 'TBD'` üretiyor. |

### Düzenlenen dosyalar (3)

- `backend/src/modules/schedules/domain/models/index.ts` — silinen `generation`/`seeded-random` export'ları kaldırıldı; `scoring-model` export'u korundu.
- `frontend/src/app/features/scheduling/models/index.ts` — `coverage.models` export'u kaldırıldı.
- `backend/src/modules/schedules/domain/constants.ts` — importer'ı olmayan `OVERRIDE_ROLES` satırı kaldırıldı; lokal yeniden-inline tanımlara dokunulmadı (rol semantiği değişmedi).

### Bilinçli olarak korunan dosya

`backend/src/modules/schedules/domain/models/scoring-model.ts` **silinmedi**: `5b4-preseeding.spec.ts` içindeki GATE 5 testleri (`canonical weights`, `version 2.0.0`, `weights sum to 1.0`) bu sınıfı aktif olarak doğruluyor. Silmek test kapsamını zayıflatacağından P3-01 yalnızca kısmi kapatıldı; bu sapma rapora kaydedildi.

## 2. Kapılar

| Kapı | Sonuç |
|---|---|
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Hedef regresyon (5b4, conflict-validation, 5b1-domain-architecture, P2-E, P2-F) | **86/86 PASS** |
| Backend tam suite | **1285/1285 PASS** (118 dosya) |
| Frontend birim testleri | **157/157 PASS** (19 dosya) |
| Backend lint | **4069 error / baseline 4075** → PASS (re-baseline yok) |
| Frontend lint | **0 error / 335 warning** (önce 397; ölü dosyaların warning'leri kalktı) |
| Backend build (`nest build`) | PASS |
| Frontend build (`ng build`) | PASS |
| Tarayıcı e2e (`npm run test:browser`) | **44/44 PASS** (3.5 dk) |

Test skip'leri, eşikler, severity'ler ve lint baseline değiştirilmedi. DB/Redis servisleri doğrulama boyunca healthy kaldı.

## 3. Kapsam / manifest

Batch G yedeğine göre:

- **Değişen:** 3 dosya
- **Yeni:** 0
- **Silinen:** 17 dosya (yukarıdaki liste; hepsi onaylı ölü kod kapsamı)
- **Yasaklı yol eşleşmesi:** 1 → **false positive**: `seeded-random.ts` dosya adı `/seed` deseniyle eşleşti; seed/migration içeriği yok, yalnızca deterministik RNG sınıfıydı.
- Migration, schema, seed verisi, `.env`, secret, `eslint-baseline.json`, `.git`, Docker/package dosyalarına dokunulmadı.
- Üretilen `e2e/playwright-report/index.html` yedekteki durumuna geri yüklendi.

## 4. P3 durumu (Batch G sonrası)

| Madde | Önce | Sonra |
|---|---|---|
| P3-01 | OPEN | **PARTIALLY RESOLVED** (3/4 dosya; ScoringModel test pin'i nedeniyle korundu) |
| P3-03 | OPEN | **RESOLVED** |
| P3-04 | OPEN | **RESOLVED** |
| P3-05 | OPEN | **RESOLVED** |
| Diğer 10 madde | OPEN/PARTIAL | Değişmedi (Batch H/I kararlarını bekliyor) |

## 5. Go-live

Değişiklikler hâlâ commit/push edilmedi (repo `.git` içermiyor) ve staging/production dağıtımı doğrulanmadı. **30 Kasım 2026 go-live değerlendirmesi NOT READY** kalıyor.

> **STOP — Batch G tamamlandı. Batch H (P3-07/P3-12) ve Batch I (karar gerektiren maddeler) için ayrı onay gerekir.**
