# Release Workspace Integrity Report

- Tarih: 2026-10-02
- Release candidate: `7c9eb76`
- Kanonik repo (dokunulmadı): `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`
- Doğrulama workspace'i (non-OneDrive): `C:\dev\vardiyasystem`
- Doğrulama modeli: candidate üzerine yeni bir çalışma tree, tüm release gate'leri çalıştırıldı; **push / GHCR / Helm / kubectl yapılmadı (STOP)**.

## Özet (Verdict)

| Boyut                                         | Sonuç                                                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Byte bütünlüğü (tree SHA)                     | PASS — `e3e5859...` eşit, 1302/1302 dosya                                                                                                         |
| Secret / artifact sızıntısı                   | PASS — 0                                                                                                                                          |
| Filesystem determinizm (OneDrive karşıtı)     | PASS — stash 2.7s / pop 0.8s; hook'lu gerçek commit + `reset --soft` → HEAD `7c9eb76`, status temiz                                               |
| preflight:test                                | PASS — 32/32                                                                                                                                      |
| preflight `--ci`                              | PASS — **18/18**                                                                                                                                  |
| actionlint (4 workflow)                       | PASS — exit 0                                                                                                                                     |
| commitlint (örnek mesaj)                      | PASS — exit 0                                                                                                                                     |
| Frontend typecheck                            | PASS — exit 0                                                                                                                                     |
| Backend production typecheck                  | PASS — 0 hata kaynak kodu (14 hata yalnızca `__tests__/fixtures`)                                                                                 |
| Backend prisma generate/validate/migrate/seed | PASS                                                                                                                                              |
| Backend docker build                          | PASS — exit 0 (~173 MB image)                                                                                                                     |
| Kustomize (`k8s` + `infra/sealed-secrets`)    | PASS — render exit 0                                                                                                                              |
| Helm template prod + staging + kubeconform    | PASS — 44 doc, 41 valid, 0 invalid, 3 skipped (her ikisi)                                                                                         |
| `scripts/release-dry-run.sh --ci`             | PASS — exit 0                                                                                                                                     |
| Backend unit (vitest)                         | **RED** — 45 dosya, 41 geçen; 553/557 test geçer; 4 kök-nedenli + 1 orphan suite                                                                  |
| Backend E2E (vitest e2e)                      | **RED/kısıtlı** — local ortamda 8/8 dosya `hookTimeout(30s)` (ortam yavaşlığı; CI tarihsel 85/85 iddiası `7c9eb76` üzerinde yeniden doğrulanmadı) |
| Frontend vitest (configured set)              | **RED** — 8 dosyadan 7 FAIL (TestBed/HttpTestingController `environment:'node'` altında DI kırılıyor)                                             |
| audit-ci `--critical` (backend + frontend)    | **RED** — GHSA-23hp-3jrh-7fpw (transitive `tar`) ve GHSA-67c8-pqhq-4rmx                                                                           |
| Blob satır sonları (EOL)                      | PASS — byte-level ölçüm: blob'lar LF (3 dosyada 0 CRLF)                                                                                           |
| `npm ci` (frontend)                           | **UYARI** — yalnızca `--legacy-peer-deps` ile çalışıyor; CI adımları düz `npm ci` kullanıyor                                                      |
| `.gitattributes`                              | **UYARI (hardening)** — yok; EOL normalize için author makinesindeki `core.autocrlf=true`'ye güveniliyor                                          |

**Sonuç:** `7c9eb76` doğrulama/sağlamlık katmanlarında temiz, ancak **release gate'leri RED**.
Candidate bu hâliyle yayınlanamaz; bulgular aşağıda kategorize edilmiş ve next-phase fix listesi verilmiştir.

## Yöntem

