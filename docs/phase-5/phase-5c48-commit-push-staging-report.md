# Phase 5c48 — Commit / Push / PR / CI Kapanış Raporu

**Tarih:** 2026-11-22 / 2026-11-23 (audit flake düzeltmesi)
**Kapsam:** Batch I (I-A / I-B / I-C / I-D) canonical remediation ağacının commit/push/PR süreci, CI follow-up düzeltmeleri, staging doğrulama durumu ve kalan blocker’lar.
**Karar:** Commit, push, PR ve tüm fonksiyonel CI kapıları tamamlandı; gece koşularındaki audit flake’i de giderildi. Security Scan ve advisory Coverage hâlâ FAIL; gerçek staging/production doğrulaması da yapılmadığı için **GO-LIVE: NOT READY**.

---

## 1. Commit / Push / PR kanıtları (nihai durum)

| Öğe | Değer |
|---|---|
| Branch | `remediation/phase-5-20261122` |
| Son fonksiyonel HEAD (c57) | `8f783c84af3c3bf0f4a044e49f5a210d87c1dbeb` |
| Push | Tüm follow-up commit’leri `git push origin remediation/phase-5-20261122` → exit 0 |
| Upstream | `origin/remediation/phase-5-20261122` |
| `origin/main` (değişmedi) | `ef1277f6c61c765129ec1a35f09194d4d1b89613` |
| PR | https://github.com/hhasanagir/vardiyasystem/pull/75 |
| PR durumu | `open`, `mergeable: true`, `mergeable_state: blocked` (kalan 2 FAIL check) |
| PR içeriği | 10 remediation commit’i + docs/e2e follow-up commit’leri, **1070 changed file** |
| Strateji | Kullanıcı onayı: `Remote dosyalarını koru` — 40 remote-özgü dosya HEAD’den geri yüklendi, 22 çakışan dosyada kanonik sürüm kazandı. Doğrudan `main` push/force-push yok. |

Commit dışında kalan 7 debug artifact’i untracked olarak korundu (ayrı onay olmadan silinmeyecek):
`$null`, `api`, `backend/probe-err.txt`, `dump.rdb`, `query`, `real-check-b5a6ec/onWheel.txt`, `server_log.txt`.

### 1.1 Commit zinciri (c48 → c57)

| # | SHA | Konu | Kapsam |
|---|---|---|---|
| c48 | `e949aef` | `feat(remediation): apply Phase 5 P0-P3 canonical remediation` | Ana remediation ağacı |
| c48 | `702d008` | `fix(remediation): commit gitignored schedules coverage source modules` | `.gitignore:39` nedeniyle commit’e girmeyen 3 kaynak dosya (`git add -f`) |
| c49 | `72b5803` | `fix(ci): restore remote RC-hardened PR validation workflow` | `.github/workflows/pr-validation.yml` remote `f4fcd44` blob’u birebir |
| c50 | `2f9a686` | `fix(backend): restore migration drift npm script` | `backend/package.json` içinde `check:migration-drift` |
| c51 | `e90923b` | `fix(e2e): isolate throttler buckets per app in test-helpers` | XFF izolasyonu (random IP) |
| c52 | `f5eb28b` | `fix(e2e): make X-Forwarded-For unique across vitest spec files` | XFF benzersizliği |
| c53 | `5d42d54` | `fix(seed): run personnel seed with the standard seed script` | `seed` script’i iki seed dosyasını çalıştırıyor |
| c54 | `2a3b907` | `fix(ci): restore pre-commit typecheck gate files and spec project reference` | `scripts/lint-staged-typecheck*.mjs` + `frontend/tsconfig.json` spec referansı |
| c55 | `cfb6f43` | `fix(seed): set organizationId on seeded personnel rows` | `seed.ts` / `seed-personnel.ts` tenant alanı |
| c56 | `439daaa` | `fix(ci): stage throwaway backend/.env in release dry run CI mode` | `scripts/release-dry-run.sh` CI-only geçici env bloğu |
| rapor | `649833b` | `docs(phase5): close out commit/push/PR and CI remediation report` | Kapanış raporu güncellemesi (docs-only) |
| c57 | `8f783c8` | `test(e2e): scope audit assertion to the rapid-change flag` | Gece koşularındaki OFF_HOURS + RAPID_CHANGES flag çakışması |

