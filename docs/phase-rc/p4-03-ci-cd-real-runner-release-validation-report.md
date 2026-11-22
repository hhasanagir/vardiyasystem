# P4.3 — CI/CD Real Runner & Release Pipeline Validation Raporu

**Durum:** PARTIAL — Gerçek GitHub Actions runner üzerinde uçtan uca release pipeline'ı kanıtlanamadı; tüm yerel-koşulabilir gate'ler deterministik olarak doğrulandı, gerçek runner'a/registry'ye dokunan adımlar açıkça `CI-ONLY` / `ENVIRONMENT-BLOCKED` işaretleniyor.
**Tarih:** 30 Eylül 2026
**Kapsam:** `.github/workflows` envanteri ve sözleşme analizi; clean-install / preflight / compose / kustomize / helm / failure-gate / secret-leak kontrollerinin yerel replikasyonu; GitHub repo durumunun tespiti; GHCR + Actions + deploy zincirinin yetki nedeniyle bloke durumu. Kanonik ağaç: `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (git repo değil). Referans git ağacı: `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem` (remote `https://github.com/hhasanagir/vardiyasystem.git`, `main`).

---

## 1. Yönetici Özeti

- Gerçek CI runner çalıştırması **mümkün değildir**: GitHub repo `hhasanagir/vardiyasystem` tek commit (`eb7a6db` "Initial commit") içeriyor, `.github/` **hiç tracklenmemiş** (remote'ta sıfır workflow olduğundan Actions run tetiklenemez); `gh` CLI kurulu değil; Desktop kanonik bir git repo değil.
- Kullanıcı kararı (bu oturumda alındı): **push yok; local doğrulama + PARTIAL**. Mirror/sync/push yapılmadı, hiçbir git mutasyonu uygulanmadı, hiçbir dosya değiştirilmedi (yalnızca read + çalıştırma).
- Yerelde doğrulanan tüm zincir **PASS** (aşağıdaki bölümler): preflight 18/18 (env-dahil) / 17/17 (CI modu), preflight test suite 32/32 (negatif vakalar dahil), release-dry-run (compose+kustomize+helm+image parity) tek seferde tamamlandı, clean-install 3/3 workspace, helm prod+staging 44'er manifest hatasız.
- AmA **iki deterministik gate başarısızlığı** tespit edildi; gerçek bir runner'da pipeline bugün **yeşil olamaz**:
  - **F1:** `pr-validation.yml`'deki `npx prisma validate` adımı eksik env var yüzünden kırmızı olur. Şema `directUrl = env("DATABASE_DIRECT_URL")` (schema.prisma:10) tanımlıyor; workflow env'lerinde `DATABASE_DIRECT_URL` **0 referans** (yalnız `DATABASE_URL`/`PRISMA_STUB_URL` stub'ı var). Yerel replikasyon: stub ile `prisma validate` → `error: Environment variable not found: DATABASE_DIRECT_URL.` (exit 1); `DATABASE_DIRECT_URL` eklendiğinde → `schema is valid` (exit 0). (`prisma generate` bu env'i gerektirmez — deploy tarafı etkilenmez; PR gate'i etkilenir.)
  - **F2:** `audit-ci@6 --critical` gate'i (deploy + pr-validation `security-scan` job'ları) mevcut ağaçta kırmızı olur: doğrulanmış temiz `npm ci` sonrası `npm audit` → backend ve frontend'de **1'er critical** (transitive `node-tar` / `tar <=7.5.20`), `--audit-level=critical` exit 1. Yerel e2e/unit/build kanıtları bu gate'i kapsamaz (P4.2'de audit hiç çalıştırılmamıştı).
- Verdict: **PARTIAL.** Real runner, GHCR push, deploy-release zinciri, gitleaks, manifest-verify, production-stack integration testleri `ENVIRONMENT-BLOCKED`; yukarıdaki F1/F2 kalıcı blocör olarak raporlanır (kod değişikliği yapılmadı çünkü kanonik source-of-truth değişikliği anca kullanıcı onayıyla olur).

## 2. Kısıtlar ve Yönetim Kararı

