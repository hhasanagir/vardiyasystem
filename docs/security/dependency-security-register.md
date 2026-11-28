# P3-G — Bağımlılık Güvenliği Karar ve Risk Kaydı

**Tarih:** 2026-11-28
**Durum:** P3-G tamamlandı. Bu doküman yalnızca kayıttır; bağımlılık, lockfile, CI, eşik veya kaynak kodu değişikliği içermez.
**Referans:** `main` @ `94228fa` (PR #90 merge), deploy `46123506317` **SUCCESS**, release `v1.0.0-94228facdb545f973481b28c70f26ac4df25d7d2`.
**Kapsam:** Onaylı dalga planının son maddesi (P3-G — karar/kalıntı işleri). Önceki dalgalar: P1-A (#80), P1-B (#85), P1-C (#86), P1-D (#87), Node 22 ön koşulu (#88), P2-E backend (#89), P2-E Angular 22 (#90).

## 1. Verilen kararlar

| ID | Konu | Karar | Gerekçe / kanıt |
|---|---|---|---|
| D-01 | `exceljs@4.4.0` moderate advisory (`via: ["uuid"]`, `uuid@8.3.2`) | **Override ile kapatıldı** — `exceljs` sürümü korundu, downgrade / kütüphane değişimi / risk kabulü **yapılmadı** | Backend direkt `uuid ^11.1.1` + `overrides.uuid = "$uuid"`. CJS `require('uuid').v4` yolu backend testleriyle doğrulandı. Son `npm audit`: backend full **0**. |
| D-02 | Node 22 geçişinin ertelenmesi seçeneği | **Ertelenmedi**, repo geneli bare `22`, CI `22.23.5` | Angular CLI 22 `^22.22.3` istiyor. Yerel `v22.14.0` için gate’ler `npx node@22.23.5` ile çalıştırıldı. Dev-only `@angular/cli` zinciri Angular 22 ile birlikte kapandı. |
| D-03 | Angular 22 chunk optimization | **Kapatıldı**, bütçe/eşikler **değiştirilmedi** | `@angular/build@22` tüm initial vendor chunk’larını `main` içinde birleştiriyordu; `anyScript` 500 kB error eşiği gerçek transfer artışı olmadan patlıyordu. `frontend/scripts/build.mjs` yalnızca `NG_BUILD_OPTIMIZE_CHUNKS=0` ayarlar; tüm CI/Docker build’leri `npm run build` üzerinden geçer. |
| D-04 | `audit-ci` / eşikler | **Hiçbir suppression, allowlist, eşik veya kapsam değişikliği yapılmadı** | Zorunlu gate’ler hâlâ `npx --yes audit-ci@6 --critical --report-type summary` (deploy.yml, pr-validation.yml). `security-scan.yml` içindeki `|| true` yalnızca önceden var olan advisory *tam rapor* adımına aittir; zorunlu gate değildir ve bu dalgalarda değiştirilmedi. |
| D-05 | PrimeNG 22 template API kaldırılması | **Template ref’e geçirildi** (`#footer`, `#header`, `#body`, `#emptymessage`) | `pTemplate` v20’de deprecate, v22’de kaldırıldı. Eski attribute sessizce yok sayıldığı için dışa aktarma dialog footer’ı render olmuyordu (Browser Acceptance FAIL). 72 kullanım 16 dosyada güncellendi; tekrarını önleyen 2 invariant testi eklendi. |

## 2. Audit sonuçları (doğrulanmış)

| Kapsam | Plan başlangıcı (2026-11-26) | P2-E backend sonrası | Son durum (`94228fa`) |
|---|---|---|---|
| Backend prod (`--omit=dev`) | 28 moderate + 1 low | 0 | **0** |
| Backend full | 4 high + 45 moderate + 4 low | 0 | **0** |
| Frontend prod | 3 moderate | 0 | **0** |
| Frontend full | 7 high + 25 moderate + 3 low | 16 moderate (dev-only `@angular/cli` zinciri) | **0** |

HIGH/critical: **0**. `audit-ci@6 --critical` backend ve frontend için exit 0. Zorunlu CI kontrolleri PR #90’da **14/14 PASS**; yalnızca bilinen advisory `Coverage Report` FAIL kaldı (PR #89’da da aynıydı; güvenlik eşiğiyle ilgisi yok).

## 3. Kalan risk kaydı

Açık güvenlik advisory’si **yok**. Aşağıdaki maddeler “no upstream fix” / bakım takibi içindir; sahip ve son tarih alanları bu kayıtta önerilen atamayı temsil eder.

| ID | Risk | Şu anki kontrol | Sahip (önerilen) | İlk yeniden değerlendirme | Residual |
|---|---|---|---|---|---|
| R-DEP-01 | `exceljs@4.4.0` advisory’si transitive `uuid` sürümüne geri dönebilir | Lockfile + `overrides.uuid = "$uuid"`; PR/deploy `audit-ci --critical`; aylık tam tarama | Backend / Platform | 2026-12-28 | Low |
| R-DEP-02 | `@primeng/themes@21.0.4` deprecated (upstream `@primeuix/themes` lehine) — güvenlik bulgusu **değil** | Lock’ta `@primeuix/themes 2.0.3` zaten mevcut; tema davranışı değiştirilmedi | Frontend | 2026-12-28 | Low |
| R-DEP-03 | Yerel Node `22.14.0`, CLI gereksinimi `^22.22.3` — gate yanılması riski (güvenlik bulgusu değil) | Yerel gate’ler `npx node@22.23.5`; CI aynı sürümü çözüyor | Platform | 2026-12-28 | Low |
| R-DEP-04 | Yeni “no upstream fix” advisory çıkarsa kayıpsız kalması | Aşağıdaki izleme prosedürü; şu an açık kayıt yok | Güvenlik | Aylık | Low |

### İzleme prosedürü

1. Her ay her iki workspace için `npm audit --json` ve `npx --yes audit-ci@6 --critical --report-type summary` çalıştır; sonucu bu kayda yaz.
2. Yeni moderate/high/critical bulgu çıkarsa: paket, `via` zinciri, etkilenen kapsam (prod/dev), upstream düzeltme durumu, **sahip** ve **son tarih** ile bu tabloya ekle. `audit-ci` suppression’ı veya eşik değişikliği **yok**.
3. HIGH/critical veya prod etkisi varsa yeni dalga aç; ayrı branch/PR ve ayrı merge onayı gerektir. Yalnızca dev-only ve upstream fixesiz bulgular risk kabulüyle izlenir.
4. Bir advisory upstream düzeltmeyle kapanırsa ilgili satırı “closed” olarak işaretle ve kapanış kanıtını (PR/deploy/audit) bağla.

## 4. Kapsam dışı / bilinen gürültü

- `Coverage Report (advisory)` FAIL ve `security-scan.yml` tam rapor `|| true` davranışı güvenlik gate’i değildir; bu kayıt onları değiştirmez.
- Native Android artifact kaynaklı tam `eslint .` hatası ve backend `security-closure-4.1.spec.ts` CRLF assertion’ı bilinen, bu dalgalarla ilgisiz baseline sorunlarıdır.

## 5. Onay

P3-G çalışması kullanıcıdan açık onay alınarak yapıldı. Bu dokümanın merge edilmesi ayrı onay gerektirir; merge sonrası production deploy tetiklenirse yalnızca izlenir.
