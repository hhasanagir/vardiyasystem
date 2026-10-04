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

| Gate                                 | Baz durum                                                          | Sonuç                                                                                        | Kanıt                                                      |
| ------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Backend unit (vitest)                | RED — 41/45 dosya, 553/557                                         | **PASS** — 43/43 dosya, **553/553** (%100)                                                   | `backend-unit-regression.log`                              |
| Backend typecheck (`tsc --noEmit`)   | RED — 14 hata                                                      | **PASS** — 0 hata                                                                            | `backend-typecheck-regression.log`                         |
| Frontend vitest (configured set)     | RED — 7/8 FAIL (DI, `environment:'node'`)                          | **PASS** — 8/8 dosya, **72/72** (hem `npx vitest run` hem `npx ng test`)                     | `vitest-ngtest-after-1.log`, `ng-test-after-setup-fix.log` |
| audit-ci critical (backend+frontend) | RED — GHSA-23hp-3jrh-7fpw (tar), GHSA-67c8-pqhq-4rmx; bcrypt 5.1.1 | **PASS** — critical **0** (backend total 62, frontend total 42; hepsi critical-altı)         | `npm audit --audit-level=critical`                         |
| `npm ci` (frontend)                  | UYARI — yalnızca `--legacy-peer-deps`                              | **PASS** — düz `npm ci` (lockfile CI-uyumlu; `@angular/platform-browser-dynamic@21.2.9` pin) | önceki `npm ci` runs                                       |

### 1.1 Değişiklik özeti

- **Güvenlik (backend):** `bcrypt@^6.0.0`; **frontend:** `@typescript-eslint` `^8.71.0` ×2, `piscina 5.3.2` / `tar 7.5.22` overrides.
- **Backend unit/typecheck:** test fixture ve constrraint/optimizer/performans/preseeding/quality `Set()` kaldırımları; `constraint-engine.spec` 7-param `validate`; orphan `backend/src/modules/schedules/schedules/` (54 dosya) canonical tree'den uzaklaştırıldı (staged `D`).
- **Frontend testler:** 7 spec gerçek API sözleşmelerine göre yeniden yazıldı (promise tabanlı, `done()` kaldırıldı; süreç içi ayrıntılar: `firstValueFrom` + flush-öncesi-await; URL-string-query sözleşmesi; error-channel contract'ları). `src/test-setup.ts` eklendi (matchMedia polyfill + `getPlatform()` guard'lı `initTestEnvironment` + `afterEach resetTestingModule`). `angular.json`'a `test` arch. target (`@angular/build:unit-test`, vitest runner) eklendi.
- **Release aracı:** `scripts/release-dry-run.sh` CI modunda throwaway `backend/.env` aşamalar — dev compose `env_file ./backend/.env` (gitignore'lı, temiz checkout'ta yok) artık `config -q` adımını kırmaz.

---

## 2. Regresyon gate'leri (re-run)

| Gate                              | Komut                                                | Sonuç                                               |
| --------------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Backend typecheck                 | `tsc --noEmit`                                       | PASS (0)                                            |
| Backend unit                      | `npm run test` (vitest run)                          | **43/43 dosya, 553/553**                            |
| Backend lint                      | `npm run lint` (`scripts/lint-gate.mjs`)             | PASS — 0 hata, 0 uyarı (baseline `maxErrors: 0`)    |
| Frontend `npm ci`                 | düz `npm ci`                                         | PASS                                                |
| Frontend `ng test` (CI unit gate) | `npm run test`                                       | **8/8 dosya, 72/72**                                |
| Frontend `npx vitest run`         | configured set                                       | **8/8 dosya, 72/72**                                |
| Frontend typecheck (CI gate)      | `npm run typecheck`                                  | PASS (0) — **gerçek gate**, §4-6 not                |
| Frontend lint (CI gate)           | `npm run lint` (`eslint .`)                          | **PASS (exit 0)** — 0 hata, 379 uyarı (bkz. §4-1)   |
| Root lint                         | `npm run lint` (frontend → backend)                  | PASS (exit 0)                                       |
| Hook birim testleri               | `node --test scripts/lint-staged-typecheck.test.mjs` | **14/14** — CI'da 3 workflow'da zorunlu             |
| Pre-commit hook                   | `husky` → `npx lint-staged`                          | **ÇALIŞIYOR** — tip hatasıyla commit'i bloke ediyor |
| Frontend `ng build` (üretim)      | `npm run build`                                      | **PASS** — 0 hata, **0 uyarı** (bkz. §4-2, §4-6)    |