Uygulanan kurallar (P4.3 talimatı + oturum kararı):
- Kanonik = Desktop; mirror kullanılmadı; git tree divergence'ında source of truth değiştirilmedi; destructive git işlemi yapılmadı; feature creep yok (yeni feature/role/permission/model yok; hiçbir app/pipe dosyası düzenlenmedi).
- PASS yalnızca kanıtla; kanıtlanamayan adım `CI-ONLY` veya `ENVIRONMENT-BLOCKED` yazıldı, "local simüle PASS" yazılmadı.
- Gerçek runner'a koşabilmek için Desktop kanonik içeriğin repo'ya commit+push edilmesi gerektiği kullanıcıya soruldu; seçim: **Push yok; local doğrulama + PARTIAL.**

## 3. Workflow Envanteri ve Statik Sözleşme

| Yön | Dosya | SHA256 (Desktop) | Git-tree SHA256 | Aynı? |
|---|---|---|---|---|
| Desktop + git | `.github/workflows/deploy.yml` | 1189602FD…81 | 1189602FD…81 | Evet |
| Desktop + git | `.github/workflows/pr-validation.yml` | 42BD3BC40E…6A | 42BD3BC40E…6A | Evet |
| Desktop + git | `.github/workflows/security-scan.yml` | E229D11377…9 | E229D11377…9 | Evet |
| sadece git | `.github/workflows/ci.yml` | — | (untracked) | Desktop'ta yok |

- Desktop'ta 3 workflow + `.github/dependabot.yml`; git ağacında ek olarak `ci.yml` var (legacy backward-compat: `name: ci`, push main/develop + workflow_dispatch, sadece preflight suite + `SKIP_ENVIRONMENT_CHECKS=1` preflight çalıştırır). **Not:** git çalışma ağacında `.github/` untracked — workflow'lar remote'a hiç gitmemiş.
- Statik sözleşme: tüm job'lar `ubuntu-24.04` (23 adet); `NODE_VERSION: '20'` (± `setup-node@v4`), tümü npm-cache li; Windows/`C:\`/OneDrive/`pwsh`/`cmd`/WSL komutu **yok** (regex taraması temiz); `bash scripts/...` kullanımı 3 yerde; hardcoded dev yolu yok; env'ler placeholder (ci-deploy-secret / ci-validation-secret) — gerçek credential yok.
- Toolchain notu: yerel araçlar CI'dan farklıdır — node v22.14.0 (CI: 20), npm 9.9.4, Prisma CLI 5.22.0, docker 29.4.0, kubectl v1.34.1, helm v3.17.1 (local scratch). P4.3 için toolchain-diff'a dayalı sonuç sınırlaması: clean-install ve manifest render'ları sürüm-toleranslıdır; preflight `node-version` check'i (.nvmrc/20 ↔ workflow NODE_VERSION/20 ↔ Dockerfile `FROM node:20`) **17/17'de PASS**.

## 4. Clean-Install Gate'leri (LOCAL-VALIDATED)

Temiz lockfile-only yeniden üretim, `%TEMP%\opencode\p43\scratch` altında (git-bash/node ile):
- `npm ci` — backend: 1103 paket (exit 0); frontend: 668 paket (exit 0); e2e: 3 paket (exit 0). Stale node_modules'a bağımlılık yok.
- `npx prisma generate` (scratch backend, yalnız `DATABASE_URL` stub): exit 0, `node_modules/.prisma/client/index.js` üretildi.
- `npx prisma validate`: yalnız stub ile **FAIL** (`DATABASE_DIRECT_URL` eksik) → F1; iki URL de verilince PASS (`The schema ... is valid`).

## 5. Baseline Korunması (lokalde bugün yeniden kanıtlanan)