1. Kanonik repo `7c9eb76`'dan `C:\dev\vardiyasystem`'e (non-OneDrive) clone/checkout, `git diff` ile birebir doğrulama.
2. Analiz/kantitatif ölçümler: `docs/phase-rc` altındaki önceki faz raporlarının iddialarıyla karşılaştırma.
3. Her gate repo kökündeki script'ler üzerinden (root scripts / CI komutları kullanılarak) çalıştırıldı.
4. Bu fazda candidate dosyalarına müdahale YOK; tüm kırmızılar bulgu olarak kaydedildi.

## Geçen Gate'ler (kanıt özeti)

- Tree SHA bütünlüğü: workspace ile kanonik repo `git rev-parse HEAD^{tree}` = `e3e5859...` (1302/1302).
- Determinizm: `git stash push` 2.7s / `git stash pop` 0.8s (exit 0). Husky hook'larıyla (lint-staged + commitlint) gerçek commit başarılı; ardından `reset --soft HEAD~1` → HEAD yine `7c9eb76`, `git status` temiz. OneDrive hang kök nedeni doğrulandı.
- `npm run preflight:test` → fail 0, cancelled 0, skipped 0 (32 test).
- `node scripts/release-preflight.mjs --ci` → **18/18 checks passed, Preflight clean** (p4-04 raporundaki "17/17" artık 18 modele sahip).
- `actionlint` (ci, deploy, pr-validation, security-scan) → çıktısız, exit 0.
- `chore:` örnek mesajı commitlint → exit 0.
- `npm run typecheck` (frontend) → exit 0.
- Backend tsc: production `src` 0 hata; 14 hata tümü test dosyalarında (aşağıya).
- prisma: generate OK, validate "schema is valid 🚀", `migrate deploy` OK (vardiya-rc-postgres:55432), seed OK (admin@hospital.com / technician@hospital.com).
- Docker: engine 29.4.0; `vardiya-rc-postgres` (postgres:15-alpine:55432), `vardiya-rc-redis` (redis:7-alpine:56379) up; pg_ready=True.
- `docker build -f backend/Dockerfile` → exit 0, image boyu ~173,328,627 bytes.
- `kubectl kustomize k8s` → exit 0, 35 manifest; `infra/sealed-secrets` kustomization mevcut.
- `helm template` (prod: `values/production.yaml`, staging: `values/staging.yaml`, `--kube-version 1.31`) → 44 resource; kubeconform `-strict -ignore-missing-schemas`: Valid 41, Invalid 0, Errors 0, Skipped 3.
- `bash scripts/release-dry-run.sh --ci` → exit 0 (dahili: compose prod+dev config, :latest kontrolü, kustomize, helm prod+staging, image parity).
- Not: standalone `docker compose -f docker-compose.prod.yml config` interpolasyon için `BACKEND_IMAGE/FRONTEND_IMAGE/FRONTEND_URL` ve secrets/ gerektiriyor; bu doğrulama dry-run `--ci` içinde gerçekleşti.

## KIRMIZI Gate'ler — Kanıtlar ve Kök Nedenler

### 1. Backend unit test (vitest) — 4 kök nedenli hata + 1 orphan suite

Ölçüm: LF worktree'te `npx vitest run --config ./vitest.config.ts` → **41/45 dosya, 553/557 test geçer**.

- `swap-requests.service.spec.ts` "approve": mock'ta `toAssignmentId`/`targetPersonnelId` yok → hiçbir dal çalışmıyor; service `findUnique` sonucunu (PENDING) döndürüyor. **Stale test/mock** — service'in iki-dallı transaction davranışı doğru.
- `analytics.service.spec.ts` `getDeviceUtilization` ×2: `Cannot read properties of undefined (reading 'findMany')` — mockPrisma'da **`holiday` modeli eksik** (service holiday lookup eklemiş, spec güncellenmemiş).
- `security-closure-4.1.spec.ts` SEC-002: kaynak literal `'validate(payload: { sub:'` bekleniyor; gerçek imza çok satırlı `async validate(payload: {`; davranış doğru (`payload.sub` kullanımı). **Brittle literal-source test**.
- `schedules/schedules/__tests__/schedules.service.spec.ts`: **Failed Suite** — `Cannot find module '../../prisma.service'`. `backend/src/modules/schedules/schedules/**` (~60 dosyalık DDD duplicate) hiçbir yerden import edilmiyor (orphan), yalnızca kendi spec'i kırıyor.

