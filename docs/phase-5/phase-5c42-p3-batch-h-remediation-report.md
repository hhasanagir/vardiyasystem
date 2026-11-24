# Phase 5c42 — P3 Batch H (Gözlemlenebilir Bütünlük) Kapanış Raporu

**Tarih:** 2026-11-22
**Onay:** Kullanıcı `Batch H (Recommended)` seçeneğini açıkça onayladı (P3-07 + P3-12, iki davranış kararı dahil).
**Kapsam:** P3-07 (legacy rollback tek versiyon artışı), P3-12 (version/audit panellerinin gerçek veriye bağlanması).
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchh-backup-20261122\MANIFEST.txt` (1752 dosya).

## 1. Uygulanan değişiklikler

### P3-07 — Legacy rollback tek atomik versiyon artışı

`backend/src/modules/schedules/schedules.service.ts` (legacy `rollback`):

- **Sorun:** `bumpScheduleVersion(tx, id, expectedVersion)` çağrısından sonra ikinci bir `data: { version: { increment: 1 } }` güncellemesi vardı; her legacy rollback sürümü **+2** ilerletiyordu. Snapshot geri yükleme sonrası `rolledBackToVersion` / version geçmişi tutarsızlaşıyordu.
- **Düzeltme:** İkinci `version` artışı kaldırıldı. `bumpScheduleVersion()` tek versiyon mutasyonu olarak bırakıldı (CAS/precondition semantiği korundu). Son `tx.schedule.update` yalnızca ilişki re-read için `data: {}` ile çağrılıyor.
- **Kanonik yol dokunulmadı:** Aktif route `workflowService.rollback` üzerinden çalışmaya devam ediyor; legacy `SchedulesService.rollback` dormant ama tek atomik bump yapacak şekilde düzeltildi.

Kanıt: yeni `backend/src/modules/schedules/__tests__/p3-batch-h-rollback.spec.ts`:

- CAS bump'ın tam bir kez çağrıldığını ve `where: { id, version: expectedVersion }` ile gittiğini doğrular.
- Re-read update'in `data: {}` olduğunu ve `version` içermediğini pin'ler.
- Stale `expectedVersion` durumunda `ConflictException` fırlatıldığını ve re-read'e **hiç ulaşılmadığını** doğrular.

### P3-12 — Panellerde sahte veri kaldırıldı

| Dosya | Önce | Sonra |
|---|---|---|
| `version-panel.component.ts` | `score: '—'` sentetik skor satırı | Kaldırıldı; geçmiş `getVersion` snapshot'larından gerçek durum/aktör/zaman gösteriliyor |
| `audit-panel.component.ts` | Mevcut `Schedule` nesnesinden üretilen sentetik denetim satırı | Kaldırıldı; gerçek `/schedules/activities` akışına bağlandı |
| `schedule-api.service.ts` | — | `ScheduleActivity` interface + `getActivities(limit = 10)` eklendi |

Ek davranış:

- `mapSnapshotsToVersions()` — eksik snapshot için `'kayıt yok'` / `'anlık görüntü yok'` döndürür; **skor ya da durum uydurmaz**. `getVersion` `MinRole.SUPERVISOR` istediği için 403/erre durumda panel yalnızca mevcut sürümü ve açık hata mesajını gösterir.
- `mapActivitiesToAuditEntries()` — yalnızca backend'den gelen gerçek audit satırlarını map'ler; boş liste boş panel demektir (sentetik satır üretilmez).
- Audit endpoint'i org-scoped ve schedule-scoped **değil**; panel etiketi "/ son aktiviteler" akışını yansıtacak şekilde güncellendi.

Kanıt: `audit-panel.mapper.spec.ts` (3 test) + `version-panel.mapper.spec.ts` (2 test).

## 2. Kapılar

| Kapı | Sonuç |
|---|---|
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Hedef regresyon (P3-07, schedules.service, 5c6-hardening, security-invariants, 5c29 + mapper spec'leri) | **69/69 PASS** (64 backend + 5 frontend) |
| Backend tam suite | **1287/1287 PASS** (119 dosya; Batch G sonrası 1285 + 2 yeni rollback testi) |
| Frontend birim testleri | **162/162 PASS** (21 dosya; Batch G sonrası 157 + 5 yeni mapper testi) |
| Backend lint | **4069 error / baseline 4075** → PASS (re-baseline yok) |
| Frontend lint | **0 error / 334 warning** (Batch G sonrası 335 → bir warning azaldı) |
| Backend build (`nest build`) | PASS |
| Frontend build (`ng build`) | PASS |
| Backend DB e2e (`npm run test:e2e`) | **10 dosya, 85/85 PASS** |
| Tarayıcı e2e (`npm run test:browser`) | **44/44 PASS** (3.6 dk) |

Test skip'leri, eşikler, severity'ler ve lint baseline değiştirilmedi. DB/Redis servisleri kapılar boyunca healthy kaldı; fail-closed test log'larındaki "redis connection refused" beklenen davranıştır. Üretilen `e2e/playwright-report/index.html` Batch H yedeğindeki durumuna geri yüklendi.

## 3. Kapsam / manifest

Batch H yedeğine göre:

- **Değişen:** 4 dosya
- **Yeni:** 5 dosya (2 regresyon spec'i + 2 mapper + 1 backend rollback spec'i)
- **Silinen:** 0
- **Yasaklı yol eşleşmesi:** 0
- Migration, schema, seed verisi, `.env`, secret, `eslint-baseline.json`, `.git`, Docker/package dosyalarına dokunulmadı.

## 4. P3 durumu (Batch H sonrası)

| Madde | Önce | Sonra |
|---|---|---|
| P3-07 | OPEN | **RESOLVED** |
| P3-12 | OPEN | **RESOLVED** |
| P3-01 | PARTIAL | PARTIAL (Batch G'den kalan `ScoringModel` test pin'i) |
| P3-02, P3-06, P3-08, P3-09, P3-10, P3-11, P3-13, P3-14 | OPEN/PARTIAL | Değişmedi — **Batch I kararları bekliyor** |

## 5. Go-live

Değişiklikler hâlâ commit/push edilmedi (repo `.git` içermiyor) ve staging/production dağıtımı doğrulanmadı. **30 Kasım 2026 go-live değerlendirmesi NOT READY** kalıyor.

> **STOP — Batch H tamamlandı. Batch I (P3-02/06/08/09/10/11/13/14) için ayrı karar onayı gereklidir.**