- Release preflight: **18/18** ham yerel (env-dahil, `secret-contract` dahil) — 17/17 CI modu (`SKIP_ENVIRONMENT_CHECKS=1` → `secret-contract` atlanır; 18-1=17). Talimattaki "18/18 (veya güncel sayı)" maddesi böylece teyit/güncellendi.
- Preflight test suite: **32/32** subtest (negatif vakalar: pin-dışı workflow, `:latest` fallback, eksik service account, apply edilebilir secret template, commit'li secret, kopuk health probe, job'suz workflow, kayıp script, `.env` track, key material, undocumented secret file, bozuk lint baseline, kayıp rollback exe, PG-major sapması, compose/helm pgbouncer drift, eksik sealed key, unpinned workflow image, resız restore yolu, crash-safety vb.).
- `bash scripts/release-dry-run.sh --ci` (git-bash, helm scratch bin) — tüm zincir tek seferde: preflight suite → preflight → `docker compose config` (prod+dev) → `:latest` yok → `kubectl kustomize k8s` (**35 kind**) → `infra/sealed-secrets` render → `helm template` prod+staging → image parity → `Release dry run COMPLETE`; exit 0. (Script `--ci` modunda geçici `.env`/`secrets/` kurar ve mevcut durumu geri yükler — Desktop'ta kalıcı değişiklik yok; raw çalıştırma öncesi `env_file: .env` mevcut olmadığından `.env`'in önce CI-moddan sağlandı.)
- P4.2 raporundan bugünün kanıtı (dünkü/today P4.2 oturumu, entendre değil): backend unit 1172/1172, backend E2E 85/85, browser acceptance 44/44, frontend vitest 153/153, backend+frontend typecheck/build PASS, lint 0 err / 391 warning (commit'li baseline ile), backend Docker build 138s + `PRISMA_CLIENT_LOAD_OK`, frontend Docker build 97.5s (~22.9 MB, HEALTHCHECK `127.0.0.1` → healthy). — Kaynak: `docs/phase-rc/p4-02-residual-debt-closure-report.md`.
- Docker gate'lerinin bugünkü sisteme etkisi yok; docker build'ler her çalıştırmada yeniden ispatlanabilir (P4.2 same-day kayıt).

## 6. Test İzolasyonu (STATIC-VERIFIED)

- Her test job'u kendi `services:` PostgreSQL 15 + Redis 7'yi kurar; her job `prisma migrate deploy` + `seed` çalıştırır; ortak dev DB / paylaşılan volume / dev token yok; local `.env`'e bağımlılık yok (CI placeholder env `PRISMA_STUB_URL` + jeton placeholder'ları üretir).
- Browser-acceptance: `playwright.config.ts` backend (dist) + Angular dev server'ı kendi başlatır (`CI: 'true'`), artık çalışan sunucu reuse etmez. Kalan risk: lokaldeki e2e `playwright.config.ts` live/dev DB + seeded veri kullanır (P4.2 browser düzeltmeleri bu DB üzerinde 44/44 doğrulandı) — CI'da job-DB üzerinde sayı aynı olmayabilir; bu fark raporların §Residüel kısmında izlenir.

## 7. Docker Release Pipeline

- `deploy.yml`: `npm ci` → prisma generate → lint → typecheck → build (matrix) → `release-dry-run` (manifest gate) → unit-tests → security-scan → `docker-build-push` (buildx + `metadata-action`, etiketler: `type=sha format=long` (bare), `type=ref event=branch`, `type=semver`, `type=raw value=latest enable=main`) + **manifest-verify** (image tam etikete 200 dönene kadar fail-closed) → `integration-test` (production stack: compose `up`, /health/ready bekleme, nginx üzerinden `/`, `/health`, `/api/v1/health/live`, `/realtime` non-SPA, pg_dump+`scripts/restore-check.sh` round trip, `if: failure()` diagnostics, `always()` teardown) → `create-release` (`v<version>-<sha>`, mikepenz changelog). Hepsi statik okundu; docker build'lerin yerel eşdeğerleri P4.2'de PASS.
- Gerçek Image build+push+integration-test runner'da çalıştırılamadı → **ENVIRONMENT-BLOCKED** (bkz. §8).

## 8. GHCR Push (ENVIRONMENT-BLOCKED)

- `docker/login-action@v3` + `packages: write` (GITHUB_TOKEN masked) + push + manifest-verify, yalnız GitHub'da çalışabilir. Bu ortamda: repo'da 0 workflow (push yok), `packages: write` yetkisi yok, Actions çalışmıyor. Kanıt yok → **PASS değil; ENVIRONMENT-BLOCKED** işaretlenir. Registry'de image'ın varlığı da doğrulanamadı.

## 9. İmmutabilite

