# Phase 5c46 — P3 Batch I-C (k6 / Performans CI Gate) Kapanış Raporu

**Tarih:** 2026-11-22
**Onay:** Kullanıcı `I-C'yi uygula (Recommended)` seçeneğini açıkça onayladı. I-D için ayrı onay alınmadı.
**Kapsam:** P3-13 — k6 performans regresyon gate'i.
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchic-backup-20261122\MANIFEST.txt` (1762 dosya).
**Karar referansı:** `docs/phase-5/phase-5c43-p3-batch-i-decision-record.md` §P3-13.
**Ön koşul:** I-A ve I-B tamamlandı; tüm kapılar PASS.

## 1. Uygulanan değişiklikler

Karar dokümanındaki öneri birebir uygulandı: **5b3 sentetik benchmark'ine dokunulmadan**, ayrı bir scheduled/manual workflow + kısa smoke senaryosu + gerçek ölçümden üretilmiş commit'li baseline + onaylı tolerans eklendi.

### 1.1 `k6/scenarios/smoke-test.js` (yeni)

- 5 VU / 30 sn `constant-vus`; load (34 dk), stress, spike ve soak (3s40) profillerinin **yerine geçmez**.
- Tüm mutlak eşikler `helpers.js`'ten `THRESHOLDS` üzerinden **birebir import edilir** — hiçbir SLO gevşetilmedi. Tek ek kapı `checks: ['rate==1']`: tek bir beklenmeyen status koşuyu düşürür, ortalamaya gömülmez.
- İlk gerçek koşu bir kusur yakaladı: `/health` global guard arkasında **401** dönerken `/health/live` public ve 200. Senaryo gerçek public liveness route'unu (`/health/live`) ölçecek şekilde düzeltildi. Mevcut uzun senaryoların bu hatası **bu batch kapsamında değiştirilmedi** (ayrı öneri, §5).
- Authoritative `setup()` fail-closed: token alınamazsa senaryo `throw` eder; varsayılan `helpers.js` credential'ları legacy olduğu için workflow gerçek seed hesabını `AUTH_EMAIL`/`AUTH_PASSWORD` ile enjekte eder.

### 1.2 `k6/smoke-baseline.json` (yeni)

- Uydurma değil: yerel migrate + seed edilmiş stack'e (Postgres 5432 + Redis 6379) karşı `grafana/k6:0.54.0` ile yapılan **gerçek koşudan** üretildi.
- Özet: **869 istek / 124 iterasyon / checks 869/869 / exit 0**; `http_req_duration` p95 = **108 ms**, p99 = 192 ms.
- Mutlak SLO'lar yine k6 threshold'larında; baseline dosyası yalnızca **tolerans sapmasını** yakalar: `latencyMultiplier: 1.25`, `latencyAbsoluteMs: 100`, `errorRateAbsolute: 0`, `minChecksRate: 1`, `minRequestCount: 100`.
- Threshold **tanımları** da dosyaya kaydedildi; sessiz bir eşik kaldırılması/zayıflatması ayrı bir ihlal sayılır.

### 1.3 `k6/compare-baseline.mjs` (yeni)

Fail-closed karşılaştırıcı. Dört bağımsız kapı:

1. **Eşik tanımı drift'i** — beklenen threshold key'leri birebir eşleşmeli (silme/rename = zayıflatma).
2. **Örneklem tabanı** — <100 istekli koşu gürültü üzerinden PASS veremez.
3. **Hata/check oranı** — baseline 0 + tolerans 0 → tek failed request bile FAIL.
4. **Latency drift'i** — `avg`/`p(95)`/`p(99)` için `baseline × 1.25 + 100 ms`; eksik/non-finite değer FAIL.

Kırmızıya girebildiği kanıtlandı (gerçek özet bozularak): `p95=9000 ms → exit 1`, `error=0.05 → exit 1`, `rate<0.01 threshold'u silindi → exit 1`, `count=5 → exit 1`. Dört senaryo da doğru ihlal mesajını üretti. GitHub Actions'ta `GITHUB_STEP_SUMMARY` çıktısı da yazılır.

### 1.4 `.github/workflows/performance.yml` (yeni)

- Tetikleyici: `schedule` (`0 5 * * 2`) + `workflow_dispatch`. **PR tetikleyicisi yok** — gerekçe: uzun profiller PR check'e uygun değil, 5b3 zaten her PR'da çalışıyor (§1.1). Birkaç stabil koşudan sonra required PR gate'e yükseltme öneri olarak bırakıldı.
- Ephemeral stack: `postgres:15-alpine` + `redis:7-alpine` service container'ları; `prisma generate` → `migrate deploy` → `npm run seed` → `nest build`. `DATABASE_DIRECT_URL` workflow env'inde mevcut (schema `directUrl` gereksinimi).
- **Gerçek hazırlık kapısı:** port probe değil `/api/v1/health/ready` (database, redis, queue, memory, endpoints) — bozuk stack baseline olamaz.
- Resmi `grafana/k6:0.54.0` container'ı, `--network host`, summary JSON artifact (30 gün), hata durumunda API log'u, her durumda API kapatma.
- Özel Docker image, yeni bağımlılık, secret veya production credential **eklenmedi**; seed hesabı throwaway (`admin@hospital.com` / `admin123`, `prisma/seed.ts` ile eşleşir).

