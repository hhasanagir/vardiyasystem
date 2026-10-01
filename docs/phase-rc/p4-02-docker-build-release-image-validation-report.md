# P4.2 — Docker Build & Release Image Validation (Backend)

**Amaç:** Backend Docker image build'inde görülen `failed to commit ... snapshot ... does not exist` hatasının OneDrive mı, BuildKit/Dockerfile mı olduğunu kesin ayırmak ve release image'ını runtime düzeyinde doğrulamak.

**Kanonik kopya (bu görev için):** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
**İzole build context:** `C:\Temp\vardiyasystem-docker-test\backend` (OneDrive dışı; kaynak değildir)
**Image:** `ghcr.io/anomalyco/vardiyasystem/backend:local-e2e`
**Tarih:** 2026-09-29

---

## 1. Original failure (olay sırası)

| #   | Context                    | Dockerfile varyantı                             | Sonuç                                                                                                                              |
| --- | -------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | git repo (OneDrive)        | orijinal git                                    | FAIL: `npm run build` → tsc **TS2353/TS2554** (`src/modules/schedules/__tests__/**`)                                               |
| 2   | git repo (OneDrive)        | orijinal git + `tsconfig.build.json` düzeltmesi | FAIL: `COPY /app/node_modules/.prisma`: **not found** (son builder adımı `npm ci --only=production` node_modules'ı komple siliyor) |
| 3   | git repo (OneDrive)        | + `.prisma-cache` denemesi                      | FAIL: `COPY --from=builder /app/node_modules ./node_modules` → **snapshot commit**                                                 |
| 4   | git repo (OneDrive, retry) | aynı                                            | FAIL: aynı snapshot hatası (aynı id)                                                                                               |
| 5   | temp (OneDrive dışı)       | git varyantı (aynı)                             | FAIL: **aynı snapshot hatası** (aynı id) — cache prune SONRASI, pristine build                                                     |

Hata imzası (bütün denemelerde birebir aynı):

```
ERROR: failed to commit oj29ajdbjfy33otrs497ov7ji to u6dj5fq69qtp32h0f8i2wz45l during
finalize: failed to stat active key during commit: snapshot oj29ajdbjfy33otrs497ov7ji
does not exist: not found
```

## 2. Retry sonucu

`docker buildx prune -f` (3.32 GB) sonrası pristine rebuild → **aynı snapshot hatası tekrar üredi**. Hata cache'e bağlı DEĞİL, deterministik ve content-addresli (snapshot id = katman content hash'i).

## 3. OneDrive context sonucu

