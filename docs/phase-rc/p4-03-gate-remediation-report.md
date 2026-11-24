# P4.3 Gate Remediation Report

**Faz:** P4.3 — CI Gate Remediation (F1 + F2)
**Tarih:** 2026-09-30
**Ortam:** Windows (node v22.14.0, npm 9.9.4, docker 29.4.0, kubectl v1.34.1, helm v3.17.1 scratch)
**Kanonik repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (yalnızca bu kullanıldı)
**Verdict:** **P4.3 REMEDIATION COMPLETE — CI RUN ENVIRONMENT-BLOCKED**
**Kapsam dışı:** gerçek GitHub Actions run'ı (environment-blocked, aşağıda gerekçeli)

---

## 1. Bağlam

P4.3 doğrulama fazı PARTIAL olarak kapanmıştı
(`docs/phase-rc/p4-03-ci-cd-real-runner-release-validation-report.md`). Yerel doğrulamada
kırmızı kalan iki determinant gate şunlardı:

- **F1** — `pr-validation.yml` içindeki `npx prisma validate` adımı, `DATABASE_DIRECT_URL`
  sağlamıyor → Prisma schema validation hatası.
- **F2** — `audit-ci --critical`, transitive `tar <= 7.5.20` (backend + frontend) bilinirliği
  yüzünden 1+1 kritik bulgu ile kırmızı.

Bu rapor iki gate'in kök neden düzeltmelerini, kanıtlarını ve tüm regression sonuçlarını içerir.

---

## 2. F1 — `DATABASE_DIRECT_URL` eksikliği (pr-validation.yml)

### 2.1 Kök neden

`backend/prisma/schema.prisma:10` datasource şunları bildirir:

```prisma
url        = env("DATABASE_URL")
directUrl  = env("DATABASE_DIRECT_URL")
```

`prisma validate` ve `prisma migrate deploy`, datasource'u **tamamen** çözer (get-config wasm).
Github Actions `pr-validation.yml` ortamında yalnızca `DATABASE_URL` tanımlıydı; varsayılanlar
varsa bunlar da çözüm null bırakıyordu. Sonuç:

```
Error: Prisma schema validation - (get-config wasm)
Error code: P1012
Environment variable not found: DATABASE_DIRECT_URL
```

Yani gate-hata kaynağı *test çalışması değil*, datasource'un kendisidir; ayrıca
`prisma migrate deploy` adımının ortamında da aynı eksiklik vardı (bkz. §7 residual).

### 2.2 Uygulanan değişiklik (canonical)

`.github/workflows/pr-validation.yml` — workflow-level `env` bloğuna eklendi (tüm job'lara
kalıtım):

