# Phase 5c39 — DB/Redis Doğrulama ve Performans Regresyonu Kapanış Raporu

**Tarih:** 2026-11-22
**Kapsam:** Batch E/F sonrası kalan DB/worker doğrulaması, gerçek Redis kanıtı ve tam kapıların yeniden çalıştırılması.
**Not:** Bu doküman yalnızca kanıt kaydıdır; yeni ürün özelliği veya P3 kapsamı içermez.

## 1. Ortam hazırlığı (repoya dokunmadan)

- Docker CLI mevcuttu ancak daemon kapalıydı (`com.docker.service: Stopped`, Docker API erişilemez).
- `Docker Desktop.exe` başlatıldı; daemon `29.4.0` olarak doğrulandı.
- `docker compose up -d postgres redis` ile mevcut compose tanımındaki servisler ayağa kaldırıldı.
  - `vardiya-postgres`: `postgres:15-alpine`, **healthy**, `localhost:5432`
  - `vardiya-redis`: `redis:7-alpine`, **healthy**, `localhost:6379`
- `Test-NetConnection`: PostgreSQL 5432 = **True**, Redis 6379 = **True**.
- `.env`, `docker-compose*.yml`, secret'ler, migration'lar ve `package.json` **değiştirilmedi**.

## 2. Database-backed doğrulama

| Kapı | Sonuç |
|---|---|
| `npx prisma migrate status` (salt okunur) | 32 migration bulundu, **"Database schema is up to date!"** |
| `device-off.spec.ts` (önce DB'siz 10 FAIL) | **10/10 PASS** |
| Backend tam birim suite | **1285/1285 PASS** (önce 1275/1285; 10 DB hatası kalktı) |
| Backend DB e2e (`npm run test:e2e`) | **10 dosya, 85/85 PASS** |
| Backend build (`nest build`) | PASS |
| Frontend build (`ng build`) | PASS |
| Frontend birim testleri | **157/157 PASS** |
| Backend / frontend typecheck | PASS |
| Frontend lint | 0 error / 397 warning |
| Backend lint | **4071 error / 8988 warning**, `maxErrors: 4075` → **PASS** (baseline güncellenmedi) |

E2E fixture'ları idempotent `ensure*` çağrıları kullanıyor; yıkıcı seed/reset çalıştırılmadı.

## 3. Gerçek Redis doğrulaması (P2-09)

Geçici doğrulama betiği repo dışında çalıştırıldı:
`C:\Users\Hasan\AppData\Local\Temp\opencode\redis-real-check.ts` (gerçek `ioredis`, fake/mock yok).

Doğrulanan akışlar:

1. `PING` → `PONG`
2. `create()` → `QUEUED`, `organizationId` kayıt altında
3. Aynı org + schedule + type için ikinci `create()` → `ConflictException` (atomik `SET NX` dedupe)
4. Farklı org aynı schedule için kabul edildi (tenant ayrımı)
5. `start → progress(42) → complete` gerçek Redis'te kalıcı
6. Terminal durumda dedupe anahtarı serbest bırakıldı
7. `getByScheduleId` org bazlı filtreli, cross-org sızıntı yok
8. Kayıt TTL'si `86400s` (doğru key: `vardiya:queue:schedule-job:<scope>:<jobId>`)

**Sonuç: 8/8 PASS.** In-memory fallback kullanılmadı; fail-closed davranış korundu.

## 4. Performans regresyonu ve düzeltme (eşik değiştirilmeden)

DB erişimi sağlandıktan sonra tam suite'te yeni bir regresyon görüldü:
`5b3-performance-failure.spec.ts` → 200 personel benchmark **4283ms**, eşik **3000ms**.

Teşhis:
- İzole koşu 12/12 PASS → paralel yük marjı daraltıyordu.
- Faz ölçümü: hard-constraint ~1.6–1.9s, soft ~60ms.
- Kök neden: `greedy-strategy.ts` her slot için 440 atamalık `AssignmentCollection`'ı sıfırdan yeniden kuruyordu (~194 bin `Assignment.create()` çağrısı, O(n²)). Batch F gerçek roster'ı scoring katmanına taşıyınca görünür oldu.
- İkincil maliyet: `FairnessEngine` her personel için tüm koleksiyonu filtreliyordu.

Düzeltme (davranış ve eşik aynı):
- `domain/optimization/greedy-strategy.ts`: koleksiyon bir kez materialize ediliyor; doğrulanan atama kendi validasyonu süresince koleksiyondan çıkarılıp `finally` ile geri ekleniyor (self-exclusion birebir korundu; P2-18 gece vardiyası görünürlüğü korundu).
- `domain/models/fairness-engine.ts`: tek geçişli `personnelId → Assignment[]` indeksi.

Ölçüm (3 koşu): hard fazı **~1.6–1.9s → ~0.75–0.83s**, toplam **~2.0–2.3s → ~1.4–1.5s**.
Kanıt: `5b3 + 5b2 + fairness + batch-F + p2-11` birlikte **47/47 PASS**; tam backend suite **1285/1285 PASS**; eşik 3000ms değiştirilmedi.

## 5. Tarayıcı e2e

- İlk tam koşu **43/44**: `livesync` ilk testinde `.live-page` 10s içinde bulunamadı; diğer 3 livesync testi geçti.
- İzole `livesync.spec.ts`: **4/4 PASS** → başlangıç race'i olduğu doğrulandı.
- Tam paket tekrarı: **44/44 PASS** (3.1 dk). Test, eşik veya bekleme süresi değiştirilmedi.
- Üretilen `e2e/playwright-report/index.html` Batch E yedeğindeki durumuna geri yüklendi; kaynak kapsamına girmedi.

## 6. Kapsam bütünlüğü

Batch E öncesi yedek manifest'i ile son durum karşılaştırması (`final-manifest-diff.py`):

- Değişen: **20** dosya (P0/P1/P2 A–F kapsamı + 2 performans dosyası)
- Yeni: **4** dosya (2 regresyon spec'i + 2 Batch E/F raporu; bu rapor hariç tutuldu)
- Silinen: **0**
- Yasaklı yol eşleşmesi: **0** (migration/schema/seed/.env/secret/eslint-baseline/.git/docker/Dockerfile/package)
- Repo hâlâ `.git` içermiyor; commit/push/history/gitleaks doğrulaması yapılamadı.

## 7. Sonuç

P0/P1/P2 Batch A–F için yerel ortamda tüm otomatik kapılar geçti ve DB/Redis doğrulaması kapatıldı. Buna rağmen **go-live değerlendirmesi production için NOT READY** kalıyor:

1. Değişiklikler commit/push edilmedi (repo'da `.git` yok).
2. Production/staging DB, Redis ve worker dağıtımı doğrulanmadı; yalnızca yerel Docker compose kanıtı var.
3. P3 ayrı onay gerektiriyor ve başlatılmadı.

Bir sonraki adım için iki seçenek: (a) P3 için açık onay verilmesi, veya (b) mevcut değişikliklerin versiyon kontrolüne alınıp staging doğrulamasına geçilmesi.