## 2. Kapılar

| Kapı | Sonuç |
|---|---|
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Backend tam suite | **1298/1298 PASS** (121 dosya) |
| Frontend birim testleri | **162/162 PASS** (21 dosya) |
| Backend lint | **4074 error / baseline 4075** → PASS (re-baseline yok) |
| Frontend lint | **0 error / 332 warning** |
| Backend build (`nest build`) | PASS |
| Frontend build (`ng build`) | PASS |
| Backend DB e2e (`npm run test:e2e`) | **10 dosya, 85/85 PASS** |
| Tarayıcı e2e (`npm run e2e`) | **44/44 PASS** (3.6 dk) |
| **k6 smoke (gerçek koşu)** | **exit 0**, 869 istek, checks 100%, tüm eşikler PASS |
| **Baseline karşılaştırıcı** | **exit 0** — "no regression beyond the committed tolerance" |
| **Negatif kapı kanıtı** | 4/4 senaryo **exit 1** (latency, error, eşik drift, örneklem) |
| YAML / JS sözdizimi | `performance.yml` YAML OK; `compare-baseline.mjs`, `smoke-test.js`, `helpers.js` `node --check` OK |

Notlar:

- Unit log'larındaki `ScheduleJobStatusService ... redis connection refused` mesajları fail-closed testlerinden beklenen davranış; DB/Redis kapılar boyunca healthy kaldı (`vardiya-postgres` 5432, `vardiya-redis` 6379).
- Tarayıcı e2e'nin yeniden ürettiği `e2e/playwright-report/index.html`, I-C yedeğindeki hash ile birebir aynı olacak şekilde geri yüklendi (`BFBE31BC…120CACB4`).
- Test skip'i, eşik/severity zayıflatması, `eslint-baseline.json` re-baseline'i veya 5b3 eşiği değişikliği **yok**.

## 3. Kapsam / manifest

I-C yedeğine göre (`batchic-manifest-diff.py`):

- **Değişen:** 0 dosya
- **Yeni:** 8 dosya
- **Silinen:** 0 dosya
- **Yasaklı yol eşleşmesi:** 0

8 "yeni" dosyadan **5'i bu batch'in gerçek değişikliği**:

1. `.github/workflows/performance.yml`
2. `k6/scenarios/smoke-test.js`
3. `k6/smoke-baseline.json`
4. `k6/compare-baseline.mjs`
5. `docs/phase-5/phase-5c46-p3-batch-ic-remediation-report.md` (bu rapor, diff'den sonra yazıldı)

Kalan 3'ü (`backend/src/modules/schedules/domain/coverage/coverage-engine.ts`, `coverage-input-mapper.ts`, `coverage-types.ts`) **I-B dosyalarıdır**; OneDrive Files On-Demand nedeniyle `ReparsePoint` (dehydrated) oldukları için yedekleme scripti bunları kopyalayamamış ve diff yanlışlıkla "yeni" saymıştır. I-C öncesinde mevcut oldukları I-B raporu ve dosya timestamp'leriyle doğrulandı; **I-C bunlara dokunmadı**. Aynı nedenle migration, `schema.prisma`, seed, `.env`, secret, `.git`, Docker ve package dosyalarına dokunulmadı.

## 4. P3 durumu (I-C sonrası)

| Madde | Önce | Sonra |
|---|---|---|
| P3-13 | OPEN | **RESOLVED** (advisory-by-placement, real-by-behaviour) |
| P3-14 | PARTIAL | Değişmedi — **I-D onayını bekliyor** |
| P3-01 | PARTIAL | PARTIAL (Batch G'den kalan `ScoringModel` GATE 5 pin'i) |

P3-02, 06, 08, 09, 10, 11 I-A/I-B/G/H kapsamında kapalı kaldı.

## 5. Go-live

Tüm P0/P1/P2 ve P3 I-A/I-B/I-C değişiklikleri hâlâ commit/push edilmedi (kanonik workspace `.git` içermiyor) ve staging/production DB, Redis ve worker dağıtımı doğrulanmadı. **30 Kasım 2026 go-live değerlendirmesi NOT READY** kalıyor.

Ayrı öneri (bu batch'in dışında): mevcut `k6/scenarios/load-test.js` ve diğer uzun profiller de `/health` yerine `/health/live` kullanacak şekilde düzeltilmeli; ayrıca birkaç stabil scheduled koşudan sonra `performance.yml` required PR gate'e yükseltilmeli.

> **STOP — Batch I-C tamamlandı. I-D (git/OneDrive) için ayrı onay gerekir.**
