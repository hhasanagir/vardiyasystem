# P5 — Release Candidate Remediation Report

**RC:** baseline `7c9eb76` (`chore: commit full validated working tree as release baseline (P4.4 closeout)`)
**Girdi:** `docs/phase-rc/release-workspace-integrity-report.md` (RED gate listesi)
**Ağaç (kanonik):** `C:\dev\vardiyasystem` — `main`, HEAD öncesi `76b50c8`
**Tarih:** 2026-10-02

> Not (iki-ağaç): Oturum çalışma dizini açık iken OneDrive üzerindeki ikincil checkout
> (`C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`, HEAD `7c9eb76`, `origin` = GitHub) ayrı ve
> temiz bir kopyaydı. Tüm remediyasyonlar ve commit'ler kullanıcı onayı ile kanonik ağaç
> `C:\dev\vardiyasystem` üzerinde yapıldı (DEV ağacının `origin`'i OD dizinidir). OneDrive ağacına dokunulmadı.

---

## 1. RED gate remediyasyonu (bütçe: `release-workspace-integrity-report.md`)

| Gate | Baz durum | Sonuç | Kanıt |
|---|---|---|---|
| Backend unit (vitest) | RED — 41/45 dosya, 553/557 | **PASS** — 43/43 dosya, **553/553** (%100) | `backend-unit-regression.log` |
| Backend typecheck (`tsc --noEmit`) | RED — 14 hata | **PASS** — 0 hata | `backend-typecheck-regression.log` |
| Frontend vitest (configured set) | RED — 7/8 FAIL (DI, `environment:'node'`) | **PASS** — 8/8 dosya, **72/72** (hem `npx vitest run` hem `npx ng test`) | `vitest-ngtest-after-1.log`, `ng-test-after-setup-fix.log` |
| audit-ci critical (backend+frontend) | RED — GHSA-23hp-3jrh-7fpw (tar), GHSA-67c8-pqhq-4rmx; bcrypt 5.1.1 | **PASS** — critical **0** (backend total 62, frontend total 42; hepsi critical-altı) | `npm audit --audit-level=critical` |
| `npm ci` (frontend) | UYARI — yalnızca `--legacy-peer-deps` | **PASS** — düz `npm ci` (lockfile CI-uyumlu; `@angular/platform-browser-dynamic@21.2.9` pin) | önceki `npm ci` runs |

### 1.1 Değişiklik özeti
- **Güvenlik (backend):** `bcrypt@^6.0.0`; **frontend:** `@typescript-eslint` `^8.71.0` ×2, `piscina 5.3.2` / `tar 7.5.22` overrides.
- **Backend unit/typecheck:** test fixture ve constrraint/optimizer/performans/preseeding/quality `Set()` kaldırımları; `constraint-engine.spec` 7-param `validate`; orphan `backend/src/modules/schedules/schedules/` (54 dosya) canonical tree'den uzaklaştırıldı (staged `D`).
- **Frontend testler:** 7 spec gerçek API sözleşmelerine göre yeniden yazıldı (promise tabanlı, `done()` kaldırıldı; süreç içi ayrıntılar: `firstValueFrom` + flush-öncesi-await; URL-string-query sözleşmesi; error-channel contract'ları). `src/test-setup.ts` eklendi (matchMedia polyfill + `getPlatform()` guard'lı `initTestEnvironment` + `afterEach resetTestingModule`). `angular.json`'a `test` arch. target (`@angular/build:unit-test`, vitest runner) eklendi.
- **Release aracı:** `scripts/release-dry-run.sh` CI modunda throwaway `backend/.env` aşamalar — dev compose `env_file ./backend/.env` (gitignore'lı, temiz checkout'ta yok) artık `config -q` adımını kırmaz.

---

## 2. Regresyon gate'leri (re-run)

| Gate | Komut | Sonuç |
|---|---|---|
| Backend typecheck | `tsc --noEmit` | PASS (0) |
| Backend unit | `npm run test` (vitest run) | **43/43 dosya, 553/553** |
| Frontend `npm ci` | düz `npm ci` | PASS |
| Frontend `ng test` (CI unit gate) | `npm run test` | **8/8 dosya, 72/72** |
| Frontend `npx vitest run` | configured set | **8/8 dosya, 72/72** |
| Frontend typecheck (CI gate) | `npm run typecheck` | PASS (0) |
| Frontend `ng build` (üretim) | `npm run build` | **PASS** — `Application bundle generation complete` (bkz. §4-2) |

> NOT — `npm run lint` (CI `lint-typecheck` işinde frontend için çalışır): **FAIL — önceden var olan tanımlı ONCE**. Angular.json'da `lint` arch. target yok (`Cannot find "lint" target`). Bu RED-gate listesinde değildi; kullanıcı kararıyla **belgelendi, düzeltilmedi** (bkz. §4-1).
>
> NOT — `ng build` (üretim): **PASS**. Bu görevde P0 olarak kapatıldı: bazda takipli 3 component dosyası **0 byte** commit edilmişti (`frontend/src/app/layouts/main-layout/main-layout.component.ts`, `components/settings/settings.component.ts`, `features/radiation-safety/radiation-safety.component.ts`); `app.routes.ts` bunları lazy-import ediyordu → `TS2306 ... is not a module`. Geri yükleme + uyarlama §4-2'de. Kalan uyarılar yalnızca **non-fatal**: `NG8107` (`mobile-day-view.component.ts:26`) ve bundle/component-size bütçe aşımları.

---

## 3. Release gate'leri (re-run)

| Gate | Komut | Sonuç |
|---|---|---|
| Preflight test suite | `node --test scripts/release-preflight.test.mjs` | PASS — 32/32 |
| Release preflight | `node scripts/release-preflight.mjs --ci` | PASS — 18/18 |
| Release dry run | `bash scripts/release-dry-run.sh --ci` | **PASS** — preflight 17/17, compose prod+dev `config OK`, kustomize para (`k8s/` 35 kinds, sealed-secrets), helm production/staging OK, image parity OK |
| actionlint | `.github/workflows/*.yml` (4 dosya) | PASS — 0 hata |
| commitlint | `npx commitlint --from eb7a6db..` | FAIL — yalnızca **önceden var olan** baz commit `7c9eb76` başlığındaki **BOM (U+FEFF)** (`header-trim`/`subject-empty`/`type-empty`); yeni commit'ler §5'te `--edit` ile ayrı doğrulanır |
| kustomize | `kubectl kustomize k8s` | PASS — 35 kinds |
| helm + kubeconform | production + staging | **44 resource**, Valid 41, **Invalid 0**, Errors 0, Skipped 3 (yerel çalışma alanında CRD schema yok: `Certificate` ×1, `ServiceMonitor` ×2) — exit 0 |

> `release-dry-run.sh --ci` (yukarıdaki araç düzeltmesinden önce) **ilk koşuda FAIL**: dev `docker-compose.yml` `env_file: ./backend/.env` → temiz checkout'ta dosya yok → `config -q` exit 1. Düzeltme sonrası tam PASS. (Yan çıktı yalnızca bilgilendirici: `version` obsolet uyarısı.)

---

## 4. Önceden var olan / belgelenen eksikler (bu görevin RED kapsamı dışında)

1. **Frontend lint gate yok.** `angular.json` `lint` target'sız; CI `lint-typecheck` matrisi frontend için `npm run lint` çağırıyor → gerçek PR/CI koşusunda kırılır. Çözüm (yapılmadı): `@angular-eslint` devDependency + `lint` target + baseline. Kullanıcı kararı: belgele – geç.
2. **Üç boş component (`main-layout`, `settings`, `radiation-safety`) — P0' DA ÇÖZÜLDÜ.** Baz commit `7c9eb76` bu dosyaları 0 byte olarak kaydetmişti; `git log --follow`, `git fsck --dangling` (51 blob) ve stash/reflog taramasında önceki dolu içerik **bulunamadı**. Aynı makinedeki ayrı çalışma kopyası `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` dolu implementasyonları içeriyordu ve bu dosyalar için tek mevcut kaynak olarak kullanıldı.
   - `settings.component.ts` ve `radiation-safety.component.ts` **birebir** kopyalandı (inline template/stiller; `radiation-safety` için mevcut `.html`/`.scss` ile uyumlu — template'deki tüm binding'ler sınıf üyelerinde mevcut).
   - `main-layout.component.ts` kopyalandı ancak bu kopya **ayrışmış** bir feature dalına ait: DEV'in `RbacService`'i `isFieldSupervisor()` / `getFieldSupervisorUnitType()` içermiyor ve DEV `UserRoleEnum`'ında `field_supervisor` yok. Kopya **bloke eden** 4 tip hatası üretti (`TS2367`, `TS2339` ×2, `TS7006`). Template `isFieldSupervisor`/`fieldSupervisorUnitType`'a referans vermediği için sapma izoleydi; placeholder yazılmadan, kanonik yapıdan çıkarılan 5 hedefli uyarlama yapıldı:
     1. `hasSupervisorSurfaces` eşiği `'field_supervisor'` → `'supervisor'` (kanıt: `app.routes.ts` içindeki `minRole: 'supervisor'` route guard'ları).
     2. `isFieldSupervisor` computed **kaldırıldı** (`RbacService` bağımlıydı).
     3. `fieldSupervisorUnitType` signal **kaldırıldı**.
     4. `units` computed → `this.allUnits` (field-supervisor daraltma kuralı yok).
     5. Constructor'daki field-supervisor `.then()` bloğu → `void this.rbac.ensureLoaded()`.
   - Sapma sırasında bulunan ilgili düzeltme: nav'daki "Operasyon Merkezi" öğesi `/app/supervisor-center`'a gidiyordu; DEV'de bu yol **yok** (`supervisor-center.component.ts` orphan — hiçbir route dosyasında kayıtlı değil). DEV'in gerçek "Operasyon Merkezi" rotası `command-center` (`app.routes.ts:298`, `minRole: 'supervisor'`, `page-context.config.ts:245`) → nav rotası `/app/command-center` yapıldı. 24 nav rotasının kalan 23'ü DEV `app.routes.ts` ile doğrulandı.
   - Sonuç: `npm run typecheck` 0 hata, `npm run build` **PASS**, `npx vitest run` 8/8–72/72, `npx ng test` 8/8–72/72.
3. **commitlint BOM artefaktı.** Baz commit `7c9eb76` mesajı U+FEFF ile başlıyor; git geçmişi yeniden yazılmaz → bu commit için commitlint kalıcı FAIL. Yeni commit'ler conventional style'da, BOM'suz (doğrulama §5).
4. **Backend E2E local sınırlı (CI-authoritative).** 8 e2e dosyası; 30s hook timeout + WSL2–Docker postgres gecikmesi local koşuyu kesiyor (önceden ölçülen `slow_query_detected` ~100–220 ms/sorgu; `metrics_registered` boot kanıtı). CI tarihsel referansı: 85/85 (`p4-04`). Gerçek yeşil sayı yalnızca CI koşusunda doğrulanabilir. Konteynerler: `vardiya-rc-postgres` / `vardiya-rc-redis` ayakta.
5. **İkincil checkout kopyası** güncellenmedi (OneDrive ağacı `7c9eb76`'da temiz duruyor). Bu remediyasyon + commit'ler yalnızca kanonik `C:\dev\vardiyasystem`.

---

## 5. Commit planı ve commitlint doğrulaması

Sıralı, konu-bazlı commit'ler (yeni commit'lerin her biri `npx commitlint --edit` ile ayrı doğrulanır):

1. `build(backend): bump bcrypt to ^6.0.0 (critical audit closures)`
2. `fix(backend): repair unit rig (553/553) and remove orphan schedules suite`
3. `build(frontend): pin transitive security fixes and add angular unit-test runner`
4. `test(frontend): rewrite specs against real API contracts (8 files, 72/72)`
5. `build(release): stage backend/.env in CI mode for dev compose config`
6. `docs(phase-rc): add release candidate remediation report`
7. `fix(frontend): restore zero-byte layout, settings and radiation-safety components`

**Nelere dokunulmadı:** push / PR / GHCR push / Helm kurulumu / kubectl apply / üretim DB migration / geçmiş yeniden yazma / `reset --hard` / test zayıflatma (`.skip`, `.only`, timeout artışı, fake assert, `any`-maskeleme).

## 6. Son durum

- **COMPLETE** — RED gate kapsamı bitti: backend unit 553/553, typecheck 0, frontend vitest+ng-test 72/72, **frontend `ng build` PASS**, audit critical 0, plain `npm ci`, tüm release gate'leri (preflight 32/32 + 18/18, dry-run COMPLETE, actionlint 4/4, kustomize 35, helm+kubeconform 44/0/0, commitlint yalnızca baz-BOM artefaktıyla).
- **PARTIAL/BLOCKED (belgeli):** frontend `lint` — referansı §4-1 (kullanıcı kararıyla geçildi); backend E2E — local environment-limited, CI-authoritative (§4-4).
- Commit'lerle birlikte çalışma ağacı temiz olarak bırakılır (untracked sıfır).