- Statik: deploy `metadata-action` etiketleri commit-SHA tabanlı (bare full SHA) + semver + main-latest (açık); production compose `${BACKEND_IMAGE:?}` / `${FRONTEND_IMAGE:?}` fallback'siz (preflight `compose-prod-images` bunu zorlar); `docker-compose.prod.yml`'de `:latest` yok; `k8s/` manifestlerinde pinned tag'ler zorunlu (`k8s-images`); `release-dry-run` image-parity ghost prefix + `:latest` reddi. Rollback dokümanıyla uyumlu (bkz. §14).
- Hâlâ doğrulanamayan: canlı digest/tag ilişkisi (GHCR tarafı) → **ENVIRONMENT-BLOCKED**. Silent retag'i engelleyen manifest-verify adımı statik doğrulandı, çalıştırılamadı (CI-ONLY).

## 10. Helm (LOCAL-VALIDATED)

- `helm template vardiya infra/helm/vardiya-platform -f values/{production,staging}.yaml` (helm v3.17.1): her ikisi de 0 parse hatası, prod 44 manifest / staging 44 manifest.
- Prod render içeriği: `Ingressx1, Servicex12, Deploymentx9, StatefulSetx2, Jobx1, CronJobx1, ConfigMapx6, PVCx5, HPAx2, PDBx2, ServiceMonitorx2, Certificatex1`. App image'ları pinned (`backend:v1.0.0`, `frontend:v1.0.0`) — `:latest` yok. App workload'ları `runAsUser/fsGroup: 100` (yardiya non-root); monitoring tarafı 65534. Migration: `kind: Job` + `- name: migrate` + `helm.sh/hook: pre-install,pre-upgrade` (hook-weight -5) — release-önce migration sırası statik kanıtlandı. İnfra image'ları (postgres 15-alpine, redis 7-alpine, pgbouncer bitnamilegacy pinned, prom/grafana/loki/tempo pinned) `infra-image-parity` + `postgres-version-aligned` preflight check'leriyle uyumlu.

## 11. Kustomize (LOCAL-VALIDATED)

- `kubectl kustomize k8s` (kubectl v1.34.1) → 35 kind render; `kubectl kustomize infra/sealed-secrets` render OK (dry-run içinde).

## 12. Release Preflight

- Ham yerel: **18/18 PASS** (çıktıda her check listelendi; `secret-contract` dahil "Compose secret files are documented"). CI modu (SKIP): 17/17.
- Suite: 32/32 (bkz. §5). F2 hariç gate'lerin kendisi geçerli ve negatif rezüe sahibi.

## 13. Deployment Sırası ve Readiness Gate'leri

