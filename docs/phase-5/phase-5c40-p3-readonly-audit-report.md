# Phase 5c40 — P3 Read-Only Denetim Raporu

**Tarih:** 2026-11-22
**Durum:** Kullanıcı onayıyla P3 başlatıldı; bu faz **yalnızca okuma** — kaynak kodu, test, migration, schema, secret, yapılandırma veya git değişikliği yapılmadı.
**Referans:** `docs/phase-5/phase-5c24-readonly-audit-report.md` §21/§23 P3-01…P3-14.
**Ön koşul:** P0/P1/P2 Batch A–F uygulandı; DB/Redis doğrulaması `phase-5c39` ile kapatıldı.

## 1. Sonuç özeti

| Durum | Sayı | Maddeler |
|---|---|---|
| RESOLVED | 0 | — |
| PARTIALLY RESOLVED | 2 | P3-02, P3-14 |
| OPEN | 12 | P3-01, P3-03…P3-13 |

Hiçbir P3 maddesi Batch A–F kapsamında bilinçli olarak kapatılmadı. İki kısmi çözüm yan etkidir: P3-02'de event bus stub'ları gerçek metotlara dönüştü ama hâlâ **zero caller**; P3-14'te OneDrive kopyasındaki nested klonun dosyaları dehydrated (0 hydrated dosya) ama eski repo ayrı `.git` ile duruyor.

Batch yan etkilerinin P3'ü **kapatmadığına** dikkat: P2-09 Redis yalnızca job status/dedupe (P3-10 ayrı servis), P2-15 batch validation ve P1-A5 apply gate'leri provenance eklemedi (P3-09), P2-07 snapshot yalnız DDD publish (P3-07/P3-09 değil), P2-13 yalnız frontend etiketleri (P3-11 değil), P2-16 gerçek `/activities` akışı panelleri bağlamadı (P3-12), 5c39 tek seferlik performans ölçümü CI gate'i değil (P3-13).

## 2. Madde madde durum

