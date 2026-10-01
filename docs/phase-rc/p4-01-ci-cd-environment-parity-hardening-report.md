# P4.1 — CI/CD & Environment Parity Hardening

**Durum:** Tamamlandı (statik doğrulama)
**Tarih:** 2026-09-29
**Kapsam:** Bu faz bitmeseydi pipeline üretim manifest'lerini hiç doğrulamıyordu; Helm chart ise **ilk kez render edilemez durumdaydı**.

---

## 1. Hedefler

| #   | Hedef                                                                               | Sonuç                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PG major'ını her katmanda sabitle (compose dev/prod, helm, k8s, restore, workflows) | **PG15** tek major; preflight `postgres-version-aligned` ile zorlanıyor                                                                                                                                                |
| 2   | Clean-install parity: prod manifest'leri temiz makinede doğrulanabilir olsun        | `release-dry-run.sh --ci` kök `.env` + `secrets/*.txt` placeholder üretir; `.gitignore` (satır 12/67) bu dosyaları korur                                                                                               |
| 3   | Workflow'ların gerçek build/push/tag'leri release ile örtüşsün                      | `type=sha,prefix=,format=long` + `latest`(main) + semver(tag); compose/helm/rollouts/k8s referansları `:v1.0.0` immutable                                                                                              |
| 4   | GHCR build → tagged push → tüketim zinciri tutarlı                                  | `ghcr.io/anomalyco/vardiyasystem/{backend,frontend}` prefix contract; preflight + release-dry-run image parity                                                                                                         |
| 5   | kustomize→environment zinciri canlı manifest'leri beslesin                          | `k8s` (35 doc) ve `infra/sealed-secrets` (4 SealedSecret, ns `vardiya`) `kubectl kustomize` ile render ediliyor                                                                                                        |
| 6   | Migration → deploy sıralaması her iki yol için güvenli                              | compose: backend `initContainer migrate`; helm: `migration-job` (hook pre-install,pre-upgrade, weight -5); migration her zaman `database_direct_url` üzerinden (transaction pooling pgbouncer migration'a uygun değil) |
| 7   | Backup → restore → rollback döngüsü otomatik doğrulanabilir                         | `restore-check.sh` (scratch PG, `pg_restore`, `_prisma_migrations` assert); integration-test job'ında round-trip                                                                                                       |
| 8   | Fail-closed secrets/env                                                             | commit edilmiş secret yok; `sealed-secret-contract` ile tüm referanslar sealed; preflight `no-committed-secrets`                                                                                                       |
| 9   | CI-local gate parity: CI'nin her adımı local'de de çalışır                          | preflight hem test suite (32) hem gerçek repo (18/18) local'de koşuyor                                                                                                                                                 |
| 10  | Release dry-run manifest'leri CI'da üretip doğrulasın                               | `release-dry-run` (deploy.yml) + `manifest-render` (pr-validation.yml) job'ları                                                                                                                                        |

## 2. Kritik Bulgu: Helm chart hiçbir zaman render edilememiş

P4.1'in en büyük bulgusu: `infra/helm/vardiya-platform` **kendi başına render edilemiyordu**.
Önceki fazlarda `helm template` hiç çalıştırılmadığı için bu hiç yakalanmamıştı. CI'ya eklenen
helm render adımı anında patlardı. Üç kök neden onarıldı:

1. **Subchart values scope hatası** — tüm subchart template'leri parent-persona yazılmıştı
   (`.Values.backend.*`, `.Values.redis-cluster.*`). Helm subchart içinde `.Values` = o subchart'ın bloğudur;
   üst anahtar erişimi nil döner. Ayrıca `redis-cluster` anahtarı go-template dotted erişimde tire
   yüzünden kırılıyor (Go template'de tire alan adı sınırlayıcısıdır):
   - `.Values.redis-cluster` → `index .Values ...` / subchart-scope (`index .Values "cluster" ...`).
   - Tüm subchart'larda `.Values.<sub>.` öneki söküldü (scripted, 22 dosya).
   - İngress'in backend/frontend port'larına cross-subchart erişimi `ingress.service.backendPort/frontendPort`
     değerlerine taşındı; frontend'in `ingress.host` erişimi `global.publicHost`'a taşındı (production/staging
     override'ları ile birlikte, tek kaynak).

2. **`vardiya.labels` newline yutması** — `{{- if .Chart.AppVersion }}` ifadesinin başındaki `{{-`
   selectorLabels include'undan sonraki satırsonunu yutuyor ve `app.kubernetes.io/instance` ile
   `managed-by` aynı satıra yapışıyordu. Labels tekrar satır satır yazıldı.

3. **alertmanager ConfigMap scalar** — `text: '{{ "{{ range .Alerts }}...\n..." }}'` içindeki `\n`
   go-template string literal'inde gerçek newline'a dönüşüp single-quoted scalar'ı çok satıra bölüyordu;
   block-scalar içinde helm parse'ı kırıyordu. `\\n` yapıldı (alertmanager'ın kendi template'i için
   literal `\n` doğrusu budur).

## 3. Değişiklikler

### Workflow'lar

- **deploy.yml**
  - `security-scan` fail-closed: `npx --yes audit-ci@6 --critical --report-type summary` ×2 (backend/frontend), `|| true` kaldırıldı.
  - Metadata tag: `type=sha,prefix=,format=long` (immutable, rollback hedefi).
  - Yeni `release-dry-run` job'ı (needs `validate`): `bash scripts/release-dry-run.sh --ci` + dry-run summary.
  - `docker-build-push` needs `[release-dry-run, unit-tests, security-scan]`, `if: ${{ !inputs.dry_run }}`.
  - `integration-test` ve `create-release` de `dry_run` gate'li; manifest curl doğrulama adımı.
  - Preflight test: `node --test scripts/release-preflight.test.mjs`.
- **pr-validation.yml**
  - docker-compose-validation'a "Release preflight test suite".
  - Yeni `manifest-render` job'ı (preflight sonrası true: k8s + sealed kustomize, helm prod/staging template, compose config, `:latest` grep — hepsi `release-dry-run.sh --ci` ile).

### Script'ler

- `scripts/release-dry-run.sh` — CI'da (ubuntu bash): preflight test → preflight (CI mode: env check'leri skip) →
  compose config (prod+dev) → `:latest` yok → `kubectl kustomize` (k8s + sealed) → `helm template` (prod + staging) →
  image parity (prefix + immutable). `--ci` modu kök `.env` + `secrets/*.txt` placeholder yazar, teardown trap ile temizler.
- `scripts/restore-check.sh` — scratch `postgres:15-alpine` (port 5433), `docker cp` dump, `gunzip -c | pg_restore --exit-on-error --no-owner --no-acl`, `_prisma_migrations` ≥ 1 assert, tablo sayısı, teardown trap. `RESTORE_CHECK_IMAGE/RESTORE_CHECK_PORT` override.

### Helm chart (onarım + contract)

- Image'ler: `vardiyasystem/{backend,frontend}:v1.0.0` (registry `ghcr.io/anomalyco` üstünden),
  pgbouncer `bitnamilegacy/pgbouncer:1.24.1-debian-12-r10` (compose ile aynı), postgres `15-alpine`.
- Grafana `adminPasswordSecret` + alertmanager `existingSecret` → `vardiya-monitoring-secrets`; slack webhook mount (`slack_webhook` key).
- `global.nameOverride: vardiya` → `vardiya.fullname` standart release adında `vardiya-<component>`'e söner (tüm Service/DNS adları helper'ların çözdüğü adlarla tutarlı).
- Backend/Frontend deployment: `rollme` kaldırıldı, `securityContext` runAsNonRoot/runAsUser 100/fsGroup 100 (alpine `adduser -S vardiya` → uid 100).
- `charts/backend/templates/migration-job.yaml` — hook pre-install,pre-upgrade, weight -5, delete-policy before-hook-creation, `npx prisma migrate deploy`, `database_direct_url`.
- `global.publicHost` tek kamu adresi kaynağı; `ingress.host` kullanımı kaldırıldı.