- **Desktop (OneDrive) context + Desktop(Dockerfile) → BAŞARILI** (exit 0). Aynı makinede 420 MB node_modules COPY katmanı clean commit ediliyor.
- **git (OneDrive) context + git Dockerfile → FAIL** (yukarıdaki #3-4).

## 4. İzole context sonucu

- **temp (OneDrive dışı) + git Dockerfile → FAIL** (aynı snapshot). → **OneDrive context, FAIL-değişkeni DEĞİL.**
- **minimal reproducer** (same node_modules ağacını başka image'den COPY, 3 kopya) → PASS.
- **in-session duplicate test** (aynı 335 MB'ı 3 stage'de COPY) → PASS.

### Karar: CASE B

> OneDrive build = FAIL, OneDrive dışı build = FAIL → OneDrive kök neden DEĞİL; Dockerfile/BuildKit layer yapısı kök nedendir.

## 5. BuildKit teşhisi (root cause)

Bisection (hepsi temp, sadece Dockerfile değişkeni):

| Varyant | Değişiklik                                                 | Sonuç                    |
| ------- | ---------------------------------------------------------- | ------------------------ |
| V1      | git + `.prisma-cache` (tam)                                | FAIL (node_modules COPY) |
| V2      | V1 − prod `.prisma-cache` COPY                             | FAIL (aynı)              |
| V4      | builder `cp -a` kaldırılsa (öngörülmüş)                    | —                        |
| **V5**  | **Desktop kanonik Dockerfile (prune-based) + git içeriği** | **PASS (exit 0)**        |

**Bulgular:**

1. VM diski 944 GB boş, host 251 GB boş → alan değil.
2. Builder stage ayrıca build (`--target builder`) → PASS; 808 MB `npm ci` katmanı + 368 MB son build katmanı commit ediliyor.
3. Hatalı katman özelikle: son builder adımındaki **`npm ci --only=production --ignore-scripts --omit=dev` (tam yeniden reinstall)** ile üretilip ardından stage-1'de **`COPY --from=builder /app/node_modules`** ile kopyalanan ağaç.
4. Desktop'ın **`npm prune --omit=dev` (yerinde pruned ağaç)** varyantı aynı içeriği clean commit ediyor (hem OneDrive'da hem in-session 420 MB prototipi).
5. Bu Docker Desktop/BuildKit işçisinde (wsl2 backend), tam-reinstall türevi büyük ağacın ayı-session `COPY --from` commit'i content-addresli store'da `failed to stat active key` ile dayanıksız; prune-derived ağaç dayanıklı.

**Düzeltme (kök neden):** git repo `backend/Dockerfile`'ı kanonik Desktop Dockerfile ile birebir aynı yapıldı (hash aynı).

- `.prisma-cache` denemesi geri çekildi (gerek yok; `npm prune` `.prisma`'ya dokunmuyor).
- `tsconfig.build.json`'da `src/**/__tests__/**` exclude KORUNDU (git ağacının build-derlemesinin ayrı gerekli düzeltmesi; artefakt test fixture içermez; `npm run typecheck` 14 hatayı ayrı gate olarak göstermeyi sürdürür).

## 6. Docker image verification (final state)

Son durum: **git repo (OneDrive) context + kanonik Dockerfile → build PASS (exit 0)**, 1.4 s (idempotent).

- Boyut: **157.8 MB** (`docker inspect .Size`)
- Base: node:20-alpine (runtime node **v20.20.2**)
- USER: **vardiya** (non-root)
- HEALTHCHECK: `curl -sf http://localhost:3000/api/v1/health/live`
- ENTRYPOINT: `/sbin/tini --`, CMD `node dist/src/main`
- Labels: vendor/OC-image (source github.com/anomalyco/vardiyasystem)

## 7. Runtime verification

| Kontrol                                       | Sonuç                                                                   |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| `dist/src/main.js` mevcut                     | PASS                                                                    |
| `node_modules/.prisma/client/index.js` mevcut | PASS                                                                    |
| `new PrismaClient()` **başlatma**             | İlk build'de **FAIL** → düzeltildi                                      |
| Engine dosyası                                | `libquery_engine-linux-musl-openssl-3.0.x.so.node` (fix sonrası mevcut) |

**İlk runtime build'de yakalanan gizli blocker:**

```
PrismaClientInitializationError: Prisma Client could not locate the Query Engine for
 runtime "linux-musl-openssl-3.0.x". generated for "linux-musl", but the actual
 deployment required "linux-musl-openssl-3.0.x".
```

`generator client` blokunda `binaryTargets` yoktu → build ortamı native olarak `linux-musl` üretti; node:20-alpine'da çalışan Prisma 5.22 `linux-musl-openssl-3.0.x` istiyor. Image build oluyordu ama **ilk DB erişiminde çökecekti** (healthcheck dahil).

**Düzeltme:** `backend/prisma/schema.prisma` generator bloğuna `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]` eklendi (git + Desktop eşit, hash aynı). Rebuild → `PRISMA_CLIENT_LOAD_OK`, exit 0. Engines: hem musl hem musl-openssl-3.0.x mevcut; local (windows) native de kapsanır.

## 8. CI relevance

- CI runner OneDrive kullanmıyor; yerel BuildKit snapshot hatası CI için yayın engeli DEĞİL. Ancak **aynı Dockerfile'ın gerçekten build olduğu doğrulandı**: git repo Dockerfile = artık kanonik prune-based varyant → CI'da da build edilir.
- CI'ın `docker-build-push` adımı `context: ./backend`, `push: true`, `tags: sha-long + branch + semver + latest(main)` → tag sözleşmesi P4.1 ile uyumlu.
- **CI'ı da vuracak iki gerçek engel yine de vardı ve giderildi:** (a) tsc build hatası (`__tests__` derlemeye giriyordu → `tsconfig.build.json` exclude); (b) runtime query-engine eksikliği (`binaryTargets`). İkisi de release-blocker seviyesindeydi.

## 9. OpenCode API hatası (ayrı residual)

`Cannot connect to API: getaddrinfo ENOTFOUND opencode.ai` — **DNS/ağ problemi**; Docker build hatasıyla ilgisi yok, kod içinde workaround eklenmedi. Bağlantı geri gelirse normal akış devralır.

## 10. Remaining risks

1. `npm run test` (backend, git repo): **317 passed / 8 failed** — 8 fail `schedules.service.spec.ts`'te **pre-existing** `this.prisma.$transaction is not a function` (mock'ta `$transaction` yok; aynı havuzdaki 14 tsc hatası kategorisi). Bu görevde hiçbir schedule dosyasına dokunulmadı → regression değil; app-kalite borcu olarak P4.2 raporuna eklenir.
2. Backend `typecheck` (`tsc --noEmit`) 14 hatayı ayrı gate olarak raporlamaya devam ediyor (bilinçli; build artık etkilenmiyor).
3. İki Prisma engine (~+15 MB) imaj boyutunu büyütüyor; optimizasyon (yalnızca linux-musl-openssl-3.0.x taşımak) build target seçimiyle kısılabilir → residual.
4. Frontend imaj build edilmedi (bu görevin kapsamı backend idi; frontend `ng lint` + image build P4.2 genel akışında ayrı kalem olarak duruyor).
5. Desktop ↔ git kopyaları Dockerfile + schema.prisma + tsconfig.build açısından artık dengeli; diğer P4.1 eserleri git'te **commit edilmemiş** durumda (tek commit'li repo, büyük untracked set). Commit kullanıcı onayı gerektirir.
6. Diyagnostik ara görseller (`vardiya-backend-builder`, `vardiya-copy-repro`, `vardiya-dup-repro`) ispat amacıyla tutuluyor; silme onay bekler. `C:\Temp\vardiyasystem-docker-test` izole laboratuvarı korundu.