> NOT — Frontend typecheck: script `npx tsc --noEmit` varsayılan `tsconfig.json`'ı kullanıyordu; o dosya `"files": []` + `references` içerdiği için **hiçbir kaynak dosyayı kontrol etmeden exit 0** veriyordu. Yani tablodaki "PASS (0)" bir **yanlış geçiş**ti ve CI gate'i (`pr-validation.yml:47`) bugüne kadar boştu. `-p tsconfig.app.json` ile gerçek gate'e çevrildi ve gerçek bir tip hatasıyla doğrulandı. Kanıt ve tüm kusur zinciri §4-6.
>
> NOT — `npm run lint` (frontend): **PASS**. Bu görevde kapatıldı: script `npx ng lint` çağırıyordu ama `angular.json`'da `lint` architect target'ı yoktu → `Cannot find "lint" target`. Çözüm ve kanıt §4-1'de.
>
> NOT — `ng build` (üretim): **PASS**. Bu görevde P0 olarak kapatıldı: bazda takipli 3 component dosyası **0 byte** commit edilmişti (`frontend/src/app/layouts/main-layout/main-layout.component.ts`, `components/settings/settings.component.ts`, `features/radiation-safety/radiation-safety.component.ts`); `app.routes.ts` bunları lazy-import ediyordu → `TS2306 ... is not a module`. Geri yükleme + uyarlama §4-2'de. `NG8107` uyarıları ve bütçe aşımları da giderildi (§4-5, §4-6); build artık tamamen uyarısız.

---

## 3. Release gate'leri (re-run)

| Gate                 | Komut                                            | Sonuç                                                                                                                                                                                    |
| -------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight test suite | `node --test scripts/release-preflight.test.mjs` | PASS — 32/32                                                                                                                                                                             |
| Release preflight    | `node scripts/release-preflight.mjs --ci`        | PASS — 18/18                                                                                                                                                                             |
| Release dry run      | `bash scripts/release-dry-run.sh --ci`           | **PASS** — preflight 17/17, compose prod+dev `config OK`, kustomize para (`k8s/` 35 kinds, sealed-secrets), helm production/staging OK, image parity OK                                  |
| actionlint           | `.github/workflows/*.yml` (4 dosya)              | PASS — 0 hata                                                                                                                                                                            |
| commitlint           | `npx commitlint --from eb7a6db..`                | FAIL — yalnızca **önceden var olan** baz commit `7c9eb76` başlığındaki **BOM (U+FEFF)** (`header-trim`/`subject-empty`/`type-empty`); yeni commit'ler §5'te `--edit` ile ayrı doğrulanır |
| kustomize            | `kubectl kustomize k8s`                          | PASS — 35 kinds                                                                                                                                                                          |
| helm + kubeconform   | production + staging                             | **44 resource**, Valid 41, **Invalid 0**, Errors 0, Skipped 3 (yerel çalışma alanında CRD schema yok: `Certificate` ×1, `ServiceMonitor` ×2) — exit 0                                    |

> `release-dry-run.sh --ci` (yukarıdaki araç düzeltmesinden önce) **ilk koşuda FAIL**: dev `docker-compose.yml` `env_file: ./backend/.env` → temiz checkout'ta dosya yok → `config -q` exit 1. Düzeltme sonrası tam PASS. (Yan çıktı yalnızca bilgilendirici: `version` obsolet uyarısı.)

---

## 4. Önceden var olan / belgelenen eksikler (bu görevin RED kapsamı dışında)