### K8s base + rollouts + sealed

- `k8s/backend-deployment.yaml`: pod securityContext (uid 100, apkNonRoot, fsGroup 100) + `migrate` initContainer (`prisma migrate deploy`, direct DATABASE_URL `$(DB_PASSWORD)` expansion, resources).
- `k8s/frontend-deployment.yaml`: pod securityContext.
- `k8s/postgres-statefulset.yaml`: pgbouncer image compose/helm ile hizalandı.
- `infra/rollouts/*`: image'ler `:v1.0.0`, uid 100.
- `infra/sealed-secrets/backend-secrets.yaml`: 4 SealedSecret, ns `vardiya`, lowercase key contract (yukarıda liste); placeholder `AgAA...`.
- `k8s/kustomization.yaml`: `commonLabels` → `labels` (deprecation uyarısı giderildi).

### Preflight (18 check)

Yeni eklenenler: `postgres-version-aligned` (yalnız image bildirimleri + `RESTORE_CHECK_IMAGE`; `@postgres:5432` port false-positive'i regex ile elendi),
`infra-image-parity` (compose == helm == k8s base pgbouncer), `sealed-secret-contract` (referans→sealed + ns + key'ler),
`workflow-image-tags` (workflow image'leri pinned), `restore-scripts` (5 script + pg_restore/gz/\_prisma_migrations token'ları).

## 4. Doğrulama Kanıtları

| Denetim               | Komut                                                                                               | Sonuç                        |
| --------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| Preflight test suite  | `node --test scripts/release-preflight.test.mjs`                                                    | 32/32 pass                   |
| Gerçek repo preflight | `node scripts/release-preflight.mjs`                                                                | 18/18 pass                   |
| Helm template prod    | `helm template vardiya ... -f values/production.yaml` (helm 3.17.3)                                 | 44 doc, exit 0               |
| Helm template staging | aynı, staging values                                                                                | 44 doc, exit 0               |
| k8s kustomize         | `kubectl kustomize k8s`                                                                             | 35 doc, exit 0, uyarı yok    |
| sealed kustomize      | `kubectl kustomize infra/sealed-secrets`                                                            | 4 SealedSecret, ns `vardiya` |
| compose config        | `docker compose -f docker-compose.prod.yml --env-file .env config -q`                               | exit 0                       |
| Image parity (render) | rendered prod/staging'de `:latest` taraması                                                         | 0 adet                       |
| K8s spot-check        | initContainer `migrate`, uid/fsGroup 100, `postgres:15-alpine`, `bitnamilegacy/pgbouncer:1.24.1...` | doğrulandı                   |
| Staging değerleri     | publicHost `staging.vardiya.example.com`, `imagePullPolicy: Always`, frontend API_URL staging       | doğrulandı                   |

Doğrulama ortamı: Windows host (Node 22, Docker Engine 29.4, kubectl v1.34.1 + kustomize v5.7.1),
yoksa helm → `alpine/helm:3.17.3` container. WSL bash çalışmadığı için shell script'ler local'de koşturulamıyor;
helm/compose/kustomize adımları birebir aynı argümanlarla ayrı ayrı koşuldu (release-dry-run.sh'in içeriği).

## 5. Alınan Kararlar

- **PG15** ship edildi: compose dev/prod, helm `postgres.version: "15"` + `15-alpine`, k8s statefulset, smoke/workflows, restore-check default hepsi `15-alpine`. Redis 7-alpine bağımsız (16-alpine Unleash ile zaten mevcut çift major kararı korunuyor).
- **Migration pgbouncer'dan geçmez**: `database_direct_url` (5432) kullanılır; pgbouncer transaction pooling migration sırasında hata üretir.
- **Compose/K8s immutable image zorunlu**: `:latest` tüm render'larda yasak; `latest` yalnız GHCR'da main push'ları için (operasyon aracı olarak), tüketim tarafı hep sha/semver.
- **Backup formatı**: `pg_dump --format=custom --compress=9` → `vardiyasystem_<ts>.sql.gz` + `latest.sql.gz`; restore ve check bu konvansiyonla uyumlu.

## 6. Kalıntılar / Riskler (dokümante edildi, bu fazda çözülmedi)

- `infra/argocd/applications/vardiya-platform.yaml` **`HEAD`'e pinned** — ArgoCD APP'i belirli bir commit'e sabitlenmeden GitOps zincirinin "ne dağıtılacağı" CI çıktısıyla birebir doğrulanamaz.
- `infra/rollouts/*` `envFrom` configMap/secret adları (`vardiya-backend-config`, `vardiya-frontend-config`, `vardiya-frontend-secrets`) k8s base ile uyumsuz (deconfliction yapılmadı); bu dosyalar manifest olarak üretilmiyor.
- `values/production.yaml` `postgres.replicaCount: 2` — StatefulSet ile ikincil yazmada split-brain riski; primary/standby topolojisi tanımlanmadı. Şartlı olarak staging'de `1`.
- `global.nameOverride: vardiya` contract'ı release adı "vardiya"ya bağlı; farklı release adı (ör. `staging`) "staging-vardiya" tarzı adlar üretir ve DNS contract'ları bozulur → release adını canlıda "vardiya" olarak sabitle.
- `monitoring.tempo/loki` vs. OpenTelemetry Collector adresi (`otel-collector`) izlenimi dokümante edilmeli; dağıtım derinliği bu fazın kapsamı dışında.
- Bazı Helm subchart'larının kendi `values.yaml`'i yok (değerler parent'tan scope'lanıyor) — çalışıyor, ama subchart'ı tek başına `helm template` eden bir kullanıcı boş değerler görür.

## 7. Referanslar

- `.github/workflows/deploy.yml`, `.github/workflows/pr-validation.yml`
- `scripts/release-preflight.mjs` + `.test.mjs`, `scripts/release-dry-run.sh`, `scripts/restore-check.sh`
- `infra/helm/vardiya-platform/**`, `infra/sealed-secrets/`, `infra/rollouts/`
- `k8s/**`, `docs/devops/rollback.md`, `k8s/README.md`