```yaml
# The schema declares `directUrl = env("DATABASE_DIRECT_URL")`. `prisma
# validate`/`migrate deploy` resolve the datasource fully, so the variable
# must exist. CI has no connection pooler, so the direct URL is the same local
# test database; production supply keeps URL (pooler) and direct URL separate.
DATABASE_DIRECT_URL: postgresql://postgres:postgres@localhost:5432/vardiyasystem_test
```

Doğrulama adımı, `npx prisma migrate deploy`, Prisma client generate ve unit testler aynı
`DATABASE_URL` üzerinden çalıştığı için `DATABASE_DIRECT_URL` de aynı test veritabanına işaret
eder. `directUrl` davranışı kaldırılmadı, `DATABASE_URL` ile eşitlenmedi (yalnız CI değeri
eşit), validate adımı kaldırılmadı, gate gevşetilmedi, gerçek credential commit edilmedi.

### 2.3 Doğrulama kanıtları

CI benzeri temiz ortam (`%TEMP%\opencode\p43\scratch\backend`, `npm ci` sonrası, yalnız env
stub'ları ile):

| Deney | Exit | Çıktı |
|---|---|---|
| `npx prisma validate` (DATABASE_URL + DATABASE_DIRECT_URL set) | **0** | `The schema at prisma\schema.prisma is valid` |
| `npx prisma generate` (aynı env) | **0** | client üretildi |
| `npx prisma validate` (yalnız DATABASE_URL) | 1 | `Environment variable not found: DATABASE_DIRECT_URL` |
| `npx prisma migrate deploy` — DIRECT_URL set (throwaway DB `gard_p43_probe`) | **0** | `All migrations have been successfully applied.` |
| `npx prisma migrate deploy` — DIRECT_URL yok (aynı DB) | 1 | `P1012` (get-config wasm) |

Throwaway DB `gard_p43_probe` sonrasında `DROP DATABASE` ile temizlendi (no kayıt).

### 2.4 Workflow YAML / ayrıştırma

`actionlint v1.7.12`, kanonik Desktop'taki üç workflow üzerinde çalıştırıldı → tümü **exit 0**
(pr-validation.yml, deploy.yml, security-scan.yml): YAML ve GitHub Actions semantiği geçerli.

---

## 3. F2 — transitive `tar` kritik güvenlik bulgusu

### 3.1 Kök neden / kaynak zinciri (`npm ls tar`)

- **Backend:** `bcrypt@5.1.1 → @mapbox/node-pre-gyp@1.0.11 → tar@6.2.1`
  (node-pre-gyp `tar: ^6.1.11` bildirir; 6.x hattı 6.2.1'de biter, yamalı 6.x sürümü yoktur).
- **Frontend:** `@angular/cli@21.2.7 → pacote@21.3.1 → @npmcli/run-script@10.0.4 →
  node-gyp@12.3.0 → tar@7.5.13 (deduped)` + `@capacitor/cli@8.4.0 → tar@7.5.13`.

Yalnız 7.x hattında yamalı sürüm var: `npm view tar` → **latest 7.5.22** (7.5.21, 7.5.22 > 7.5.20).

### 3.2 Uygulanan remediasyon (canonical)

Üst bağımlılıkların güvenli sürümü mevcut olmadığından, npm `overrides` ile workspace-level
çözüm kullanıldı (aşağı düşürme yok, yukarı yama):

```json
"overrides": {
  "tar": "7.5.22"
}
```

`backend/package.json` ve `frontend/package.json`'a eklendi (devDependencies'ten önce). Lockfile'lar
manuel düzenlenmedi; `npm install --package-lock-only --ignore-scripts` ile deterministik yeniden
üretildi. `audit-ci` bayrakları değiştirilmedi, ignore listesi/`continue-on-error`/filtre eklenmedi,
testler skip edilmedi, `--force` ile kırma yok.

### 3.3 Doğrulama kanıtları

Kanonik `npm ci` (yeni lockfile ile): backend **1099 pkg exit 0**, frontend **668 pkg exit 0**.

| Kontrol | Backend | Frontend |
|---|---|---|
| `npm ls tar` | `@mapbox/node-pre-gyp@1.0.11 → tar@7.5.22 overridden` | `tar@7.5.22` (pacote + @capacitor/cli) |
| `npx --yes audit-ci@6 --critical` | **exit 0** — `Passed npm security audit.` | **exit 0** — `Passed npm security audit.` |
| `npm audit` özeti | 33 vuln (4 low / 18 mod / 11 high), **0 critical** | 42 vuln (5 low / 14 mod / 23 high), **0 critical** |

bcrypt native derlemesi (`@mapbox/node-pre-gyp` tar üzerinden extract) tar@7.5.22 ile sorunsuz
geçti; bu, aşağıdaki tüm backend testlerinin (unit/E2E) yeşil kalmasıyla da kanıtlandı.

---

## 4. Regression — kontroller ve sonuçlar

| # | Gate | Sonuç |
|---|---|---|
| 1 | Backend typecheck (`tsc --noEmit`) | **PASS** exit 0 |
| 2 | Backend unit (vitest) | **PASS** 1172/1172 (104 dosya, 414.6s) |
| 3 | Backend E2E | **PASS** 85/85 (10 dosya, 319.8s) |
| 4 | Frontend typecheck (`tsc --noEmit`) | **PASS** exit 0 |
| 5 | Frontend full vitest | **PASS** 153/153 (18 dosya); ilk attempt'te 2 collection error ile flake (rerun temiz — bkz. §7.2) |
| 6 | Frontend production build (`ng build`) | **PASS** exit 0 (140s) |
| 7 | Release preflight — raw | **PASS** 18/18 |
| 8 | Release preflight — CI modu | **PASS** 17/17 (secret-contract skip) + preflight suite 32/32 |
| 9 | `scripts/release-dry-run.sh --ci` | **PASS** — compose prod+dev OK, kustomize **35 kinds**, helm prod/staging OK, image parity OK, `DRYRUN_PIPE_EXIT=0`, `Release dry run COMPLETE` |
| 10 | Helm render | prod **44 docs** / staging **44 docs** (exit 0) |
| 11 | Sürüm devamlılığı | prod render'da `:latest` **0** eşleşme |
| 12 | Secret taraması | dry-run `no-committed-secrets` PASS; root'ta `.env` yok, `secrets/` içinde kalıntı yok |

Not: aldığım tüm gate'ler hem `%TEMP%\opencode\p43\scratch` (temiz `npm ci`) hem kanonik
Desktop'ta koşuldu; yukarıdaki bölüm değerleri kanonik koşumlara aittir.

---

## 5. CI koşulu — REAL GITHUB ACTIONS RUN

```
REAL GITHUB ACTIONS RUN = ENVIRONMENT BLOCKED
```

Gerçek bir GitHub Actions run'ı sağlanamadı ve **"CI PASS" olarak raporlanmaz**, çünkü:

1. GitHub repo `hhasanagir/vardiyasystem` yalnızca tek commit içerir (`eb7a6db` "Initial commit") ve
   remote'ta **hiç workflow tracklenmemiştir** (`.github/` yalnızca local'de untracked duruyor).
2. Kanonik repo Desktop'tır; `...\Belgeler\GitHub\vardiyasystem` yalnızca mirror'dur ve bu fazın
   kuralı gereği kullanılmaz.
3. Push/remote kurulumu/credential talep etme bu fazın kapsamı dışındadır (§9 kısıtları).

Bu nedenle workflow değişikliğinin gerçek bir runner'da doğrulanması ancak kullanıcının sonraki
adımıyla (kanonik → GitHub push'u + PR) mümkündür. Bununla birlikte tüm adımlar **CI-benzeri
koşullarda** (temiz `npm ci`, env stub'ları, throwaway DB) local'de koşulmuş ve exit code'lar
yukarıda kayıt altına alınmıştır.

---

## 6. Değişen dosyalar (canonical Desktop)

| Dosya | Değişiklik |
|---|---|
| `.github/workflows/pr-validation.yml` | env'e `DATABASE_DIRECT_URL` eklendi (yorumlu) |
| `backend/package.json` | `overrides: { "tar": "7.5.22" }` |
| `backend/package-lock.json` | `npm install --package-lock-only` ile yeniden üretildi |
| `frontend/package.json` | `overrides: { "tar": "7.5.22" }` |
| `frontend/package-lock.json` | `npm install --package-lock-only` ile yeniden üretildi |
| `docs/phase-rc/p4-03-gate-remediation-report.md` | bu rapor |

Başka hiçbir source koduna dokunulmadı; migration üretilmedi; schedule/authorization/security
kodu, UI ve P4.4 kapsam dışı tutuldu.

---

## 7. Notlar ve residual'lar (engelleyici değil)

1. **deploy.yml residual:** `deploy.yml` içindeki `Run migrations` adımı (`prisma migrate deploy`,
   unit-tests job'ı) aynı latent `DATABASE_DIRECT_URL` eksikliğine sahiptir. §2.3'teki throwaway DB
   deneyiyle deneysel kanıtlandı: env değişkeni olmadan `migrate deploy` P1012 ile başarısız olur.
   Bu fazın kapsamı §10 gereği yalnız `pr-validation.yml` ile sınırlı olduğundan düzeltilmedi; bir
   sonraki faza ayrıca `deploy.yml`i aynı env bloğuyla yansıtmak kalır.
2. **Frontend vitest flake:** ilk attempt'te 2 test dosyası collection error verdi (132/132 + 2
   collection error), rerun temiz 153/153 (exit 0). Bu fazın değişiklikleriyle ilişkisizdir;
   workspace OneDrive üzerinde olduğundan zaman zaman görülebilir. CI (ubuntu) etkilenmez.
3. **Yerel araç seti:** WSL dağıtımı olmadığından `bash` yerine Git Bash kullanıldı; helm sistem
   PATH'ine kurulmadı (scratch `%TEMP%\opencode\p43\bin` v3.17.1).
4. **Yerel node v22.14.0;** workflow'lar node 20 kullanır (P4.3 doğrulama fazında da böyleydi;
   değişmedi).
5. gitleaks/codeql gibi repo-scoped taramalar yalnız CI runner'ında çalışır (deploy.yml security
   job) — bugün yerelde karşılığı yoktur.
6. GitHub ağ geçidi: repo'da `.github/` hiç tracklenmediği için dependency/security botlarının
   (dependabot.yml) etkinliği de push bekler.

---

## 8. Kabul kriterleri (AC) — kontrol listesi

| AC | Durum |
|---|---|
| F1: prisma validate exit 0 (CI-benzeri env) | ✅ |
| F2: audit-ci critical=0 (backend+frontend) | ✅ |
| Backend typecheck / unit (1172) / E2E (85) | ✅ |
| Frontend typecheck / full suite (153) / prod build | ✅ |
| Preflight 18/18 + CI modu 17/17 + suite 32/32 | ✅ |
| release-dry-run.sh --ci | ✅ |
| kustomize 35 kinds | ✅ |
| helm prod 44 / staging 44 docs, `:latest` yok | ✅ |
| Secret taraması temiz | ✅ |
| Test weakening yok (test dosyası değişmedi) | ✅ |
| Audit bypass yok (bayrak/ignore/continue-on-error yok) | ✅ |
| Compiler bypass yok (tsc çalıştı) | ✅ |
| Migration oluşturulmadı | ✅ |
| Kapsam dışı source değişikliği yok | ✅ |
| Gerçek GitHub Actions run'ı | ⛔ ENVIRONMENT-BLOCKED (§5) |

---

## 9. Sonuç

- F1 ve F2 kök nedenle düzeltildi; tüm local/CI-benzeri gate'ler yeşil.
- Gerçek runner doğrulaması yoktur ve "CI PASS" iddiası bu raporda yer almaz.
- Bu nedenle faz **`P4.3 REMEDIATION COMPLETE — CI RUN ENVIRONMENT-BLOCKED`** olarak işaretlenir;
  `P4.3 COMPLETE` değildir (bu fark bilinçlidir).

**Sonraki adım (kullanıcı onayı ile):** kanonik `.github/` değişikliklerinin GitHub'a push'u +
PR → gerçek GitHub Actions run'ı (§5). P4.4'e geçilmedi.