| ID | Durum | Kanıt (mevcut kod) | Not / karar gereksinimi |
|---|---|---|---|
| P3-01 | OPEN | `backend/src/modules/schedules/domain/models/seeded-random.ts`, `generation.ts`, `scoring-model.ts`, `domain/services/scheduling-logger.ts`; yalnız barrel + spec import'ları | Güvenli ölü kod temizliği; migration/DB/secret/git yok. |
| P3-02 | PARTIALLY | `domain/events/schedule-event-bus.ts:12-40` gerçek `on/publish/publishAll/getEventLog`; `schedules.module.ts` DI kaydı; ama çağrı yok. `domain/aggregates/schedule.aggregate.ts:503` boş `applyEvent`; `ddd/aggregate-root.base.ts:13,21` `commit()`/`loadFromHistory()` çağrılmıyor | Event sourcing'i bağlamak mimari karar; tek başına stub temizliği yeterli değil. |
| P3-03 | OPEN | `frontend/src/app/core/scheduling/**` (13 dosya, GA `constraint-solver.service.ts:198-285` dahil); dış import 0 | Güvenli silme; P1-A2 gerçek generate UI bu katmanı kullanmıyor. |
| P3-04 | OPEN | `frontend/src/app/features/scheduling/models/coverage.models.ts:54` `dateStr = 'TBD'`; `computeDeviceCoverage` sadece barrel'da | Güvenli silme/düzeltme; ürün kararı yok. |
| P3-05 | OPEN | `backend/src/modules/schedules/domain/constants.ts:18` `OVERRIDE_ROLES` import'suz; `schedules.service.ts:1473,1541,1703` lokal yeniden inline | Kısmi doğru: kardeş sabitler kullanılıyor, bloğun tamamı ölü değil. Güvenli cleanup. |
| P3-06 | OPEN | `schedules.controller.ts:150,162,360,387,661,714` (6 route); FE `schedule.service.ts:978-999` `previewSchedule()` çağrısız | API uyumluluk / ürün kararı; silmeden önce tüketici teyidi gerekir. |
| P3-07 | OPEN | `schedules.service.ts:2137` `bumpScheduleVersion()` + `:2142` `version:{increment:1}` → **+2**; route dormant (`workflowService.rollback`) | Kod-only ama kanonik rollback yolu kararı gerekir; CAS gerilemeyecek. |
| P3-08 | OPEN | `audit-log/audit.constants.ts:31-45` eksik aksiyonlar; serbest string kullanımı `schedules-ddd.controller.ts:354,369`, `schedules.controller.ts:725`; `SCHEDULE_GENERATED` emit edilmiyor; `schedule_generate` entity yok | Denetim taksonomisi ürün/karar konusu; DB enum ise **migration** kapısı açılır — şimdilik dokunulmayacak. |
| P3-09 | OPEN | `schedule-auto-generator.service.ts:553-732` (`createMany:726`, CAS `:714-725`), snapshot/generatedBy/score yok | Kalıcılık/provenance politikası kararı; additive alanlar migration gerektirebilir. |
| P3-10 | OPEN | `schedule-application.service.ts:11-12,20-29` `Map` + 300s TTL, instance-local | P2-09'tan bağımsız; Redis'e taşıma altyapı/multi-pod kararı (schema migration yok). |
| P3-11 | OPEN | `schedule-alert.service.ts:46-65`; `supervisor-center.service.ts:177,320`; `insights.service.ts:86-87` | Gerçek vardiya ihtiyaç modeli (P2-13) olmadan sezgisel eşikler güvenilir değil; ürün kararı, opsiyonel additive migration. |
| P3-12 | OPEN | `version-panel.component.ts:113-124` (`score:'—'`), `audit-panel.component.ts:67-92` sentetik satır | P2-16 gerçek akışı var ama paneller bağlı değil; "geçmiş skor" anlamı ürün kararı. |
| P3-13 | OPEN | `k6/` senaryoları, `.github/workflows/*` içinde k6 yok, `package.json` script yok; `5b3-performance-failure.spec.ts` sentetik | CI runner + baseline artifact kararı; 5c39 düzeltmesi tek seferlik kanıt. |
| P3-14 | PARTIALLY | Desktop `backend/src/modules/schedules/schedules` = yok; `Belgeler\GitHub\vardiyasystem` ayrı `.git` ile mevcut, nested klon 0 hydrated dosya | Silme/arşivleme git + OneDrive senkronizasyonu etkiler — açık onay gerekir. |

## 3. Önerilen uygulama grupları (henüz onaylanmadı)

| Grup | Maddeler | Nitelik | Migration / karar |
|---|---|---|---|
| **Batch G — güvenli ölü kod temizliği** | P3-01, P3-03, P3-04, P3-05 | Code-only, geri alınabilir | Yok. Dosya silme dahil olduğu için ayrı onay gerekir. |
| **Batch H — gözlemlenebilir bütünlük (code-only kısmı)** | P3-07 (tek bump + rollback yolu), P3-12 (gerçek `/activities` bağlantısı) | Code-only, regresyon spec'leri | P3-07 için kanonik rollback yolu, P3-12 için skor anlamı kararı. |
| **Batch I — altyapı/ürün kararları** | P3-02, P3-06, P3-08, P3-09, P3-10, P3-11, P3-13, P3-14 | Mimari/API/denetim/CI/git | Kısmi migration ve ürün kararı olası; **önce karar dokümanı**, sonra kod. |

Her grup için aynı kapılar korunur: yedek + MANIFEST, typecheck, lint baseline (maxErrors 4075, re-baseline yok), hedef regresyon, backend full suite, frontend gate'ler. DB/worker iddiası yalnızca gerçek servislerle yapılır. Test skip/eşik/severity zayıflatması yok; DDD kanonik yön, strictest-wins, tenant fail-closed, four-eyes, published/archived immutability korunur.

## 4. Go-live

P3 read-only olsa da üretim dağıtımı için engeller sürüyor: değişiklikler `.git` olmadığı için commit/push edilmedi, staging/production DB/Redis/worker doğrulanmadı. **30 Kasım 2026 go-live değerlendirmesi NOT READY** kalıyor.

> **STOP — Phase 5C.40 read-only tamamlandı. Kod değişikliği yapılmadı. Uygulama için ayrı açık onay gerekir.**