- Statik zincir: image (build+push) → migration → backend readiness → frontend/ingress.
- Migration: compose tarafı backend `command` (`docker-compose.prod.yml:138-149` → `npx prisma migrate deploy && …`) ve helm tarafı `Job migrate` (pre-install/pre-upgrade hook) — her ikisi backend imajını kullanır, yani imajla aynı şemayı taşır.
- Readiness: `integration-test` `/api/v1/health/ready` (DB+Redis'i zorlar) 60×10s bekle, başarısızsa `ps`/`logs --tail=200` + exit 1 (success beyan edilmez). Nginx ön kapısı `/`, `/health`, `/api/v1/health/live`, `/realtime` non-SPA; restore round-trip. Tümü statik; production-stack üzerinde bu adımların canlı kanıtı **CI-ONLY/ENVIRONMENT-BLOCKED**.

## 14. Rollback Uyumu

- `docs/devops/rollback.md` ↔ CI artefaktları çapraz kontrolü:
  - Tam SHA immutable tag referansları (`ghcr.io/anomalyco/vardiyasystem/{backend,frontend}:<sha>`) = deploy metadata `type=sha,prefix=,format=long` + bare full SHA. ✓
  - `rollback.sh` mutable target reddi; compose `${BACKEND_IMAGE:?}`/`${FRONTEND_IMAGE:?}` (IMAGE_TAG okunmaz) = preflight `compose-prod-images`. ✓
  - `:latest`'e retag yasağı; `scripts/restore-check.sh`, `scripts/restore-db.ps1`, `backups/vardiyasystem_*.sql.gz`, `startup-verify.sh` referansları tümü gerçek dosyalar. ✓
  - Helm rollback (`helm rollback vardiya`) chart adıyla tutarlı. ✓
  - `rollback-script` preflight check (17/18 içinde PASS) var olan exe'yi zorunlu kılıyor. ✓
  - Not: `rollback.md`'de referanslı `backups/` dizini repo'da komitli değil (doğru davranış); yalnızca deployment zamanı üretilir.

## 15. Failure Testleri (fail-closed kanıtları, lokalde üretildi — gerçek cluster'a dokunulmadı)

- **F-P1 (helm başarısız render):** `helm template … -f values/does-not-exist.yaml` → `Error: open … does-not-exist.yaml … bulunamıyor` exit 1. ✓
- **F-P2 (`:latest` pin gate triplenir):** scratch'te `.env` ile `BACKEND_IMAGE/FRONTEND_IMAGE=…:latest`; `docker compose -f docker-compose.prod.yml config` çıktısında 2 satır `^\s*image: .*:latest\s*$` eşleşti (gate'teki grep bunu yakalayıp exit 1 verir). ✓ Kompose prod mevcut AWS değil — `.env`'i yoksa `config` hata verir (grid kapalı "env_file yok" modu).
- **F-P3 (eksik secret/env):** `prisma validate` stub env ile derdi DATABASE_DIRECT_URL → exit 1 (F1). Preflight suite'inde secret/commit negatif vakaları 32/32 içinde zaten kırmızıya dönüyor.
- **F-P4 (bozuk YAML):** helm missing-values probe (F-P1) YAML-invalide eşdeğer fail; compose missing `.env` fail-closed.
- **F-P5 (npm ci):** lockfile-diff/eksik durumda `npm ci` doğal olarak nonzero döner (semântik doğrulandı; kırık lockfile senaryosu kasıtlı olarak çalıştırılmadı; yeni kurulum başarısı §4'te kanıtlandı).
- Production cluster üzerinde deneysel failure üretilmedi (talimat gereği).

## 16. Güvenlik ve Sızıntı Kontrolleri

- `tracked secret material` gate'i (pr-validation'ın grep kuralı) git repo üzerinde replike edildi: kural1 `.env` 0 hit, kural2 pem/key 0 hit, kural3 `secrets/` runtime 0 hit → **temiz**.
- Gitleaks-analog regex taraması (Desktop, node_modules/dist/git hariç, git-bash grep `BEGIN PRIVATE KEY|AKIA|ghp_|xox|sk-live`): yalnız benign `BEGIN` (SQL transaction, iCal `BEGIN:VCALENDAR`) + 1 bilinçli test fixture (`release-preflight.test.mjs` içinde `certs/server.key` sahte key). Gerçek credential yok. → `gitleaks/gitleaks-action@v2` + `trufflehog` gerçek çalıştırma **CI-ONLY** (GITHUB_TOKEN ister).
- Workflow'lar yalnız `secrets.GITHUB_TOKEN`, placeholder `ci-*-secret` ve `openssl rand` (runtime üretim) kullanır; loglara secret dump yok; artifactlar yalnız playwright-report (7 gün). `integration-test` throwaway secret üretir (repo değerlerini kullanmaz).
- **F2 (audit critical)** bu bölümün bulgusu: bulgu §1'de.

## 17. CI-ONLY / ENVIRONMENT-BLOCKED Maddeler

| Adım | Durum | Neden |
|---|---|---|
| `deploy.yml` `docker-build-push` (GHCR push + manifest-verify) | ENVIRONMENT-BLOCKED | `packages: write` + Actions yok; repo 0 workflow |
| `deploy.yml` `integration-test` (production stack) | ENVIRONMENT-BLOCKED | GHCR imajları ve canlı registry gerekli |
| `deploy.yml` `create-release` | ENVIRONMENT-BLOCKED | `contents: write` + real run gerekli |
| `pr-validation.yml` tüm job'lar (gerçek run) | ENVIRONMENT-BLOCKED | Actions tetiklenemez (workflow commit'li değil) |
| gitleaks / trufflehog / codeql | CI-ONLY | runner+GITHUB_TOKEN gerektirir; statik/analog kanıt verildi |
| `security-scan.yml` (weekly) | CI-ONLY | schedule/workflow_dispatch; real run yok |
| Gizli sızıntının canlı "log" denetimi | ENVIRONMENT-BLOCKED | gerçek run logu yok |
| `ci.yml` (git ağacı fazlası) | kayıt | backward-compat preflight-only; Desktop'ta yok (hash farkı §3) |