### 2. Backend typecheck — 14 hata, tümü test/fixture'da

`__tests__/fixtures` içinde TS2353 `deviceOffDates` ∉ `SchedulingProblem` (5b2-optimizer, 5b3-performance-failure, 5b3-quality-gates, 5b4-preseeding, fixtures/scenarios) + TS2554 "Expected 7 arguments, but got 8" (`constraint-engine.spec.ts`). **Production kaynak derleniyor; drift yalnızca test senaryolarında.**

### 3. Frontend vitest (configured set) — 8 dosyadan 7 FAIL

`frontend/vitest.config.ts` `environment:'node'`; Angular spec'leri `TestBed` + `HttpClientTestingModule` + `HttpTestingController` kullanıyor → DI kırılıyor:

- `Cannot read properties of undefined (reading 'verify')` (HttpTestingController)
- `Cannot read properties of null (reading 'ngModule')` (TestBed derlenemiyor)
  Yalnızca `assignment-errors` (saf logic) geçiyor. CI frontend koşusu `ng test` (Karma) olduğundan bu vitest include config'i, kendi içindeki Angular spec'leriyle tutarsız. **NEXT PHASE:** jsdom + Angular testing setup sağlanmalı veya Angular spec'leri vitest include'undan çıkarılmalı.

### 4. Backend E2E — local'de ortam-kısıtlı

- İlk koşu `ENCRYPTION_MASTER_KEY` eksikliğiyle bootstrap'te kırıldı (64-hex key) → sonraki koşuda 8/8 dosya `hookTimeout(30s)`; her `beforeAll` `app.init()`'i bu makinede aşıyor.
- Kanıt: auth.e2e-spec tek dosya koşusunda `{"level":"info","message":"metrics_registered",...}` loglandı (app boot gerçekleşiyor). WSL2-Docker postgres gecikmesi (`slow_query_detected` ~100–220ms/sorgu) init'i dakikalara çıkarıyor; vitest fork'ları yerel harness tarafından da kesiliyor.
- **CI Linux tarafı kesinleştirici:** tarihsel "85/85" iddiası `7c9eb76` için yeniden koşulmadı. NEXT PHASE: CI üzerinde doğrulama + (gerekirse) runbook'a `--hookTimeout` / ortam bekletme notu.

### 5. audit-ci `--critical` — RED (backend ve frontend)

- backend: `bcrypt → @mapbox/node-pre-gyp → tar` üzerinden **GHSA-23hp-3jrh-7fpw** (critical, transitive).
- frontend: **GHSA-23hp-3jrh-7fpw** (`tar`) + **GHSA-67c8-pqhq-4rmx**.
- Bu, CI'daki `audit-ci --critical` adımları (p4-01'de `|| true` kaldırılmıştı) için fail-closed anlamına gelir. NEXT PHASE: `tar` override/upgrade (bcrypt güncellemesi veya npm overrides) + audit'i yeşile çekme.

### 6. Satır sonları (EOL) — PASSLAR; ölçüm hatası düzeltmesi

