# Phase 5c44 — P3 Batch I-A (Güvenli Code-Only) Kapanış Raporu

**Tarih:** 2026-11-22
**Onay:** Kullanıcı `I-A'yı uygula (Recommended)` seçeneğini açıkça onayladı (fail-closed kararı dahil).
**Kapsam:** P3-02 (event sourcing iskeleti), P3-08 (denetim taksonomisi), P3-10 (Redis idempotency).
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchia-backup-20261122\MANIFEST.txt` (1759 dosya).
**Karar referansı:** `docs/phase-5/phase-5c43-p3-batch-i-decision-record.md`.

## 1. Uygulanan değişiklikler

### P3-02 — Event sourcing iskeleti kaldırıldı

- `backend/src/modules/schedules/domain/events/schedule-event-bus.ts` **silindi** (in-process `Map` bus, hiçbir constructor'da inject edilmiyordu).
- `schedules.module.ts` — import, provider ve export kaydı kaldırıldı.
- `ddd/aggregate-root.base.ts` — çağrısız `commit()`, `loadFromHistory()`, `_isCommitting` ve abstract `applyEvent()` kaldırıldı. Boş reducer'larla replay aggregate'i sessizce bozduğu için metodlar bırakılmadı.
- `domain/aggregates/schedule.aggregate.ts` — boş `applyEvent` switch'i ve artık kullanılmayan `DomainEvent` import'u kaldırıldı.
- **Gerçek event akışı korundu:** cross-module eventler hâlâ Redis/BullMQ `EventBusService` üzerinden çalışıyor (P3-02 kapsam dışı, dokunulmadı).

### P3-08 — Denetim taksonomisi (additive, migration yok)

`audit.constants.ts`:

- `AuditEvent` enum'una **`SCHEDULE_ARCHIVED`**, **`SCHEDULE_REVERTED`**, **`ASSIGNMENTS_APPLIED`** eklendi.
- `AuditEventLabels`'a karşılık gelen Türkçe etiketler eklendi.
- `schedules-ddd.controller.ts:354,369` ve `schedules.controller.ts:725` serbest string'leri enum referansına çevrildi (`schedules.controller.ts`'e `AuditEvent` import'u eklendi).

**Mevcut serbest string değerleri yeniden yazılmadı** — rapor/dashboard filtreleri korundu. `AuditLog.actionType` zaten `String` (schema.prisma:725), bu yüzden **migration gerekmedi**.

### P3-10 — Idempotency Redis'e taşındı

`schedule-application.service.ts`:

- `processedOps` Map'i ve ölü `IDEMPOTENCY_TTL_MS` duplikasyonu kaldırıldı.
- `@Inject(REDIS_CLIENT)` ile Redis injector eklendi (global provider — `event-bus.module.ts`).
- Key: `vardiya:cache:schedule-idempotency:<organizationId|global>:<op>:<key>` (`redisKey()` convention).
- TTL: **300 saniye** (önceki 300_000 ms ile birebir aynı).
- Kayıt: `SET key <scheduleId> EX 300 NX` — yalnızca ilk yazan kazanır.
- Replay: Redis'te id varsa aggregate `scheduleRepo.findById()` ile **yeniden yükleniyor**; bayat in-process nesne döndürülmüyor.
- **Fail-closed:** Redis hatası → `ServiceUnavailableException` (503, `IDEMPOTENCY_STORE_UNAVAILABLE`); per-instance Map fallback yok.
- org kapsamı DDD controller'dan geçiriliyor: `create()` ve `rollback()` artık `req.user.organizationId` değerini servise iletiyor.

Kapsam yalnızca DDD `createSchedule` ve `rollback` — `/generate/apply` farklı servis olduğu için etkilenmedi (P3-10 karar dokümanındaki düzeltmeyle uyumlu).

Kanıt: yeni `p3-batch-ia-idempotency.spec.ts` (5 test): org-scoped key + EX 300 + NX, replay'de ikinci yazma yok, tenant ayrımı, Redis hatasında 503 ve **hiçbir save**, rollback replay'in snapshot aramasını short-circuit etmesi.

## 2. Kapılar

| Kapı | Sonuç |
|---|---|
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Hedef regresyon (P3-10 + 6 ilgili service/controller/architecture spec) | **67/67 PASS** |
| Backend tam suite | **1292/1292 PASS** (120 dosya; I-A öncesi 1287 + 5 yeni test) |
| Frontend birim testleri | **162/162 PASS** (21 dosya, değişmedi) |
| Backend lint | **4070 error / baseline 4075** → PASS (re-baseline yok) |
| Frontend lint | **0 error / 334 warning** (değişmedi) |
| Backend build (`nest build`) | PASS |
| Frontend build (`ng build`) | PASS |
| Backend DB e2e (`npm run test:e2e`) | **10 dosya, 85/85 PASS** |
| Tarayıcı e2e (`npm run test:browser`) | **44/44 PASS** (3.3 dk) |

Test skip'leri, eşikler, severity'ler ve lint baseline değiştirilmedi. DB/Redis kapılar boyunca healthy kaldı; fail-closed test log'larındaki "redis connection refused" beklenen davranıştır. Üretilen `e2e/playwright-report/index.html` I-A yedeğindeki durumuna geri yüklendi.

## 3. Kapsam / manifest

I-A yedeğine göre:

- **Değişen:** 11 dosya (3 uygulama + 4 test güncellemesi + 2 controller/module + 1 enum + 1 aggregate base)
- **Yeni:** 1 dosya (`p3-batch-ia-idempotency.spec.ts`)
- **Silinen:** 1 dosya (`schedule-event-bus.ts`, onaylı P3-02 kapsamı)
- **Yasaklı yol eşleşmesi:** 0
- Migration, schema, seed verisi, `.env`, secret, `eslint-baseline.json`, `.git`, Docker/package dosyalarına dokunulmadı.

## 4. P3 durumu (I-A sonrası)

| Madde | Önce | Sonra |
|---|---|---|
| P3-02 | PARTIAL | **RESOLVED** |
| P3-08 | OPEN | **RESOLVED** |
| P3-10 | OPEN | **RESOLVED** |
| P3-06, P3-09, P3-11 | OPEN | Değişmedi — **I-B kararlarını bekliyor** |
| P3-13 | OPEN | Değişmedi — **I-C (CI) kararını bekliyor** |
| P3-14 | PARTIAL | Değişmedi — **I-D, kanonik ağaç git'e girdikten sonra** |
| P3-01 | PARTIAL | PARTIAL (Batch G'den kalan `ScoringModel` test pin'i) |

## 5. Go-live

Değişiklikler hâlâ commit/push edilmedi (workspace `.git` içermiyor) ve staging/production dağıtımı doğrulanmadı. **30 Kasım 2026 go-live değerlendirmesi NOT READY** kalıyor.

> **STOP — Batch I-A tamamlandı. I-B (API/ürün), I-C (CI) ve I-D (git/OneDrive) için ayrı onay gerekir.**
