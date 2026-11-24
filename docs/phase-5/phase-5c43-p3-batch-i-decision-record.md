# Phase 5c43 — P3 Batch I Karar Dokümanı (Salt Okunur)

**Tarih:** 2026-11-22
**Durum:** Kullanıcı onayıyla hazırlandı. **Kod, migration, schema, secret, CI veya git değişikliği yapılmadı.**
**Kapsam:** P3-02, P3-06, P3-08, P3-09, P3-10, P3-11, P3-13, P3-14 (Batch G/H sonrası kalan 8 madde).
**Referanslar:** `phase-5c24` (orijinal katalog), `phase-5c40` (P3 read-only), `phase-5c41` (Batch G), `phase-5c42` (Batch H).

## 1. Karar özeti

| Madde | Konu | Migration | Risk | Önerilen karar | Uygulama |
|---|---|---|---|---|---|
| P3-02 | Event bus / event sourcing iskeleti | Yok | Yüksek (çift event yolu, boş reducer'lar) | **Sil / devre dışı bırak**; event sourcing istenirse ayrı mimari karar | I-A (code-only) |
| P3-06 | Ölü endpoint'ler | Yok | Orta (k6 SLO, API uyumluluk) | 5'i sil; `my-shifts` 1 sürüm deprecation window | I-A + I-B |
| P3-08 | Denetim taksonomisi | **Yok** (`actionType String`) | Orta (mevcut serbest string'ler) | 3 aksiyonu enum'a ekle (additive); literal'ları değiştirme | I-A (code-only) |
| P3-09 | Apply provenance | Yok (JSONB `data.metadata`) | Orta (version/snapshot tutarlılığı) | Snapshot'ı aynı transaction'da oluştur, metadata JSONB'ye yaz | I-B (code-only) |
| P3-10 | In-memory idempotency | Yok (Redis) | Orta (Redis bağımlılığı, fail-open/closed) | Redis'e taşı; org-scoped key, 300s TTL, fail-closed | I-A (code-only) |
| P3-11 | Sezgisel alarm/eşikler | Yok (mevcut veriyle); opsiyonel additive | **Yüksek (ürün politikası)** | Önce eşik politikası kararı; `CoverageEngine` tek kaynak | I-B (ürün kararı) |
| P3-13 | k6 / performans CI gate | Yok (CI) | Orta (koşu süresi, eşik yönetimi) | 5b3'e dokunma; önce scheduled smoke + baseline artifact | I-C (CI kararı) |
| P3-14 | Nested klon | Yok | **Yüksek (git + OneDrive)** | Şimdi silme; kanonik ağaç git'e girince tekrar değerlendir | **Ertele** (onay gerekir) |

**Sonuç:** 8 maddenin 5'i code-only (I-A/I-B), 1'i ürün kararı (P3-11), 1'i CI kararı (P3-13), 1'i git/OneDrive kararı (P3-14). **Hiçbiri zorunlu DB migration gerektirmiyor** — bu, önceki denetimdeki en önemli düzeltmedir.

## 2. Önceki denetimdeki düzeltmeler (doğrulandı)

1. **P3-08 migration riski yanlışlığı:** `backend/prisma/schema.prisma:725` → `actionType String`; migration geçmişinde audit action için `CREATE TYPE` yok. Enum'a aksiyon eklemek **tamamen code-only**.
2. **P3-10 yanlış önerme:** `ScheduleApplicationService` sınıfında `apply()` **yok**. `processedOps` Map yalnızca `createSchedule()` (:35) ve `rollback()` (:290) tarafından kullanılıyor. `/generate/apply` farkı bir servise (`ScheduleAutoGeneratorService.apply`) gidiyor ve idempotency kapsamı dışında.
3. **P3-14 yol düzeltmesi:** Workspace altında `Belgeler\...` yolu **yok**. Gerçek eski klon `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem` (OneDrive Belgeler) altında ve kendi `.git`'i var. Canonical Desktop ağacında `.git` yok. `phase-5c40` raporundaki "nested klon" ifadesi bu açıdan güncellenmelidir.

## 3. Madde detayları

### P3-02 — Event bus / event sourcing iskeleti

**Kanıt:** `domain/events/schedule-event-bus.ts:6-40` gerçek bir in-process bus (`Map` handler + dizi eventLog); `schedules.module.ts:16,37,53` DI kaydı var ama **hiçbir constructor'da inject edilmiyor**. `domain/aggregates/schedule.aggregate.ts:503-524` `applyEvent` boş switch (tüm case'ler `break`); `ddd/aggregate-root.base.ts:13,21` `commit()`/`loadFromHistory()` çağrısız. Tüm workspace'te çağrı noktası 0.

**Gerçek altyapı:** Cross-module event akışı `EventBusService` (Redis + BullMQ) ile çalışıyor — `events/event-bus.module.ts`, `app.module.ts:40,135`; üretim kullanımı `schedules.service.ts:199,866`, `swap-requests.service.ts:307`, `personnel.service.ts:254`, `device-incidents.service.ts:99`; consumer `events/handlers/events.consumer.ts`. Event store Redis ZSET, Prisma tablosu değil. `ScheduleGeneratedEvent` payload'u (`generatedBy/score/algorithm/seed`) de hiç instantiate edilmiyor.

**Risk:** İkinci canlı event yolu açmak audit/notification yan etkilerini çiftletir; `eventLog` sınırsız büyür; `loadFromHistory()` boş reducer'larla aggregate'i sessizce bozuk replay eder.

**Karar önerisi:** Bus'ı, DI kaydını, boş `applyEvent` switch'ini ve kullanılmayan base metotlarını kaldır (I-A). Event sourcing istenirse **ayrı mimari karar** olarak ele al: reducer'ları uygula, replay semantiğini tanımla ve mevcut Redis/BullMQ `EventBusService`'i kullan — paralel bus ekleme.

### P3-06 — Ölü endpoint'ler

**Kanıt (hepsi `schedules.controller.ts`):**

| Route | Satır | Tüketici | Karar |
|---|---|---|---|
| `GET by-unit/:unitId` | 150 | Yok (yalnız docs) | Sil |
| `GET my-shifts` | 162 | **k6: 4 senaryo** (`load-test.js:120`, `soak-test.js:47`, `spike-test.js:88,101`, `stress-test.js:47`) | Deprecation window |
| `GET :id/versions/:version` (legacy) | 360 | FE DDD kopyasını kullanıyor (`schedule-api.service.ts:173-176` → `schedules-ddd.controller.ts:400`) | Sil (rol VIEWER→SUPERVISOR asymmetry notu) |
| `GET :id/snapshots` | 387 | Yok (UnitScope yok) | Sil |
| `POST :id/duplicate` | 661 | Yok (yalnız service unit testi) | Endpoint'i sil, service testi koru |
| `POST generate/preview` | 714 | FE `schedule.service.ts:978-999` helper çağrısız | Sil + helper kaldır |

**Risk:** `my-shifts` silinirse k6 SLO trend'leri bozulur (404/401); external/mobile client bilinmez. `snapshots`/`duplicate` UnitScope'suz olduğu için silinmesi saldırı yüzeyini azaltır. FE'de canonical yol `me.controller.ts:55-66` (`/me/summary`).

**Karar önerisi:** 5 route + FE helper hemen sil (I-A). `my-shifts` için önce k6 path'lerini `/me/shifts` ailesine taşı, bir sürüm `@Deprecated()` bırak, sonra sil (I-B). API dokümanları (`docs/api/api-inventory.md`) güncellenecek.

### P3-08 — Denetim taksonomisi

**Kanıt:** `audit.constants.ts:31-45` enum'da `SCHEDULE_CREATED/GENERATED/UPDATED/SUBMITTED/APPROVED/REJECTED/PUBLISHED/ROLLED_BACK/DELETED` var; **`SCHEDULE_ARCHIVED`, `SCHEDULE_REVERTED`, `ASSIGNMENTS_APPLIED` yok** ama serbest string olarak kullanılıyor: `schedules-ddd.controller.ts:354,369`, `schedules.controller.ts:725`. `SCHEDULE_GENERATED` emit edilmiyor; `schedule_generate` entity yok. `AuditLog.actionType` = `String` (schema.prisma:725) → **migration yok**.

**Risk:** Mevcut satırlar serbest string değerler içeriyor; toplu rename raporları/dashboard'ları böler (`schedules.controller.ts:58-59` activity mapping, `audit-log.service.ts:462,528` hard-coded filtreler). FE filtre listesi `audit-center.component.ts:78-99` hard-coded.

**Karar önerisi:** 3 aksiyonu enum + label'e **additive** ekle ve 3 decorator'ı enum'a geçir; mevcut literal'ları **yeniden yazma** (I-A). `SCHEDULE_GENERATED`'ı emit et ya da bilinçli olarak kaldır — bu, P3-09 provenance ile birlikte kararlaştırılmalı.

> Not: İş hukuku / NDK yorumu içeren hiçbir audit etiketi doğrulanmış mevzuat olarak sunulmayacak; bu maddeler teknik taksonomi kapsamındadır.

### P3-09 — Apply provenance

**Kanıt:** `schedule-auto-generator.service.ts:553-731` `apply()` yalnızca assignment satırları + CAS version bump (`:714-726`) yazıyor; **snapshot oluşturmuyor**, metadata yok. DTO (`dto/generate-schedule.dto.ts:68-94`) yalnızca `scheduleId/expectedVersion/assignments`. Aspirasyonel `SnapshotMetadata` (`domain/models/version-snapshot.ts:54-63`: `generatedAt/algorithm/seed/score`) tanımlı ama **hiçbir writer metadata yazmıyor** (`schedules-workflow.service.ts:843-852`, `schedules.service.ts:2193-2201`). `ScheduleGeneratedEvent` tam istediğ alanları modelliyor ama emit edilmiyor.

**Karar önerisi (code-only, additive):** `apply()` içindeki aynı `$transaction`'da, post-CAS version ile snapshot oluştur; provenance'ı mevcut `ScheduleSnapshot.data.metadata` JSONB'sine yaz (`generatedBy` zaten `schedules.controller.ts:728`'de `req.user.id` olarak mevcut). `score/algorithm` için `scoreCandidates()` (`:951-978`) sonucunu `generate()` çıktısına taşı. Metadata **sunucu türetilmiş** olmalı, FE'den gelen DTO'ya güvenilmemeli. Snapshot version'ı `@@unique([scheduleId, version])` ve `createSnapshot()` mantığıyla tutarlı olmalı. Raporlama için index'lenmiş kolon gerekirse o zaman additive migration ayrı karar.