- Byte-level doğrulama (`git cat-file blob ... > dosya` + `\r\n` sayımı): `backend/src/app.module.ts` (8176 B, 194 LF, 0 CRLF), `security-closure-4.1.spec.ts` (15455 B, 410 LF, 0 CRLF), `frontend/vitest.config.ts` (151 B, 8 LF, 0 CRLF). **Commit'li blob'lar LF-normalized.**
- Bu fazın başında raporlanan "blob'lar CRLF" notu ölçüm hatasıydı (ön kontrol tekniği byte'ları karıştırmıştı); kanunî ölçüm üzerine DÜZELTİLDİ.
- Faz başında görülen "1174 modified" durumu: workspace klonu, global `core.autocrlf=true` altında LF→CRLF checkout yapmış; local `core.autocrlf=false`'e çekilince CRLF worktree ↔ LF blob farkı 1174 dosyada `M` görünmüştü. Manuel LF konvansiyonu ile temizlenmişti; `git reset --hard` sonrası worktree == blob (LF), status temiz. **Blob'larda ve GNU/Linux CI checkout'unda bir sorun yok.**
- Hardening önerisi (bloker değil): repo'ya `.gitattributes` (`* text=auto eol=lf`) ekleyerek EOL politikası makine ayarlarından bağımsız garantilenmeli; mevcut durumda normalize, commit eden makinedeki `core.autocrlf`'e bağlı.

### 7. Frontend `npm ci` (UYARI — CI blocker riski)

- `npm ci --legacy-peer-deps` ile 685 paket kuruldu; düz `npm ci` başarısız: `typescript ~5.9.2` (5.9.3) ↔ `@typescript-eslint/eslint-plugin@8.31.0` peer `<5.9.0`; lockfile legacy mode ile üretilmiş.
- `pr-validation.yml`/`deploy.yml` düz `npm ci --prefix frontend` kullanıyor → CI'da kırılma riski. NEXT PHASE: lockfile'ı `npm ci` ile uyumlu üretmek (devDependency'leri eskitmek/upgrade) veya CI adımlarına flag eklemek.

### 8. Baseline uyumsuzlukları (rapor)

- p4-04 "unit 1172 / e2e 85 / frontend vitest 153" değerleri repo ile örtüşmüyor: tracked 45 backend spec / 557 unit; 8 e2e dosyası; 8 vitest dosyası (~153). CI koşulmadıkça gerçek yeşil sayı bilinmiyor.

## Next-Phase Fix Listesi (öneri)

1. **EOL hardening (bloker değil):** `.gitattributes` (`* text=auto eol=lf`) ekle; blob'lar zaten LF olduğundan `renormalize` gerekmiyor, yalnızca politika tüm ortamlarda garantilenir.
2. **Frontend npm ci:** lockfile'ı CI-uyumlu hâle getir (typescript/eslint uyumu) — CI'da düz `npm ci` testi.
3. **Audit:** `tar` transitive güvenlik açığını override/upgrade ile kapat; audit-ci `--critical` yeşile.
4. **Stale testler/mocklar:** swap-requests (mock'a `toAssignmentId`/`targetPersonnelId`), analytics (mockPrisma'ya `holiday`), security-closure-4.1 (imzalı/literal-olmayan assert).
5. **Orphan DDD duplicate:** `schedules/schedules/**` temizliği (gerekmiyorsa silme PR'ı).
6. **Typecheck fixture drift:** `deviceOffDates` ve 8-argım constraint-engine tiplerini `SchedulingProblem`/gerçek imzayla hizala.
7. **Frontend vitest config:** jsdom + Angular test setup veya Angular spec'lerini include'un dışına al; CI `ng test` ile çakışmayı çöz.
8. **E2E:** CI üzerinde `7c9eb76` için tam koşu; hook timeout/ortam hazırlık notu runbook'a.
9. **Baseline:** CI çıktısını bu rapora bağla (gerçek sayılar), tahmini 1172/85/153 iddialarından vazgeç.

## STOP Durumu

Tüm doğrulamalar tamamlandı. Yayın dışı hiçbir adım atılmadı. Çalışma tree `git reset --hard` ile blob'larla (LF) eşitlendi ve bu raporun kendisi dışında hiçbir dosya değişmedi (bkz. `git status`/`git log` doğrulaması).