1. **Frontend lint gate yok — ÇÖZÜLDÜ.** `angular.json`'da `lint` architect target'ı yoktu; script `npx ng lint` çağırdığı için CI `lint-typecheck` matrisi gerçek koşuda kırılıyordu. Araştırma sonucu: `eslint.config.mjs` (flat config), `@angular-eslint/*`, `@typescript-eslint/*` ve `eslint` **zaten kuruluydu** — eksik olan tek şey çalıştırma yoluydu. Yapılan:
   - `frontend/package.json` script'i `"lint": "npx ng lint"` → `"lint": "eslint ."`. Repo zaten elle yazılmış flat config kullanıyor ve `@angular-eslint/builder` bağımlılığı yok; `ng lint` yerine doğrudan `eslint` çalıştırmak yeni paket/lockfile yükü getirmeden aynı kapsamı (TS + HTML) lint'liyor.
   - `eslint.config.mjs` içindeki kullanılmayan `import eslint from '@eslint/js'` kaldırıldı — `@eslint/js` ne `devDependencies`'te ilan edilmiş ne de config'te kullanılıyordu (sadece transitift geliyordu).
   - **Sürüm hizası (asıl kök neden):** `eslint .` ilk çalıştırmada **3 hata** verdi; bunlar kod hatası değil, `@angular-eslint/template-parser`ın **template ifadelerindeki arrow function'ları parse edememesi**ydi (`employees.component.html:747`, `person-shift-view.component.html:102`, `firevibe-schedule.component.html:599`). Uygulama `@angular/compiler 21.2.9` kullanıyor (template arrow function desteği 21.2 ile geldi ve `ng build` bunları sorunsuz derliyor), ama parser'ın gömülü compiler'ı `@angular-eslint/bundled-angular-compiler 21.2.0` idi. Declared range `^21.2.0` zaten 21.4.0'ı kapsadığı için üç `@angular-eslint` paketi lockfile'daki 21.2.0'e pinlenmişti → **21.4.0'a yükseltildi** (`bundled-angular-compiler` 21.4.0 geldi). Sonuç: 3 parse hatası **sıfırlandı, uygulama koduna tek satır dokunulmadan**. Lockfile etkisi yalnızca 5 `@angular-eslint/*` paketiyle sınırlı.
   - Ölçüm (`eslint . -f json` ile birebir doğrulandı): 270 dosya lint'lendi, sorunlu **97 dosya** → **0 hata, 379 uyarı, exit 0**. Kural dağılımı: `@typescript-eslint/no-explicit-any` **208**, `@typescript-eslint/no-unused-vars` **170**, `no-console` **1**. Üç kural da config'de bilerek `warn` seviyesinde; bu yüzden CI exit 0. Kullanıcı kararı: **bu turda dokunulmadı**, aşağıdaki backlog'a alındı.
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
6. **Kırık pre-commit hook — KÖK NEDEN BULUNDU ve ÇÖZÜLDÜ.** Root `package.json` lint-staged'da `*.{ts,js}` için `cd frontend && npx tsc --noEmit --pretty 2>&1 || true` çalıştırılıyordu. Bu satır silinerek "geçici workaround" uygulanmıştı; sonradan yapılan kök neden analiziyle **asıl hata zinciri** çıkarıldı ve kalıcı çözüm kuruldu.

   **Kanıt (lint-staged `DEBUG=lint-staged:resolveTaskFn` ile yeniden üretildi):**

   ```
   resolveTaskFn cmd:  cd
   resolveTaskFn args: [ 'frontend', '&&', 'npx', 'tsc',
                         '--noEmit', '--pretty', '2>&1', '||', 'true' ]
   resolveTaskFn execaOptions: { cwd: 'C:\\dev\\vardiyasystem',
                                 preferLocal: true, shell: false }
   [FAILED] cd frontend && npx tsc --noEmit --pretty 2>&1 || true
   Dosya adı, dizin adı veya birim etiketi sözdizimi hatalı.
   ```

   **Tespit edilen kusurlar (birbirinden bağımsız, hepsi ölçüldü):**
   - **(a) Shell yok — asıl ölüm sebebi.** lint-staged 15.5.2 görevleri `shell: false` ile çalıştırır (`lib/index.js:80`, `lib/resolveTaskFn.js`): komut dizesi `string-argv` ile boşluktan bölünür ve **ilk token doğrudan program olarak spawn edilir**. `cd` bir cmd.exe builtin'dir, diskte `cd.exe` yoktur; `&&`, `||`, `2>&1` literal argv'ye düşer, hiç yorumlanmaz. Sonuç: `CreateProcess` → `ERROR_INVALID_NAME` ("Dosya adı, dizin adı veya birim etiketi sözdizimi hatalı"). Derleyici hiç çalışmadan komut çöker.
   - **(b) Yanlış derleyici sürümü.** `cd` hiç çalışmadığı için `cwd` repo kökü (`C:\dev\vardiyasystem`) olarak kalıyor. `preferLocal: true` yüzünden `<root>/node_modules/.bin` PATH'e öncelikli giriyor ve orada **peer olarak hoist'lanmış `typescript@6.0.3`** bulunuyor (root `package.json`'da typescript **declare edilmemiş**). Ölçüldü: `npx tsc --version` → kökte **6.0.3**, frontend'de **5.9.3** (`~5.9.2`). Yani hook, projeye ait olmayan bir derleyici sürümüyle çalışıyordu.
   - **(c) Kökte kontrol edilecek proje yok.** Repo kökünde `tsconfig.json` **yok**; kökten `npx tsc --noEmit` doğrudan `tsc` yardım metnini basıp exit 1 veriyor.
   - **(d) Yanlış workspace kapsamı.** Glob `*.{ts,js}` kök-göreli ve backend `.ts` dosyalarını da eşleştiriyor, ama komut frontend'e sabit `cd` ile gidiyor: bir backend dosyası commit'lerken frontend typecheck çalışıyor, backend hiç kontrol edilmiyordu. Kanonik doğru kapsam root `typecheck` script'idir (`frontend` **ve** `backend`).
   - **(e) Hiçbir zaman gate değildi.** `|| true` yapılandırma gereği exit 0'ı zorlar. Yani "başarılı" görünse bile hiçbir şeyi engellemiyordu.
   - **(f) Yanlış yönlendirme.** `2>&1` anlamsız: execa `reject: false` ile stdout/stderr'ı ayrı yakalayıp kendisi basıyor; stderr'ı stdout'a katmak yalnızca çıktı ayrımını bozuyor.

   **Çözüm (workaround değil, kalıcı):** Shell tamamen devre dışı bırakıldı. Yeni `scripts/lint-staged-typecheck.mjs`:
   - `process.execPath` + workspace'in **kendi** `node_modules/typescript/bin/tsc` → doğru derleyici sürümü, PATH'e veya `.cmd` shim'e bağımlılık yok, shell yok → (a) ve (b) çözüldü.
   - Workspace'ler diskten keşfediliyor (`package.json` + `tsconfig.json` + kendi TypeScript'i) ve staged dosyalara göre **yalnızca ilgili workspace'ler** seçiliyor → (d) çözüldü.
   - `tsc` doğrudan `process.exit` koduyla çalıştırılıyor, `|| true` yok, `stdio: 'inherit'` ile gerçek hata çıktısı (dosya/satır/caret) görünür, derleyici yoksa **sessizce geçmek yerine hata verir** → (e) çözüldü.
   - **Boş-gate koruması:** `tsc -p`, `files: []` + `references` içeren solution-style bir kök tsconfig üzerinde **hiçbir dosyayı kontrol etmeden exit 0** verir. Script bunu bir çözüm dosyası sayar ve `references` içindeki gerçek projeleri kontrol eder → (f) benzeri sessiz geçişler kapatıldı.
   - 14 adet `node --test` birim testi (`scripts/lint-staged-typecheck.test.mjs`, repo konvansiyonuna uygun) workspace yönlendirmesini, opt-in kuralını ve tsconfig çözümlemesini kilitler; "checks nothing" sınıfı regresyonlar için ayrı testler vardır. Suite CI'da üç workflow'da da zorunlu.

   **Ek gerçek bulgu — frontend `typecheck` script'i de boştu.** `frontend/package.json` içindeki `"typecheck": "npx tsc --noEmit"` varsayılan `tsconfig.json`'ı kullanıyordu; o dosya `"files": []` + `references` içerdiği için **hiçbir kaynak dosyayı kontrol etmeden exit 0** veriyordu. Doğrulandı: `frontend/src/` altına gerçek bir tip hatası bırakıldığında `npm run typecheck` **exit 0** verirken, `tsc -p tsconfig.app.json` aynı hatayı `TS2322` olarak yakalıyor. Bu script CI'da `pr-validation.yml:47` üzerinden koştuğu için frontend typecheck gate'i **bugüne kadar boştu**. `npx tsc --noEmit` yerine `tsc --noEmit -p tsconfig.app.json` yapıldı; artık gerçek bir gate.

   **İkinci gerçek boşluk — spec dosyaları hiçbir yerde tip kontrol edilmiyordu.** `frontend/tsconfig.json` bir solution dosyası (`files: []` + `references`) ve yalnızca `tsconfig.app.json`'ı referanslıyordu; `tsconfig.spec.json` **grafiğin dışında** kalmıştı. Sonuç: `tsc` spec'leri atladı, vitest ise esbuild kullandığı için tip kontrolü yapmadan transpile etti — yani bir `.spec.ts` içindeki tip hatası **reponun hiçbir yerinde** yakalanmıyordu. Referans eklendi (`7fae115`); hook grafiği izlediği için frontend artık app + spec'i tek geçişte kontrol ediyor. Doğrulandı: spec dosyasına bırakılan tip hatası `TS2322` ile yakalanıyor ve commit bloklanıyor (Senaryo C).

   **Workspace opt-in kuralı.** Keşif `package.json` + `tsconfig.json` arıyordu ve bu, `e2e` Playwright projesini de içeri alıyordu. `e2e` tsconfig taşıyor ama tip kontrolü yapmadan transpile ediyor ve derleyici kurulu değil — yani `e2e` dosyasına dokunan bir commit, derleyicisi olmayan bir workspace'e yönlendirilip **"no TypeScript installed"** ile **yanlışlıkla bloklanırdı**. Opt-in ölçütü artık "TypeScript declare ediyor" (`6b2c828`): derleyicisi eksik olan ama TypeScript declare eden workspace yine keşfedilir, çünkü asıl risk sessiz geçiştir. Testler bunu kilitliyor.

   **Maliyet:** frontend `tsconfig.app.json` ≈ 15 s, `tsconfig.spec.json` ≈ 7 s, backend `tsconfig.json` ≈ 18 s. Yani hook artık **gerçekten zaman alıyor** (eski hâli saniyeler içinde "başarılı" oluyordu; ölçülen pozitif senaryo ≈ 35 s). Hook yalnızca staged dosyaların ait olduğu workspace'i çalıştırır; kök script dosyaları ve `e2e` atlanır. Kullanıcı kararıyla **daraltılmadı**: bu, bir gate'in gerçek maliyetidir ve CI gate'i zaten aynı kontrolü yapıyor.

   **Kapsam genişletmesi (tamamlandı).** `*.{ts,js,mjs,cjs}` glob'larına genişletildi (`c7e6eef`) ve kök `format`/`format:check` script'leri de eşitlendi. Önce repodaki 10 `.mjs`/`.cjs` dosyası **ayrı bir committe** formatlandı (`daaf848`) — 9'u prettier-clean değildi; amaç, glob genişletmesinin kimsenin commit'ine ilgisiz toplu reformat sokmasını önlemekti. Doğrulama: `format:check` genişletmeden önce ve sonra **aynı 70 uyumsuz dosyayı** raporluyor, yani `mjs`/`cjs` **sıfır** yeni ihlal ekliyor.

   **CI bağlantısı.** Hook testleri artık `ci.yml`, `deploy.yml` ve `pr-validation.yml` içinde preflight testinin yanına bağlı (`d79c9fd`) — aynı gerekçe: _kırmızıya gidemeyen gate gate değildir_. Üç dosya da YAML olarak parse edilip yeni adımın her birinde tam bir kez eklendiği doğrulandı.