Her grup için ayrı kaynak yedeği/MANIFEST ve ayrı git-dir yedeği alındı:
- Son kaynak yedeği: `vardiyasystem-c57-audit-flake-backup-20261123` (1790 dosya + MANIFEST)
- Son git-dir yedeği: `vardiya-system-git-c57-audit-flake-backup-20261123`
- Önceki prefix’ler: `precommit`, `c48-sourcefix`, `c49-workflow`, `c50-script`, `c51-xff`, `c52-xff`, `c53-seed`, `c54-scripts`, `c55-seed-org`, `c56-release-dryrun`, `report-closeout`.

---

## 2. Yerel kapılar (nihai, tüm düzeltmeler sonrası)

| Kapı | Sonuç |
|---|---|
| Backend typecheck | PASS (0 hata) |
| Frontend typecheck | PASS (0 hata) |
| Backend tam suite | 121 dosya / **1298/1298** PASS |
| Frontend birim testleri | **162/162** PASS |
| Backend lint | **4074 error / baseline 4075** — PASS, re-baseline yapılmadı |
| Frontend lint | 0 error / 332 warning — PASS |
| Backend build | PASS |
| Frontend build | PASS |
| DB e2e (Redis’li) | **11 dosya / 93/93** PASS — skip yok |
| Tarayıcı e2e (`TZ=UTC`, hem 20:xx hem 05:xx UTC) | **44/44** PASS |
| `node --test scripts/lint-staged-typecheck.test.mjs` | **14/14** PASS |
| `node --test scripts/release-preflight.test.mjs` | **32/32** PASS |
| `bash scripts/release-dry-run.sh --ci` | exit 0 — tüm katmanlar render edildi, `.env` hash’leri değişmedi |
| k6 smoke / baseline comparator | exit 0, 869 istek, checks 869/869, p95 108 ms |

> **Audit flake’i (c57):** 05:18 UTC’de `TZ=UTC` ile izole audit testi `Expected 1 / Received 2` vererek CI’yı tekrarladı. Sebep: OFF_HOURS detector’ı (22:00–06:00) ile RAPID_CHANGES aynı kullanıcı için iki flag üretiyor. Locator rapid-change mesajına sabitlendi; **4 iddianın tamamı, eşik ve skip ayarları değişmedi**. Sonrasında izole 1/1 ve tüm suite 05:28 UTC’de **44/44 PASS**. Daha önce 20:xx UTC’de de 44/44 PASS’ti; düzeltme gündüz davranışını değiştirmiyor.

### 2.1 Shadow DB — seed tenant doğrulaması (c55)

Temiz DB’ye 33 migration SQL’i uygulanıp `npm run seed` çalıştırıldı (CI’daki migrate → seed sırası):

| Kontrol | Sonuç |
|---|---|
| Personel sayısı / org’lu / null org | 30 / **30** / 0 |
| `HOSPITAL-001` personeli | 30 |
| Supervisor görünür roster | **30** (önce CI’da 1) |

---

## 3. Yerel production-like doğrulama (staging değil)

| Kontrol | Sonuç |
|---|---|
| `docker exec vardiya-redis redis-cli ping` | `PONG` |
| `docker exec vardiya-postgres pg_isready -U vardiya` | `/var/run/postgresql:5432 - accepting connections` |
| `npx prisma migrate status` | `33 migrations found`, `Database schema is up to date!` |
| `GET /api/v1/health/ready` (yerel API) | **HTTP 200** — `database:ok, redis:ok, queue:ok, memory:ok, endpoints:ok` |

Bu kanıtlar yalnızca yerel Docker stack’ini kapsar; staging/production dağıtımını doğrulamaz.

---

## 4. GitHub Actions — CI geçmişi ve nihai sonuç

### 4.1 Koşu geçmişi