### P3-10 — In-memory idempotency

**Kanıt:** `schedule-application.service.ts:11-29` `processedOps` Map + 300s TTL; key'ler org-scoped **değil** (`create:${unitId}:${month}:${year}` :34-35; `rollback:${scheduleId}:${targetVersion}:${userId}` :289-291). `IDEMPOTENCY_TTL_MS` (:12) tanımlı ama :22'de hardcoded `300000` kullanılıyor. Redis zaten global (`event-bus.module.ts`), P2-09 `ScheduleJobStatusService` `REDIS_CLIENT` inject ediyor. Org-scoped key convention: `redisKey(...)` → `vardiya:<namespace>:...` (`config/redis-key-namespace.ts`), scope = `organizationId || 'global'`.

**Risk:** Multi-pod'da Mapinstance-local; create DB uniqueness ile 409, rollback Redis lock sonrası `version <= target` 400 veriyor (yani duplicate replay değil hata). Redis'e geçiş **davranış değişikliği**: yeni availability bağımlılığı ve fail-open/closed seçimi gerekir.

**Karar önerisi (I-A, code-only):** `REDIS_CLIENT` inject et; `redisKey()` ile org-scoped key, aynı 300s TTL, sonuç replay'i koru; rollback için **fail-closed** (P2-09 emsali), create için availability öncelikliyse fail-open değerlendir. `DistributedLockService`'in raw `lock:` prefix'ini idempotency için kullanma. Ölü `IDEMPOTENCY_TTL_MS` duplikasyonunu temizle.