7. **`NG8107` optional-chain uyarıları — ÇÖZÜLDÜ.** `mobile-day-view.component.ts:26`'daki `currentDay()?.label` / `currentDay()?.dayOfMonth` için Angular "sol taraf null içermiyor" diyordu. Sebep: `computed(() => this.days()[this.currentIdx()] ?? null)` — `days()` elemanı tipi null içermediği için TypeScript `?? null` ifadesini daraltıp sonucu non-nullable yapıyor, oysa **runtime'da indeks taşması `undefined` verebilir**. `?.` kaldırmak runtime'da güvensiz olurdu; bunun yerine computed'a dürüst dönüş tipi verildi: `computed((): GridDay | null => ...)` (`GridDay` zaten dosyada import edilmişti). Sıfır runtime değişikliği, uyarılar kalıcı olarak gitti.
8. **Bundle bütçeleri yeniden kalibre edildi (kullanıcı onayı).** `maximumError` eşikleri ölçülen değerlerin çok az üstündeydi — initial 619.23 kB / 650 kB sınır (**%5 pay**), en büyük component stili 24.17 kB / 25 kB (**%3 pay**), en büyük script 320.86 kB / 350 kB (**%8 pay**). Yani birkaç yüzde lik meşru bir değişiklik build'i kıracaktı; gate'ler tripwire olmuştu. Ölçülen değerlere göre yeniden ayarlandı: `initial` 700 kB / 850 kB, `anyComponentStyle` 28 kB / 40 kB, `anyScript` 400 kB / 500 kB. `bundle` (500 kB / 1 MB) zaten iki eşiğin de altında olduğu için **dokunulmadı**. Böylece kalıcı gürültü bitti ve bütçeler yeniden regresyon avcısı işlevi görür. Build artık **0 hata, 0 uyarı**.
9. **Backlog (bilinçli olarak bu turda yapılmadı — kullanıcı kararı).**
   - Frontend lint'te **379 uyarı** (97 dosya): `no-explicit-any` 208, `no-unused-vars` 170, `no-console` 1. Config'de `warn` seviyesinde olduğu için CI exit 0; `error` seviyesine çıkarmak 379 ihlalin düzeltilmesini gerektirir (geniş kapsam, ayrı plan). `no-explicit-any` için kısa vadede `@typescript-eslint/no-explicit-any` yerine hedefli `unknown` + daraltma veya dosya bazlı `// eslint-disable-next-line` gerekir; 208 ihlal tek seferde çözülemez.
   - **Bundle küçültme**: initial 619 kB ve `chunk-HLFWTKC4.js` 320 kB. Route bazlı lazy-loading, tree-shaking ve SCSS sadeleştirme gerektirir; bütçe artık yeşil olduğu için aciliyet düşmüştür.
   - **Orphan `supervisor-center` feature'ı**: `features/supervisor-center/supervisor-center.component.ts` + service + modeller mevcut ama hiçbir route dosyasında kayıtlı değil. Ya route'a eklenmeli ya da kaldırılmalı — bu bir **ürün kararı**, bu turda değiştirilmedi (§4-2'de nav bu yüzden `/app/command-center`'a yönlendirildi).

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
8. `build(frontend): make the lint gate runnable and align eslint template parser`
9. `fix(build): clear NG8107 warnings and recalibrate bundle budgets`
10. `fix(hooks): repair the pre-commit typecheck gate at its root cause`
11. `style(scripts): format the existing .mjs and .cjs files with prettier`
12. `fix(hooks): only gate workspaces that declare typescript`
13. `fix(frontend): typecheck the spec project in the declared graph`
14. `build(repo): cover mjs and cjs in the pre-commit hook`
15. `ci: run the pre-commit gate test suite in every workflow`