| Run ID | Tetikleyen commit | Sonuç özeti |
|---|---|---|
| `45057744912` | `e949aef` | 3 SUCCESS / 3 SKIPPED / 8 FAILURE (3 kaynak dosyası eksik) |
| `45058371956` | `702d008` | coverage dosyaları eklendi; kalan FAIL’ler |
| `45059558398` | `72b5803` | workflow geri yüklendi |
| `45060030076` | `2f9a686` | migration drift script’i |
| `45061279008` | `e90923b` | XFF throttler izolasyonu |
| `45063846170` | `f5eb28b` | XFF benzersizliği |
| `45064741429` | `5d42d54` | seed script kapsamı |
| `45068216920` | `cfb6f43` | Browser Acceptance + Docker Compose PASS; Manifest Render FAIL |
| `45069418455` | `439daaa` | 13 SUCCESS / 2 FAILURE / 0 SKIPPED |
| `45115794020` | `649833b` (docs-only) | 12 SUCCESS / 3 FAILURE — **Browser Acceptance gece flake’i** (05:15 UTC, `Expected 1 / Received 2`) |
| **`45118345763`** | **`8f783c8`** | **13 SUCCESS / 2 FAILURE / 0 SKIPPED** — Browser Acceptance 05:xx UTC’de de PASS |

### 4.2 Son fonksiyonel doğrulama koşusu `45118345763` — 15 check

> `649833b` ve bu rapor commit’i docs-only olduğundan aynı check setini yeniden tetikler; fonksiyonel kod `8f783c8` ile sabittir.

| Check | Sonuç |
|---|---|
| Lint & Type Check (backend) | SUCCESS |
| Lint & Type Check (frontend) | SUCCESS |
| Unit Tests (backend) | SUCCESS |
| Unit Tests (frontend) | SUCCESS |
| Security Invariant Tests | SUCCESS |
| Backend E2E | SUCCESS |
| Build Check (backend) | SUCCESS |
| Build Check (frontend) | SUCCESS |
| Docker Build Validation (backend) | SUCCESS |
| Docker Build Validation (frontend) | SUCCESS |
| Docker Compose Validation | SUCCESS |
| Browser Acceptance | SUCCESS |
| Manifest Render (Kustomize + Helm) | SUCCESS |
| Security Scan | **FAILURE** |
| Coverage Report (advisory) | **FAILURE** |

**Tüm fonksiyonel kapılar yeşil.** PR `mergeable_state: blocked` yalnızca yukarıdaki 2 FAIL yüzünden.

### 4.3 Çözülen kök nedenler (follow-up commit’leri)

| Kök neden | Etkilenen check’ler | Çözüm |
|---|---|---|
| `.gitignore:39 coverage/` 3 kaynak dosyasını yutuyor (20 TS hatası, 48 failed suite, +323 lint error) | 7 check | `git add -f` (c48/702d008) |
| Workflow remote `RC-hardened` sürümünden düşmüş | zincir | `f4fcd44` birebir geri yükleme (c49) |
| `check:migration-drift` script satırı eksik | zincir | remote satırı geri eklendi (c50) |
| XFF sabit counter → vitest modül reload’unda throttler çakışması | Backend E2E | random per-app IP (c51/c52) |
| `seed` yalnızca `seed.ts` çalıştırıyordu; personel seed’i boş | Browser Acceptance | iki seed dosyası (c53) |
| `scripts/lint-staged-typecheck*.mjs` eksik + `tsconfig.spec.json` referansı düşmüş | Docker Compose Validation, Manifest Render (SKIP) | remote blob’ları birebir (c54) |
| Seed personellerinde `organizationId` yok; v18 backfill seed’den önce çalışıyor → supervisor 1 kişi görüyor | Browser Acceptance | seed’lerde org alanı (c55) |
| `release-dry-run.sh` CI modunda geçici `backend/.env` üretmiyor → compose config FAIL | Manifest Render | remote 3 satırlık blok (c56) |
| 05:xx UTC koşusunda OFF_HOURS + RAPID_CHANGES aynı kullanıcı için 2 flag → `toHaveCount(1)` FAIL | Browser Acceptance | locator rapid-change mesajına sabitlendi; 4 iddia korundu (c57) |

---

## 5. Kalan FAIL’ler — ayrı onay gerektirir

### 5.1 Security Scan

`npx --yes audit-ci@6 --critical --report-type summary` → `exit code 1`.
Frontend lockfile: **4 critical / 27 high / 32 moderate / 4 low** (toplam 67 advisory; 773 dependency). Backend audit: **0 critical / 17 high** → PASS.

Kritik yollar:
- `GHSA-rvm3-566m-v7fv` → `@capacitor/android`
- `GHSA-rvm3-566m-v7fv` → `@capacitor/ios`
- `GHSA-67c8-pqhq-4rmx` → `@angular/build > piscina`
- `GHSA-jqcg-44mw-7w3h` → `proxy-addr`