## 18. Deterministik Gate Başarısızlıkları (Gerçek Runner Bugün Yeşil Olamaz)

- **F1 — `prisma validate` env eksikliği** (`pr-validation.yml` unit-tests + coverage + backend-e2e + browser-acceptance için `npx prisma validate`/`generate`; schema:`directUrl = env("DATABASE_DIRECT_URL")`). Workflow env'lerinde `DATABASE_DIRECT_URL` yok → gerçek runner'da `error: Environment variable not found: DATABASE_DIRECT_URL`, exit 1. Yerel doğrulama §4'te. Etki: **PR gate'i kırmızı**.
- **F2 — audit-ci critical** (transitive `tar`/node-tar `<=7.5.20`; backend 1 + frontend 1 critical). `audit-ci@6 --critical` (deploy + pr-validation) ve weekly `--high` gate'leri kırmızı. Etki: **deploy'nun `security-scan` job'ı + PR gate kırmızı**.
- Düzeltme, kanonik içerik değişikliği gerektirir (workflow env eklemek ve/veya lockfile override). Kullanıcı kararı gerektiğinden **uygulanmadı**; P4.3 kapsamında devam eden blocör olarak kaydedilir.

## 19. Residüeller

- Gerçek GitHub run kanıtı yok (PARTIAL kararı).
- F1, F2: düzeltilmeden release pipeline'ı gerçek ortamda yeşil olamaz.
- `docker-compose.yml` (dev) `version:` anahtarı obsolete — uyarı (prod değil; preflight yalnız prod'u denetler). Geçersiz kılınabilir, kozmetik.
- Git ağacı, kanonik Desktop'tan daha erkendir (7 P4.2-fixed dosya farklı; workflow dosyaları ise SHA aynı); `.github/` remote'a commit'li değil — ilk gerçek run'dan önce sync + commit + push + secret kurulumu (GHCR token vb.) kullanıcı eliyle yapılmalıdır.
- Browser-acceptance lokalde live/dev DB üzerinde 44/44; CI'da job-DB üzerinde birebir sayı beklentisi yapılmamıştır (izolasyon farkı).
- Local toolchain (node22/npm9) vs CI (node20/npm10) sürüm farkı: preflight `node-version` check'i geçti; yine de F2'nin sayısı advisory gizliliğine duyarlıdır (zamanla değişebilir).

## 20. Kanıt Zinciri

[30.09.2026, LOCAL/STATIC] preflight 18/18 (verbose) + 17/17 (CI modu) + suite 32/32 · release-dry-run.sh --ci exit 0 (compose prod+dev, :latest yok, kustomize 35 kind, sealed-secrets, helm prod+staging 44+44, image parity) · scratch npm ci backend/frontend/e2e exit 0 · scratch prisma generate exit 0 · prisma validate: stub FAIL / double-URL PASS · helm missing-values exit 1 · :latest pin-gate trip (2 satır) · tracked-secret gate 0 hit · regex secret taraması temiz · npm audit critical (tar) backend+frontend exit 1 · helm prod render (1 Ingress, 1 Job migrate pre-install/pre-upgrade, runAsUser/fsGroup 100, backend/frontend v1.0.0) · rollback.md ↔ CI artefakt uyumu.

## 21. Verdict

**P4.3 = PARTIAL.**

- Local ölçülen tüm release-manifest gate'leri deterministik ve yeşil; preflight 18/18 (CI modu 17/17), suite 32/32, clean-install, compose, kustomize (35 kind), helm (44+44) ve rollback uyumu kanıtlandı.
- Gerçek CI runner / GHCR push / deploy-release zinciri / gitleaks canlı çalışması `CI-ONLY` veya `ENVIRONMENT-BLOCKED`; bu adımlar için PASS beyan edilmedi.
- F1 (prisma validate env) ve F2 (audit critical `tar`) ağaçta duran deterministik blockerlardır; düzeltme kanonik değişiklik + push gerektirir (kullanıcı kararı bekler).
- STOP: P4.4'e geçilmiyor; gerçek runner kanıtı olmadan COMPLETE beyan edilmiyor.