> Not — 10 numaralı commit, bir önceki turda yapılan "workaround"ı (hook görevini silmek) kök neden analiziyle tersine çevirdi. O workaround geri alındı; satır silinerek değil, kabuk bağımlılığı kaldırılarak düzeltildi.

**Nelere dokunulmadı:** PR / GHCR push / Helm kurulumu / kubectl apply / üretim DB migration / geçmiş yeniden yazma / `reset --hard` / `--no-verify` / hook devre dışı bırakma / lint devre dışı bırakma / hata bastırma / test zayıflatma (`.skip`, `.only`, timeout artışı, fake assert, `any`-maskeleme).

## 6. Son durum

- **COMPLETE** — RED gate kapsamı bitti: backend unit 553/553 + lint 0/0 + typecheck 0, frontend test 72/72 + typecheck 0 (app **ve** spec) + **lint 0 hata (exit 0)** + **`ng build` PASS (0 hata, 0 uyarı)**, hook testleri 14/14, preflight 32/32 + 18/18, audit critical 0, plain `npm ci`, root `npm run lint` ve root `npm run typecheck` PASS, commitlint yalnızca baz-BOM artefaktıyla.
- **Pre-commit hook — ÇALIŞIR VE GERÇEK GATE.** Dört yönlü uçtan uca doğrulama, `--no-verify` **kullanılmadan**: (A) app tip hatası → **bloke**; (B) temiz kod → **geçti** (≈ 35 s); (C) spec tip hatası → **bloke** (`tsconfig.spec.json`); (D) temiz kod → **geçti**. Hiçbir senaryoda HEAD değişmedi ya da hook atlanmadı.
- **PARTIAL/BLOCKED (belgeli):** backend E2E — local environment-limited, CI-authoritative (§4-4).
- **BACKLOG (bilinçli karar, §4-9):** 379 frontend lint uyarısı, bundle küçültme, orphan `supervisor-center` feature'ı.
- **PRE-EXISTING BORÇ (bu turun kapsamı dışında, CI'da değil):** kök `npm run format:check` 70 `.ts`/`.json` dosyasında uyumsuzluk raporluyor. Bu, glob genişletmesinden **önce de** vardı (önce/sonra aynı 70 dosya ölçüldü) ve hiçbir workflow `format:check` çalıştırmıyor. lint-staged yalnızca **staged** dosyaları formatladığı için bu borç geliştiriciyi rahatsız etmiyor; toplu 70 dosyalık reformat ayrı bir çalışma olarak değerlendirilmeli.
- Commit'lerle birlikte çalışma ağacı temiz olarak bırakılır (untracked sıfır).