## 11. Release impact

- Backend release imajı artık **bu makinede build edilebilir VE çalıştırılabilir** (non-root, dist, Prisma client + query engine, healthcheck).
- Preflight **18/18 PASS** (dokunulan kaynak sonrası re-run).
- OneDrive etkileşimi CI'ı etkilemez; ama lokal üretimde kanonik Dockerfile'ın kullanılması zorunlu hale geldi (git varyantı bu işçide deterministik fail).

## 12. Final verdict

**CASE B doğrulandı.** OneDrive kök neden DEĞİL. Gerçek kök nedenler:

1. Git Dockerfile varyantının `npm ci --only=production` tam-reinstall türevli büyük ağacının bu Docker Desktop/BuildKit işçisinde `COPY --from` commit'i (BuildKit store tutarsızlığı) → **prune-based kanonik Dockerfile ile giderildi ve PASS doğrulandı.**
2. `binaryTargets` eksikliği → runtime `new PrismaClient()` engeli → **binaryTargets ile giderildi; `PRISMA_CLIENT_LOAD_OK` doğrulandı.**

**P4.2 backend docker-release-image validation = COMPLETE** (bu görev kapsamı). P4.3'e geçilmedi; CI workflow yeniden tasarlanmadı; yeni feature eklenmedi.