**Kullanıcı kararı: “Şimdilik dokunma.”** package/lockfile/dependency değişikliği yapılmadı, yapılmayacak. Bu FAIL açık kalacak.

### 5.2 Coverage Report (advisory)

`npm run test:coverage` → 121/121 test dosyası PASS, fakat global eşik karşılanmadı:

| Metrik | Değer | Eşik |
|---|---|---|
| Lines | 55.77% | 80% |
| Functions | 48.74% | 80% |
| Statements | 53.87% | 80% |
| Branches | 45.23% | 80% |

`ERROR: Coverage for lines (55.77%) does not meet global threshold (80%)` (ve diğer 3 metrik).

**Eşik 80%’den düşürülmeyecek.** Test skip’i, eşik/severity değişikliği veya re-baseline yok. Kapsam artırımı ayrı bir iş olarak ele alınmalı.

---

## 6. Staging / production boşluğu

- `kubectl config get-contexts` boş; `kubectl cluster-info` → `localhost:8080 connection refused`.
- `STAG*`, `PROD*`, `DEPLOY*`, `DATABASE_URL`, `REDIS_URL` ortam değişkenleri tanımlı değil.
- Docker context yalnızca `desktop-linux` (yerel).
- Gerçek staging DB migrate status, Redis health, worker/job queue, API readiness ve smoke/e2e doğrulaması **yapılamadı**.
- Yerel readiness kanıtı (bölüm 3) staging kanıtı değildir.

---

## 7. Açık onaylar ve sonraki adımlar

1. **Onay bekliyor (security):** 4 critical advisory için strateji — kullanıcı “Şimdilik dokunma” dedi; mevcut karar korunuyor.
2. **Planlandı (coverage):** 80% eşiğine ulaşmak için hedefli test planı çıkarıldı (bkz. §7.2); test eklemeden önce ayrı onay alınacak, eşik düşürülmeyecek.
3. **Erişim bekliyor:** kullanıcı kubeconfig sağlayacak; ardından staging DB/Redis/worker/API/smoke doğrulaması yapılacak.
4. **KAPANDI (P3-01):** `scoring-model.ts` kanonik ağırlık invariant’larının test oracle’i olarak sınıflandırıldı (bkz. §7.1). Kod/test değişikliği yok.
5. **Onay bekliyor:** eski klon arşivleme/silme (`C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem` — `M LICENSE` ve `?? bin/gh.exe` korunacak).
6. **Onay bekliyor:** 7 untracked junk dosyasının silinmesi.

### 7.1 P3-01 karar kaydı — kanonik referans / invariant oracle (2026-11-23)

**Karar:** P3-01 “güvenli ölü kod temizliği” olarak bırakılmadı; kalan dosya kanonik skorlama invariant’larının çalıştırılabilir referansı (**test oracle’i**) olarak sınıflandırıldı ve kalem kapatıldı.

**Kod taraması (2026-11-23):**

| c40 raporundaki dosya | Mevcut durum |
|---|---|
| `schedules/domain/models/seeded-random.ts` | yok |
| `schedules/domain/models/generation.ts` | yok |
| `schedules/domain/services/scheduling-logger.ts` | yok |
| `schedules/domain/models/scoring-model.ts` | mevcut — barrel export + 2 spec import’u |

**Oracle kanıtları:**

- `backend/src/modules/schedules/domain/optimization/canonical-scoring.config.ts:32-37` tek kaynak: `fairness=0.35`, `workload=0.25`, `fatigue=0.25`, `coverage=0.15` (toplam `1.00`).
- `backend/src/modules/schedules/domain/models/scoring-model.ts:46-53` `DEFAULT_CONFIGURATION` değerleri doğrudan bu sabitlerden türetiyor; `preference → fatigue` eşlemesi, `version: '2.0.0'` ve `penaltyMultiplier: 2.0` (`PENALTY_MULTIPLIER` ile aynı) sabit.
- `backend/src/modules/schedules/__tests__/5b4-preseeding.spec.ts:166-188` GATE 5: ağırlıklar, sürüm ve toplam=1.0 için **3 test**; `conflict-validation.spec.ts:5` ikinci spec importer’ı.
- `docs/phase-5/phase-5b4-score-invariants.md` Invariant 1 (ScoreAggregator = ScoringModel hizası) ve Invariant 5 (ağırlık toplamı) bu davranışı zaten tanımlıyor.

