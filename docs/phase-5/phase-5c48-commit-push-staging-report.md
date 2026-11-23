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
2. **Onay bekliyor (coverage):** 80% eşiğine ulaşmak için test/kapsam çalışması (eşik düşürülmeyecek).
3. **Erişim bekliyor:** staging/production kubecontext + env; ardından DB/Redis/worker/API/smoke doğrulaması.
4. **Onay bekliyor:** P3-01 (`scoring-model.ts` GATE 5 pin’i) hâlâ PARTIAL.
5. **Onay bekliyor:** eski klon arşivleme/silme (`C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem` — `M LICENSE` ve `?? bin/gh.exe` korunacak).
6. **Onay bekliyor:** 7 untracked junk dosyasının silinmesi.

**GO-LIVE DEĞERLENDİRMESİ: NOT READY** — CI tamamen yeşil olmadan (2 FAIL açık) ve gerçek staging/production DB, Redis ve worker doğrulaması yapılmadan bu karar değiştirilmeyecek.

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