### P3-11 — Sezgisel alarm/eşikler (ürün kararı)

**Kanıt:** `schedule-alert.service.ts:46-65` her cihaz × her gün × `day|evening|night` için ≥1 atama arıyor; `workDays`, tatil, cihaz kapalı günleri, vardiya şablonları dikkate alınmıyor. `supervisor-center.service.ts:177,320` `Device.mode`'a göre 1/2 zorunlu, `filled` unit-level roster sayısı. `insights.service.ts:86-87` `deviceCount - personnelCount`.

**Gerçek veri modeli mevcut:** `domain/coverage/coverage-engine.ts:41-128` (`workDays`, `Shifts`, tatil/off, tier eligibility); P2-13 soft-fairness gerçek roster + gerçek ay uzunluğu kullanıyor. Ancak `schema.prisma:466-528`'da per-device minimum coverage alanı yok, `coverage-engine.ts:75`'te `required = 1` hardcoded.

**Risk:** Eşikler iş politikası; değişim dashboard KPI'larını ve publish/validation hard conflict'lerini etkiler. Yanlış eşik publish engelleyebilir.

**Karar önerisi:** Önce ürün kararı: (1) tek kaynak `CoverageEngine.evaluateCoverage()`; (2) hafta sonu/tatil/off/night/tier handling; (3) herhangi bir slot için >1 kişi gerekli mi? Sonra 3 servisi tek sonuca bağla (code-only faz 1). Per-device override gereksinimi doğarsa **additive migration ayrı onayla**.