**Kapsam dışı / yapılmadı:** üretim koduna wire etme (davranış + mimari karar), test silme veya zayıflatma, eşik/severity değişikliği, migration/DB/secret değişikliği. `docs/phase-5/phase-5c40-p3-readonly-audit-report.md` tarihsel anlık görüntü olarak OPEN satırını korur; bu bölüm sonraki karar kaydıdır.

### 7.2 Coverage 80% — hedefli test planı (read-only, 2026-11-23)

**Kaynak veri:** CI run `45069418455` / `45119405759` coverage tablosu. Global: statements 53.87%, branches 45.23%, functions 48.74%, lines 55.77%. `backend/vitest.config.ts:21-26` eşikleri **80%** — sabit kalacak. Bu adımda **test eklenmedi, skip/eşik/severity değiştirilmedi**; aşağıda somut senaryolar planlandı.

**Öncelik sırası:** düşük kapsam × yüksek dosya ağırlığı → (1) events, notifications, push-subscriptions; (2) websocket, asset-management, rbac; (3) shifts ve kalan servisler. İlk dalga tek başına 80% garanti etmez; her dalga sonunda ölçüm yapılacak.

#### Dalga 1 — en zayıf modüller

| Modül (lines %) | Hedef dosyalar | Yeni test senaryoları (davranış odaklı) | Mevcut testler / mock notu |
|---|---|---|---|
| `src/events` **15.62%** | `event-bus.service.ts`, `event-store.service.ts`, `event-monitoring.service.ts`, `dead-letter-queue.service.ts`, `event-replay.service.ts`, `handlers/events.consumer.ts` | `publish`: `recordPublished` → `store` → `eventsQueue.add(event.eventName, event, {attempts:3, backoff exponential 1000ms, removeOnComplete:false, removeOnFail:false})` sırası; `publishBatch` her olay için bir `publish`. Store: `events:{Type}:{id}` / `event:{id}` (TTL 604800) / `events:all` key'leri, `replayByType` filtresi, timestamp sıralaması, Redis hatasında swallow. Consumer: her `EVENT_NAMES` dalı → `recordProcessed`, hata attempt<2 ise rethrow, `attemptsMade>=2` ise DLQ + rethrow yok. DLQ: retry/flush/count. Monitoring: ms→s `observe`. | Yalnız `domain-event.interface.spec.ts` var. `FakeRedis` deseni `schedules/__tests__/p2-batch-e-infrastructure.spec.ts:19-77`; `getQueueToken('events'/'dead-letter')` fake Queue. Gerçek BullMQ/Redis ve gerçek `prom-client` registry kullanılmaz. |
| `src/modules/notifications` **13.75%** | `notifications.service.ts`, `notification-orchestrator.service.ts`, `channel-dispatcher.service.ts`, `notification-event.service.ts` | `create` varsayılan `PENDING`/`NORMAL`; `getUserNotifications` filtre `where` + `{data,total,limit,offset}`; `markAllAsRead` aynı `readAt` değerini recipient+delivery'a yazar; `markAsRead`/`delete`/`markClicked` başka kullanıcıya dokunmaz. Orchestrator: recipient×channel `createDelivery`, `NOTIFICATION_SENT` event payload'u, `sendToAllUsers` sadece aktif kullanıcılar, `sendEmergency` → CRITICAL + 4 kanal. Dispatcher: kanal→sender eşlemesi, tercih kapalıyken skip, `bypassPrefs`, başarısızlıkta `FAILED`+`failedAt`, bir kanalın reddi diğerini durdurmaz. | `notification-event.service.spec.ts` (personnelId→user çözümü, `addRecipients`) ve 2 route-order spec'i var; tekrar edilmez. SMTP/Firebase/VAPID/SMS gerçek çağrıları ve cron timer'lar dışlanır. |
| `src/modules/push-subscriptions` **24.07%** | `push-subscriptions.service.ts`, `push-subscriptions.controller.ts` | `subscribe`: mevcut endpoint → `update`, yoksa `create`; `unsubscribe` endpoint'li/siz `deleteMany` where; `getSubscriptions`/`getAllSubscriptions` Map gruplaması. VAPID keys var → `setVapidDetails(mailto:vardiyaos@hospital.com, pub, priv)`; yok → `sendPush` false. `sendPush`: 2 abonelikten biri 410 → stale silinir, diğer korunur, payload/TTL 86400 sabit. `broadcastPush` başarı sayısı ve 404/410 temizliği. | Mevcut spec yalnız `toBeDefined()` + `getEndpointCount()===0`; genişletilecek. `web-push`, ConfigService ve Prisma fake; **gerçek VAPID key/.env okunmaz**, gerçek push ağı çağrılmaz. |

#### Dalga 2 — orta kapsam, yüksek satır hacmi

| Modül (lines %) | Hedef dosyalar | Yeni test senaryoları | Mevcut testler / mock notu |
|---|---|---|---|
| `src/modules/websocket` **28.54%** | `schedule.gateway.ts` (`getMissedEvents`, broadcast/full-sync, cleanup, `disconnectSession`, `authorizeScheduleAccess`, `getUnitIdFromSchedule`) | `lastEventId` sonrası olaylar + boş/geçersiz id; `schedule:sync`, `personnel:update` (org zorunlu), alert/incident oda hedefleri; `vi.useFakeTimers()` ile 30 sn cleanup → `setOffline`/`lockExpired`/TTL prune; oturum iptali map dolu/boş; yetkilendirme red yolları. | `schedule.gateway.authz.spec.ts` cross-tenant/unit/role/lock senaryolarını zaten kapsıyor; tekrar edilmez. `makeClient` + 10 constructor double'ı reuse; gerçek socket.io/JWT/Redis yok, heartbeat timer'ları temizlenir. `isDuplicateEvent` çağrısız — saf satır için bile olsa üretime bağlamadan test edilmez. |
| `src/modules/asset-management` **29.48%** | `asset-management.service.ts` (`findAll` filtreleri, `getFullDetail`, `getDashboard`, `generateQR`, CRUD, `getDocuments`, `getMovements`, `getWarrantyStatus`) | 6 alanlı `OR` insensitive `contains` where; include limitleri (20/10/50/20/30); `$queryRaw`/`count`/`groupBy` çağrılarında org+unit where ve 90 günlük warranty penceresi; QR payload JSON + sha256 ilk 16 hane + `vardiya://asset/<n>?v=<hash>` + DB update; auto-number `VAR-000001`, tarih dönüşümü, sadece gönderilen alanların update'i. | `5c15-sec-c-asset-scope.spec.ts` org/unit red yollarını kapsıyor; tekrar edilmez. `$queryRaw` da mock'lanır; gerçek SQL/QR dosyası/UnitScope yok. |
| `src/modules/rbac` **33.74%** | `rbac.service.ts` (`getAvailableRoles`, `getAllPermissions`, `getRolePermissions`, `getPermissionMatrix`, permission cache, `ensureUserHasRbacRole`) | Sıralı rol/permission sorguları ve `{role,label,permissions:{name:boolean}}` matrisi; child permission inheritance (level ≤ role.level), 5 scope OR kombinasyonu, cache key/15 sn TTL/fail-closed `[]`; legacy role eşlemesi (`system_admin`→SYSTEM_ADMIN, bilinmeyen→GUEST), aktif atama varsa yazma yok; prefix'li invalidation. | `rbac-enterprise`, `5c12-ownership-hardening`, `unit-scope-*` spec'leri dominance/scope/guard yollarını kapsıyor; tekrar edilmez. Gerçek seed DB/JWT callback yok; TTL fake timer ile. |

#### Dalga 3 — kalan

| Modül (lines %) | Hedef dosyalar | Yeni test senaryoları | Mevcut testler / mock notu |
|---|---|---|---|
| `src/modules/shifts` **47.43%** | `shifts.service.ts` (`findLiveShifts` L161-248, master koruması, `create` masterCollision, `findAll` ek filtreler) | `isMaster` update/remove → `ForbiddenException` + yazma yok; user/org yok → `[]`; `published/approved` + unit/month/year where; upcoming/active/completed + progress; `ShiftType` etiketleri ve `'Personel Nöbeti'` fallback; aynı gün `date: today.toISOString().slice(0,10)`. | `shifts.service.spec.ts` create/find/update/remove happy-path'leri var; genişletilecek. `TZ` sabitlenir (UTC dateStr vs yerel `getHours()`); `endTime < startTime` gece vardiyası product kararı gerektirdiğinden test edilmez. |

#### Uygulama kapıları