### P3-13 — k6 / performans CI gate

**Kanıt:** `k6/` 9 dosya, senaryolar load/stress/spike/soak; `k6/helpers.js:29-50` mutlak eşikler (`p95<2000`, `p99<5000`), `k6/run-all.ps1`. `.github/workflows` yalnız deploy/pr-validation/security-scan; **k6 çalıştıran job yok**; package.json'larda k6 script'i yok; baseline artifact/comparison logic yok. `5b3-performance-failure.spec.ts:45-51` sentetik 200 kişi/<3000ms benchmark'i her backend test koşusunda çalışıyor (CI: `pr-validation.yml:120-127`).

**Risk:** 5b3'ü HTTP p95 gate olarak kullanmak mevcut `p95<2000` hedefinden **daha zayıf** ve farklı ölçüm. Soak ~3s40 ve 5 kademeli load ~34 dk PR check'e uygun değil. Advisory job gerçek gate değil.

**Karar önerisi:** 5b3'e dokunma. Önce ayrı `performance.yml` (scheduled/manual) ile yalnızca kısa smoke senaryosu, ephemeral seed stack,summary JSON artifact, commited baseline + onaylı tolerans. Birkaç stabil koşudan sonra required PR gate'e yükselt. Özel Docker image gerekmez; official k6 action/container yeterli.

### P3-14 — Eski nested klon (ertele)

**Kanıt:** Workspace altında yol yok; gerçek klon `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem` → `.git` var, remote `https://github.com/hhasanagir/vardiyasystem.git`, HEAD `b672483...`, `M LICENSE` ve untracked `bin/` mevcut. 95.452 dosyanın 87.575'i `node_modules`. Hiçbir runtime kod/config bu yola referans vermiyor (23 hit yalnız doküman anlatımı).

**Risk:** Silme, `.git` refs/reflog + **commit edilmemiş `M LICENSE`** ve `bin/`'ı yok eder; OneDrive senkronizasyonu ile buluta/cihazlara yayılır; kurtarma OneDrive retention'a bağlı. Canonical Desktop ağacında `.git` olmadığı için bu klon yerel git geçmişinin tek kopyası.

**Karar önerisi:** **P3 batch kapsamında silme.** Kanonik ağaç kendi git'ine girdikten sonra, remote'un `b672483`'ü içerdiği doğrulanıp `LICENSE`/`bin/` durumu korunarak ve OneDrive sync durumu ele alınarak ayrı açık onayla arşivle/sil.

## 4. Önerilen uygulama grupları (henüz onaylanmadı)

| Grup | Maddeler | Nitelik | Ön koşul |
|---|---|---|---|
| **I-A — güvenli code-only** | P3-02, P3-08 (additive), P3-10 (Redis) | Silme + additive enum + Redis idempotency | Ayrı onay; P3-10 için fail-open/closed kararı |
| **I-B — davranış/ürün** | P3-06 (k6 migration + deprecation), P3-09 (provenance), P3-11 (eşik politikası) | Ürün/API kararı + code | Eşik ve API uyumluluk kararı |
| **I-C — CI** | P3-13 | Yeni workflow + baseline artifact | Runner/baseline sahipliği kararı |
| **I-D — git/OneDrive** | P3-14 | Arşivleme/silme | Kanonik ağaç git'e girdikten sonra ayrı onay |

Her grup için aynı kapılar korunur: yedek + MANIFEST, typecheck, lint baseline (`maxErrors: 4075`, re-baseline yok), hedef regresyon, backend full suite, frontend gate'ler, DB e2e + tarayıcı e2e. Migration/DB/secret/git değişikliği **yok**; test skip/eşik/severity zayıflatması yok; DDD kanonik yön, strictest-wins, tenant fail-closed, four-eyes, published/archived immutability korunur.

## 5. Go-live

Tüm P0/P1/P2 + P3 Batch G/H değişiklikleri hâlâ commit/push edilmedi (workspace `.git` içermiyor) ve staging/production DB/Redis/worker dağıtımı doğrulanmadı. **30 Kasım 2026 go-live değerlendirmesi NOT READY** kalıyor. Batch I uygulaması bu değerlendirmeyi tek başına değiştirmez.

> **STOP — Batch I karar dokümanı tamamlandı. Kod değişikliği yapılmadı. Uygulama için grup bazında ayrı açık onay gerekir.**