1. Her dalga öncesi ayrı kaynak yedeği/MANIFEST + ayrı git-dir yedeği; dalga sonunda `npm run test:coverage --prefix backend` (mevcut 1298 test + yenileri, 0 skip), backend lint/typecheck/build, DB e2e, gerekirse tarayıcı e2e.
2. Test ekleme/commit/push için **ayrı açık onay** alınacak; eşik 80% değiştirilmeyecek, test zayıflatma/skip/severity değişikliği yok.
3. Security Scan advisory’leri “Şimdilik dokunma” kararıyla açık kalır; coverage 80%’e ulaşmadan ve staging doğrulaması yapılmadan **GO-LIVE: NOT READY** korunur.

### 7.3 Dalga 1 uygulama sonucu (2026-11-23)

**Kapsam:** yalnızca yeni test dosyaları — 12 spec (6 events, 4 notifications, 2 push-subscriptions). Üretim kodu, migration/schema, yapılandırma, eşik, skip veya severity değişmedi; gerçek Redis/BullMQ/SMTP/Firebase/VAPID ağı ve secret kullanılmadı.

| Alan | Yeni spec'ler | Hedeflenen davranış |
|---|---|---|
| `src/events` | `event-bus`, `event-store`, `dead-letter-queue`, `event-replay`, `event-monitoring`, `events.consumer` | publish sırası/options, Redis key layout + TTL, DLQ retry/flush, replay yeniden yayın, metrik ms→s, consumer routing/retry/DLQ |
| `src/modules/notifications` | `notifications.service`, `notification-orchestrator.service`, `channel-dispatcher.service`, `notification-event.mappings` | filtre/ tenant-scoped mutation, recipient×channel fan-out + `NOTIFICATION_SENT`, kanal yönlendirme/tercih/başarısızlık izolasyonu, event alias eşlemeleri |
| `src/modules/push-subscriptions` | `push-subscriptions.service.behaviour`, `push-subscriptions.controller` | VAPID init, subscribe/unsubscribe, Map gruplama, 410/404 temizliği, payload/TTL, controller DTO varsayılanları |

**Kapılar:**

- Hedeflenen 3 dizin: **17 test dosyası / 101 test PASS**, 0 skip.
- Tam backend suite: **133 dosya / 1380 test PASS** (önce 1298; +82 net yeni test), 0 skip.
- Coverage (aynı 80% eşik, değişiklik yok): lines **55.77 → 59.31%**, statements **53.87 → 57.31%**, functions **48.74 → 52.97%**, branches **45.23 → 46.87%**. Modül bazında: `src/events` lines/functions **100% / 100%**, push-subscriptions **98.43% / 100%**, notifications **46.28% / 45.45%**.
- `npm run test:coverage` hâlâ advisory FAIL (4 metrik 80% altında) — beklenen; eşik düşürülmedi.
- Backend lint gate **4074 error ≤ 4075 baseline** (1 daha az; re-baseline yok), `tsc --noEmit` PASS, `nest build` PASS.
- Yedek: `vardiyasystem-coverage-wave1-backup-20261123` + ayrı git-dir yedeği (`MANIFEST.txt` ile).

Commit/push bu adımda yapılmadı; ayrı açık onay bekleniyor. Security advisory’leri “Şimdilik dokunma” kararıyla açık; staging kubeconfig gelmedi.

**GO-LIVE DEĞERLENDİRMESİ: NOT READY** — CI tamamen yeşil olmadan (2 FAIL açık) ve gerçek staging/production DB, Redis ve worker doğrulaması yapılmadan bu karar değiştirilmeyecek.

### 7.4 Dalga 2 uygulama sonucu (2026-11-23)

**Kapsam:** yalnızca 3 yeni test dosyası / 50 yeni test. Üretim kodu, migration/schema, yapılandırma, 80% eşik, skip veya severity değişmedi. Gerçek socket.io/JWT/Redis/SQL/QR dosyası/seed kullanılmadı; tüm bağımlılıklar fake. `schedule.gateway.authz.spec.ts`, `5c15-sec-c-asset-scope.spec.ts` ve RBAC dominance/scope spec’lerinde bulunan senaryolar tekrar edilmedi.

| Alan | Yeni spec | Hedeflenen davranış |
|---|---|---|
| `src/modules/websocket` | `schedule.gateway.behaviour.spec.ts` (18 test) | `lastEventId` sonrası olaylar/geçersiz id, `schedule:sync` payload’u, forceSync/unsubscribe, personel/alert/incident/handover oda hedefleri, `vi.useFakeTimers()` ile 30 sn cleanup (offline/lockExpired/TTL prune), oturum iptali map durumları, yetkilendirme giriş noktasının boş kimlik/id/schedule ve global-admin yolları |
| `src/modules/asset-management` | `asset-management.service.behaviour.spec.ts` (18 test) | 6 alanlı insensitive `OR` araması + filtreler, include limitleri (20/10/50/20/30), dashboard count/groupBy ve 90 günlük pencere, QR payload/sha256/`vardiya://asset` + DB update, auto-number `VAR-000006`, tarih dönüşümleri, sadece gönderilen alanların update’i, doküman/hareket sıralaması, `$queryRaw` org/unit scope |
| `src/modules/rbac` | `rbac.service.behaviour.spec.ts` (14 test) | sıralı rol/permission okumaları, permission matrisi, 5 scope OR grubu, child inheritance (level ≤ role.level), cache key/15 sn TTL/fail-closed `[]`, legacy rol eşlemesi (`system_admin`→SYSTEM_ADMIN, bilinmeyen→GUEST), aktif atamada yazma yok, prefix invalidation |

**Kapılar:**

- Yeni 3 spec: **50/50 PASS**, 0 skip. Hedef 3 dizin: **14 dosya / 245 test PASS**, 0 skip.
- Tam backend suite: **136 dosya / 1430 test PASS** (Dalga 1 sonrası 1380; +50 net yeni test), 0 skip.
- Coverage (80% eşik sabit, değişiklik yok): lines **59.31 → 62.12%**, statements **57.31 → 60.12%**, functions **52.97 → 54.73%**, branches **46.87 → 49.59%**. Dosya bazında lines: `schedule.gateway.ts` **67.46%**, `asset-management.service.ts` **93.66%**, `rbac.service.ts` **84.93%**. `npm run test:coverage` advisory FAIL (4 metrik 80% altında) — beklenen; eşik düşürülmedi.
- Backend lint gate **4074 error ≤ 4075 baseline** (re-baseline yok), `tsc --noEmit` PASS, `nest build` PASS.
- İlk tam coverage koşusunda 2 geçici başarısızlık görüldü: yeni asset spec’inde `Date.now()` kaynaklı 1 ms fark (fake timer ile deterministikleştirildi) ve mevcut `5b3-performance-failure.spec.ts` performans benchmark’ında coverage yükü altında 3097 ms < 3000 ms iddiası. Benchmark tek başına 12/12 PASS, ikinci tam koşuda 1430/1430 PASS; **eşik/test değiştirilmedi**.
- Yedek: `vardiyasystem-coverage-wave2-backup-20261123` + ayrı git-dir yedeği `vardiya-system-git-coverage-wave2-backup-20261123` (`MANIFEST.txt` ile, 2129 dosya).

Commit/push bu adımda yapılmadı; ayrı açık onay bekleniyor. Security advisory’leri “Şimdilik dokunma” kararıyla açık; staging kubeconfig gelmedi.

**GO-LIVE DEĞERLENDİRMESİ: NOT READY** — CI tamamen yeşil olmadan (Security Scan + Coverage advisory FAIL) ve gerçek staging/production DB, Redis ve worker doğrulaması yapılmadan bu karar değiştirilmeyecek.

---

## 8. Kanıt dosyaları

- `C:\Users\Hasan\AppData\Local\Temp\opencode\run9-failed-logs.txt` — run `45069418455` Security/Coverage log’ları
- `C:\Users\Hasan\AppData\Local\Temp\opencode\run10-failed-logs.txt` — run `45115794020` Browser Acceptance gece flake’i log’u
- `C:\Users\Hasan\AppData\Local\Temp\opencode\run8-failed-logs.txt` — run `45068216920` Manifest Render log’u
- `C:\Users\Hasan\AppData\Local\Temp\opencode\watch-checks-auth.ps1` — token’lı check izleme (son SHA `8f783c8`)
- `C:\Users\Hasan\AppData\Local\Temp\opencode\shadow-seed-check.sql`, `roster-scope-check.sql` — seed tenant doğrulama sorguları
- `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-c57-audit-flake-backup-20261123\MANIFEST.txt`
- `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiya-system-git-c57-audit-flake-backup-20261123`
- `docs/phase-5/phase-5c44…5c47` batch kapanış raporları
